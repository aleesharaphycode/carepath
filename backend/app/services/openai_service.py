import base64
import io
import logging
from typing import Optional, List
from openai import OpenAI
from pypdf import PdfReader
from app.core.config import settings
from app.schemas.extraction import MedicalDocumentExtraction
from app.utils.prompts import EXTRACTION_SYSTEM_PROMPT, get_extraction_user_prompt

logger = logging.getLogger("carepath.openai")


class OpenAIService:
    def __init__(self):
        self._client: Optional[OpenAI] = None

    @property
    def client(self) -> OpenAI:
        if self._client is None:
            if not settings.OPENAI_API_KEY:
                raise ValueError("OPENAI_API_KEY is not configured on the backend.")
            self._client = OpenAI(api_key=settings.OPENAI_API_KEY)
        return self._client

    def extract_from_document(
        self,
        file_bytes: bytes,
        file_name: str,
        file_type: str,
        document_id: str,
        document_type: str = "general",
    ) -> MedicalDocumentExtraction:
        """
        Processes a medical document using OpenAI multimodal Structured Outputs.
        Supports PDF, PNG, JPEG, JPG, and WEBP.
        """
        mime = file_type.lower()
        model_name = settings.OPENAI_MODEL
        logger.info(f"Initiating AI extraction for document {document_id} ({file_name}, mime={mime}) using {model_name}")

        messages: List[dict] = [
            {"role": "system", "content": EXTRACTION_SYSTEM_PROMPT},
        ]

        if "pdf" in mime or file_name.lower().endswith(".pdf"):
            # Process PDF document
            extracted_text, page_images = self._parse_pdf(file_bytes)
            user_text_prompt = get_extraction_user_prompt(
                document_id=document_id,
                file_name=file_name,
                document_type=document_type,
                text_content=extracted_text,
            )

            user_content: List[dict] = [{"type": "text", "text": user_text_prompt}]

            # If PDF contains extracted page images (e.g. scanned prescriptions/reports), include up to 5 images
            for img_bytes, img_mime in page_images[:5]:
                b64_img = base64.b64encode(img_bytes).decode("utf-8")
                user_content.append({
                    "type": "image_url",
                    "image_url": {"url": f"data:{img_mime};base64,{b64_img}"},
                })

            messages.append({"role": "user", "content": user_content})

        else:
            # Process Image document (PNG, JPEG, WEBP)
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
                    {
                        "type": "image_url",
                        "image_url": {"url": data_url},
                    },
                ],
            })

        # Invoke OpenAI Structured Outputs with Pydantic Schema enforcement
        try:
            completion = self.client.beta.chat.completions.parse(
                model=model_name,
                messages=messages,
                response_format=MedicalDocumentExtraction,
            )

            extraction = completion.choices[0].message.parsed
            if not extraction:
                raise ValueError("OpenAI model returned empty extraction response.")

            # Ground source references with document_id if missing
            for ref in extraction.source_references:
                if not ref.document_id:
                    ref.document_id = document_id

            logger.info(
                f"Successfully extracted document {document_id}: "
                f"{len(extraction.diagnoses)} diagnoses, "
                f"{len(extraction.medications)} medications, "
                f"{len(extraction.investigations)} investigations, "
                f"{len(extraction.procedures)} procedures, "
                f"{len(extraction.allergies)} allergies, "
                f"{len(extraction.follow_ups)} follow-ups"
            )
            return extraction

        except Exception as e:
            logger.error(f"OpenAI extraction API call failed: {str(e)}")
            raise

    def _parse_pdf(self, file_bytes: bytes) -> tuple[str, List[tuple[bytes, str]]]:
        """
        Extracts page-indexed text and embedded scan images from PDF.
        """
        extracted_text_blocks = []
        page_images = []

        try:
            reader = PdfReader(io.BytesIO(file_bytes))
            for idx, page in enumerate(reader.pages):
                page_num = idx + 1
                text = page.extract_text() or ""
                if text.strip():
                    extracted_text_blocks.append(f"[Page {page_num}]\n{text.strip()}")

                # Extract embedded images if available
                if hasattr(page, "images"):
                    for img in page.images:
                        img_name = img.name.lower()
                        img_mime = "image/png" if img_name.endswith(".png") else "image/jpeg"
                        page_images.append((img.data, img_mime))

        except Exception as e:
            logger.warning(f"pypdf could not fully extract PDF structure: {str(e)}")

        combined_text = "\n\n".join(extracted_text_blocks)
        return combined_text, page_images


openai_service = OpenAIService()
