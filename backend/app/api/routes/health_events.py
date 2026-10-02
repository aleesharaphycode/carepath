import logging
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from app.core.security import get_current_user, get_current_patient, get_supabase_admin
from app.services.health_event_service import health_event_service
from app.services.family_service import family_service
from app.schemas.health_events import (
    HealthEventCreate,
    HealthEventUpdate,
    HealthEventItem,
    HealthEventCandidate,
)

logger = logging.getLogger("carepath.routes.health_events")

router = APIRouter(prefix="/api/health-events", tags=["Health Events & Calendar"])


@router.get("", response_model=List[HealthEventItem])
async def get_health_events(
    patient_id: Optional[str] = Query(None, description="Optional target patient ID for family dependents"),
    user: Any = Depends(get_current_user),
    current_patient: Dict[str, Any] = Depends(get_current_patient),
):
    """
    Retrieves all confirmed and planned health events for the patient.
    Strictly verifies ownership or family authorized view permissions.
    """
    admin_client = get_supabase_admin()
    target_patient_id = current_patient["id"]

    if patient_id and patient_id != current_patient["id"]:
        is_authorized = family_service.verify_family_view_permission(
            client=admin_client,
            requester_user_id=user.id,
            requester_patient_id=current_patient["id"],
            target_patient_id=patient_id,
        )
        if not is_authorized:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied. You do not have permission to view health events for this patient.",
            )
        target_patient_id = patient_id

    return health_event_service.get_health_events(client=admin_client, patient_id=target_patient_id)


@router.post("", response_model=HealthEventItem, status_code=status.HTTP_201_CREATED)
async def create_health_event(
    req: HealthEventCreate,
    user: Any = Depends(get_current_user),
    current_patient: Dict[str, Any] = Depends(get_current_patient),
):
    """
    Creates a new healthcare event record.
    The healthcare occurrence date is authoritative and provided by the patient / confirmed from AI.
    Never silently falls back to document upload timestamps.
    """
    admin_client = get_supabase_admin()
    target_patient_id = current_patient["id"]

    if req.patient_id and req.patient_id != current_patient["id"]:
        is_authorized = family_service.verify_family_view_permission(
            client=admin_client,
            requester_user_id=user.id,
            requester_patient_id=current_patient["id"],
            target_patient_id=req.patient_id,
        )
        if not is_authorized:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied. You do not have permission to create events for this patient.",
            )
        target_patient_id = req.patient_id

    return health_event_service.create_health_event(
        client=admin_client,
        patient_id=target_patient_id,
        data=req,
    )


@router.get("/candidates", response_model=List[HealthEventCandidate])
async def get_event_candidates(
    patient_id: Optional[str] = Query(None, description="Optional target patient ID"),
    user: Any = Depends(get_current_user),
    current_patient: Dict[str, Any] = Depends(get_current_patient),
):
    """
    Retrieves unconfirmed healthcare event candidates extracted from patient documents.
    Allows user to review AI-detected dates and confirm actual healthcare events.
    """
    admin_client = get_supabase_admin()
    target_patient_id = current_patient["id"]

    if patient_id and patient_id != current_patient["id"]:
        is_authorized = family_service.verify_family_view_permission(
            client=admin_client,
            requester_user_id=user.id,
            requester_patient_id=current_patient["id"],
            target_patient_id=patient_id,
        )
        if not is_authorized:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied.",
            )
        target_patient_id = patient_id

    return health_event_service.get_candidates(client=admin_client, patient_id=target_patient_id)


@router.patch("/{event_id}", response_model=HealthEventItem)
async def update_health_event(
    event_id: str,
    req: HealthEventUpdate,
    user: Any = Depends(get_current_user),
    current_patient: Dict[str, Any] = Depends(get_current_patient),
):
    """
    Modifies an existing healthcare event.
    """
    admin_client = get_supabase_admin()
    return health_event_service.update_health_event(
        client=admin_client,
        authorized_patient_id=current_patient["id"],
        event_id=event_id,
        data=req,
    )


@router.delete("/{event_id}")
async def delete_health_event(
    event_id: str,
    user: Any = Depends(get_current_user),
    current_patient: Dict[str, Any] = Depends(get_current_patient),
):
    """
    Deletes a healthcare event.
    """
    admin_client = get_supabase_admin()
    health_event_service.delete_health_event(
        client=admin_client,
        authorized_patient_id=current_patient["id"],
        event_id=event_id,
    )
    return {"success": True, "message": "Health event deleted successfully."}
