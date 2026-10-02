from typing import List, Optional
from pydantic import BaseModel, Field


class SourceReference(BaseModel):
    """
    Source citation grounding each extracted clinical fact in the source document.
    """
    document_id: str = Field(description="UUID of the source document in CarePath vault")
    page: Optional[int] = Field(default=None, description="1-indexed page number if identifiable, else null")
    source_text: str = Field(description="Verbatim or close quotation from the source document supporting this fact")


class DiagnosisItem(BaseModel):
    """
    Explicitly documented clinical condition or diagnosis.
    """
    name: str = Field(description="Name of the diagnosis or medical condition exactly as documented")
    status: Optional[str] = Field(default=None, description="Status: active, resolved, suspected, chronic, or null if unstated")
    date: Optional[str] = Field(default=None, description="Documented date of diagnosis (YYYY-MM-DD or text as written), or null")
    source_reference: SourceReference = Field(description="Direct source citation within the document")
    confidence_note: Optional[str] = Field(default="Explicitly stated in document", description="Controlled note: Explicitly stated in document, Partially legible, Unclear")


class MedicationItem(BaseModel):
    """
    Prescribed or administered medication.
    """
    name: str = Field(description="Brand or generic pharmaceutical name")
    dose: Optional[str] = Field(default=None, description="Dosage amount and unit (e.g. 500 mg, 10 ml), or null")
    route: Optional[str] = Field(default=None, description="Administration route (e.g. oral, intravenous, topical), or null")
    frequency: Optional[str] = Field(default=None, description="Frequency (e.g. twice daily, every 8 hours, once at bedtime), or null")
    duration: Optional[str] = Field(default=None, description="Duration of therapy (e.g. 5 days, 1 month, ongoing), or null")
    instructions: Optional[str] = Field(default=None, description="Special patient instructions (e.g. with meals, before sleep), or null")
    start_date: Optional[str] = Field(default=None, description="Explicit start date if documented, or null")
    end_date: Optional[str] = Field(default=None, description="Explicit end date if documented, or null")
    source_reference: SourceReference = Field(description="Direct source citation within the document")
    confidence_note: Optional[str] = Field(default="Explicitly stated in document", description="Controlled confidence indicator")


class InvestigationItem(BaseModel):
    """
    Diagnostic laboratory test, pathology value, or clinical measurement.
    """
    name: str = Field(description="Test or panel name (e.g. HbA1c, Serum Creatinine, Fasting Blood Glucose)")
    date: Optional[str] = Field(default=None, description="Date specimen collected or report generated, or null")
    result: Optional[str] = Field(default=None, description="Reported numeric or qualitative finding (e.g. 6.8, Negative, Elevated)")
    unit: Optional[str] = Field(default=None, description="Measurement unit (e.g. mg/dL, %, mmol/L), or null")
    reference_range: Optional[str] = Field(default=None, description="Normal biological reference interval if listed, or null")
    abnormal_flag: Optional[bool] = Field(default=None, description="True if marked high, low, or abnormal on report; False if normal; null if unflagged")
    source_reference: SourceReference = Field(description="Direct source citation within the document")
    confidence_note: Optional[str] = Field(default="Explicitly stated in document", description="Controlled confidence indicator")


class ProcedureItem(BaseModel):
    """
    Clinical surgical procedure, imaging exam, or interventional therapy.
    """
    name: str = Field(description="Procedure or imaging name (e.g. Appendectomy, Chest X-ray, Echocardiogram)")
    date: Optional[str] = Field(default=None, description="Date procedure was performed, or null")
    details: Optional[str] = Field(default=None, description="Key operative or radiological findings reported, or null")
    source_reference: SourceReference = Field(description="Direct source citation within the document")
    confidence_note: Optional[str] = Field(default="Explicitly stated in document", description="Controlled confidence indicator")


class AllergyItem(BaseModel):
    """
    Documented drug, food, or environmental hypersensitivity.
    """
    substance: str = Field(description="Allergen or offending agent (e.g. Penicillin, Sulfa drugs, Peanuts)")
    reaction: Optional[str] = Field(default=None, description="Documented reaction manifestation (e.g. rash, anaphylaxis), or null")
    severity: Optional[str] = Field(default=None, description="Reported severity (mild, moderate, severe, life-threatening), or null")
    source_reference: SourceReference = Field(description="Direct source citation within the document")
    confidence_note: Optional[str] = Field(default="Explicitly stated in document", description="Controlled confidence indicator")


class FollowUpItem(BaseModel):
    """
    Follow-up appointment, clinical review, or monitoring instruction.
    NOTE: Never calculate future dates inside the model. Return confirmed_date=null and relative_time as written.
    """
    description: str = Field(description="Nature of scheduled review (e.g. 'Review with Dr. Sharma in 3 months', 'Repeat lipid panel')")
    confirmed_date: Optional[str] = Field(default=None, description="Calendar date ONLY if an exact specific appointment date is written. Otherwise null.")
    relative_time: Optional[str] = Field(default=None, description="Relative timeframe stated as text (e.g. '3 months', '2 weeks', 'in 10 days'), or null")
    source_reference: SourceReference = Field(description="Direct source citation within the document")
    confidence_note: Optional[str] = Field(default="Explicitly stated in document", description="Controlled confidence indicator")


class MedicalDocumentExtraction(BaseModel):
    """
    Comprehensive structured extraction schema conforming to clinical taxonomies.
    Guaranteed via OpenAI Structured Outputs (JSON Schema validation).
    """
    document_type: str = Field(description="Classified type: prescription, lab_report, discharge_summary, scan, general, other")
    document_date: Optional[str] = Field(default=None, description="Primary date of document creation or encounter, or null")
    provider_name: Optional[str] = Field(default=None, description="Healthcare provider, clinic, or physician name if present, or null")
    patient_name_as_written: Optional[str] = Field(default=None, description="Patient name written on the document for provenance verification, or null")
    diagnoses: List[DiagnosisItem] = Field(default_factory=list, description="Extracted medical conditions and diagnoses")
    medications: List[MedicationItem] = Field(default_factory=list, description="Extracted medications, dosages, and regimens")
    investigations: List[InvestigationItem] = Field(default_factory=list, description="Extracted lab tests, biomarkers, and measurements")
    procedures: List[ProcedureItem] = Field(default_factory=list, description="Extracted clinical procedures and imaging exams")
    allergies: List[AllergyItem] = Field(default_factory=list, description="Extracted patient allergies and sensitivities")
    follow_ups: List[FollowUpItem] = Field(default_factory=list, description="Extracted follow-up schedules and review instructions")
    clinical_notes: Optional[str] = Field(default=None, description="Concise objective summary of additional narrative observations, or null")
    source_references: List[SourceReference] = Field(default_factory=list, description="All source reference citations across the document")
    confidence_notes: Optional[str] = Field(default=None, description="Overall document legibility notes (e.g. 'High quality typed document', 'Handwritten notes partially legible')")


class ProcessDocumentResponse(BaseModel):
    """
    API Response returned upon document processing completion.
    """
    document_id: str
    patient_id: str
    processing_status: str
    message: str
    extraction: MedicalDocumentExtraction
