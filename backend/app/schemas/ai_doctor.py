from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    role: str = Field(..., description="Message author role: 'user' or 'assistant'/'doctor'")
    text: str = Field(..., description="Message text content")


class AIDoctorChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000, description="User question or symptom query")
    target_patient_id: Optional[str] = Field(None, description="Optional patient ID if viewing an authorized family member")
    chat_history: Optional[List[ChatMessage]] = Field(default=[], description="Recent conversation turns for context")
    quick_action: Optional[str] = Field(None, description="Optional shortcut type: 'medications', 'labs', 'history', 'follow_ups', 'medicine_info', 'medicine_checker'")


class SourceReferenceItem(BaseModel):
    document_id: str
    document_name: str
    document_type: Optional[str] = None
    date: Optional[str] = None
    relevance_note: Optional[str] = None


class OTCMedicine(BaseModel):
    name: str
    dosage: Optional[str] = None
    when: Optional[str] = None
    warning: Optional[str] = None


class AIDoctorChatResponse(BaseModel):
    urgency: str = Field(default="yellow", description="Clinical triage level: 'green', 'yellow', 'orange', 'red'")
    urgency_label: str = Field(default="Consult Doctor Soon", description="Human-readable triage label")
    reply: str = Field(..., description="Direct conversational explanation grounded in patient records")
    possible_causes: List[str] = Field(default_factory=list, description="Non-definitive potential causes")
    what_to_do: List[str] = Field(default_factory=list, description="Actionable recommended steps")
    home_remedies: List[str] = Field(default_factory=list, description="Supportive home care measures")
    otc_medicines: List[OTCMedicine] = Field(default_factory=list, description="Permissible non-prescription supportive aids")
    precautions: List[str] = Field(default_factory=list, description="Important clinical cautions or contraindications")
    when_to_rush: List[str] = Field(default_factory=list, description="Red-flag escalation triggers")
    doctor_type: Optional[str] = Field(None, description="Relevant clinical specialty (e.g. Cardiologist, GP)")
    sources_used: List[SourceReferenceItem] = Field(default_factory=list, description="CarePath source records referenced")
    follow_up_questions: List[str] = Field(default_factory=list, description="Helpful follow-up queries")
    safety_alert: Optional[str] = Field(None, description="High-priority emergency or safety warning banner")
    safety_violations: Optional[List[str]] = Field(None, description="Internal safety triggers intercepted by detector")
    patient_name: Optional[str] = None
    patient_id: Optional[str] = None


class AIDoctorFeedbackRequest(BaseModel):
    message_id: str = Field(..., description="Unique ID of the message receiving feedback")
    rating: str = Field(..., description="'up' for helpful, 'down' for unhelpful")
    comment: Optional[str] = Field(None, max_length=500, description="Optional user comment")
    user_message: Optional[str] = None
    ai_response: Optional[str] = None


class AIDoctorFeedbackResponse(BaseModel):
    status: str = "ok"
    message: str = "Feedback received. Thank you for helping improve clinical quality."
