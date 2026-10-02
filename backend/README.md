# CarePath Backend — AI Intelligence Engine (Sprint 3)

FastAPI microservice providing deterministic authentication, multimodal OpenAI document understanding, Pydantic clinical validation, and normalized PostgreSQL persistence for CarePath.

---

## 1. Architectural Role & Responsibilities

The backend serves as the deterministic bridge between patient-owned medical documents stored in Supabase Storage and OpenAI's multimodal language models.

- **Deterministic Security**: The LLM *never* controls authorization or permissions. FastAPI verifies JWT access tokens with Supabase Auth, derives the patient identity (`auth.users -> patients.user_id -> patients.id`), and verifies document ownership before touching any file.
- **Multimodal Document Understanding**: Accepts PDF, PNG, JPEG, JPG, and WEBP clinical records.
- **Structured Outputs**: Enforces strict JSON Schema extraction via Pydantic (`MedicalDocumentExtraction`) using OpenAI's native Structured Outputs.
- **Normalized Persistence**: Automatically decomposes extracted diagnoses, medications, lab investigations, procedures, allergies, and follow-ups into relational PostgreSQL tables with source references (`document_id`, `source_page`, `source_text`).
- **Medical Safety Guardrail**: CarePath is an extraction and comprehension engine, *not* a diagnostic system. It never hallucinates diagnoses or calculates future appointment dates inside the model.

---

## 2. Directory Structure

```text
backend/
├── app/
│   ├── main.py                  # FastAPI application entrypoint with CORS
│   ├── api/
│   │   └── routes/
│   │       ├── health.py        # Public health check endpoint
│   │       └── documents.py     # Document processing & extraction endpoints
│   ├── core/
│   │   ├── config.py            # Pydantic BaseSettings environment configuration
│   │   └── security.py          # Supabase JWT verification & patient identity derivation
│   ├── schemas/
│   │   └── extraction.py        # Pydantic schemas for medical entities & extraction
│   ├── services/
│   │   ├── openai_service.py    # OpenAI multimodal Structured Outputs integration
│   │   └── storage_service.py   # Secure private Supabase Storage retrieval
│   ├── repositories/
│   │   └── clinical_records.py  # Atomic persistence and queries for clinical records
│   └── utils/
│       └── prompts.py           # Medical safety instructions & extraction prompts
├── requirements.txt             # Pinned backend dependencies
├── .env.example                 # Template for environment variables (no secrets)
└── README.md                    # Technical documentation
```

---

## 3. Environment Configuration

Create a `.env` file inside `backend/` based on `backend/.env.example`:

```bash
# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-secret

# OpenAI Configuration
OPENAI_API_KEY=your-openai-api-key
OPENAI_MODEL=gpt-4o-mini

# Server Configuration
PORT=8000
HOST=0.0.0.0
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
```

> **Security Rule**: The `SUPABASE_SERVICE_ROLE_KEY` and `OPENAI_API_KEY` must never be placed in frontend code, client bundles, or version control.

---

## 4. API Endpoints

### 4.1 `GET /health`
- **Authentication**: None (Public).
- **Description**: Verifies service operational readiness.
- **Response**:
  ```json
  {
    "status": "healthy",
    "service": "carepath-ai-engine",
    "version": "1.0.0",
    "pipeline": "Sprint 3: AI Document Intelligence Active"
  }
  ```

### 4.2 `POST /api/documents/{document_id}/process`
- **Authentication**: Required (`Authorization: Bearer <supabase_jwt>`).
- **Description**: Downloads the document from private Supabase Storage, validates ownership, runs multimodal AI extraction, stores normalized clinical entities, and updates status to `completed`.
- **Pre-conditions**:
  - Authenticated session must own the document (`patients.id == documents.patient_id`).
  - Document must not be currently in `processing` status (duplicate prevention returns HTTP `409 Conflict`).
- **Response (`200 OK`)**:
  ```json
  {
    "document_id": "c1f7a4...",
    "patient_id": "b2e6d1...",
    "processing_status": "completed",
    "message": "Document successfully processed and structured clinical records persisted.",
    "extraction": {
      "document_type": "prescription",
      "document_date": "2026-03-15",
      "provider_name": "Dr. Sarah Mitchell, MD",
      "patient_name_as_written": "Jane Doe",
      "diagnoses": [
        {
          "name": "Type 2 Diabetes Mellitus",
          "status": "active",
          "date": "2026-03-15",
          "source_reference": {
            "document_id": "c1f7a4...",
            "page": 1,
            "source_text": "Diagnosis: Type 2 Diabetes Mellitus"
          },
          "confidence_note": "Explicitly stated in document"
        }
      ],
      "medications": [
        {
          "name": "Metformin",
          "dose": "500 mg",
          "route": "oral",
          "frequency": "twice daily",
          "duration": "ongoing",
          "instructions": "Take with meals",
          "start_date": "2026-03-15",
          "end_date": null,
          "source_reference": {
            "document_id": "c1f7a4...",
            "page": 1,
            "source_text": "Metformin 500mg oral tablet, twice daily with meals"
          },
          "confidence_note": "Explicitly stated in document"
        }
      ],
      "investigations": [],
      "procedures": [],
      "allergies": [],
      "follow_ups": [
        {
          "description": "Review HbA1c and fasting blood sugar",
          "confirmed_date": null,
          "relative_time": "3 months",
          "source_reference": {
            "document_id": "c1f7a4...",
            "page": 1,
            "source_text": "Follow up in 3 months with repeat HbA1c"
          },
          "confidence_note": "Explicitly stated in document"
        }
      ],
      "clinical_notes": "Well-controlled on current oral hypoglycemic regimen.",
      "source_references": [...],
      "confidence_notes": "Clear typed clinical documentation."
    }
  }
  ```

### 4.3 `GET /api/documents/{document_id}/extraction`
- **Authentication**: Required (`Authorization: Bearer <supabase_jwt>`).
- **Description**: Retrieves the cached structured extraction for a document owned by the patient.
- **Response**: Returns extraction JSON and document processing state.

---

## 5. Running the Backend

```bash
# 1. Activate virtual environment
# Windows PowerShell:
.\.venv\Scripts\Activate.ps1

# Linux / macOS:
source .venv/bin/activate

# 2. Run with Uvicorn
uvicorn app.main:app --reload --port 8000 --host 0.0.0.0
```

Interactive API documentation (Swagger UI): `http://localhost:8000/docs`  
ReDoc documentation: `http://localhost:8000/redoc`
