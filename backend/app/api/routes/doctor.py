import logging
from fastapi import APIRouter, Request, HTTPException, status
from app.core.security import get_supabase_admin
from app.services.consent_service import consent_service
from app.schemas.consent import DoctorAccessResponse

logger = logging.getLogger("carepath.routes.doctor")

router = APIRouter(prefix="/api/doctor", tags=["Doctor Access Portal"])


@router.get("/access/{token}", response_model=DoctorAccessResponse)
async def validate_doctor_access(token: str, request: Request):
    """
    Validates a temporary doctor access token generated via patient QR code.
    Enforces server-side token validation, revocation checks, and expiration.
    Returns data strictly limited to the consented scope.
    """
    admin_client = get_supabase_admin()
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        ip_addr = forwarded_for.split(",")[0].strip()
    else:
        ip_addr = request.client.host if request.client else None

    logger.info(f"Doctor access validation requested for token prefix: {token[:8]}...")
    return consent_service.validate_doctor_access(
        client=admin_client,
        token=token,
        ip_address=ip_addr,
    )
