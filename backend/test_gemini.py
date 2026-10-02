import os
import httpx
from dotenv import load_dotenv

load_dotenv()

key = os.getenv("GEMINI_API_KEY")

if not key:
    print("ERROR: GEMINI_API_KEY not found")
    raise SystemExit

url = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    "gemini-3.5-flash-lite:generateContent?key=" + key
)

payload = {
    "contents": [
        {
            "parts": [
                {
                    "text": 'Return only JSON: {"status":"working"}'
                }
            ]
        }
    ]
}

response = httpx.post(
    url,
    json=payload,
    timeout=30
)

print("STATUS:", response.status_code)
print(response.text)