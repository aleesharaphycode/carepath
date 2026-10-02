from typing import Optional, Literal
from pydantic import BaseModel, Field


HealthEventType = Literal["visit", "test", "medication", "procedure", "follow_up"]
HealthEventStatus = Literal["completed", "planned"]


class HealthEventCreate(BaseModel):
    """
    Schema for creating a confirmed healthcare event.
    """
    event_date: str = Field(description="Date when the healthcare event occurred or is planned (YYYY-MM-DD)")
    event_type: HealthEventType = Field(default="visit", description="Type of healthcare event")
    title: str = Field(min_length=1, description="Concise descriptive title of event")
    doctor_name: Optional[str] = Field(default=None, description="Attending physician or specialist name")
    clinic_name: Optional[str] = Field(default=None, description="Hospital, clinic, or facility name")
    location: Optional[str] = Field(default=None, description="Physical location or facility branch")
    description: Optional[str] = Field(default=None, description="Clinical summary, prescription instructions, or notes")
    status: HealthEventStatus = Field(default="completed", description="Historical (completed) or upcoming (planned)")
    document_id: Optional[str] = Field(default=None, description="Source document UUID if originated from a vault document")
    patient_id: Optional[str] = Field(default=None, description="Optional target patient UUID for authorized dependents")


class HealthEventUpdate(BaseModel):
    """
    Schema for updating an existing healthcare event.
    """
    event_date: Optional[str] = None
    event_type: Optional[HealthEventType] = None
    title: Optional[str] = None
    doctor_name: Optional[str] = None
    clinic_name: Optional[str] = None
    location: Optional[str] = None
    description: Optional[str] = None
    status: Optional[HealthEventStatus] = None


class HealthEventItem(BaseModel):
    """
    Full healthcare event model returned from the API.
    """
    id: str
    patient_id: str
    document_id: Optional[str] = None
    event_date: str
    event_type: str
    title: str
    doctor_name: Optional[str] = None
    clinic_name: Optional[str] = None
    location: Optional[str] = None
    description: Optional[str] = None
    status: str
    document_name: Optional[str] = None
    created_at: str


class HealthEventCandidate(BaseModel):
    """
    Candidate healthcare event extracted from an existing or newly analyzed document,
    awaiting patient confirmation.
    """
    document_id: str
    document_name: str
    document_type: str
    detected_date: Optional[str] = None
    confidence_is_date_confirmed: bool = False
    suggested_event_type: str = "visit"
    suggested_title: str
    doctor_name: Optional[str] = None
    clinic_name: Optional[str] = None
    location: Optional[str] = None
    description: Optional[str] = None
    status: str = "completed"
