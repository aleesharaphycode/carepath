"""
CarePath AI Doctor Assistant Engine
===================================
Orchestrates patient record grounding, deterministic clinical safety rules,
Gemini multimodal LLM interaction, post-response safety detection, and graceful degradation.

Priorities Implemented:
- Priority 1: Grounded interactive AI Doctor chat
- Priority 2: Patient medical brief integration
- Priority 3: Grounded clinical answers with hallucination defense
- Priority 4: Deterministic medical safety rules
- Priority 5: Post-response pure-Python safety detector
- Priority 6: Emergency & red-flag symptom escalation
- Priority 7: Source provenance linking to CarePath records
- Priority 8: Medicine Info explanations (purpose, side effects, precautions)
- Priority 9: Lab Insights explanations (clear language without speculative diagnosis)
- Priority 10: Medicine Interaction Checker guidance
- Graceful degradation: handles Gemini 429 quota exhaustion, network failure, and missing records.
"""

import json
import logging
import time
from typing import Dict, Any, Optional, List
import httpx
from supabase import Client

from app.core.config import settings
from app.schemas.ai_doctor import (
    AIDoctorChatRequest,
    AIDoctorChatResponse,
    SourceReferenceItem,
    OTCMedicine,
)
from app.services.patient_brief import build_patient_medical_brief, PatientMedicalBrief
from app.services.medical_safety import (
    CORE_MEDICAL_SAFETY_RULES,
    detect_red_flags,
    detect_safety_violations,
    sanitize_response_if_unsafe,
)

logger = logging.getLogger("carepath.ai_doctor")

DOCTOR_SYSTEM_PROMPT = """You are Dr. CarePath — an intelligent, empathetic, and evidence-based AI Health Assistant for CarePath patients and their families.

ROLE & RESPONSIBILITY:
- You help patients understand their health records, medications, lab investigations, doctor follow-ups, and general symptoms.
- Your answers must be CLEAR, COMPASSIONATE, OBJECTIVE, and GROUNDED in the patient's verified health records.
- You speak directly to the patient or authorized caregiver in an encouraging, professional tone.

{safety_rules}

PATIENT GROUND TRUTH BRIEF:
{patient_brief}

OUTPUT SPECIFICATION:
Respond ONLY with a valid, raw JSON object matching the following structure (no markdown formatting, no backticks, no outer text):
{{
  "urgency": "green" | "yellow" | "orange" | "red",
  "urgency_label": "Low Risk" | "Consult Doctor Soon" | "See Doctor Promptly" | "Emergency",
  "reply": "Direct, conversational explanation in 2-4 clear sentences. Grounded in their records.",
  "possible_causes": ["Plausible cause 1", "Plausible cause 2"],
  "what_to_do": ["Specific, practical step 1", "Step 2"],
  "home_remedies": ["Safe supportive remedy"],
  "otc_medicines": [{{"name": "Approved OTC name", "dosage": "Standard dose guidance", "when": "Timing", "warning": "Precaution if any"}}],
  "precautions": ["Important caution or drug warning"],
  "when_to_rush": ["Specific warning sign that warrants immediate hospital visit"],
  "doctor_type": "Specialist to consult if needed (e.g. Primary Care Physician, Cardiologist)",
  "sources_used": [
    {{
      "document_id": "document ID from the brief",
      "document_name": "filename or title from the brief",
      "date": "document date if available",
      "relevance_note": "How this record was used"
    }}
  ],
  "follow_up_questions": ["Helpful question patient might ask next"]
}}
"""


class AIDoctorService:
    """Core AI Doctor service for CarePath."""

    def __init__(self):
        self._api_key = settings.GEMINI_API_KEY
        self._model = settings.GEMINI_MODEL or "gemini-3.5-flash-lite"

    def _call_gemini_rest(self, system_instruction: str, user_prompt: str) -> Optional[str]:
        """
        Executes REST API call to Google Gemini with retry and graceful error handling.
        Returns the raw string output or None if service is unavailable.
        """
        if not self._api_key:
            logger.warning("Gemini API key is not configured.")
            return None

        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self._model}:generateContent"
        headers = {
            "x-goog-api-key": self._api_key,
            "Content-Type": "application/json",
        }
        payload = {
            "contents": [
                {
                    "role": "user",
                    "parts": [{"text": f"{system_instruction}\n\nUSER QUERY:\n{user_prompt}"}],
                }
            ],
            "generationConfig": {
                "responseMimeType": "application/json",
                "temperature": 0.2,
                "maxOutputTokens": 1000,
            },
        }

        max_retries = 1
        for attempt in range(max_retries + 1):
            try:
                with httpx.Client(timeout=25.0) as client:
                    resp = client.post(url, headers=headers, json=payload)

                if resp.status_code == 200:
                    data = resp.json()
                    candidates = data.get("candidates", [])
                    if candidates and "content" in candidates[0]:
                        parts = candidates[0]["content"].get("parts", [])
                        if parts and "text" in parts[0]:
                            return parts[0]["text"]
                    logger.warning(f"Gemini returned unexpected structure: {data}")
                    return None

                elif resp.status_code == 429:
                    logger.warning(f"Gemini quota exhausted (HTTP 429) on attempt {attempt + 1}.")
                    if attempt < max_retries:
                        time.sleep(1.5)
                        continue
                    return None

                else:
                    logger.warning(f"Gemini API returned status {resp.status_code}: {resp.text[:300]}")
                    if attempt < max_retries and resp.status_code in (500, 503):
                        time.sleep(1.5)
                        continue
                    return None

            except httpx.TimeoutException:
                logger.warning(f"Gemini timeout on attempt {attempt + 1}")
                if attempt < max_retries:
                    time.sleep(1.0)
                    continue
                return None
            except Exception as e:
                logger.error(f"Gemini network error: {str(e)}")
                return None

        return None

    def _parse_gemini_json(self, raw_text: str) -> Optional[Dict[str, Any]]:
        """Parses and sanitizes Gemini JSON output."""
        if not raw_text:
            return None
        clean = raw_text.strip()
        # Remove potential markdown ```json blocks
        if clean.startswith("```"):
            clean = clean.split("\n", 1)[-1]
        if clean.endswith("```"):
            clean = clean.rsplit("```", 1)[0]
        clean = clean.strip()

        try:
            return json.loads(clean)
        except json.JSONDecodeError:
            logger.warning(f"Failed to decode JSON from Gemini output: {clean[:200]}")
            return None

    def _build_fallback_response(
        self,
        brief: PatientMedicalBrief,
        user_message: str,
        red_flag: Optional[Dict[str, str]],
    ) -> AIDoctorChatResponse:
        """
        Graceful degradation fallback when Gemini is unreachable or quota exhausted.
        Ensures the patient is never presented with an internal error and health safety is upheld.
        """
        if red_flag:
            urgency = "red"
            urgency_label = "Emergency - Seek Immediate Medical Attention"
            reply = (
                f"🚨 URGENT: Your symptoms indicate potential {red_flag['reason']}. "
                f"Please seek emergency medical attention or contact emergency services immediately."
            )
            what_to_do = [
                "Call emergency medical services (911/112/108) or go to the nearest emergency department.",
                "Do not drive yourself; seek assistance from family or emergency transport.",
            ]
            safety_alert = f"Urgent safety alert: Potential {red_flag['reason']} detected. Immediate care required."
        else:
            urgency = "yellow"
            urgency_label = "CarePath Assistant Notice"
            reply = (
                "CarePath AI Doctor is temporarily operating in high-demand mode. "
                "Your verified health records remain fully accessible in the Health Timeline, Care Calendar, and Documents tabs. "
                "For specific medical advice or urgent concerns, please consult your physician or healthcare clinic directly."
            )
            what_to_do = [
                "Review your verified medical records in the Documents and Timeline tabs.",
                "Contact your primary care doctor for personalized medical questions.",
            ]
            safety_alert = "CarePath AI Doctor is temporarily unavailable. Your health records are still available."

        # Include basic source references from brief if documents exist
        sources: List[SourceReferenceItem] = []
        for doc in brief.source_documents[:3]:
            sources.append(
                SourceReferenceItem(
                    document_id=doc["id"],
                    document_name=doc["file_name"],
                    document_type=doc.get("document_type"),
                    date=doc.get("uploaded_at", "")[:10] if doc.get("uploaded_at") else None,
                    relevance_note="Existing CarePath health record",
                )
            )

        return AIDoctorChatResponse(
            urgency=urgency,
            urgency_label=urgency_label,
            reply=reply,
            possible_causes=[],
            what_to_do=what_to_do,
            home_remedies=["Rest comfortably", "Stay hydrated"],
            otc_medicines=[],
            precautions=["Do not start or modify medications without professional medical clearance."],
            when_to_rush=[
                "Severe chest pressure or breathing distress",
                "Sudden weakness, facial drooping, or speech difficulty",
                "Uncontrolled bleeding or severe loss of balance",
            ],
            doctor_type="General Physician",
            sources_used=sources,
            follow_up_questions=[
                "What medicines am I currently taking?",
                "What diagnoses are in my records?",
                "Explain my latest lab results",
            ],
            safety_alert=safety_alert,
            patient_name=brief.patient_name,
            patient_id=brief.patient_id,
        )

    def chat(
        self,
        client: Client,
        patient_id: str,
        req: AIDoctorChatRequest,
    ) -> AIDoctorChatResponse:
        """
        Executes full AI Doctor turn:
        1. Builds Patient Medical Brief from PostgreSQL.
        2. Detects pre-response red flags.
        3. Formulates prompt with Medical Doctor Persona + Grounding Rules.
        4. Calls Gemini via REST API with fallback.
        5. Runs pure-Python post-response safety detector.
        6. Returns validated AIDoctorChatResponse.
        """
        # 1. Build Patient Medical Brief from existing records
        brief = build_patient_medical_brief(client, patient_id)

        # 2. Check for emergency / red-flag symptoms in user message
        red_flag = detect_red_flags(req.message)

        # 3. Assemble Gemini Prompt
        system_instruction = DOCTOR_SYSTEM_PROMPT.format(
            safety_rules=CORE_MEDICAL_SAFETY_RULES,
            patient_brief=brief.brief_text,
        )

        history_lines = []
        if req.chat_history:
            for turn in req.chat_history[-4:]:
                author = "Patient" if turn.role == "user" else "Dr. CarePath"
                history_lines.append(f"{author}: {turn.text[:300]}")
        history_text = "\n".join(history_lines)

        user_content_parts = []
        if history_text:
            user_content_parts.append(f"PREVIOUS CONVERSATION CONTEXT:\n{history_text}")
        if req.quick_action:
            user_content_parts.append(f"[FOCUS ACTION: {req.quick_action.upper()}]")
        user_content_parts.append(f"PATIENT QUESTION: {req.message}")
        user_prompt = "\n\n".join(user_content_parts)

        # 4. Call Gemini
        raw_response = self._call_gemini_rest(system_instruction, user_prompt)
        parsed = self._parse_gemini_json(raw_response) if raw_response else None

        # 5. Handle fallback if Gemini failed or gave malformed output
        if not parsed:
            logger.info("Using graceful fallback response for AI Doctor.")
            return self._build_fallback_response(brief, req.message, red_flag)

        # 6. Run Post-Response Safety Detector
        patient_context = {
            "allergies": brief.allergies,
            "is_pregnant": brief.is_pregnant,
            "age_years": brief.age_years,
        }
        violations = detect_safety_violations(parsed, patient_context, req.message)

        # 7. Apply deterministic safety sanitization
        sanitized = sanitize_response_if_unsafe(parsed, violations, red_flag)

        # 8. Enrich source references
        sources_used: List[SourceReferenceItem] = []
        raw_sources = sanitized.get("sources_used", [])
        if isinstance(raw_sources, list) and raw_sources:
            for s in raw_sources:
                if isinstance(s, dict) and s.get("document_name"):
                    sources_used.append(
                        SourceReferenceItem(
                            document_id=str(s.get("document_id", "doc-ref")),
                            document_name=str(s.get("document_name")),
                            document_type=s.get("document_type"),
                            date=s.get("date"),
                            relevance_note=s.get("relevance_note"),
                        )
                    )

        # If model didn't return sources but patient has documents and asked about records,
        # attach the matching source documents
        if not sources_used and brief.source_documents:
            msg_lower = req.message.lower()
            if any(k in msg_lower for k in ["medicine", "lab", "result", "history", "diagnos", "surger", "doctor", "follow"]):
                for doc in brief.source_documents[:3]:
                    sources_used.append(
                        SourceReferenceItem(
                            document_id=doc["id"],
                            document_name=doc["file_name"],
                            document_type=doc.get("document_type"),
                            date=doc.get("uploaded_at", "")[:10] if doc.get("uploaded_at") else None,
                            relevance_note="CarePath verified medical record",
                        )
                    )

        # Parse OTC medicines list defensively
        otc_medicines: List[OTCMedicine] = []
        for m in sanitized.get("otc_medicines", []):
            if isinstance(m, dict) and m.get("name"):
                otc_medicines.append(
                    OTCMedicine(
                        name=str(m["name"]),
                        dosage=m.get("dosage"),
                        when=m.get("when"),
                        warning=m.get("warning"),
                    )
                )

        return AIDoctorChatResponse(
            urgency=sanitized.get("urgency", "yellow"),
            urgency_label=sanitized.get("urgency_label", "Consult Doctor Soon"),
            reply=sanitized.get("reply", "Please consult your healthcare provider."),
            possible_causes=sanitized.get("possible_causes", []) if isinstance(sanitized.get("possible_causes"), list) else [],
            what_to_do=sanitized.get("what_to_do", []) if isinstance(sanitized.get("what_to_do"), list) else [],
            home_remedies=sanitized.get("home_remedies", []) if isinstance(sanitized.get("home_remedies"), list) else [],
            otc_medicines=otc_medicines,
            precautions=sanitized.get("precautions", []) if isinstance(sanitized.get("precautions"), list) else [],
            when_to_rush=sanitized.get("when_to_rush", []) if isinstance(sanitized.get("when_to_rush"), list) else [],
            doctor_type=sanitized.get("doctor_type"),
            sources_used=sources_used,
            follow_up_questions=sanitized.get("follow_up_questions", []) if isinstance(sanitized.get("follow_up_questions"), list) else [],
            safety_alert=sanitized.get("safety_alert"),
            safety_violations=sanitized.get("safety_violations"),
            patient_name=brief.patient_name,
            patient_id=brief.patient_id,
        )


ai_doctor_service = AIDoctorService()
