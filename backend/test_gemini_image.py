import os
import base64
import httpx
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

storage_path = "a0b7b23f-5304-4237-98b2-3c4a61d7bffe/44b77d94-3d3e-4f8c-81fb-4f1e37841114-sampleimg.jpg"

# Download image from private Supabase Storage
url = f"{SUPABASE_URL}/storage/v1/object/medical-documents/{storage_path}"

headers = {
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "apikey": SUPABASE_KEY,
}

print("Downloading image from Supabase...")

response = httpx.get(url, headers=headers)

print("SUPABASE STATUS:", response.status_code)

if response.status_code != 200:
    print(response.text)
    raise SystemExit("Could not download image.")

image_bytes = response.content
image_b64 = base64.b64encode(image_bytes).decode("utf-8")

print("Image downloaded:", len(image_bytes), "bytes")
print("Sending image to Gemini 3.5 Flash-Lite...")

gemini_url = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    "gemini-3.5-flash-lite:generateContent"
    f"?key={GEMINI_API_KEY}"
)

payload = {
    "contents": [
        {
            "parts": [
                {
                    "text": """Analyze this medical document image.

Extract ONLY information that is clearly visible in the image.

Return JSON with:
{
  "document_type": "",
  "document_date": "",
  "diagnoses": [],
  "medications": [],
  "investigations": [],
  "procedures": [],
  "follow_ups": [],
  "visible_text_summary": ""
}

Do not guess or invent any medical information.
If something is not visible, return an empty value."""
                },
                {
                    "inline_data": {
                        "mime_type": "image/jpeg",
                        "data": image_b64
                    }
                }
            ]
        }
    ],
    "generationConfig": {
        "responseMimeType": "application/json"
    }
}

response = httpx.post(
    gemini_url,
    json=payload,
    timeout=60
)

print("GEMINI STATUS:", response.status_code)
print()

if response.status_code == 200:
    data = response.json()
    print("========== GEMINI RESPONSE ==========")
    print(data["candidates"][0]["content"]["parts"][0]["text"])
    print("=====================================")
else:
    print(response.text)