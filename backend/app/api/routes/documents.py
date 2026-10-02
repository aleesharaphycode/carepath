import logging
from typing import Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from supabase import Client
from app.core.security import get_current_patient, get_supabase_admin
from app.services.storage_service import storage_service
from app.services.ai_provider import (
    ai_provider_service,
    AIQuotaExhaustedError,
    AIAuthenticationError,
    AIInvalidRequestError,
    AIValidationError,
    AIProviderError,
)
from app.services.usage_service import usage_service
from app.services.subscription_service import subscription_service
from app.repositories.clinical_records import clinical_records_repo
from app.schemas.extraction import ProcessDocumentResponse, MedicalDocumentExtraction

logger = logging.getLogger("carepath.routes.documents")

router = APIRouter(prefix="/api/documents", tags=["Medical Documents"])


@router.post("/{document_id}/process", response_model=ProcessDocumentResponse)
async def process_document(
    document_id: str,
    patient: Dict[str, Any] = Depends(get_current_patient),
):
    """
    Triggers multimodal AI document understanding and structured entity extraction for an uploaded document.
    Enforces server-side AI usage limits, controlled provider fallback (OpenAI/Gemini), and atomic state transitions.
    """
    admin_client = get_supabase_admin()
    patient_id = patient["id"]
    logger.info(f"Process request received for document {document_id} by patient {patient_id}")

    # 1. Fetch document and verify patient ownership
    doc_res = (
        admin_client.from_("documents")
        .select("*")
        .eq("id", document_id)
        .eq("patient_id", patient_id)
        .maybe_single()
        .execute()
    )

    document = doc_res.data
    if not document:
        # Do not leak whether another patient's document exists
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found or access unauthorized.",
        )

    # 2. Prevent duplicate simultaneous processing
    if document.get("processing_status") == "processing":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This document is currently being processed. Please wait for completion.",
        )

    # 3. Server-side quota check: never invoke AI provider if monthly allowance is exhausted
    sub = subscription_service.get_patient_subscription(admin_client, patient_id)
    current_plan = sub.get("plan", "free")
    usage_service.check_ai_allowance(admin_client, patient_id, plan=current_plan)

    # 4. Transition document to 'processing' state
    admin_client.from_("documents").update({"processing_status": "processing"}).eq("id", document_id).execute()

    try:
        # 5. Securely download document binary from private Supabase Storage
        file_bytes = storage_service.download_document(
            client=admin_client,
            storage_path=document["storage_path"],
        )

        # 6. Execute multimodal AI extraction with unified provider abstraction and fallback
        extraction, provider_used = ai_provider_service.extract_from_document(
            file_bytes=file_bytes,
            file_name=document["file_name"],
            file_type=document["file_type"],
            document_id=document_id,
            document_type=document.get("document_type", "general"),
        )

        # 7. Persist structured clinical records to database
        clinical_records_repo.persist_extraction(
            client=admin_client,
            patient_id=patient_id,
            document_id=document_id,
            extraction=extraction,
        )

        # 8. Record successful AI usage event server-side
        usage_service.record_analysis_event(
            client=admin_client,
            patient_id=patient_id,
            provider=provider_used,
            successful=True,
        )

        # 9. Transition document to 'completed' state
        admin_client.from_("documents").update({"processing_status": "completed"}).eq("id", document_id).execute()

        return ProcessDocumentResponse(
            document_id=document_id,
            patient_id=patient_id,
            processing_status="completed",
            message=f"Document successfully analyzed using {provider_used.upper()} provider.",
            extraction=extraction,
        )

    except HTTPException:
        # Re-raise already structured HTTP exceptions (e.g. usage limit)
        try:
            admin_client.from_("documents").update({"processing_status": "failed"}).eq("id", document_id).execute()
        except Exception:
            pass
        raise

    except AIQuotaExhaustedError as quota_err:
        logger.warning(f"AI Quota Exhausted for document {document_id}: {str(quota_err)}")
        try:
            admin_client.from_("documents").update({"processing_status": "failed"}).eq("id", document_id).execute()
        except Exception:
            pass
        usage_service.record_analysis_event(admin_client, patient_id, provider="exhausted", successful=False)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="AI provider quota temporarily unavailable. Please try again later or upgrade your plan.",
        )

    except AIAuthenticationError as auth_err:
        logger.error(f"AI Authentication failure for document {document_id}: {str(auth_err)}")
        try:
            admin_client.from_("documents").update({"processing_status": "failed"}).eq("id", document_id).execute()
        except Exception:
            pass
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI extraction provider is temporarily unconfigured or unavailable.",
        )

    except AIInvalidRequestError as req_err:
        logger.error(f"AI Invalid request for document {document_id}: {str(req_err)}")
        try:
            admin_client.from_("documents").update({"processing_status": "failed"}).eq("id", document_id).execute()
        except Exception:
            pass
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=req_err.message or "The document format or content could not be processed by the clinical AI provider.",
        )

    except AIValidationError as val_err:
        logger.error(f"AI Validation failure for document {document_id}: {str(val_err)}")
        try:
            admin_client.from_("documents").update({"processing_status": "failed"}).eq("id", document_id).execute()
        except Exception:
            pass
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The clinical AI provider returned an invalid extraction format. Please retry.",
        )

    except AIProviderError as prov_err:
        logger.error(f"AI Provider failure for document {document_id}: {str(prov_err)}")
        try:
            admin_client.from_("documents").update({"processing_status": "failed"}).eq("id", document_id).execute()
        except Exception:
            pass
        is_timeout = "timed out" in str(prov_err).lower()
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT if is_timeout else status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=prov_err.message or "Clinical AI extraction service is temporarily unavailable. Please try again.",
        )

    except Exception as e:
        logger.error(f"Processing failed unexpectedly for document {document_id}: {str(e)}")
        try:
            admin_client.from_("documents").update({"processing_status": "failed"}).eq("id", document_id).execute()
        except Exception:
            pass
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="AI extraction service encountered an unexpected error while analyzing document.",
        )


@router.get("/{document_id}/extraction")
async def get_document_extraction(
    document_id: str,
    patient: Dict[str, Any] = Depends(get_current_patient),
):
    """
    Retrieves the structured extraction and clinical records for an analyzed document.
    """
    admin_client = get_supabase_admin()
    patient_id = patient["id"]

    # Verify document ownership
    doc_res = (
        admin_client.from_("documents")
        .select("id, patient_id, file_name, file_type, processing_status, uploaded_at")
        .eq("id", document_id)
        .eq("patient_id", patient_id)
        .maybe_single()
        .execute()
    )

    if not doc_res.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found or access unauthorized.",
        )

    extraction_record = clinical_records_repo.get_extraction(
        client=admin_client,
        document_id=document_id,
        patient_id=patient_id,
    )

    if not extraction_record:
        return {
            "document_id": document_id,
            "processing_status": doc_res.data.get("processing_status"),
            "extracted": False,
            "extraction": None,
        }

    return {
        "document_id": document_id,
        "processing_status": doc_res.data.get("processing_status"),
        "extracted": True,
        "extraction": extraction_record.get("raw_extraction"),
        "created_at": extraction_record.get("created_at"),
    }
