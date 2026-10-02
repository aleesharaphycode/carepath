import secrets
import logging
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any, Optional
from fastapi import HTTPException, status
from supabase import Client
from app.schemas.consent import (
    CreateConsentRequest,
    ConsentSessionItem,
    ConsentSessionListResponse,
    RevokeConsentResponse,
    AuditLogItem,
    AuditLogResponse,
    DoctorAccessResponse,
    DoctorAccessStatusResponse,
    ALLOWED_CONSENT_SCOPES,
)
from app.services.family_service import family_service
from app.services.intelligence_service import intelligence_service

logger = logging.getLogger("carepath.consent_service")


class ConsentService:
    """
    Temporary QR Doctor Consent and Audit Logging engine.
    Enforces least-privilege scoping, cryptographic token generation,
    server-side expiration, immediate revocation, and append-only audit logging.
    """

    def _log_audit_event(
        self,
        client: Client,
        patient_id: str,
        actor: str,
        action: str,
        details: str,
        session_id: Optional[str] = None,
        ip_address: Optional[str] = None,
    ):
        """Append an immutable audit entry into public.access_audit_logs."""
        try:
            client.from_("access_audit_logs").insert({
                "patient_id": patient_id,
                "session_id": session_id,
                "actor": actor,
                "action": action,
                "details": details,
                "ip_address": ip_address,
            }).execute()
        except Exception as e:
            logger.error(f"Failed to record audit event for patient {patient_id}: {str(e)}")

    def create_consent_session(
        self,
        client: Client,
        user_id: str,
        creator_patient_id: str,
        req: CreateConsentRequest,
        base_url: str = "http://localhost:3000",
    ) -> ConsentSessionItem:
        """
        Creates a time-bound doctor access session with an opaque random token.
        Generates QR access URL and logs the consent creation.
        """
        target_patient_id = req.patient_id or creator_patient_id

        # Verify caller has permission to share for target_patient_id
        if target_patient_id != creator_patient_id:
            can_share = family_service.verify_family_view_permission(
                client=client,
                requester_user_id=user_id,
                requester_patient_id=creator_patient_id,
                target_patient_id=target_patient_id,
            )
            if not can_share:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You do not have authorization to share medical records for this family member.",
                )

        # Sanitize and validate requested scope
        sanitized_scope = [s for s in req.scope if s in ALLOWED_CONSENT_SCOPES]
        if not sanitized_scope:
            sanitized_scope = ["timeline", "diagnoses", "medications", "investigations"]

        # Generate cryptographic opaque token
        access_token = secrets.token_urlsafe(32)
        
        # Generate 6-digit verification code
        pin = f"{secrets.randbelow(1000000):06d}"
        db_scope = sanitized_scope.copy()
        db_scope.append(f"PIN:{pin}")
        db_scope.append("ATTEMPTS:0")

        # Calculate expiration time
        now_utc = datetime.now(timezone.utc)
        expires_at_dt = now_utc + timedelta(minutes=req.duration_minutes)
        expires_at_iso = expires_at_dt.isoformat()

        # Insert session into database
        res = (
            client.from_("consent_sessions")
            .insert({
                "patient_id": target_patient_id,
                "recipient_name": req.recipient_name.strip(),
                "access_token": access_token,
                "scope": db_scope,
                "duration_minutes": req.duration_minutes,
                "expires_at": expires_at_iso,
                "status": "active",
                "created_by": user_id,
            })
            .execute()
        )
        if not res.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to persist consent session in database.",
            )
        session_data = res.data[0]

        # Fetch patient display name
        p_res = client.from_("patients").select("full_name").eq("id", target_patient_id).maybe_single().execute()
        patient_name = p_res.data.get("full_name", "Patient") if p_res.data else "Patient"

        # Record audit log
        self._log_audit_event(
            client=client,
            patient_id=target_patient_id,
            session_id=session_data["id"],
            actor="patient",
            action="consent_created",
            details=(
                f"Patient generated temporary access QR for '{req.recipient_name}' "
                f"with {req.duration_minutes}m duration and scope [{', '.join(sanitized_scope)}]."
            ),
        )

        qr_url = f"{base_url.rstrip('/')}/share/{access_token}"

        return ConsentSessionItem(
            id=session_data["id"],
            patient_id=target_patient_id,
            patient_name=patient_name,
            recipient_name=session_data["recipient_name"],
            access_token=session_data["access_token"],
            qr_access_url=qr_url,
            verification_code=pin,
            scope=sanitized_scope,
            duration_minutes=session_data["duration_minutes"],
            expires_at=session_data["expires_at"],
            revoked_at=session_data.get("revoked_at"),
            status=session_data["status"],
            created_at=session_data["created_at"],
        )

    def get_consent_sessions(
        self,
        client: Client,
        user_id: str,
        patient_id: str,
        base_url: str = "http://localhost:3000",
    ) -> ConsentSessionListResponse:
        """
        Lists all consent sessions created by the patient or involving their profile.
        Automatically syncs expired sessions.
        """
        try:
            res = (
                client.from_("consent_sessions")
                .select("*, patients!inner(full_name)")
                .or_(f"created_by.eq.{user_id},patient_id.eq.{patient_id}")
                .order("created_at", desc=True)
                .execute()
            )
            raw_sessions = res.data or []
            now_utc = datetime.now(timezone.utc)

            items: List[ConsentSessionItem] = []
            for s in raw_sessions:
                # Check server-side expiration
                current_status = s["status"]
                expires_dt = datetime.fromisoformat(s["expires_at"].replace("Z", "+00:00"))
                if current_status == "active" and now_utc > expires_dt:
                    current_status = "expired"
                    client.from_("consent_sessions").update({"status": "expired"}).eq("id", s["id"]).execute()

                qr_url = f"{base_url.rstrip('/')}/share/{s['access_token']}"
                patient_name = s.get("patients", {}).get("full_name") if s.get("patients") else "Patient"

                raw_scope = s["scope"] or []
                clean_scope = [x for x in raw_scope if not x.startswith("PIN:") and not x.startswith("ATTEMPTS:") and not x.startswith("CONSUMED:") and not x.startswith("LOCKED")]
                stored_pin = next((x.split(":")[1] for x in raw_scope if x.startswith("PIN:")), None)

                items.append(
                    ConsentSessionItem(
                        id=s["id"],
                        patient_id=s["patient_id"],
                        patient_name=patient_name,
                        recipient_name=s["recipient_name"],
                        access_token=s["access_token"],
                        qr_access_url=qr_url,
                        verification_code=stored_pin,
                        scope=clean_scope,
                        duration_minutes=s["duration_minutes"],
                        expires_at=s["expires_at"],
                        revoked_at=s.get("revoked_at"),
                        status=current_status,
                        created_at=s["created_at"],
                    )
                )

            return ConsentSessionListResponse(sessions=items)
        except Exception as e:
            logger.warning(f"Could not load consent sessions from database ({str(e)}). Returning empty session list.")
            return ConsentSessionListResponse(sessions=[])

    def revoke_consent_session(
        self,
        client: Client,
        user_id: str,
        patient_id: str,
        session_id: str,
    ) -> RevokeConsentResponse:
        """
        Immediately revokes an active consent session.
        Sets revoked_at timestamp, changes status to 'revoked', and writes to audit log.
        """
        # 1. Fetch session and verify ownership
        res = (
            client.from_("consent_sessions")
            .select("*")
            .eq("id", session_id)
            .maybe_single()
            .execute()
        )
        session = res.data
        if not session:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Consent session not found.")

        if session["created_by"] != user_id and session["patient_id"] != patient_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to revoke this consent session.",
            )

        now_iso = datetime.now(timezone.utc).isoformat()
        if session.get("access_token"):
            self._revoked_demo_tokens.add(session["access_token"])

        # 2. Update status and revoked_at
        client.from_("consent_sessions").update({
            "status": "revoked",
            "revoked_at": now_iso,
        }).eq("id", session_id).execute()

        # 3. Write immutable audit log
        self._log_audit_event(
            client=client,
            patient_id=session["patient_id"],
            session_id=session_id,
            actor="patient",
            action="consent_revoked",
            details=f"Patient revoked active access session for '{session['recipient_name']}'.",
        )

        return RevokeConsentResponse(
            success=True,
            session_id=session_id,
            message="Consent session successfully revoked. Any further access attempts will be blocked.",
            revoked_at=now_iso,
        )

    def approve_consent_session(
        self,
        client: Client,
        user_id: str,
        patient_id: str,
        session_id: str,
    ) -> Dict[str, Any]:
        """
        Approves a pending doctor access request.
        """
        res = (
            client.from_("consent_sessions")
            .select("*")
            .eq("id", session_id)
            .maybe_single()
            .execute()
        )
        session = res.data
        if not session:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Consent session not found.")

        if session["created_by"] != user_id and session["patient_id"] != patient_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to approve this consent session.",
            )
            
        raw_scope = session.get("scope", [])
        if "APPROVED" not in raw_scope:
            new_scope = raw_scope.copy()
            new_scope.append("APPROVED")
            client.from_("consent_sessions").update({"scope": new_scope}).eq("id", session_id).execute()
            
            self._log_audit_event(
                client=client,
                patient_id=session["patient_id"],
                session_id=session_id,
                actor="patient",
                action="consent_approved",
                details=f"Patient approved access request for '{session['recipient_name']}'.",
            )
            
        return {"success": True, "message": "Access approved"}

    def _verify_session_validity(self, client: Client, session: Dict[str, Any], clean_token: str, ip_address: Optional[str] = None):
        """Helper to check if session is found, active, not expired."""
        if not session:
            logger.warning(f"Doctor access attempt with unknown token: {clean_token[:8]}...")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Invalid or unknown access token. Please verify the QR code or link.",
            )

        patient_id = session["patient_id"]
        recipient = session.get("recipient_name", "Doctor")

        # Check Revocation
        if session.get("status") == "revoked" or session.get("revoked_at"):
            self._log_audit_event(
                client=client,
                patient_id=patient_id,
                session_id=session["id"],
                actor="doctor",
                action="access_denied",
                details=f"Doctor '{recipient}' attempted access using a revoked session.",
                ip_address=ip_address,
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This healthcare access session has been revoked by the patient.",
            )

        # Check Expiration
        now_utc = datetime.now(timezone.utc)
        expires_dt = datetime.fromisoformat(session["expires_at"].replace("Z", "+00:00"))
        if now_utc > expires_dt or session.get("status") == "expired":
            if session.get("status") != "expired" and session["id"] != "demo-dr-jenkins-session-id":
                client.from_("consent_sessions").update({"status": "expired"}).eq("id", session["id"]).execute()
            self._log_audit_event(
                client=client,
                patient_id=patient_id,
                session_id=session["id"],
                actor="doctor",
                action="access_denied",
                details=f"Doctor '{recipient}' attempted access using an expired session.",
                ip_address=ip_address,
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This CarePath sharing session has expired. Please ask the patient to generate a new QR code.",
            )
            
        # Check if already consumed or locked
        raw_scope = session.get("scope", [])
        if "CONSUMED" in raw_scope:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This access request has already been used. Please ask the patient to generate a new access QR.",
            )
        if "LOCKED" in raw_scope:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This access request has been locked due to too many failed attempts. Please ask the patient to generate a new QR.",
            )

        return session

    def check_doctor_access_status(
        self,
        client: Client,
        token: str,
    ) -> DoctorAccessStatusResponse:
        """
        Validates token existence and expiry without revealing medical data.
        Returns status indicating PIN is required and whether the patient has approved.
        """
        clean_token = token.strip()
            
        session = None
        try:
            res = client.from_("consent_sessions").select("*").eq("access_token", clean_token).maybe_single().execute()
            session = res.data
        except Exception as e:
            logger.warning(f"Could not query consent_sessions: {e}")
            
        session = self._verify_session_validity(client, session, clean_token)
        
        # Track that the doctor scanned the QR
        raw_scope = session.get("scope", [])
        if "SCANNED" not in raw_scope:
            new_scope = raw_scope.copy()
            new_scope.append("SCANNED")
            client.from_("consent_sessions").update({"scope": new_scope}).eq("id", session["id"]).execute()
            raw_scope = new_scope
            
        is_approved = "APPROVED" in raw_scope
        
        now_utc = datetime.now(timezone.utc)
        expires_dt = datetime.fromisoformat(session["expires_at"].replace("Z", "+00:00"))
        time_remaining = max(0, int((expires_dt - now_utc).total_seconds()))
        
        return DoctorAccessStatusResponse(
            is_valid=True,
            requires_pin=True,
            is_approved=is_approved,
            expires_at=session["expires_at"],
            time_remaining_seconds=time_remaining,
        )

    def validate_doctor_access_with_pin(
        self,
        client: Client,
        token: str,
        pin: str,
        ip_address: Optional[str] = None,
    ) -> DoctorAccessResponse:
        """
        Validates a doctor access token and PIN.
        Enforces token existence, expiration, and revocation status server-side.
        Returns medical data filtered strictly by the granted scope.
        """
        clean_token = token.strip()

        session = None
        try:
            res = (
                client.from_("consent_sessions")
                .select("*")
                .eq("access_token", clean_token)
                .maybe_single()
                .execute()
            )
            session = res.data
            if session and session.get("patient_id"):
                p_res = (
                    client.from_("patients")
                    .select("id, full_name, date_of_birth, gender, phone")
                    .eq("id", session["patient_id"])
                    .maybe_single()
                    .execute()
                )
                session["patients"] = p_res.data or {}
        except Exception as e:
            logger.warning(f"Could not query consent_sessions from database: {e}")

        session = self._verify_session_validity(client, session, clean_token, ip_address)
        
        raw_scope = session.get("scope", [])
        
        if "APPROVED" not in raw_scope:
            self._log_audit_event(
                client=client,
                patient_id=session["patient_id"],
                session_id=session["id"],
                actor="doctor",
                action="access_denied",
                details=f"Doctor '{session.get('recipient_name', 'Doctor')}' attempted to verify PIN before patient approval.",
                ip_address=ip_address,
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Patient has not approved this access request yet.",
            )
            
        stored_pin = next((x.split(":")[1] for x in raw_scope if x.startswith("PIN:")), None)
        attempts = int(next((x.split(":")[1] for x in raw_scope if x.startswith("ATTEMPTS:")), "0"))
        
        patient_id = session["patient_id"]
        recipient = session.get("recipient_name", "Doctor")
        
        if stored_pin and pin.strip() != stored_pin:
            attempts += 1
            if attempts >= 5:
                # Lock it
                new_scope = [x for x in raw_scope if not x.startswith("ATTEMPTS:")]
                new_scope.append(f"ATTEMPTS:{attempts}")
                new_scope.append("LOCKED")
                if session["id"] != "demo-dr-jenkins-session-id":
                    client.from_("consent_sessions").update({"scope": new_scope, "status": "revoked"}).eq("id", session["id"]).execute()
                self._log_audit_event(client, patient_id, session["id"], "doctor", "access_denied", "Doctor access locked due to 5 failed PIN attempts.", ip_address)
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This access request has been locked. Please ask the patient to generate a new QR.")
            else:
                new_scope = [x for x in raw_scope if not x.startswith("ATTEMPTS:")]
                new_scope.append(f"ATTEMPTS:{attempts}")
                if session["id"] != "demo-dr-jenkins-session-id":
                    client.from_("consent_sessions").update({"scope": new_scope}).eq("id", session["id"]).execute()
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Invalid verification code. {5 - attempts} attempts remaining.")

        # Correct PIN -> Consume capability
        new_scope = raw_scope.copy()
        new_scope.append("CONSUMED")
        if session["id"] != "demo-dr-jenkins-session-id":
            client.from_("consent_sessions").update({"scope": new_scope}).eq("id", session["id"]).execute()

        now_utc = datetime.now(timezone.utc)
        expires_dt = datetime.fromisoformat(session["expires_at"].replace("Z", "+00:00"))
        time_remaining = max(0, int((expires_dt - now_utc).total_seconds()))
        
        # Clean scope before returning data
        clean_scope = [s for s in raw_scope if not s.startswith("PIN:") and not s.startswith("ATTEMPTS:") and not s.startswith("CONSUMED:") and not s.startswith("LOCKED")]
        
        patient_data = session.get("patients") or {}
        patient_name = patient_data.get("full_name", "Verified Patient")

        # Log authorized access event in audit log
        self._log_audit_event(
            client=client,
            patient_id=patient_id,
            session_id=session["id"],
            actor="doctor",
            action="records_viewed",
            details=f"Doctor '{recipient}' verified PIN and accessed consented patient health records (scope: {', '.join(clean_scope)}).",
            ip_address=ip_address,
        )

        # Filter and retrieve data strictly by granted scope
        profile_data = None
        if "profile" in clean_scope:
            profile_data = {
                "full_name": patient_name,
                "date_of_birth": patient_data.get("date_of_birth"),
                "gender": patient_data.get("gender"),
                "phone": patient_data.get("phone"),
            }

        diagnoses_data = None
        if "diagnoses" in clean_scope:
            diag_res = client.from_("diagnoses").select("*").eq("patient_id", patient_id).order("date", desc=True).execute()
            diagnoses_data = diag_res.data or []

        medications_data = None
        if "medications" in clean_scope:
            med_res = client.from_("medications").select("*").eq("patient_id", patient_id).order("created_at", desc=True).execute()
            medications_data = med_res.data or []

        investigations_data = None
        if "investigations" in clean_scope:
            inv_res = client.from_("investigations").select("*").eq("patient_id", patient_id).order("date", desc=True).execute()
            investigations_data = inv_res.data or []

        procedures_data = None
        if "procedures" in clean_scope:
            proc_res = client.from_("procedures").select("*").eq("patient_id", patient_id).order("date", desc=True).execute()
            procedures_data = proc_res.data or []

        follow_ups_data = None
        if "follow_ups" in clean_scope:
            fu_res = client.from_("follow_ups").select("*").eq("patient_id", patient_id).order("confirmed_date", desc=True).execute()
            follow_ups_data = fu_res.data or []

        timeline_data = None
        if "timeline" in clean_scope:
            t_res = intelligence_service.get_timeline(client=client, patient_id=patient_id)
            timeline_data = [e.model_dump() for e in t_res.events]

        documents_data = None
        if "documents" in clean_scope:
            doc_res = client.from_("documents").select("id, file_name, file_type, document_type, uploaded_at, storage_path").eq("patient_id", patient_id).execute()
            documents_data = []
            for d in (doc_res.data or []):
                doc_item = {
                    "id": d["id"],
                    "file_name": d["file_name"],
                    "file_type": d["file_type"],
                    "document_type": d.get("document_type", "general"),
                    "uploaded_at": d["uploaded_at"],
                }
                if d.get("storage_path"):
                    try:
                        s_res = client.storage.from_("medical-documents").create_signed_url(d["storage_path"], 300)
                        if isinstance(s_res, dict):
                            doc_item["signed_url"] = s_res.get("signedUrl") or s_res.get("signedURL")
                    except Exception as s_err:
                        logger.warning(f"Could not generate signed URL for scoped doc {d['id']}: {s_err}")
                documents_data.append(doc_item)

        return DoctorAccessResponse(
            session_id=session["id"],
            recipient_name=recipient,
            patient_name=patient_name,
            scope=clean_scope,
            expires_at=session["expires_at"],
            time_remaining_seconds=time_remaining,
            is_active=True,
            profile=profile_data,
            diagnoses=diagnoses_data,
            medications=medications_data,
            investigations=investigations_data,
            procedures=procedures_data,
            follow_ups=follow_ups_data,
            timeline=timeline_data,
            documents=documents_data,
        )

    def get_audit_logs(
        self,
        client: Client,
        patient_id: str,
    ) -> AuditLogResponse:
        """Retrieves patient-isolated access audit trail."""
        try:
            res = (
                client.from_("access_audit_logs")
                .select("*")
                .eq("patient_id", patient_id)
                .order("created_at", desc=True)
                .limit(100)
                .execute()
            )
            items = [
                AuditLogItem(
                    id=row["id"],
                    session_id=row.get("session_id"),
                    patient_id=row["patient_id"],
                    actor=row["actor"],
                    action=row["action"],
                    details=row["details"],
                    ip_address=row.get("ip_address"),
                    timestamp=row["created_at"],
                )
                for row in (res.data or [])
            ]
            return AuditLogResponse(logs=items)
        except Exception as e:
            logger.error(f"Failed to fetch audit logs for patient {patient_id}: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to retrieve audit log: {str(e)}",
            )


consent_service = ConsentService()
