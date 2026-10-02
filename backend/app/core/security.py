import logging
from typing import Dict, Any
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from supabase import create_client, Client
from app.core.config import settings

logger = logging.getLogger("carepath.security")

security_scheme = HTTPBearer(auto_error=False)

_supabase_admin: Client = None


def get_supabase_admin() -> Client:
    """
    Returns an initialized Supabase admin client using service-role credentials.
    This client is strictly server-side and never exposed to the frontend.
    """
    global _supabase_admin
    if _supabase_admin is None:
        if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_ROLE_KEY:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Supabase server credentials are not configured on the backend.",
            )
        _supabase_admin = create_client(
            settings.SUPABASE_URL,
            settings.SUPABASE_SERVICE_ROLE_KEY,
        )
    return _supabase_admin


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme),
) -> Any:
    """
    Verifies the Supabase JWT access token sent in the Authorization header.
    Never trusts client-supplied user_id or claims.
    """
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Missing Bearer authorization token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    admin_client = get_supabase_admin()
    token = credentials.credentials

    try:
        # Validate JWT token cryptographically and verify session with Supabase Auth
        response = admin_client.auth.get_user(jwt=token)
        if not response or not response.user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired access token.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return response.user
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"Auth token validation failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session could not be verified. Please log in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_current_patient(
    user: Any = Depends(get_current_user),
    admin_client: Client = Depends(get_supabase_admin),
) -> Dict[str, Any]:
    """
    Derives the authenticated patient profile strictly from the verified session user_id.
    Ownership relationship: auth.users (auth.uid) -> patients.user_id -> patients.id.
    """
    try:
        res = (
            admin_client.from_("patients")
            .select("id, user_id, full_name, date_of_birth, gender, phone")
            .eq("user_id", user.id)
            .maybe_single()
            .execute()
        )

        patient = res.data
        if not patient:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Patient profile not found. Please complete demographic onboarding before processing records.",
            )

        return patient
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error resolving patient profile for user {user.id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to resolve patient ownership record.",
        )
