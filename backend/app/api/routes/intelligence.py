import logging
from typing import Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from app.core.security import get_current_patient, get_supabase_admin
from app.services.intelligence_service import intelligence_service
from app.schemas.intelligence import (
    TimelineResponse,
    CalendarResponse,
    MismatchResponse,
)

logger = logging.getLogger("carepath.routes.intelligence")

router = APIRouter(prefix="/api", tags=["Health Intelligence Engine"])


@router.get("/timeline", response_model=TimelineResponse)
async def get_timeline(
    patient: Dict[str, Any] = Depends(get_current_patient),
):
    """
    Retrieves the patient's unified chronological health journey.
    Combines diagnoses, medications, investigations, procedures, and follow-ups.
    Enforces deterministic patient profile ownership via Supabase JWT.
    """
    try:
        admin_client = get_supabase_admin()
        patient_id = patient["id"]
        logger.info(f"Timeline requested for patient {patient_id}")
        return intelligence_service.get_timeline(client=admin_client, patient_id=patient_id)
    except Exception as e:
        logger.error(f"Failed to generate timeline for patient {patient.get('id')}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate health timeline: {str(e)}",
        )


@router.get("/calendar", response_model=CalendarResponse)
async def get_calendar(
    patient: Dict[str, Any] = Depends(get_current_patient),
):
    """
    Retrieves the healthcare calendar.
    Distinguishes confirmed clinical dates from deterministically projected dates.
    """
    try:
        admin_client = get_supabase_admin()
        patient_id = patient["id"]
        logger.info(f"Calendar requested for patient {patient_id}")
        return intelligence_service.get_calendar(client=admin_client, patient_id=patient_id)
    except Exception as e:
        logger.error(f"Failed to generate calendar for patient {patient.get('id')}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate healthcare calendar: {str(e)}",
        )


@router.get("/mismatches", response_model=MismatchResponse)
async def get_mismatches(
    patient: Dict[str, Any] = Depends(get_current_patient),
):
    """
    Retrieves cross-document potential information mismatches with bidirectional provenance.
    Strictly factual comparison — never claims clinical malpractice or declares correctness.
    """
    try:
        admin_client = get_supabase_admin()
        patient_id = patient["id"]
        logger.info(f"Mismatches requested for patient {patient_id}")
        return intelligence_service.get_mismatches(client=admin_client, patient_id=patient_id)
    except Exception as e:
        logger.error(f"Failed to detect mismatches for patient {patient.get('id')}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to detect cross-document mismatches: {str(e)}",
        )
