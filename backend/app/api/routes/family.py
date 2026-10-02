import logging
from typing import Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from app.core.security import get_current_user, get_current_patient, get_supabase_admin
from app.services.family_service import family_service
from app.services.intelligence_service import intelligence_service
from app.schemas.family import (
    FamilyDashboardResponse,
    FamilyGroupItem,
    FamilyMemberProfile,
    CreateFamilyGroupRequest,
    AddFamilyMemberRequest,
    UpdateFamilyMemberRequest,
    FamilyInvitationsResponse,
)

logger = logging.getLogger("carepath.routes.family")

router = APIRouter(prefix="/api/family", tags=["Family Dashboard"])


@router.get("", response_model=FamilyDashboardResponse)
async def get_family_dashboard(
    user: Any = Depends(get_current_user),
    patient: Dict[str, Any] = Depends(get_current_patient),
):
    """
    Retrieves the patient's family groups and member profiles.
    Strictly preserves independent medical records for each family member.
    """
    admin_client = get_supabase_admin()
    return family_service.get_family_dashboard(
        client=admin_client,
        user_id=user.id,
        patient_id=patient["id"],
    )


@router.post("", response_model=FamilyGroupItem)
async def create_family_group(
    req: CreateFamilyGroupRequest,
    user: Any = Depends(get_current_user),
    patient: Dict[str, Any] = Depends(get_current_patient),
):
    """
    Creates a new family circle and designates the authenticated patient as owner.
    """
    admin_client = get_supabase_admin()
    return family_service.create_family_group(
        client=admin_client,
        user_id=user.id,
        patient_id=patient["id"],
        name=req.name,
    )


@router.post("/members", response_model=FamilyMemberProfile)
async def add_family_member(
    req: AddFamilyMemberRequest,
    user: Any = Depends(get_current_user),
    patient: Dict[str, Any] = Depends(get_current_patient),
):
    """
    Registers a family member or dependent with their own independent patient identity.
    """
    admin_client = get_supabase_admin()
    return family_service.add_family_member(
        client=admin_client,
        user_id=user.id,
        creator_patient_id=patient["id"],
        req=req,
    )


@router.patch("/members/{membership_id}")
async def update_family_member(
    membership_id: str,
    req: UpdateFamilyMemberRequest,
    user: Any = Depends(get_current_user),
    patient: Dict[str, Any] = Depends(get_current_patient),
):
    """
    Updates access permissions (e.g. can_view_records) or relationship metadata.
    """
    admin_client = get_supabase_admin()
    return family_service.update_family_member(
        client=admin_client,
        user_id=user.id,
        requester_patient_id=patient["id"],
        membership_id=membership_id,
        req=req,
    )


@router.delete("/members/{membership_id}")
async def remove_family_member(
    membership_id: str,
    user: Any = Depends(get_current_user),
    patient: Dict[str, Any] = Depends(get_current_patient),
):
    """
    Safely removes a family member from a family circle.
    Preserves the member's separate medical history and patient records.
    """
    admin_client = get_supabase_admin()
    return family_service.remove_family_member(
        client=admin_client,
        user_id=user.id,
        requester_patient_id=patient["id"],
        membership_id=membership_id,
    )


@router.get("/invitations", response_model=FamilyInvitationsResponse)
async def get_family_invitations(
    user: Any = Depends(get_current_user),
    patient: Dict[str, Any] = Depends(get_current_patient),
):
    """
    Retrieves pending family invitations for the authenticated user.
    """
    admin_client = get_supabase_admin()
    return family_service.get_family_invitations(
        client=admin_client,
        user_id=user.id,
        patient_id=patient["id"],
        user_email=user.email,
    )


@router.post("/members/invitations/{membership_id}/accept")
async def accept_family_invitation(
    membership_id: str,
    user: Any = Depends(get_current_user),
    patient: Dict[str, Any] = Depends(get_current_patient),
):
    """
    Accepts a pending family invitation for a 16+ member.
    Links the membership to the authenticated user's patient profile.
    """
    admin_client = get_supabase_admin()
    return family_service.accept_family_invitation(
        client=admin_client,
        user_id=user.id,
        patient_id=patient["id"],
        user_email=user.email,
        membership_id=membership_id,
    )


@router.post("/members/invitations/{membership_id}/decline")
async def decline_family_invitation(
    membership_id: str,
    user: Any = Depends(get_current_user),
    patient: Dict[str, Any] = Depends(get_current_patient),
):
    """
    Declines a pending family invitation for a 16+ member.
    """
    admin_client = get_supabase_admin()
    return family_service.decline_family_invitation(
        client=admin_client,
        user_id=user.id,
        patient_id=patient["id"],
        user_email=user.email,
        membership_id=membership_id,
    )


@router.get("/members/{target_patient_id}/records")
async def get_family_member_records(
    target_patient_id: str,
    user: Any = Depends(get_current_user),
    patient: Dict[str, Any] = Depends(get_current_patient),
):
    """
    Retrieves medical records of an authorized family member.
    Enforces strict server-side permission check: can_view_records == True AND access_status == 'active'.
    If unauthorized, returns 403 Forbidden.
    """
    admin_client = get_supabase_admin()
    my_patient_id = patient["id"]

    is_authorized = family_service.verify_family_view_permission(
        client=admin_client,
        requester_user_id=user.id,
        requester_patient_id=my_patient_id,
        target_patient_id=target_patient_id,
    )

    if not is_authorized:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. You do not have authorization to view this family member's clinical records.",
        )

    # Authorized! Fetch target member's timeline, diagnoses, medications, and investigations
    timeline = intelligence_service.get_timeline(client=admin_client, patient_id=target_patient_id)
    meds = admin_client.from_("medications").select("*").eq("patient_id", target_patient_id).execute()
    diags = admin_client.from_("diagnoses").select("*").eq("patient_id", target_patient_id).execute()
    invs = admin_client.from_("investigations").select("*").eq("patient_id", target_patient_id).execute()
    procs = admin_client.from_("procedures").select("*").eq("patient_id", target_patient_id).execute()
    docs = admin_client.from_("documents").select("id, file_name, file_type, document_type, uploaded_at").eq("patient_id", target_patient_id).execute()

    return {
        "patient_id": target_patient_id,
        "timeline": timeline,
        "medications": meds.data or [],
        "diagnoses": diags.data or [],
        "investigations": invs.data or [],
        "procedures": procs.data or [],
        "documents": docs.data or [],
    }
