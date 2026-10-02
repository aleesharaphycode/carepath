from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


class TimelineEvent(BaseModel):
    """
    Unified chronological event representing an extracted clinical record.
    """
    id: str = Field(description="Unique identifier for the timeline item")
    event_type: str = Field(description="Clinical category: diagnosis, medication, investigation, procedure, follow_up")
    title: str = Field(description="Descriptive title of the clinical event")
    date: Optional[str] = Field(default=None, description="ISO Date (YYYY-MM-DD) if confirmed, else null")
    date_display: str = Field(description="Formatted human date, or 'Date not specified'")
    is_date_confirmed: bool = Field(description="True if an explicit date is confirmed from document source")
    details: Dict[str, Any] = Field(default_factory=dict, description="Key entity attributes (dose, result, status, abnormal_flag, etc.)")
    document_id: str = Field(description="Source document UUID")
    document_name: str = Field(description="File name of the source document")
    source_page: Optional[int] = Field(default=None, description="1-indexed source page, or null if unpaged")
    source_text: str = Field(description="Verbatim citation quotation from the document")
    confidence_note: Optional[str] = Field(default=None, description="Clinical confidence annotation")


class TimelineResponse(BaseModel):
    events: List[TimelineEvent] = Field(default_factory=list)
    total_count: int = Field(default=0)
    categories: Dict[str, int] = Field(default_factory=dict)


class CalendarEvent(BaseModel):
    """
    Calendar event representing a confirmed clinical appointment, procedure, or deterministically projected follow-up.
    """
    id: str = Field(description="Unique calendar event identifier")
    event_type: str = Field(description="Event classification: visit, test, medication, procedure, follow_up, appointment")
    title: str = Field(description="Descriptive name of the appointment or scheduled review")
    date: Optional[str] = Field(default=None, description="ISO Date (YYYY-MM-DD)")
    date_display: str = Field(description="Display date string or relative timeframe label")
    is_projected: bool = Field(description="True if calculated from relative timeframe or planned; False if completed date")
    relative_time_text: Optional[str] = Field(default=None, description="As written relative duration (e.g., '3 months')")
    projection_basis: Optional[str] = Field(default=None, description="Explanation of deterministic date calculation")
    document_id: Optional[str] = Field(default=None, description="Source document UUID or null for manual events")
    document_name: Optional[str] = Field(default=None, description="File name of source document or null")
    source_page: Optional[int] = Field(default=None, description="Source page number or null")
    source_text: Optional[str] = Field(default=None, description="Source quotation or null")
    confidence_note: Optional[str] = Field(default=None)
    status: Optional[str] = Field(default="completed", description="completed or planned")
    doctor_name: Optional[str] = Field(default=None, description="Attending physician")
    clinic_name: Optional[str] = Field(default=None, description="Hospital or clinic name")
    location: Optional[str] = Field(default=None, description="Facility location")
    description: Optional[str] = Field(default=None, description="Event notes or description")


class CalendarResponse(BaseModel):
    events: List[CalendarEvent] = Field(default_factory=list)
    total_events: int = Field(default=0)
    confirmed_count: int = Field(default=0)
    projected_count: int = Field(default=0)


class MismatchSourceInfo(BaseModel):
    document_id: str = Field(description="Source document UUID")
    document_name: str = Field(description="File name of source document")
    source_page: Optional[int] = Field(default=None, description="Source page number or null")
    source_text: str = Field(description="Verbatim quotation from this source")
    value: str = Field(description="Conflicting value recorded in this document")


class MismatchItem(BaseModel):
    """
    Detected cross-document inconsistency with bidirectional provenance.
    Never states 'doctor made an error' or declares which source is correct.
    """
    id: str = Field(description="Mismatch identifier")
    category: str = Field(description="medication, investigation, procedure, anatomical_site, follow_up")
    title: str = Field(description="High-level description of mismatched topic")
    field_name: str = Field(description="Specific field (e.g. dose, frequency, tooth_number, surgical_site)")
    source_a: MismatchSourceInfo
    source_b: MismatchSourceInfo
    explanation: str = Field(description="Objective description of the difference")
    verification_message: str = Field(default="Potential Information Mismatch — Verify against original source.")
    status: str = Field(default="flagged", description="flagged, verified, dismissed")
    created_at: Optional[str] = None


class MismatchResponse(BaseModel):
    mismatches: List[MismatchItem] = Field(default_factory=list)
    total_count: int = Field(default=0)
