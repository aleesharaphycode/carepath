from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


class InsuranceClaimCreate(BaseModel):
    insurance_provider: str = Field(..., min_length=2, max_length=150, description="Name of insurance provider")
    claim_type: str = Field(default="hospitalization", description="Type of claim (e.g. hospitalization)")
    hospital_name: str = Field(..., min_length=2, max_length=200, description="Hospital or clinic name")
    admission_date: str = Field(..., description="Date of admission (YYYY-MM-DD)")
    discharge_date: str = Field(..., description="Date of discharge (YYYY-MM-DD)")
    claim_amount: Optional[float] = Field(default=None, ge=0, description="Estimated claim reimbursement amount")
    policy_number: Optional[str] = Field(default=None, max_length=100, description="Policy or member identification number")


class OtherDocumentMatch(BaseModel):
    document_id: str
    file_name: str
    document_type: Optional[str] = None
    confidence: float = 0.5


class InsuranceClaimItem(BaseModel):
    id: str
    claim_id: str
    requirement: str
    status: str = Field(..., description="'found' | 'needs_verification' | 'missing'")
    matched_document_id: Optional[str] = None
    matched_document_name: Optional[str] = None
    explanation: Optional[str] = None
    confidence_score: Optional[float] = 1.0
    evidence: Optional[Dict[str, Any]] = None
    other_matches: Optional[List[OtherDocumentMatch]] = []
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class InsuranceClaimResponse(BaseModel):
    id: str
    patient_id: str
    insurance_provider: str
    claim_type: str
    hospital_name: str
    admission_date: str
    discharge_date: str
    claim_amount: Optional[float] = None
    policy_number: Optional[str] = None
    items: List[InsuranceClaimItem] = []
    found_count: int = 0
    needs_verification_count: int = 0
    missing_count: int = 0
    total_items: int = 0
    readiness_percentage: int = 0
    network_status: str = "Not verified"
    checklist_source: str = "General claim-preparation checklist (verify against your policy/insurer)"
    disclaimer_note: Optional[str] = "Requirements may vary by insurer and policy. Verify the final checklist with your insurance provider."
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class InsuranceClaimListResponse(BaseModel):
    claims: List[InsuranceClaimResponse] = []
    total: int = 0
