import logging
from typing import Dict, Any, List
from fastapi import APIRouter, Depends, HTTPException, status
from supabase import Client

from app.core.security import get_current_user, get_current_patient, get_supabase_admin
from app.services.family_service import family_service
from app.services.ai_doctor_service import ai_doctor_service
from app.schemas.ai_doctor import (
    AIDoctorChatRequest,
    AIDoctorChatResponse,
    AIDoctorFeedbackRequest,
    AIDoctorFeedbackResponse,
)

logger = logging.getLogger("carepath.routes.ai_doctor")

router = APIRouter(prefix="/api/ai-doctor", tags=["AI Doctor"])


@router.post(
    "/chat",
    response_model=AIDoctorChatResponse,
    summary="Consult the CarePath AI Doctor assistant grounded in patient medical records",
)
async def ai_doctor_chat(
    req: AIDoctorChatRequest,
    user: Any = Depends(get_current_user),
    current_patient: Dict[str, Any] = Depends(get_current_patient),
    admin_client: Client = Depends(get_supabase_admin),
) -> AIDoctorChatResponse:
    """
    Processes patient clinical inquiries through Dr. CarePath.
    Strictly authenticates caller and resolves target patient:
    - If target_patient_id is omitted or equals current_patient["id"], accesses authenticated patient records.
    - If target_patient_id is a family member, validates strict family permissions (can_view_records).
    - Prevents User A from ever accessing User B's records.
    - Employs deterministic safety rules, allergy conflict verification, and post-response safety checks.
    """
    caller_patient_id = current_patient["id"]
    target_patient_id = req.target_patient_id or caller_patient_id

    # Strict family permission verification if asking about another patient
    if target_patient_id != caller_patient_id:
        has_access = family_service.verify_family_view_permission(
            client=admin_client,
            requester_user_id=user.id,
            requester_patient_id=caller_patient_id,
            target_patient_id=target_patient_id,
        )
        if not has_access:
            logger.warning(
                f"Unauthorized AI Doctor query attempt by user {user.id} (patient {caller_patient_id}) "
                f"for target patient {target_patient_id}"
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to access medical records for this family member.",
            )

    try:
        response = ai_doctor_service.chat(
            client=admin_client,
            patient_id=target_patient_id,
            req=req,
        )
        return response
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"AI Doctor processing error: {str(e)}", exc_info=True)
        # Never crash or expose internal system tracebacks to frontend
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="CarePath AI Doctor is temporarily unavailable. Your health records are still available.",
        )


@router.post(
    "/feedback",
    response_model=AIDoctorFeedbackResponse,
    summary="Submit user feedback on an AI Doctor response",
)
async def ai_doctor_feedback(
    req: AIDoctorFeedbackRequest,
    user: Any = Depends(get_current_user),
) -> AIDoctorFeedbackResponse:
    """
    Collects user feedback (thumbs up / thumbs down) for AI responses.
    Stateless / logged for clinical audit without requiring a database migration.
    """
    logger.info(
        f"AI Doctor Feedback logged by user {user.id}: "
        f"message_id={req.message_id}, rating={req.rating}, comment={req.comment}"
    )
    return AIDoctorFeedbackResponse(
        status="ok",
        message="Thank you! Your feedback helps us maintain high clinical safety and answer quality.",
    )


@router.get(
    "/quick-actions",
    summary="Retrieve suggested clinical questions and shortcuts",
)
async def get_quick_actions() -> Dict[str, Any]:
    """Returns curated starter prompts for the AI Doctor."""
    return {
        "prompts": [
            {
                "id": "medications",
                "label": "What medicines am I taking?",
                "query": "What medicines am I currently taking based on my records?",
                "category": "medications",
            },
            {
                "id": "labs",
                "label": "Explain my latest lab results",
                "query": "Explain my latest lab results in simple terms.",
                "category": "investigations",
            },
            {
                "id": "history",
                "label": "Summarize my health history",
                "query": "Please provide a concise summary of my medical history and conditions.",
                "category": "history",
            },
            {
                "id": "follow_ups",
                "label": "What follow-ups are coming up?",
                "query": "What upcoming doctor follow-ups or appointments are in my records?",
                "category": "follow_ups",
            },
            {
                "id": "diagnoses",
                "label": "What diagnoses are in my records?",
                "query": "What clinical diagnoses are documented in my health records?",
                "category": "diagnoses",
            },
            {
                "id": "medicine_checker",
                "label": "Medicine Interaction Checker",
                "query": "Can you check if there are known general interactions between my active medications?",
                "category": "safety",
            },
        ]
    }
