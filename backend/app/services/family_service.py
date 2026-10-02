import logging
from typing import List, Dict, Any, Optional
from fastapi import HTTPException, status
from supabase import Client
from app.schemas.family import (
    FamilyDashboardResponse,
    FamilyGroupItem,
    FamilyMemberProfile,
    CreateFamilyGroupRequest,
    AddFamilyMemberRequest,
    UpdateFamilyMemberRequest,
)

logger = logging.getLogger("carepath.family_service")


class FamilyService:
    """
    Patient-controlled family group and membership management service.
    Enforces strict relational isolation: each family member maintains separate
    identity, medical records, timeline, and document storage.
    """

    def __init__(self):
        # Ephemeral demo permissions tracking (e.g. for Margaret Vance toggle)
        self._demo_permissions: Dict[str, bool] = {"demo-mem-margaret": False}

    def get_family_dashboard(
        self,
        client: Client,
        user_id: str,
        patient_id: str,
    ) -> FamilyDashboardResponse:
        """
        Retrieves all family groups the user created or belongs to, along with member profiles.
        NEW PATIENTS START WITH ZERO FAMILY MEMBERS. Never inject synthetic demo data automatically.
        """
        try:
            # 1. Fetch groups created by user OR where patient is a member
            groups_res = (
                client.from_("family_groups")
                .select("id, name, created_by, created_at")
                .execute()
            )
            all_groups = groups_res.data or []

            # 2. Fetch memberships for these groups
            group_items: List[FamilyGroupItem] = []
            for g in all_groups:
                is_owner = g["created_by"] == user_id

                members_res = (
                    client.from_("family_memberships")
                    .select(
                        "id, family_group_id, patient_id, relationship, role, can_view_records, access_status, created_at"
                    )
                    .eq("family_group_id", g["id"])
                    .execute()
                )
                members_data = members_res.data or []

                # Fetch patient profiles for these members
                member_profiles: List[FamilyMemberProfile] = []
                for m in members_data:
                    p_res = (
                        client.from_("patients")
                        .select("id, full_name, date_of_birth, gender, phone")
                        .eq("id", m["patient_id"])
                        .maybe_single()
                        .execute()
                    )
                    p_data = p_res.data or {}

                    member_profiles.append(
                        FamilyMemberProfile(
                            id=m["id"],
                            patient_id=m["patient_id"],
                            full_name=p_data.get("full_name", "Family Member"),
                            date_of_birth=p_data.get("date_of_birth"),
                            gender=p_data.get("gender"),
                            phone=p_data.get("phone"),
                            relationship=m["relationship"],
                            role=m["role"],
                            can_view_records=bool(m.get("can_view_records", False)),
                            access_status=m.get("access_status", "active"),
                            is_current_user=(m["patient_id"] == patient_id),
                            created_at=m["created_at"],
                        )
                    )

                # Filter groups: user must be owner OR be one of the members
                user_is_member = any(m.patient_id == patient_id for m in member_profiles)
                if is_owner or user_is_member:
                    group_items.append(
                        FamilyGroupItem(
                            id=g["id"],
                            name=g["name"],
                            created_by=g["created_by"],
                            is_owner=is_owner,
                            members=member_profiles,
                            created_at=g["created_at"],
                        )
                    )

            return FamilyDashboardResponse(groups=group_items, patient_id=patient_id)

        except Exception as e:
            logger.warning(f"Could not load family groups from database ({str(e)}). Returning empty family list for real patient.")
            # REAL PATIENT MUST START EMPTY: Zero synthetic members injected on error or fresh database
            return FamilyDashboardResponse(groups=[], patient_id=patient_id)

    def create_family_group(
        self,
        client: Client,
        user_id: str,
        patient_id: str,
        name: str,
    ) -> FamilyGroupItem:
        """
        Creates a new family group and automatically registers the creator as group owner.
        """
        try:
            # 1. Insert family group
            grp_res = (
                client.from_("family_groups")
                .insert({"name": name.strip(), "created_by": user_id})
                .execute()
            )
            if not grp_res.data:
                raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create family group.")
            group_data = grp_res.data[0]
            group_id = group_data["id"]

            # 2. Add creator as owner member
            mem_res = (
                client.from_("family_memberships")
                .insert({
                    "family_group_id": group_id,
                    "patient_id": patient_id,
                    "relationship": "Primary Account Holder",
                    "role": "owner",
                    "can_view_records": True,
                    "access_status": "active",
                })
                .execute()
            )
            if not mem_res.data:
                raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to initialize owner membership.")
            mem_data = mem_res.data[0]

            # 3. Retrieve creator patient details
            p_res = client.from_("patients").select("*").eq("id", patient_id).maybe_single().execute()
            p_data = p_res.data or {}

            creator_member = FamilyMemberProfile(
                id=mem_data["id"],
                patient_id=patient_id,
                full_name=p_data.get("full_name", "Primary Account Holder"),
                date_of_birth=p_data.get("date_of_birth"),
                gender=p_data.get("gender"),
                phone=p_data.get("phone"),
                relationship="Primary Account Holder",
                role="owner",
                can_view_records=True,
                access_status="active",
                is_current_user=True,
                created_at=mem_data["created_at"],
            )

            return FamilyGroupItem(
                id=group_id,
                name=group_data["name"],
                created_by=user_id,
                is_owner=True,
                members=[creator_member],
                created_at=group_data["created_at"],
            )
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error creating family group '{name}': {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to create family group: {str(e)}",
            )

    def add_family_member(
        self,
        client: Client,
        user_id: str,
        creator_patient_id: str,
        req: AddFamilyMemberRequest,
    ) -> FamilyMemberProfile:
        """
        Adds a family member or dependent to an existing group.
        Creates a dedicated patient record ensuring medical records remain strictly separate.
        """
        if not req.date_of_birth:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Date of birth is required to add a family member.")

        try:
            from datetime import date
            dob = date.fromisoformat(req.date_of_birth)
        except ValueError:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid date of birth format. Use YYYY-MM-DD.")

        today = date.today()
        age = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
        is_dependent = age < 16

        try:
            # 1. Verify caller owns or belongs to the family group
            grp_res = (
                client.from_("family_groups")
                .select("id, created_by")
                .eq("id", req.family_group_id)
                .maybe_single()
                .execute()
            )
            if not grp_res.data:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Family group not found.")
            
            is_owner = grp_res.data["created_by"] == user_id
            if not is_owner:
                mem_check = client.from_("family_memberships").select("id").eq("family_group_id", req.family_group_id).eq("patient_id", creator_patient_id).execute()
                if not mem_check.data:
                    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have authorization to add members to this family group.")

            is_dependent = age < 16

            # 2. Check if user already exists (for 16+)
            if not is_dependent:
                if not req.target_email:
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="CarePath email is required for members age 16 and older.")
                
                target_email = req.target_email.strip().lower()
                
                # Try to find the user in Supabase Auth
                users_list = client.auth.admin.list_users()
                target_user = next((u for u in users_list if getattr(u, 'email', '').lower() == target_email), None)
                
                if target_user:
                    # User exists! Check if they have a patient profile
                    p_res = client.from_("patients").select("id").eq("user_id", target_user.id).maybe_single().execute()
                    if p_res.data:
                        existing_patient_id = p_res.data["id"]
                        
                        # Create membership directly as pending
                        mem_res = (
                            client.from_("family_memberships")
                            .insert({
                                "family_group_id": req.family_group_id,
                                "patient_id": existing_patient_id,
                                "relationship": req.relationship,
                                "role": "member",
                                "can_view_records": False,
                                "access_status": "pending",
                            })
                            .execute()
                        )
                        if not mem_res.data:
                            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create family membership for existing user.")
                        
                        client.from_("access_audit_logs").insert({
                            "patient_id": existing_patient_id,
                            "actor": "patient",
                            "action": "family_invitation_created",
                            "details": f"Family invitation created for existing account {target_email}."
                        }).execute()
                        
                        return FamilyMemberProfile(
                            id=mem_res.data[0]["id"],
                            patient_id=existing_patient_id,
                            full_name=req.full_name,
                            date_of_birth=req.date_of_birth,
                            gender=req.gender,
                            phone=req.phone,
                            relationship=req.relationship,
                            role="member",
                            can_view_records=False,
                            access_status="pending",
                            is_current_user=False,
                            created_at=mem_res.data[0]["created_at"],
                        )
                
                # If we get here, user/patient does NOT exist. Create a pending invitation.
                from datetime import datetime, timezone, timedelta
                import uuid
                inv_token = uuid.uuid4().hex
                expires_at = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
                
                inv_res = (
                    client.from_("family_invitations")
                    .insert({
                        "family_group_id": req.family_group_id,
                        "inviter_patient_id": creator_patient_id,
                        "target_email": target_email,
                        "target_name": req.full_name,
                        "target_dob": req.date_of_birth,
                        "relationship": req.relationship,
                        "role": "member",
                        "status": "pending",
                        "invitation_token": inv_token,
                        "expires_at": expires_at
                    })
                    .execute()
                )
                if not inv_res.data:
                    raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create pending invitation.")
                
                return FamilyMemberProfile(
                    id=inv_res.data[0]["id"],
                    patient_id="pending-invitation",
                    full_name=req.full_name,
                    date_of_birth=req.date_of_birth,
                    gender=req.gender,
                    phone=req.phone,
                    relationship=req.relationship,
                    role="member",
                    can_view_records=False,
                    access_status="pending",
                    is_current_user=False,
                    created_at=inv_res.data[0]["created_at"],
                )
            
            # Dependent Flow (Under 16)
            # 2. Create separate patient profile for the member
            new_p_res = (
                client.from_("patients")
                .insert({
                    "full_name": req.full_name.strip(),
                    "date_of_birth": req.date_of_birth,
                    "gender": req.gender or None,
                    "phone": req.phone or None,
                })
                .execute()
            )
            if not new_p_res.data:
                raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create dependent patient profile.")
            new_patient = new_p_res.data[0]
            new_patient_id = new_patient["id"]

            # 3. Insert membership linking the new patient to the group
            mem_res = (
                client.from_("family_memberships")
                .insert({
                    "family_group_id": req.family_group_id,
                    "patient_id": new_patient_id,
                    "relationship": req.relationship,
                    "role": "dependent",
                    "can_view_records": req.can_view_records,
                    "access_status": "active",
                })
                .execute()
            )
            
            # Rollback patient if membership creation failed (it shouldn't happen unless constraints fail)
            # Actually, supabase-py raises an APIError on constraint violation before returning,
            # but just in case it returns an empty data array:
            if not mem_res.data:
                client.from_("patients").delete().eq("id", new_patient_id).execute()
                raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create family membership. Rolled back patient.")
            
            mem_data = mem_res.data[0]

            # Audit log
            client.from_("access_audit_logs").insert({
                "patient_id": new_patient_id,
                "actor": "patient",
                "action": "dependent_created",
                "details": f"Family member profile created for {req.full_name} (dependent).",
            }).execute()

            return FamilyMemberProfile(
                id=mem_data["id"],
                patient_id=new_patient_id,
                full_name=new_patient["full_name"],
                date_of_birth=new_patient.get("date_of_birth"),
                gender=new_patient.get("gender"),
                phone=new_patient.get("phone"),
                relationship=req.relationship,
                role="dependent",
                can_view_records=req.can_view_records,
                access_status="active",
                is_current_user=False,
                created_at=mem_data["created_at"],
            )
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Failed to add family member {req.full_name}: {str(e)}")
            # Rollback: Delete the created patient record if membership failed
            if 'new_patient_id' in locals():
                try:
                    client.from_("patients").delete().eq("id", new_patient_id).execute()
                    logger.info(f"Rolled back created patient {new_patient_id} due to membership creation failure.")
                except Exception as rollback_e:
                    logger.error(f"Failed to rollback patient {new_patient_id}: {str(rollback_e)}")

            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to add family member: {str(e)}",
            )

    def update_family_member(
        self,
        client: Client,
        user_id: str,
        requester_patient_id: str,
        membership_id: str,
        req: UpdateFamilyMemberRequest,
    ) -> Dict[str, Any]:
        """
        Updates permissions (e.g. can_view_records toggle) or relationship for a member.
        Only group owner or the member themselves can update.
        """
        try:
            # 1. Fetch membership and group and patient dob
            mem_res = (
                client.from_("family_memberships")
                .select("*, family_groups!inner(created_by), patients!inner(date_of_birth)")
                .eq("id", membership_id)
                .maybe_single()
                .execute()
            )
            mem = mem_res.data
            if not mem:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Family membership not found.")

            family_group = mem.get("family_groups") or {}
            group_owner_uid = family_group.get("created_by")
            is_creator = group_owner_uid == user_id
            is_self = mem["patient_id"] == requester_patient_id

            if not (is_creator or is_self):
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have authorization to update this family member.")

            update_data: Dict[str, Any] = {}
            if req.relationship is not None:
                update_data["relationship"] = req.relationship
            if req.access_status is not None:
                update_data["access_status"] = req.access_status

            if req.can_view_records is not None:
                # Rule: do not allow a parent to directly mark a 16+ member as having granted permission.
                patient_data = mem.get("patients") or {}
                dob_str = patient_data.get("date_of_birth")
                age = 0
                if dob_str:
                    try:
                        from datetime import date
                        dob = date.fromisoformat(dob_str)
                        today = date.today()
                        age = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
                    except ValueError:
                        pass
                
                is_dependent = age < 16
                
                if not is_dependent and not is_self and req.can_view_records == True:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN, 
                        detail="You cannot grant record access on behalf of an independent family member (age 16+). The member must grant permission themselves."
                    )
                update_data["can_view_records"] = req.can_view_records

            if not update_data:
                return mem

            res = (
                client.from_("family_memberships")
                .update(update_data)
                .eq("id", membership_id)
                .execute()
            )
            return res.data[0] if res.data else mem
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Failed to update family member {membership_id}: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to update membership: {str(e)}",
            )

    def remove_family_member(
        self,
        client: Client,
        user_id: str,
        requester_patient_id: str,
        membership_id: str,
    ) -> Dict[str, Any]:
        """
        Safely removes a family member from a family group.
        Preserves the member's separate medical history and patient record intact.
        Enforces strict authorization: user must own the group or be the member.
        Prevents removing the primary account holder / group owner.
        """
        try:
            # 1. Fetch membership and parent family group
            mem_res = (
                client.from_("family_memberships")
                .select("*, family_groups!inner(id, name, created_by)")
                .eq("id", membership_id)
                .maybe_single()
                .execute()
            )
            mem = mem_res.data
            if not mem:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Family membership not found.",
                )

            family_group = mem.get("family_groups") or {}
            group_owner_uid = family_group.get("created_by")

            # 2. Authorization check: must be circle creator OR the member themselves
            is_creator = group_owner_uid == user_id
            is_self = mem["patient_id"] == requester_patient_id

            if not (is_creator or is_self):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You do not have authorization to remove this family member.",
                )

            # 3. Guard against removing primary account holder / owner
            if mem.get("role") == "owner" or mem.get("relationship") == "Primary Account Holder":
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="The primary account holder cannot be removed from the family circle.",
                )

            # 4. Safely delete ONLY the family_memberships row (NEVER patient or medical records)
            client.from_("family_memberships").delete().eq("id", membership_id).execute()

            logger.info(f"Membership {membership_id} removed by user {user_id}. Patient records preserved.")
            return {
                "success": True,
                "message": "Family member removed successfully.",
                "membership_id": membership_id,
            }
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error removing family member {membership_id}: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Unable to remove family member: {str(e)}",
            )

    def get_family_invitations(
        self,
        client: Client,
        user_id: str,
        patient_id: str,
        user_email: str,
    ) -> Dict[str, Any]:
        """
        Retrieves invitations for the current user, matching BOTH existing memberships marked pending
        AND new family_invitations matched by email.
        """
        try:
            from app.schemas.family import FamilyInvitationItem, FamilyInvitationsResponse
            invitations_list = []
            
            # 1. Check family_memberships for pending
            mem_res = (
                client.from_("family_memberships")
                .select("id, relationship, created_at, family_groups!inner(id, name, created_by)")
                .eq("patient_id", patient_id)
                .eq("access_status", "pending")
                .execute()
            )
            for mem in (mem_res.data or []):
                fg = mem.get("family_groups", {})
                inviter_uid = fg.get("created_by")
                
                # Fetch inviter name
                inviter_res = client.from_("patients").select("full_name").eq("user_id", inviter_uid).maybe_single().execute()
                inviter_name = inviter_res.data["full_name"] if inviter_res.data else "Unknown Inviter"
                
                invitations_list.append(
                    FamilyInvitationItem(
                        id=mem["id"],
                        family_group_id=fg.get("id"),
                        group_name=fg.get("name", "Unknown Group"),
                        inviter_name=inviter_name,
                        relationship=mem["relationship"],
                        status="pending",
                        created_at=mem["created_at"],
                        is_registered=True,
                    )
                )

            # 2. Check family_invitations by email
            if user_email:
                inv_res = (
                    client.from_("family_invitations")
                    .select("id, family_group_id, relationship, created_at, family_groups!inner(name), patients!inner(full_name)")
                    .ilike("target_email", user_email)
                    .eq("status", "pending")
                    .execute()
                )
                for inv in (inv_res.data or []):
                    fg_name = inv.get("family_groups", {}).get("name", "Unknown Group")
                    inviter_name = inv.get("patients", {}).get("full_name", "Unknown Inviter")
                    
                    invitations_list.append(
                        FamilyInvitationItem(
                            id=inv["id"],
                            family_group_id=inv["family_group_id"],
                            group_name=fg_name,
                            inviter_name=inviter_name,
                            relationship=inv["relationship"],
                            status="pending",
                            created_at=inv["created_at"],
                            is_registered=False,
                        )
                    )

            return FamilyInvitationsResponse(invitations=invitations_list).model_dump()
        except Exception as e:
            logger.error(f"Failed to get family invitations: {str(e)}")
            return {"invitations": []}

    def accept_family_invitation(
        self,
        client: Client,
        user_id: str,
        patient_id: str,
        user_email: str,
        membership_id: str,
    ) -> Dict[str, Any]:
        """
        Accepts a pending family invitation.
        It could be an existing family_memberships row OR a family_invitations row.
        """
        try:
            # Check family_memberships first
            mem_res = client.from_("family_memberships").select("*").eq("id", membership_id).maybe_single().execute()
            if mem_res.data:
                mem = mem_res.data
                if mem.get("access_status") != "pending":
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invitation is not pending.")
                
                if mem.get("patient_id") != patient_id:
                    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have authorization to accept this invitation.")
                
                res = (
                    client.from_("family_memberships")
                    .update({"access_status": "active"})
                    .eq("id", membership_id)
                    .execute()
                )

                client.from_("access_audit_logs").insert({
                    "patient_id": patient_id,
                    "actor": "patient",
                    "action": "family_invitation_accepted",
                    "details": f"Family invitation accepted for membership {membership_id}.",
                }).execute()
                return {"status": "accepted", "medical_record_access": False, "data": res.data[0] if res.data else {}}
            
            # Not in memberships, check family_invitations
            inv_res = client.from_("family_invitations").select("*").eq("id", membership_id).maybe_single().execute()
            if inv_res.data:
                inv = inv_res.data
                if inv.get("status") != "pending":
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invitation is not pending.")
                
                if inv.get("target_email", "").lower() != user_email.lower():
                    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have authorization to accept this invitation.")
                
                # Move to family_memberships
                mem_res = (
                    client.from_("family_memberships")
                    .insert({
                        "family_group_id": inv["family_group_id"],
                        "patient_id": patient_id,
                        "relationship": inv["relationship"],
                        "role": "member",
                        "can_view_records": False,
                        "access_status": "active",
                    })
                    .execute()
                )
                
                # Mark invitation as accepted
                client.from_("family_invitations").update({"status": "accepted"}).eq("id", membership_id).execute()

                client.from_("access_audit_logs").insert({
                    "patient_id": patient_id,
                    "actor": "patient",
                    "action": "family_invitation_accepted",
                    "details": f"Family invitation {membership_id} accepted and account linked.",
                }).execute()
                return {"status": "accepted", "medical_record_access": False, "data": mem_res.data[0] if mem_res.data else {}}
                
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invitation not found.")

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Failed to accept invitation {membership_id}: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to accept invitation: {str(e)}",
            )

    def decline_family_invitation(
        self,
        client: Client,
        user_id: str,
        patient_id: str,
        user_email: str,
        membership_id: str,
    ) -> Dict[str, Any]:
        """
        Declines a pending family invitation.
        """
        try:
            # Check family_memberships
            mem_res = client.from_("family_memberships").select("*").eq("id", membership_id).maybe_single().execute()
            if mem_res.data:
                mem = mem_res.data
                if mem.get("access_status") != "pending":
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invitation is not pending.")
                if mem.get("patient_id") != patient_id:
                    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have authorization to decline this invitation.")
                
                res = client.from_("family_memberships").update({"access_status": "declined"}).eq("id", membership_id).execute()
                
                client.from_("access_audit_logs").insert({
                    "patient_id": patient_id,
                    "actor": "patient",
                    "action": "family_invitation_declined",
                    "details": f"Family invitation declined for membership {membership_id}.",
                }).execute()
                return {"status": "declined", "data": res.data[0] if res.data else {}}
            
            # Check family_invitations
            inv_res = client.from_("family_invitations").select("*").eq("id", membership_id).maybe_single().execute()
            if inv_res.data:
                inv = inv_res.data
                if inv.get("status") != "pending":
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invitation is not pending.")
                if inv.get("target_email", "").lower() != user_email.lower():
                    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have authorization to decline this invitation.")
                
                res = client.from_("family_invitations").update({"status": "declined"}).eq("id", membership_id).execute()
                
                client.from_("access_audit_logs").insert({
                    "patient_id": patient_id, # Using the decliner's patient ID for the audit
                    "actor": "patient",
                    "action": "family_invitation_declined",
                    "details": f"Family invitation {membership_id} declined.",
                }).execute()
                return {"status": "declined", "data": res.data[0] if res.data else {}}
                
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invitation not found.")

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Failed to decline invitation {membership_id}: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to decline invitation: {str(e)}",
            )

    def verify_family_view_permission(
        self,
        client: Client,
        requester_user_id: str,
        requester_patient_id: str,
        target_patient_id: str,
    ) -> bool:
        """
        Strict server-side authorization check.
        Returns True if:
        1. requester_patient_id == target_patient_id (accessing own records)
        2. requester belongs to a family group where target_patient_id has can_view_records=True AND access_status='active'.
        3. target_patient_id age rule is satisfied.
        """
        if requester_patient_id == target_patient_id:
            return True

        try:
            # Check if target patient has authorized records sharing in any active family group
            # and check their age constraint
            res = (
                client.from_("family_memberships")
                .select("id, family_group_id, can_view_records, access_status, patients!inner(date_of_birth, user_id)")
                .eq("patient_id", target_patient_id)
                .eq("can_view_records", True)
                .eq("access_status", "active")
                .execute()
            )
            
            valid_groups = []
            for row in (res.data or []):
                patient_data = row.get("patients") or {}
                dob_str = patient_data.get("date_of_birth")
                age = 0
                if dob_str:
                    try:
                        from datetime import date
                        dob = date.fromisoformat(dob_str)
                        today = date.today()
                        age = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
                    except ValueError:
                        pass
                
                is_dependent = age < 16
                
                if is_dependent:
                    # Dependent under 16: Active and can_view_records=True is sufficient
                    valid_groups.append(row["family_group_id"])
                else:
                    # 16 or older: Must have their own user_id linked!
                    # and must be active + can_view_records
                    if patient_data.get("user_id"):
                        valid_groups.append(row["family_group_id"])
                        
            if not valid_groups:
                return False

            # Check if requester is in any of those groups
            my_res = (
                client.from_("family_memberships")
                .select("id")
                .in_("family_group_id", valid_groups)
                .eq("patient_id", requester_patient_id)
                .eq("access_status", "active")
                .execute()
            )
            return bool(my_res.data)
        except Exception as e:
            logger.warning(f"Error checking family view permission in database: {str(e)}")
            return False


family_service = FamilyService()
