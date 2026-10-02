import logging
from typing import Dict, Any, Optional
from supabase import Client
from app.schemas.extraction import MedicalDocumentExtraction

from app.utils.date_utils import normalize_date

logger = logging.getLogger("carepath.clinical_records")


class ClinicalRecordsRepository:
    """
    Repository for persisting and retrieving structured clinical entities
    with patient isolation and source provenance.
    """

    def persist_extraction(
        self,
        client: Client,
        patient_id: str,
        document_id: str,
        extraction: MedicalDocumentExtraction,
    ) -> None:
        """
        Persists validated extraction entities atomically.
        Deletes any pre-existing records for this document to prevent duplicate entries on reprocessing.
        """
        try:
            # 1. Clean up existing records for this document (idempotent reprocessing)
            client.from_("diagnoses").delete().eq("document_id", document_id).execute()
            client.from_("medications").delete().eq("document_id", document_id).execute()
            client.from_("investigations").delete().eq("document_id", document_id).execute()
            client.from_("procedures").delete().eq("document_id", document_id).execute()
            client.from_("allergies").delete().eq("document_id", document_id).execute()
            client.from_("follow_ups").delete().eq("document_id", document_id).execute()
            client.from_("document_extractions").delete().eq("document_id", document_id).execute()

            # 2. Insert Diagnoses
            if extraction.diagnoses:
                diag_rows = [
                    {
                        "patient_id": patient_id,
                        "document_id": document_id,
                        "name": item.name,
                        "status": item.status,
                        "date": normalize_date(item.date),
                        "source_page": item.source_reference.page if item.source_reference else None,
                        "source_text": item.source_reference.source_text if item.source_reference else None,
                        "confidence_note": item.confidence_note,
                    }
                    for item in extraction.diagnoses
                ]
                client.from_("diagnoses").insert(diag_rows).execute()

            # 3. Insert Medications
            if extraction.medications:
                med_rows = [
                    {
                        "patient_id": patient_id,
                        "document_id": document_id,
                        "name": item.name,
                        "dose": item.dose,
                        "route": item.route,
                        "frequency": item.frequency,
                        "duration": item.duration,
                        "instructions": item.instructions,
                        "start_date": normalize_date(item.start_date),
                        "end_date": normalize_date(item.end_date),
                        "source_page": item.source_reference.page if item.source_reference else None,
                        "source_text": item.source_reference.source_text if item.source_reference else None,
                        "confidence_note": item.confidence_note,
                    }
                    for item in extraction.medications
                ]
                client.from_("medications").insert(med_rows).execute()

            # 4. Insert Investigations
            if extraction.investigations:
                inv_rows = [
                    {
                        "patient_id": patient_id,
                        "document_id": document_id,
                        "name": item.name,
                        "date": normalize_date(item.date),
                        "result": item.result,
                        "unit": item.unit,
                        "reference_range": item.reference_range,
                        "abnormal_flag": item.abnormal_flag,
                        "source_page": item.source_reference.page if item.source_reference else None,
                        "source_text": item.source_reference.source_text if item.source_reference else None,
                        "confidence_note": item.confidence_note,
                    }
                    for item in extraction.investigations
                ]
                client.from_("investigations").insert(inv_rows).execute()

            # 5. Insert Procedures
            if extraction.procedures:
                proc_rows = [
                    {
                        "patient_id": patient_id,
                        "document_id": document_id,
                        "name": item.name,
                        "date": normalize_date(item.date),
                        "details": item.details,
                        "source_page": item.source_reference.page if item.source_reference else None,
                        "source_text": item.source_reference.source_text if item.source_reference else None,
                        "confidence_note": item.confidence_note,
                    }
                    for item in extraction.procedures
                ]
                client.from_("procedures").insert(proc_rows).execute()

            # 6. Insert Allergies
            if extraction.allergies:
                allergy_rows = [
                    {
                        "patient_id": patient_id,
                        "document_id": document_id,
                        "substance": item.substance,
                        "reaction": item.reaction,
                        "severity": item.severity,
                        "source_page": item.source_reference.page if item.source_reference else None,
                        "source_text": item.source_reference.source_text if item.source_reference else None,
                        "confidence_note": item.confidence_note,
                    }
                    for item in extraction.allergies
                ]
                client.from_("allergies").insert(allergy_rows).execute()

            # 7. Insert Follow-ups
            if extraction.follow_ups:
                fu_rows = [
                    {
                        "patient_id": patient_id,
                        "document_id": document_id,
                        "description": item.description,
                        "confirmed_date": normalize_date(item.confirmed_date),
                        "relative_time": item.relative_time,
                        "source_page": item.source_reference.page if item.source_reference else None,
                        "source_text": item.source_reference.source_text if item.source_reference else None,
                        "confidence_note": item.confidence_note,
                    }
                    for item in extraction.follow_ups
                ]
                client.from_("follow_ups").insert(fu_rows).execute()

            # 8. Insert Extraction Summary Document
            extraction_dict = extraction.model_dump()
            summary_row = {
                "patient_id": patient_id,
                "document_id": document_id,
                "document_type": extraction.document_type,
                "document_date": normalize_date(extraction.document_date),
                "provider_name": extraction.provider_name,
                "patient_name_as_written": extraction.patient_name_as_written,
                "clinical_notes": extraction.clinical_notes,
                "confidence_notes": extraction.confidence_notes,
                "raw_extraction": extraction_dict,
            }
            client.from_("document_extractions").upsert(summary_row, on_conflict="document_id").execute()

            logger.info(f"Successfully persisted clinical records for document {document_id}")

        except Exception as e:
            logger.error(f"Failed to persist clinical records in database: {str(e)}")
            raise

    def get_extraction(
        self,
        client: Client,
        document_id: str,
        patient_id: str,
    ) -> Optional[Dict[str, Any]]:
        """
        Retrieves the structured extraction for a document owned by the patient.
        """
        res = (
            client.from_("document_extractions")
            .select("*")
            .eq("document_id", document_id)
            .eq("patient_id", patient_id)
            .maybe_single()
            .execute()
        )
        return res.data


clinical_records_repo = ClinicalRecordsRepository()
