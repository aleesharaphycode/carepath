import logging
import re
from datetime import datetime, date
from typing import List, Dict, Any, Optional
from fastapi import HTTPException, status
from supabase import Client

from app.schemas.health_events import (
    HealthEventCreate,
    HealthEventUpdate,
    HealthEventItem,
    HealthEventCandidate,
)

logger = logging.getLogger("carepath.health_event_service")


class HealthEventService:
    """
    Service managing discrete clinical health events.
    Decouples actual healthcare occurrence dates from document upload/scan timestamps.
    """

    def get_health_events(self, client: Client, patient_id: str) -> List[HealthEventItem]:
        """
        Retrieves all confirmed and planned health events for the given patient.
        """
        try:
            res = (
                client.from_("health_events")
                .select("*, documents(file_name)")
                .eq("patient_id", patient_id)
                .order("event_date", desc=True)
                .execute()
            )
            rows = res.data or []
            events: List[HealthEventItem] = []
            for r in rows:
                doc_name = None
                if r.get("documents") and isinstance(r["documents"], dict):
                    doc_name = r["documents"].get("file_name")

                events.append(
                    HealthEventItem(
                        id=str(r["id"]),
                        patient_id=str(r["patient_id"]),
                        document_id=str(r["document_id"]) if r.get("document_id") else None,
                        event_date=str(r["event_date"]),
                        event_type=r["event_type"],
                        title=r["title"],
                        doctor_name=r.get("doctor_name"),
                        clinic_name=r.get("clinic_name"),
                        location=r.get("location"),
                        description=r.get("description"),
                        status=r.get("status", "completed"),
                        document_name=doc_name,
                        created_at=str(r.get("created_at")),
                    )
                )
            return events
        except Exception as e:
            logger.warning(f"Failed to fetch health events for patient {patient_id}: {e}")
            return []

    def create_health_event(
        self,
        client: Client,
        patient_id: str,
        data: HealthEventCreate,
    ) -> HealthEventItem:
        """
        Creates a new healthcare event record.
        Enforces strict date validation and prevents using arbitrary upload timestamps.
        """
        # 1. Validate date format (YYYY-MM-DD)
        iso_date = self._normalize_date(data.event_date)
        if not iso_date:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid event_date. Must be a valid date in YYYY-MM-DD format.",
            )

        # 2. Validate document if provided belongs to patient
        doc_name: Optional[str] = None
        if data.document_id:
            doc_res = (
                client.from_("documents")
                .select("id, patient_id, file_name")
                .eq("id", data.document_id)
                .maybe_single()
                .execute()
            )
            if not doc_res.data:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Referenced document not found.",
                )
            if doc_res.data["patient_id"] != patient_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Cannot attach document belonging to another patient.",
                )
            doc_name = doc_res.data.get("file_name")

        payload = {
            "patient_id": patient_id,
            "document_id": data.document_id,
            "event_date": iso_date,
            "event_type": data.event_type,
            "title": data.title.strip(),
            "doctor_name": data.doctor_name.strip() if data.doctor_name else None,
            "clinic_name": data.clinic_name.strip() if data.clinic_name else None,
            "location": data.location.strip() if data.location else None,
            "description": data.description.strip() if data.description else None,
            "status": data.status,
        }

        try:
            res = client.from_("health_events").insert(payload).execute()
            if not res.data:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Failed to insert healthcare event record.",
                )
            row = res.data[0]
            return HealthEventItem(
                id=str(row["id"]),
                patient_id=str(row["patient_id"]),
                document_id=str(row["document_id"]) if row.get("document_id") else None,
                event_date=str(row["event_date"]),
                event_type=row["event_type"],
                title=row["title"],
                doctor_name=row.get("doctor_name"),
                clinic_name=row.get("clinic_name"),
                location=row.get("location"),
                description=row.get("description"),
                status=row.get("status", "completed"),
                document_name=doc_name,
                created_at=str(row.get("created_at")),
            )
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error creating health event: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to create health event: {str(e)}",
            )

    def update_health_event(
        self,
        client: Client,
        authorized_patient_id: str,
        event_id: str,
        data: HealthEventUpdate,
    ) -> HealthEventItem:
        """
        Updates an existing healthcare event.
        Verifies ownership before allowing modifications.
        """
        # 1. Verify existence and patient ownership
        ev_res = (
            client.from_("health_events")
            .select("*, documents(file_name)")
            .eq("id", event_id)
            .maybe_single()
            .execute()
        )
        if not ev_res.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Health event not found.",
            )
        event = ev_res.data
        if event["patient_id"] != authorized_patient_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied. You do not own this health event.",
            )

        update_payload: Dict[str, Any] = {}
        if data.event_date is not None:
            norm_date = self._normalize_date(data.event_date)
            if not norm_date:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid date format for event_date.",
                )
            update_payload["event_date"] = norm_date
        if data.event_type is not None:
            update_payload["event_type"] = data.event_type
        if data.title is not None:
            update_payload["title"] = data.title.strip()
        if data.doctor_name is not None:
            update_payload["doctor_name"] = data.doctor_name.strip() if data.doctor_name else None
        if data.clinic_name is not None:
            update_payload["clinic_name"] = data.clinic_name.strip() if data.clinic_name else None
        if data.location is not None:
            update_payload["location"] = data.location.strip() if data.location else None
        if data.description is not None:
            update_payload["description"] = data.description.strip() if data.description else None
        if data.status is not None:
            update_payload["status"] = data.status

        if not update_payload:
            doc_name = None
            if event.get("documents") and isinstance(event["documents"], dict):
                doc_name = event["documents"].get("file_name")
            return HealthEventItem(
                id=str(event["id"]),
                patient_id=str(event["patient_id"]),
                document_id=str(event["document_id"]) if event.get("document_id") else None,
                event_date=str(event["event_date"]),
                event_type=event["event_type"],
                title=event["title"],
                doctor_name=event.get("doctor_name"),
                clinic_name=event.get("clinic_name"),
                location=event.get("location"),
                description=event.get("description"),
                status=event.get("status", "completed"),
                document_name=doc_name,
                created_at=str(event.get("created_at")),
            )

        try:
            up_res = client.from_("health_events").update(update_payload).eq("id", event_id).execute()
            row = up_res.data[0] if up_res.data else event
            doc_name = None
            if event.get("documents") and isinstance(event["documents"], dict):
                doc_name = event["documents"].get("file_name")

            return HealthEventItem(
                id=str(row["id"]),
                patient_id=str(row["patient_id"]),
                document_id=str(row["document_id"]) if row.get("document_id") else None,
                event_date=str(row["event_date"]),
                event_type=row["event_type"],
                title=row["title"],
                doctor_name=row.get("doctor_name"),
                clinic_name=row.get("clinic_name"),
                location=row.get("location"),
                description=row.get("description"),
                status=row.get("status", "completed"),
                document_name=doc_name,
                created_at=str(row.get("created_at")),
            )
        except Exception as e:
            logger.error(f"Error updating health event {event_id}: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to update health event: {str(e)}",
            )

    def delete_health_event(
        self,
        client: Client,
        authorized_patient_id: str,
        event_id: str,
    ) -> bool:
        """
        Deletes a healthcare event.
        Verifies ownership before deleting.
        """
        ev_res = (
            client.from_("health_events")
            .select("id, patient_id")
            .eq("id", event_id)
            .maybe_single()
            .execute()
        )
        if not ev_res.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Health event not found.",
            )
        if ev_res.data["patient_id"] != authorized_patient_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied. You do not own this health event.",
            )

        client.from_("health_events").delete().eq("id", event_id).execute()
        return True

    def get_candidates(self, client: Client, patient_id: str) -> List[HealthEventCandidate]:
        """
        Discovers documents that have structured AI extractions but do not yet have
        a confirmed health event in public.health_events.
        Where an encounter/report date was detected, pre-populates the candidate.
        Where no date could be confidently confirmed, marks confidence_is_date_confirmed = False.
        """
        candidates: List[HealthEventCandidate] = []
        try:
            # 1. Fetch all documents for this patient
            docs_res = (
                client.from_("documents")
                .select("id, file_name, document_type, processing_status, uploaded_at")
                .eq("patient_id", patient_id)
                .eq("processing_status", "completed")
                .execute()
            )
            completed_docs = docs_res.data or []
            if not completed_docs:
                return []

            # 2. Fetch existing health events referencing these documents
            ev_res = (
                client.from_("health_events")
                .select("document_id")
                .eq("patient_id", patient_id)
                .not_.is_("document_id", "null")
                .execute()
            )
            already_confirmed_doc_ids = {row["document_id"] for row in (ev_res.data or []) if row.get("document_id")}

            # 3. For documents without confirmed events, load extractions
            for doc in completed_docs:
                doc_id = doc["id"]
                if doc_id in already_confirmed_doc_ids:
                    continue  # already confirmed into calendar

                ext_res = (
                    client.from_("document_extractions")
                    .select("raw_extraction, document_date, provider_name, clinical_notes")
                    .eq("document_id", doc_id)
                    .maybe_single()
                    .execute()
                )
                ext_data = ext_res.data or {}
                raw = ext_data.get("raw_extraction") or {}

                # Determine date
                doc_date_raw = ext_data.get("document_date") or raw.get("document_date")
                iso_date = self._normalize_date(doc_date_raw)
                has_confirmed_date = bool(iso_date)

                # Determine type
                doc_type = doc.get("document_type") or raw.get("document_type") or "general"
                event_type = self._map_document_to_event_type(doc_type, raw)

                # Doctor and clinic
                doctor_name = None
                clinic_name = None
                provider = ext_data.get("provider_name") or raw.get("provider_name")
                if provider:
                    if any(kw in provider.lower() for kw in ["dr.", "dr ", "doctor", "md", "physician"]):
                        doctor_name = provider
                    else:
                        clinic_name = provider

                # Title
                title = self._suggest_title(event_type, doc_type, doc["file_name"], raw)

                # Description / summary
                description = ext_data.get("clinical_notes") or raw.get("clinical_notes")

                # Check if date is in future -> planned, else completed
                status_val = "completed"
                if iso_date:
                    try:
                        ev_dt = datetime.strptime(iso_date, "%Y-%m-%d").date()
                        if ev_dt > date.today():
                            status_val = "planned"
                    except Exception:
                        pass

                candidates.append(
                    HealthEventCandidate(
                        document_id=doc_id,
                        document_name=doc["file_name"],
                        document_type=doc_type,
                        detected_date=iso_date,
                        confidence_is_date_confirmed=has_confirmed_date,
                        suggested_event_type=event_type,
                        suggested_title=title,
                        doctor_name=doctor_name,
                        clinic_name=clinic_name,
                        location=raw.get("location"),
                        description=description,
                        status=status_val,
                    )
                )

            return candidates
        except Exception as e:
            logger.warning(f"Error gathering event candidates for patient {patient_id}: {e}")
            return []

    # -------------------------------------------------------------------------
    # Internal Helpers
    # -------------------------------------------------------------------------
    def _normalize_date(self, raw_date: Optional[str]) -> Optional[str]:
        """Attempts to parse varied human date strings into strict YYYY-MM-DD ISO format."""
        if not raw_date:
            return None
        clean = raw_date.strip()
        # Direct YYYY-MM-DD match
        if re.match(r"^\d{4}-\d{2}-\d{2}$", clean):
            try:
                datetime.strptime(clean, "%Y-%m-%d")
                return clean
            except ValueError:
                return None

        # Common format attempts
        formats = [
            "%Y/%m/%d",
            "%d/%m/%Y",
            "%m/%d/%Y",
            "%d-%m-%Y",
            "%B %d, %Y",
            "%b %d, %Y",
            "%d %B %Y",
            "%d %b %Y",
            "%Y-%m-%dT%H:%M:%S",
        ]
        for fmt in formats:
            try:
                dt = datetime.strptime(clean, fmt)
                return dt.strftime("%Y-%m-%d")
            except ValueError:
                continue

        # Regex fallback for strings like "2026-09-18T10:00:00Z"
        iso_match = re.search(r"\b(\d{4}-\d{2}-\d{2})\b", clean)
        if iso_match:
            cand = iso_match.group(1)
            try:
                datetime.strptime(cand, "%Y-%m-%d")
                return cand
            except ValueError:
                pass

        return None

    def _map_document_to_event_type(self, doc_type: str, raw_extraction: Dict[str, Any]) -> str:
        """Categorizes document extraction into one of the 5 canonical event types."""
        dt = (doc_type or "").lower()
        if dt == "prescription":
            return "visit"
        elif dt in ["lab_report", "scan"]:
            return "test"
        elif dt == "discharge_summary":
            return "visit"
        elif raw_extraction.get("procedures"):
            return "procedure"
        elif raw_extraction.get("follow_ups"):
            return "follow_up"
        elif raw_extraction.get("medications") and not raw_extraction.get("diagnoses"):
            return "medication"
        return "visit"

    def _suggest_title(self, event_type: str, doc_type: str, file_name: str, raw: Dict[str, Any]) -> str:
        """Builds a readable, professional title for candidate event."""
        diagnoses = raw.get("diagnoses") or []
        investigations = raw.get("investigations") or []
        procedures = raw.get("procedures") or []
        follow_ups = raw.get("follow_ups") or []

        if event_type == "visit":
            if diagnoses and diagnoses[0].get("name"):
                return f"Doctor Visit — {diagnoses[0]['name']}"
            return f"Clinical Consultation ({doc_type.replace('_', ' ').title()})"
        elif event_type == "test":
            if investigations and investigations[0].get("name"):
                return f"Diagnostic Test — {investigations[0]['name']}"
            return f"Diagnostic Investigation ({file_name})"
        elif event_type == "procedure":
            if procedures and procedures[0].get("name"):
                return f"Procedure — {procedures[0]['name']}"
            return f"Medical Procedure ({file_name})"
        elif event_type == "follow_up":
            if follow_ups and follow_ups[0].get("description"):
                return f"Follow-up: {follow_ups[0]['description']}"
            return f"Scheduled Review Appointment"
        elif event_type == "medication":
            meds = raw.get("medications") or []
            if meds and meds[0].get("name"):
                return f"Prescription — {meds[0]['name']}"
            return "Medication Plan"

        return f"Healthcare Event ({file_name})"


health_event_service = HealthEventService()
