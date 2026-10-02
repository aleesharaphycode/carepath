import logging
from typing import Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Request
from app.core.config import settings
from app.core.security import get_current_user, get_current_patient, get_supabase_admin
from app.services.consent_service import consent_service
from app.schemas.consent import (
    CreateConsentRequest,
    ConsentSessionItem,
    ConsentSessionListResponse,
    RevokeConsentResponse,
    AuditLogResponse,
)

logger = logging.getLogger("carepath.routes.consent")

router = APIRouter(prefix="/api/consent", tags=["Consent & QR Sharing"])


@router.post("", response_model=ConsentSessionItem)
async def create_consent_session(
    req: CreateConsentRequest,
    request: Request,
    user: Any = Depends(get_current_user),
    patient: Dict[str, Any] = Depends(get_current_patient),
):
    """
    Creates a temporary, time-bound consent session for an attending doctor.
    Generates a cryptographically secure token and QR access URL.
    """
    admin_client = get_supabase_admin()
    # Resolve public base URL: Prefer configured APP_URL, then frontend x-app-url header, then origin, then default
    base_url = (
        settings.APP_URL
        or request.headers.get("x-app-url")
        or request.headers.get("origin")
        or "http://localhost:3000"
    ).rstrip("/")

    return consent_service.create_consent_session(
        client=admin_client,
        user_id=user.id,
        creator_patient_id=patient["id"],
        req=req,
        base_url=base_url,
    )


@router.get("", response_model=ConsentSessionListResponse)
async def list_consent_sessions(
    request: Request,
    user: Any = Depends(get_current_user),
    patient: Dict[str, Any] = Depends(get_current_patient),
):
    """
    Retrieves all consent sessions generated for the authenticated patient or dependents.
    Automatically checks and marks expired sessions server-side.
    """
    admin_client = get_supabase_admin()
    base_url = (
        settings.APP_URL
        or request.headers.get("x-app-url")
        or request.headers.get("origin")
        or "http://localhost:3000"
    ).rstrip("/")
    return consent_service.get_consent_sessions(
        client=admin_client,
        user_id=user.id,
        patient_id=patient["id"],
        base_url=base_url,
    )


@router.post("/{session_id}/revoke", response_model=RevokeConsentResponse)
async def revoke_consent_session(
    session_id: str,
    user: Any = Depends(get_current_user),
    patient: Dict[str, Any] = Depends(get_current_patient),
):
    """
    Immediately revokes an active doctor access session.
    Server-side invalidation ensures immediate blockage of further requests.
    """
    admin_client = get_supabase_admin()
    return consent_service.revoke_consent_session(
        client=admin_client,
        user_id=user.id,
        patient_id=patient["id"],
        session_id=session_id,
    )


@router.post("/{session_id}/approve", response_model=Dict[str, Any])
async def approve_consent_session(
    session_id: str,
    user: Any = Depends(get_current_user),
    patient: Dict[str, Any] = Depends(get_current_patient),
):
    """
    Approves a pending doctor access request (adds APPROVED to scope).
    """
    admin_client = get_supabase_admin()
    return consent_service.approve_consent_session(
        client=admin_client,
        user_id=user.id,
        patient_id=patient["id"],
        session_id=session_id,
    )


@router.get("/audit", response_model=AuditLogResponse)
async def get_access_audit_logs(
    user: Any = Depends(get_current_user),
    patient: Dict[str, Any] = Depends(get_current_patient),
):
    """
    Retrieves the append-only access audit log for the authenticated patient.
    """
    admin_client = get_supabase_admin()
    return consent_service.get_audit_logs(
        client=admin_client,
        patient_id=patient["id"],
    )
