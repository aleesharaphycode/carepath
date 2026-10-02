import base64
import io
import json
import logging
import time
from abc import ABC, abstractmethod
from typing import Optional, List, Tuple
import httpx
from openai import OpenAI, RateLimitError, AuthenticationError
from pypdf import PdfReader

from app.core.config import settings
from app.schemas.extraction import MedicalDocumentExtraction, SourceReference
from app.utils.prompts import EXTRACTION_SYSTEM_PROMPT, get_extraction_user_prompt

logger = logging.getLogger("carepath.ai_provider")


# ==============================================================================
# AI PROVIDER EXCEPTIONS
# ==============================================================================

class AIProviderError(Exception):
    """Base exception for all AI provider operations."""
    def __init__(self, message: str, provider: str = "unknown"):
        super().__init__(message)
        self.message = message
        self.provider = provider


class AIQuotaExhaustedError(AIProviderError):
    """Raised when an AI provider's usage quota or credit balance is exhausted (HTTP 429)."""
    pass


class AIAuthenticationError(AIProviderError):
    """Raised when provider credentials (API key) are invalid, revoked, or missing."""
    pass


class AIInvalidRequestError(AIProviderError):
    """Raised when input documents or requests violate provider payload requirements."""
    pass


class AIValidationError(AIProviderError):
    """Raised when provider output fails structured Pydantic schema validation."""
    pass


# ==============================================================================
# ABSTRACT AI PROVIDER BASE CLASS
# ==============================================================================

class AIProvider(ABC):
    """
    Abstract interface for multimodal medical document extraction.
    Both OpenAI and Gemini must output the identical MedicalDocumentExtraction schema.
    """

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Human-readable provider identifier (e.g. 'openai', 'gemini')."""
        pass

    @abstractmethod
    def extract_from_document(
        self,
        file_bytes: bytes,
        file_name: str,
        file_type: str,
        document_id: str,
        document_type: str = "general",
    ) -> MedicalDocumentExtraction:
        """
        Extracts structured clinical facts from document binary.
        Returns a validated MedicalDocumentExtraction instance.
        """
        pass

    def _parse_pdf(self, file_bytes: bytes) -> Tuple[str, List[Tuple[bytes, str]]]:
        """Utility to extract page-indexed text and embedded scan images from PDF."""
        extracted_text_blocks = []
        page_images: List[Tuple[bytes, str]] = []

        try:
            reader = PdfReader(io.BytesIO(file_bytes))
            for idx, page in enumerate(reader.pages):
                page_num = idx + 1
                text = page.extract_text() or ""
                if text.strip():
                    extracted_text_blocks.append(f"[Page {page_num}]\n{text.strip()}")

                if hasattr(page, "images"):
                    for img in page.images:
                        img_name = img.name.lower()
                        img_mime = "image/png" if img_name.endswith(".png") else "image/jpeg"
                        page_images.append((img.data, img_mime))
        except Exception as e:
            logger.warning(f"PDF parsing partial failure: {str(e)}")

        combined_text = "\n\n".join(extracted_text_blocks)
        return combined_text, page_images


# ==============================================================================
# OPENAI PROVIDER IMPLEMENTATION
# ==============================================================================

class OpenAIProvider(AIProvider):
    """
    OpenAI multimodal clinical extraction implementation using Structured Outputs.
    """

    def __init__(self, api_key: Optional[str] = None, model: Optional[str] = None):
        self._api_key = api_key or settings.OPENAI_API_KEY
        self._model = model or settings.OPENAI_MODEL
        self._client: Optional[OpenAI] = None

    @property
    def provider_name(self) -> str:
        return "openai"

    @property
    def client(self) -> OpenAI:
        if self._client is None:
            if not self._api_key:
                raise AIAuthenticationError("OpenAI API key is not configured.", provider=self.provider_name)
            self._client = OpenAI(api_key=self._api_key)
        return self._client

    def extract_from_document(
        self,
        file_bytes: bytes,
        file_name: str,
        file_type: str,
        document_id: str,
        document_type: str = "general",
    ) -> MedicalDocumentExtraction:
        mime = file_type.lower()
        logger.info(f"OpenAI initiating extraction for {document_id} ({file_name}, mime={mime}) using {self._model}")

        messages: List[dict] = [
            {"role": "system", "content": EXTRACTION_SYSTEM_PROMPT},
        ]

        if "pdf" in mime or file_name.lower().endswith(".pdf"):
            extracted_text, page_images = self._parse_pdf(file_bytes)
            user_text_prompt = get_extraction_user_prompt(
                document_id=document_id,
                file_name=file_name,
                document_type=document_type,
                text_content=extracted_text,
            )
            user_content: List[dict] = [{"type": "text", "text": user_text_prompt}]
            for img_bytes, img_mime in page_images[:5]:
                b64_img = base64.b64encode(img_bytes).decode("utf-8")
                user_content.append({
                    "type": "image_url",
                    "image_url": {"url": f"data:{img_mime};base64,{b64_img}"},
                })
            messages.append({"role": "user", "content": user_content})
        elif "text" in mime or file_name.lower().endswith(".txt"):
            text_str = file_bytes.decode("utf-8", errors="replace")
            user_text_prompt = get_extraction_user_prompt(
                document_id=document_id,
                file_name=file_name,
                document_type=document_type,
                text_content=text_str,
            )
            messages.append({"role": "user", "content": [{"type": "text", "text": user_text_prompt}]})
        else:
            b64_data = base64.b64encode(file_bytes).decode("utf-8")
            image_mime = mime if mime.startswith("image/") else "image/jpeg"
            data_url = f"data:{image_mime};base64,{b64_data}"
            user_text_prompt = get_extraction_user_prompt(
                document_id=document_id,
                file_name=file_name,
                document_type=document_type,
            )
            messages.append({
                "role": "user",
                "content": [
                    {"type": "text", "text": user_text_prompt},
                    {"type": "image_url", "image_url": {"url": data_url}},
                ],
            })

        try:
            completion = self.client.beta.chat.completions.parse(
                model=self._model,
                messages=messages,
                response_format=MedicalDocumentExtraction,
            )
            extraction = completion.choices[0].message.parsed
            if not extraction:
                raise AIValidationError("OpenAI returned an empty structured response.", provider=self.provider_name)

            for ref in extraction.source_references:
                if not ref.document_id:
                    ref.document_id = document_id

            return extraction

        except RateLimitError as e:
            logger.warning(f"OpenAI rate limit / quota exhausted: {str(e)}")
            raise AIQuotaExhaustedError("OpenAI API quota or credit balance exhausted.", provider=self.provider_name) from e
        except AuthenticationError as e:
            logger.error(f"OpenAI authentication error: {str(e)}")
            raise AIAuthenticationError("Invalid or missing OpenAI API key.", provider=self.provider_name) from e
        except Exception as e:
            err_str = str(e).lower()
            if any(k in err_str for k in ("quota", "insufficient_quota", "credit_balance", "rate_limit", "429")):
                raise AIQuotaExhaustedError("OpenAI API quota or credit balance exhausted.", provider=self.provider_name) from e
            logger.error(f"OpenAI extraction API call failed: {str(e)}")
            raise AIProviderError(f"OpenAI extraction error: {str(e)}", provider=self.provider_name) from e


# ==============================================================================
# GEMINI PROVIDER IMPLEMENTATION (GEMINI 3.5 FLASH-LITE)
# ==============================================================================

class GeminiProvider(AIProvider):
    """
    Google Gemini multimodal extraction implementation using Gemini REST API.
    Model: gemini-3.5-flash-lite
    Supports real image (JPEG, JPG, PNG, WEBP), PDF, and text inputs.
    Enforces strict JSON output matching MedicalDocumentExtraction schema.
    """

    def __init__(self, api_key: Optional[str] = None, model: Optional[str] = None):
        self._api_key = api_key or settings.GEMINI_API_KEY
        self._model = model or settings.GEMINI_MODEL or "gemini-3.5-flash-lite"

    @property
    def provider_name(self) -> str:
        return "gemini"

    def extract_from_document(
        self,
        file_bytes: bytes,
        file_name: str,
        file_type: str,
        document_id: str,
        document_type: str = "general",
    ) -> MedicalDocumentExtraction:
        if not self._api_key:
            raise AIAuthenticationError("Gemini API key is not configured.", provider=self.provider_name)

        mime = file_type.lower()
        fname_lower = file_name.lower()
        logger.info(f"Gemini initiating extraction for {document_id} ({file_name}, mime={mime}) using {self._model}")

        # Assemble prompt text
        user_text = get_extraction_user_prompt(
            document_id=document_id,
            file_name=file_name,
            document_type=document_type,
        )

        strict_safety_instruction = (
            "Extract ONLY information clearly visible in the document. "
            "Never guess, infer, or fabricate clinical information. "
            "If information is not visible, return an empty value."
        )

        json_schema_prompt = f"""
Return ONLY a valid JSON object strictly matching this schema:
{{
  "document_type": "{document_type if document_type != 'general' else 'prescription'}",
  "document_date": "YYYY-MM-DD or date string as written, or null",
  "provider_name": "Healthcare provider, clinic, or physician name if present, or null",
  "patient_name_as_written": "Patient name written on the document, or null",
  "diagnoses": [
    {{
      "name": "Condition name exactly as written",
      "status": "active" | "resolved" | "suspected" | "chronic" | null,
      "date": "YYYY-MM-DD or date as written, or null",
      "source_reference": {{
        "document_id": "{document_id}",
        "page": 1,
        "source_text": "exact quote from document"
      }},
      "confidence_note": "Explicitly stated in document"
    }}
  ],
  "medications": [
    {{
      "name": "Medication name exactly as written",
      "dose": "dosage and unit (e.g. 500 mg, 100mg) or null",
      "route": "administration route (e.g. oral) or null",
      "frequency": "frequency (e.g. once daily, A.D.) or null",
      "duration": "duration of therapy or null",
      "instructions": "special instructions (e.g. # 30, with meals) or null",
      "start_date": "YYYY-MM-DD or null",
      "end_date": "YYYY-MM-DD or null",
      "source_reference": {{
        "document_id": "{document_id}",
        "page": 1,
        "source_text": "exact quote from document"
      }},
      "confidence_note": "Explicitly stated in document"
    }}
  ],
  "investigations": [
    {{
      "name": "Lab test or panel name",
      "date": "test date or null",
      "result": "result value as written or null",
      "unit": "measurement unit or null",
      "reference_range": "reference interval or null",
      "abnormal_flag": true | false | null,
      "source_reference": {{
        "document_id": "{document_id}",
        "page": 1,
        "source_text": "exact quote from document"
      }},
      "confidence_note": "Explicitly stated in document"
    }}
  ],
  "procedures": [
    {{
      "name": "Procedure or imaging name",
      "date": "procedure date or null",
      "details": "key findings or null",
      "source_reference": {{
        "document_id": "{document_id}",
        "page": 1,
        "source_text": "exact quote from document"
      }},
      "confidence_note": "Explicitly stated in document"
    }}
  ],
  "allergies": [
    {{
      "substance": "Offending drug or allergen name",
      "reaction": "manifestation or null",
      "severity": "mild | moderate | severe | null",
      "source_reference": {{
        "document_id": "{document_id}",
        "page": 1,
        "source_text": "exact quote from document"
      }},
      "confidence_note": "Explicitly stated in document"
    }}
  ],
  "follow_ups": [
    {{
      "description": "Scheduled review instruction",
      "confirmed_date": "YYYY-MM-DD ONLY if exact specific appointment calendar date is written, else null",
      "relative_time": "Relative timeframe text (e.g. '3 months', '2 weeks', 'in 10 days') or null",
      "source_reference": {{
        "document_id": "{document_id}",
        "page": 1,
        "source_text": "exact quote from document"
      }},
      "confidence_note": "Explicitly stated in document"
    }}
  ],
  "clinical_notes": "Concise objective summary of additional narrative observations, or null",
  "source_references": [
    {{
      "document_id": "{document_id}",
      "page": 1,
      "source_text": "verbatim text snippet"
    }}
  ],
  "confidence_notes": "Explicitly stated in document"
}}
"""

        full_prompt = (
            f"{EXTRACTION_SYSTEM_PROMPT}\n\n"
            f"{user_text}\n\n"
            f"{strict_safety_instruction}\n\n"
            f"{json_schema_prompt}"
        )

        parts: List[dict] = [{"text": full_prompt}]

        # Multimodal handling: PDF, Images (JPEG, JPG, PNG, WEBP), and Text
        if "pdf" in mime or fname_lower.endswith(".pdf"):
            extracted_text, page_images = self._parse_pdf(file_bytes)
            if extracted_text:
                parts.append({"text": f"--- Extracted Document Text ---\n{extracted_text}"})
            for img_bytes, img_mime in page_images[:5]:
                b64_img = base64.b64encode(img_bytes).decode("utf-8")
                parts.append({
                    "inline_data": {
                        "mime_type": img_mime,
                        "data": b64_img,
                    }
                })
            # Also attach PDF binary directly if under 10MB and no images extracted
            if len(file_bytes) < 10 * 1024 * 1024 and not page_images:
                b64_pdf = base64.b64encode(file_bytes).decode("utf-8")
                parts.append({
                    "inline_data": {
                        "mime_type": "application/pdf",
                        "data": b64_pdf,
                    }
                })
        elif (
            mime in ("image/jpeg", "image/jpg", "image/png", "image/webp")
            or fname_lower.endswith((".jpg", ".jpeg", ".png", ".webp"))
            or mime.startswith("image/")
        ):
            b64_img = base64.b64encode(file_bytes).decode("utf-8")
            if mime in ("image/png",) or fname_lower.endswith(".png"):
                img_mime = "image/png"
            elif mime in ("image/webp",) or fname_lower.endswith(".webp"):
                img_mime = "image/webp"
            else:
                img_mime = "image/jpeg"

            parts.append({
                "inline_data": {
                    "mime_type": img_mime,
                    "data": b64_img,
                }
            })
        elif "text" in mime or fname_lower.endswith(".txt"):
            text_str = file_bytes.decode("utf-8", errors="replace")
            parts.append({"text": f"--- Document Text Content ---\n{text_str}"})
        else:
            raise AIInvalidRequestError(
                f"Unsupported document format: {file_type} ({file_name}). "
                f"CarePath supports JPEG, JPG, PNG, WEBP, PDF, and TXT files.",
                provider=self.provider_name,
            )

        # API Key sent in secure header x-goog-api-key — NEVER in URL query params or logs!
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self._model}:generateContent"
        headers = {
            "x-goog-api-key": self._api_key,
            "Content-Type": "application/json",
        }
        payload = {
            "contents": [{"parts": parts}],
            "generationConfig": {
                "responseMimeType": "application/json",
            },
        }

        max_retries = 2
        retry_delays = [2.0, 4.0]

        try:
            resp = None
            for attempt in range(max_retries + 1):
                try:
                    with httpx.Client(timeout=60.0) as http_client:
                        resp = http_client.post(url, headers=headers, json=payload)
                except httpx.TimeoutException as te:
                    if attempt < max_retries:
                        logger.warning(f"Gemini timeout on attempt {attempt + 1}. Retrying in {retry_delays[attempt]}s...")
                        time.sleep(retry_delays[attempt])
                        continue
                    raise AIProviderError("Gemini request timed out while analyzing document.", provider=self.provider_name) from te
                except httpx.HTTPError as he:
                    if attempt < max_retries:
                        logger.warning(f"Gemini network error on attempt {attempt + 1}: {he}. Retrying in {retry_delays[attempt]}s...")
                        time.sleep(retry_delays[attempt])
                        continue
                    raise AIProviderError(f"Gemini connection error: {str(he)}", provider=self.provider_name) from he

                if resp.status_code in (429, 503) and attempt < max_retries:
                    delay = retry_delays[attempt]
                    logger.warning(
                        f"Gemini temporary failure HTTP {resp.status_code}. Retry {attempt + 1}/{max_retries} in {int(delay)}s."
                    )
                    time.sleep(delay)
                    continue

                break

            if resp is None:
                raise AIProviderError("Gemini client returned no response.", provider=self.provider_name)

            if resp.status_code == 429:
                logger.warning("Gemini quota exhausted (HTTP 429)")
                raise AIQuotaExhaustedError("Gemini API rate limit or quota exhausted (HTTP 429).", provider=self.provider_name)

            if resp.status_code in (401, 403):
                logger.error(f"Gemini authentication failure (HTTP {resp.status_code})")
                raise AIAuthenticationError("Invalid or unauthorized Gemini API key.", provider=self.provider_name)

            if resp.status_code == 400:
                logger.error(f"Gemini invalid request (HTTP 400): {resp.text}")
                raise AIInvalidRequestError(f"Gemini rejected the request (HTTP 400): {resp.text}", provider=self.provider_name)

            if resp.status_code >= 500:
                logger.error(f"Gemini service unavailable (HTTP {resp.status_code})")
                raise AIProviderError(f"Gemini service temporarily unavailable (HTTP {resp.status_code}).", provider=self.provider_name)

            if resp.status_code != 200:
                logger.error(f"Gemini request failed (HTTP {resp.status_code})")
                raise AIProviderError(f"Gemini request failed with HTTP {resp.status_code}.", provider=self.provider_name)

            resp_data = resp.json()
            candidates = resp_data.get("candidates", [])
            if not candidates:
                prompt_feedback = resp_data.get("promptFeedback", {})
                raise AIProviderError(
                    f"Gemini returned no candidates. Prompt feedback: {prompt_feedback}",
                    provider=self.provider_name,
                )

            raw_text = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
            if not raw_text.strip():
                raise AIValidationError("Gemini returned empty text response.", provider=self.provider_name)

            # Clean JSON if wrapped in markdown code fence
            clean_json = raw_text.strip()
            if clean_json.startswith("```json"):
                clean_json = clean_json[7:]
            if clean_json.startswith("```"):
                clean_json = clean_json[3:]
            if clean_json.endswith("```"):
                clean_json = clean_json[:-3]
            clean_json = clean_json.strip()

            parsed_obj = json.loads(clean_json)
            extraction = MedicalDocumentExtraction.model_validate(parsed_obj)

            # Ground source references with document_id and ensure completeness
            all_refs = list(extraction.source_references)
            for item_list in (
                extraction.diagnoses,
                extraction.medications,
                extraction.investigations,
                extraction.procedures,
                extraction.allergies,
                extraction.follow_ups,
            ):
                for item in item_list:
                    if hasattr(item, "source_reference") and item.source_reference:
                        if not item.source_reference.document_id:
                            item.source_reference.document_id = document_id
                        all_refs.append(item.source_reference)
                    elif hasattr(item, "source_reference") and not item.source_reference:
                        item.source_reference = SourceReference(
                            document_id=document_id,
                            page=1,
                            source_text=getattr(item, "name", str(item)),
                        )
                        all_refs.append(item.source_reference)

            # Deduplicate source_references by source_text
            seen_texts = set()
            unique_refs = []
            for r in all_refs:
                if r.source_text and r.source_text not in seen_texts:
                    seen_texts.add(r.source_text)
                    if not r.document_id:
                        r.document_id = document_id
                    unique_refs.append(r)
            if unique_refs:
                extraction.source_references = unique_refs
            elif not extraction.source_references:
                extraction.source_references = [
                    SourceReference(
                        document_id=document_id,
                        page=1,
                        source_text=file_name,
                    )
                ]

            logger.info(
                f"Gemini extraction successful for {document_id}: "
                f"{len(extraction.diagnoses)} diagnoses, "
                f"{len(extraction.medications)} medications, "
                f"{len(extraction.investigations)} investigations"
            )
            return extraction

        except (AIProviderError, AIQuotaExhaustedError, AIAuthenticationError, AIInvalidRequestError, AIValidationError):
            raise
        except json.JSONDecodeError as e:
            logger.error(f"Gemini response could not be parsed as JSON: {str(e)}")
            raise AIValidationError(f"Gemini output could not be parsed as valid JSON: {str(e)}", provider=self.provider_name) from e
        except Exception as e:
            err_str = str(e).lower()
            if any(k in err_str for k in ("quota", "resource_exhausted", "429")):
                raise AIQuotaExhaustedError("Gemini API quota exhausted.", provider=self.provider_name) from e
            logger.error(f"Gemini unexpected error: {str(e)}")
            raise AIProviderError(f"Gemini extraction failed: {str(e)}", provider=self.provider_name) from e


# ==============================================================================
# UNIFIED AI PROVIDER SERVICE (WITH RESILIENT MULTI-PROVIDER FALLBACK)
# ==============================================================================

class AIProviderService:
    """
    CarePath AI Provider Service.
    Supports Google Gemini (gemini-3.5-flash-lite) and OpenAI (gpt-4o-mini).
    When configured for OpenAI, automatically falls back to Gemini on 429 quota exhaustion.
    When configured for Gemini, uses Gemini directly.
    """

    def __init__(self):
        self.gemini_provider = GeminiProvider()
        self.openai_provider = OpenAIProvider()

    def extract_from_document(
        self,
        file_bytes: bytes,
        file_name: str,
        file_type: str,
        document_id: str,
        document_type: str = "general",
    ) -> Tuple[MedicalDocumentExtraction, str]:
        """
        Executes document extraction using configured AI provider with intelligent fallback.
        1. If AI_PROVIDER == 'openai': attempts OpenAI first. If OpenAI quota is exhausted (429),
           falls back to Gemini if configured.
        2. If AI_PROVIDER == 'gemini': uses Gemini directly.
        Returns tuple of (MedicalDocumentExtraction, provider_name).
        """
        provider_preference = (settings.AI_PROVIDER or "gemini").lower()

        if provider_preference == "openai":
            if not settings.OPENAI_API_KEY:
                if settings.GEMINI_API_KEY:
                    logger.warning("OpenAI key missing, falling back to Gemini.")
                    extraction = self.gemini_provider.extract_from_document(
                        file_bytes=file_bytes,
                        file_name=file_name,
                        file_type=file_type,
                        document_id=document_id,
                        document_type=document_type,
                    )
                    return extraction, "gemini"
                raise AIAuthenticationError("OpenAI API key is not configured on the backend.", provider="openai")

            try:
                extraction = self.openai_provider.extract_from_document(
                    file_bytes=file_bytes,
                    file_name=file_name,
                    file_type=file_type,
                    document_id=document_id,
                    document_type=document_type,
                )
                return extraction, "openai"
            except AIQuotaExhaustedError as e:
                logger.warning(f"OpenAI quota exhausted ({str(e)}). Checking for Gemini fallback...")
                if settings.GEMINI_API_KEY:
                    logger.info("Falling back to Gemini extraction...")
                    extraction = self.gemini_provider.extract_from_document(
                        file_bytes=file_bytes,
                        file_name=file_name,
                        file_type=file_type,
                        document_id=document_id,
                        document_type=document_type,
                    )
                    return extraction, "gemini"
                # If Gemini is not configured, re-raise the AIQuotaExhaustedError
                raise

        # Default / Gemini preference:
        if not settings.GEMINI_API_KEY:
            raise AIAuthenticationError(
                "Gemini API key is not configured on the backend.",
                provider="gemini",
            )

        extraction = self.gemini_provider.extract_from_document(
            file_bytes=file_bytes,
            file_name=file_name,
            file_type=file_type,
            document_id=document_id,
            document_type=document_type,
        )
        return extraction, "gemini"


ai_provider_service = AIProviderService()
