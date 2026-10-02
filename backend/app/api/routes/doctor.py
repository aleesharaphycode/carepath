import logging
from fastapi import APIRouter, Request, HTTPException, status
from app.core.security import get_supabase_admin
from app.services.consent_service import consent_service
from app.schemas.consent import DoctorAccessResponse, DoctorAccessStatusResponse, DoctorAccessVerifyRequest

logger = logging.getLogger("carepath.routes.doctor")

router = APIRouter(prefix="/api/doctor", tags=["Doctor Access Portal"])


@router.get("/access/{token}", response_model=DoctorAccessStatusResponse)
async def check_doctor_access_status(token: str, request: Request):
    """
    Checks if a temporary doctor access token is valid and requires a PIN.
    Does NOT return any patient medical records.
    """
    admin_client = get_supabase_admin()
    logger.info(f"Doctor access status check for token prefix: {token[:8]}...")
    return consent_service.check_doctor_access_status(
        client=admin_client,
        token=token,
    )


@router.post("/access/{token}/verify", response_model=DoctorAccessResponse)
async def verify_doctor_access(token: str, payload: DoctorAccessVerifyRequest, request: Request):
    """
    Verifies the 6-digit PIN and consumes the capability token.
    Returns data strictly limited to the consented scope.
    """
    admin_client = get_supabase_admin()
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        ip_addr = forwarded_for.split(",")[0].strip()
    else:
        ip_addr = request.client.host if request.client else None

    logger.info(f"Doctor access validation requested for token prefix: {token[:8]}...")
    return consent_service.validate_doctor_access_with_pin(
        client=admin_client,
        token=token,
        pin=payload.verification_code,
        ip_address=ip_addr,
    )
