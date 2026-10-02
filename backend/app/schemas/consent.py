from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


ALLOWED_CONSENT_SCOPES = [
    "profile",
    "diagnoses",
    "medications",
    "investigations",
    "procedures",
    "timeline",
    "documents",
    "follow_ups",
]


class CreateConsentRequest(BaseModel):
    patient_id: Optional[str] = Field(default=None, description="Patient UUID for self or authorized dependent")
    recipient_name: str = Field(min_length=2, max_length=120, description="Doctor or clinic name (e.g. Dr. Sarah Jenkins)")
    scope: List[str] = Field(default_factory=lambda: ["timeline", "diagnoses", "medications", "investigations"])
    duration_minutes: int = Field(default=60, ge=5, le=10080, description="Session validity duration in minutes (e.g. 15, 60, 1440)")


class ConsentSessionItem(BaseModel):
    id: str
    patient_id: str
    patient_name: str
    recipient_name: str
    access_token: str
    qr_access_url: str
    scope: List[str]
    duration_minutes: int
    expires_at: str
    revoked_at: Optional[str] = None
    status: str
    created_at: str


class ConsentSessionListResponse(BaseModel):
    sessions: List[ConsentSessionItem] = Field(default_factory=list)


class RevokeConsentResponse(BaseModel):
    success: bool
    session_id: str
    message: str
    revoked_at: str


class AuditLogItem(BaseModel):
    id: str
    session_id: Optional[str] = None
    patient_id: str
    actor: str
    action: str
    details: str
    ip_address: Optional[str] = None
    timestamp: str


class AuditLogResponse(BaseModel):
    logs: List[AuditLogItem] = Field(default_factory=list)


class DoctorAccessResponse(BaseModel):
    session_id: str
    recipient_name: str
    patient_name: str
    scope: List[str]
    expires_at: str
    time_remaining_seconds: int
    is_active: bool
    # Scoped Data: strictly None if not included in consent scope
    profile: Optional[Dict[str, Any]] = None
    diagnoses: Optional[List[Dict[str, Any]]] = None
    medications: Optional[List[Dict[str, Any]]] = None
    investigations: Optional[List[Dict[str, Any]]] = None
    procedures: Optional[List[Dict[str, Any]]] = None
    follow_ups: Optional[List[Dict[str, Any]]] = None
    timeline: Optional[List[Dict[str, Any]]] = None
    documents: Optional[List[Dict[str, Any]]] = None
