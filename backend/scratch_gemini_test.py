import os
import httpx
import json
import base64
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

storage_path = "a0b7b23f-5304-4237-98b2-3c4a61d7bffe/44b77d94-3d3e-4f8c-81fb-4f1e37841114-sampleimg.jpg"
url = f"{SUPABASE_URL}/storage/v1/object/medical-documents/{storage_path}"
headers = {"Authorization": f"Bearer {SUPABASE_KEY}", "apikey": SUPABASE_KEY}
resp = httpx.get(url, headers=headers)
image_b64 = base64.b64encode(resp.content).decode("utf-8")

# Test using header x-goog-api-key instead of query param so key is never in URL/logs
gemini_url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent"
gemini_headers = {
    "x-goog-api-key": GEMINI_API_KEY,
    "Content-Type": "application/json"
}

from app.schemas.extraction import MedicalDocumentExtraction
from app.utils.prompts import EXTRACTION_SYSTEM_PROMPT, get_extraction_user_prompt

document_id = "44b77d94-3d3e-4f8c-81fb-4f1e37841114"
user_text = get_extraction_user_prompt(
    document_id=document_id,
    file_name="sampleimg.jpg",
    document_type="prescription"
)

instruction = f"""{EXTRACTION_SYSTEM_PROMPT}

{user_text}

Extract ONLY information clearly visible in the document. Never guess, infer, or fabricate clinical information. If information is not visible, return an empty value.

Return a valid JSON object strictly conforming to this structure:
{{
  "document_type": "prescription",
  "document_date": "YYYY-MM-DD or as written",
  "provider_name": "doctor or clinic name or null",
  "patient_name_as_written": "patient name as written or null",
  "diagnoses": [
    {{
      "name": "string",
      "status": "active" | null,
      "date": null,
      "source_reference": {{
        "document_id": "{document_id}",
        "page": 1,
        "source_text": "string"
      }},
      "confidence_note": "Explicitly stated in document"
    }}
  ],
  "medications": [
    {{
      "name": "string",
      "dose": "string or null",
      "route": "string or null",
      "frequency": "string or null",
      "duration": "string or null",
      "instructions": "string or null",
      "start_date": null,
      "end_date": null,
      "source_reference": {{
        "document_id": "{document_id}",
        "page": 1,
        "source_text": "string"
      }},
      "confidence_note": "Explicitly stated in document"
    }}
  ],
  "investigations": [],
  "procedures": [],
  "allergies": [],
  "follow_ups": [],
  "clinical_notes": "string or null",
  "source_references": [
    {{
      "document_id": "{document_id}",
      "page": 1,
      "source_text": "string"
    }}
  ],
  "confidence_notes": "string or null"
}}
"""

payload = {
    "contents": [{
        "parts": [
            {"text": instruction},
            {"inline_data": {"mime_type": "image/jpeg", "data": image_b64}}
        ]
    }],
    "generationConfig": {
        "responseMimeType": "application/json"
    }
}

r = httpx.post(gemini_url, headers=gemini_headers, json=payload, timeout=60)
print("Gemini Status with header auth:", r.status_code)
if r.status_code == 200:
    t = r.json()["candidates"][0]["content"]["parts"][0]["text"]
    print("Raw response:\n", t)
    obj = json.loads(t)
    ext = MedicalDocumentExtraction.model_validate(obj)
    print("\nSUCCESSFULLY VALIDATED WITH PYDANTIC MedicalDocumentExtraction!")
    print("Document type:", ext.document_type)
    print("Document date:", ext.document_date)
    print("Patient name:", ext.patient_name_as_written)
    print("Provider name:", ext.provider_name)
    print("Medications count:", len(ext.medications))
    for m in ext.medications:
        print(f" - Name: {m.name}, Dose: {m.dose}, Freq: {m.frequency}, Source: '{m.source_reference.source_text if m.source_reference else None}'")
else:
    print("Error:", r.text)
