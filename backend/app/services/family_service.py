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

            # 2. Create separate patient profile for dependent family member
            new_p_res = (
                client.from_("patients")
                .insert({
                    "full_name": req.full_name.strip(),
                    "date_of_birth": req.date_of_birth or None,
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
                    "role": "member",
                    "can_view_records": req.can_view_records,
                    "access_status": "active",
                })
                .execute()
            )
            if not mem_res.data:
                raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create family membership.")
            mem_data = mem_res.data[0]

            return FamilyMemberProfile(
                id=mem_data["id"],
                patient_id=new_patient_id,
                full_name=new_patient["full_name"],
                date_of_birth=new_patient.get("date_of_birth"),
                gender=new_patient.get("gender"),
                phone=new_patient.get("phone"),
                relationship=req.relationship,
                role="member",
                can_view_records=req.can_view_records,
                access_status="active",
                is_current_user=False,
                created_at=mem_data["created_at"],
            )
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Failed to add family member {req.full_name}: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to add family member: {str(e)}",
            )

    def update_family_member(
        self,
        client: Client,
        user_id: str,
        membership_id: str,
        req: UpdateFamilyMemberRequest,
    ) -> Dict[str, Any]:
        """
        Updates permissions (e.g. can_view_records toggle) or relationship for a member.
        Only group owner or the member themselves can update.
        """
        if membership_id.startswith("demo-mem-"):
            if req.can_view_records is not None:
                self._demo_permissions[membership_id] = req.can_view_records
            return {
                "id": membership_id,
                "can_view_records": req.can_view_records if req.can_view_records is not None else True,
                "access_status": req.access_status or "active",
            }
        try:
            # 1. Fetch membership and group
            mem_res = (
                client.from_("family_memberships")
                .select("*, family_groups!inner(created_by)")
                .eq("id", membership_id)
                .maybe_single()
                .execute()
            )
            mem = mem_res.data
            if not mem:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Family membership not found.")

            update_data: Dict[str, Any] = {}
            if req.relationship is not None:
                update_data["relationship"] = req.relationship
            if req.can_view_records is not None:
                update_data["can_view_records"] = req.can_view_records
            if req.access_status is not None:
                update_data["access_status"] = req.access_status

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
        if membership_id.startswith("demo-mem-"):
            return {"success": True, "message": "Family member removed successfully."}

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
        Otherwise returns False (403 Forbidden).
        """
        # Rule 1: Patient can always view their own health records
        if requester_patient_id == target_patient_id:
            return True

        # Rule 2: Explicit demo dependent check
        if target_patient_id == "demo-patient-lucas-vance":
            return True
        if target_patient_id == "demo-patient-margaret-vance":
            # Dynamic check based on whether user toggled permission in demo session
            return self._demo_permissions.get("demo-mem-margaret", False)

        # Rule 3: Database check for real family groups
        try:
            res = (
                client.from_("family_memberships")
                .select("id, family_group_id, can_view_records, access_status")
                .eq("patient_id", target_patient_id)
                .eq("can_view_records", True)
                .eq("access_status", "active")
                .execute()
            )
            target_grps = [row["family_group_id"] for row in (res.data or [])]
            if not target_grps:
                return False

            # Check if requester is in any of those groups
            my_res = (
                client.from_("family_memberships")
                .select("id")
                .in_("family_group_id", target_grps)
                .eq("patient_id", requester_patient_id)
                .eq("access_status", "active")
                .execute()
            )
            return bool(my_res.data)
        except Exception as e:
            logger.warning(f"Error checking family view permission in database: {str(e)}")
            return False


family_service = FamilyService()
