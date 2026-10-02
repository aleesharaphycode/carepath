import logging
from typing import Dict, Any, List
from fastapi import APIRouter, Depends, HTTPException, status
from app.core.security import get_current_user, get_current_patient, get_supabase_admin
from app.services.insurance_service import insurance_claim_service
from app.schemas.insurance import (
    InsuranceClaimCreate,
    InsuranceClaimResponse,
    InsuranceClaimListResponse,
)

logger = logging.getLogger("carepath.routes.insurance")

router = APIRouter(prefix="/api/insurance", tags=["Insurance Claim Assistant"])


@router.post("/claims", response_model=InsuranceClaimResponse, status_code=status.HTTP_201_CREATED)
async def create_claim(
    claim_in: InsuranceClaimCreate,
    current_patient: Dict[str, Any] = Depends(get_current_patient),
):
    """
    Creates an insurance claim record for the authenticated patient and
    evaluates their Document Vault deterministically against the required checklist.
    """
    admin_client = get_supabase_admin()
    patient_id = current_patient["id"]

    try:
        claim = insurance_claim_service.create_claim(
            client=admin_client,
            patient_id=patient_id,
            claim_in=claim_in,
        )
        return claim
    except Exception as e:
        logger.error(f"Error creating insurance claim for patient {patient_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create insurance claim: {str(e)}",
        )


@router.get("/claims", response_model=InsuranceClaimListResponse)
async def list_claims(
    current_patient: Dict[str, Any] = Depends(get_current_patient),
):
    """
    Retrieves all insurance claims for the authenticated patient.
    Strictly isolated by patient ownership.
    """
    admin_client = get_supabase_admin()
    patient_id = current_patient["id"]

    try:
        claims = insurance_claim_service.get_claims(
            client=admin_client,
            patient_id=patient_id,
        )
        return InsuranceClaimListResponse(claims=claims, total=len(claims))
    except Exception as e:
        logger.error(f"Error listing insurance claims for patient {patient_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve insurance claims.",
        )


@router.get("/claims/{claim_id}", response_model=InsuranceClaimResponse)
async def get_claim(
    claim_id: str,
    current_patient: Dict[str, Any] = Depends(get_current_patient),
):
    """
    Retrieves a single insurance claim by ID with full checklist and matched sources.
    Strictly verifies patient ownership.
    """
    admin_client = get_supabase_admin()
    patient_id = current_patient["id"]

    claim = insurance_claim_service.get_claim_by_id(
        client=admin_client,
        patient_id=patient_id,
        claim_id=claim_id,
    )
    if not claim:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Insurance claim not found or does not belong to you.",
        )

    return claim


@router.post("/claims/{claim_id}/recheck", response_model=InsuranceClaimResponse)
async def recheck_claim(
    claim_id: str,
    current_patient: Dict[str, Any] = Depends(get_current_patient),
):
    """
    Re-evaluates the insurance checklist against the latest documents in the patient's vault.
    Useful after uploading new bills, discharge summaries, or receipts.
    """
    admin_client = get_supabase_admin()
    patient_id = current_patient["id"]

    claim = insurance_claim_service.recheck_claim(
        client=admin_client,
        patient_id=patient_id,
        claim_id=claim_id,
    )
    if not claim:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Insurance claim not found.",
        )

    return claim


@router.delete("/claims/{claim_id}", status_code=status.HTTP_200_OK)
async def delete_claim(
    claim_id: str,
    current_patient: Dict[str, Any] = Depends(get_current_patient),
):
    """
    Deletes an insurance claim.
    """
    admin_client = get_supabase_admin()
    patient_id = current_patient["id"]

    deleted = insurance_claim_service.delete_claim(
        client=admin_client,
        patient_id=patient_id,
        claim_id=claim_id,
    )
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Insurance claim not found or already deleted.",
        )

    return {"success": True, "message": "Insurance claim deleted successfully."}
