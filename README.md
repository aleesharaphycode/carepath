# CarePath — Unified Intelligent Healthcare Journey

CarePath is a patient-owned healthcare platform designed to transform fragmented medical documents—including prescriptions, laboratory reports, clinical discharge summaries, and medical images/PDFs—into a structured, chronological, and easily understandable health journey.

---

## 🌟 Core Product Capabilities

**CarePath v1.0.0 — Unified Patient Health Platform**

1. **Past — Health Timeline & Clinical History**: Chronological view of diagnoses, procedures, and lab results, with distinct visual badges distinguishing confirmed clinical events from AI-derived/projected dates.
2. **Present — Document Vault & Structured Records**: Secure medical document vault with bidirectional source-linking. Every extracted clinical entity references its exact originating document, page number, and clinical quotation.
3. **Next — Care Calendar & Follow-up Milestones**: Intelligent calendar surfacing confirmed clinical appointments and projecting follow-up milestones derived from doctor discharge orders.
4. **Family — Family Health Circles**: Managed family health profiles with strict authorization boundaries. Managing family members does not merge records; each dependent's clinical history remains isolated.
5. **Share — Scoped, Time-Bound QR Doctor Consent**: Cryptographic, least-privilege capability tokens allowing patients to grant temporary read-only access to attending physicians with zero app installation required.
6. **Verify — Cross-Document Mismatch Detection**: Deterministic and AI-assisted cross-document verification engine flagging conflicting information (e.g., conflicting tooth numbers or medication dosages) across providers for patient review.

---

## 💡 Problem & Solution

* **The Problem:** Modern healthcare encounters produce fragmented medical records scattered across clinic portals, paper prescriptions, lab PDFs, and discharge slips. Patients struggle to recall medical histories, understand lab results, track follow-ups, or detect conflicting recommendations between specialists.
* **The CarePath Solution:** CarePath transforms unstructured clinical documents into an intelligent, patient-owned health journey. It extracts verified clinical facts, builds a chronological history, projects future follow-ups, flags cross-document discrepancies, manages family circles, and enables secure, zero-knowledge QR sharing with doctors.

---

## 🏗️ Project Structure

```
CarePath/
├── frontend/             # Next.js 16 App Router (TypeScript, Tailwind CSS, shadcn/ui)
│   ├── src/
│   │   ├── app/          # Routes: /, /login, /register, /dashboard, /profile, /documents, /timeline, /calendar, /family, /consent, /doctor/access
│   │   ├── components/   # UI components (Vault, Viewer, Timeline, Calendar, MismatchCard, Family, Consent)
│   │   ├── lib/          # Supabase client/server/proxy configs, intelligence & consent services, types
│   │   └── proxy.ts      # Next.js 16 Proxy for Supabase session refresh & route protection
│   ├── .env.example      # Example frontend environment variables
│   ├── package.json
│   └── tsconfig.json
├── backend/              # FastAPI AI Intelligence Microservice
│   ├── app/
│   │   ├── api/routes/   # Endpoints: /health, /api/documents, /api/timeline, /api/calendar, /api/mismatches, /api/family, /api/consent, /api/doctor
│   │   ├── core/         # Config (Pydantic BaseSettings) & deterministic JWT security
│   │   ├── repositories/ # Normalized PostgreSQL clinical records persistence
│   │   ├── schemas/      # Pydantic extraction, family & consent models
│   │   ├── services/     # Intelligence engine, family & consent services, OpenAI structured outputs
│   │   ├── utils/        # Medical extraction prompts & safety guardrails
│   │   └── main.py       # FastAPI application entrypoint with CORS
│   ├── requirements.txt  # Pinned backend dependencies
│   └── .env.example      # Backend environment variables template
├── database/             # PostgreSQL migrations & Supabase RLS policies
│   └── migrations/
│       ├── 01_patients.sql          # Patients table & identity bindings
│       ├── 02_documents.sql         # Medical documents vault & storage RLS
│       ├── 03_clinical_records.sql  # Normalized clinical tables & provenance
│       ├── 04_mismatches.sql        # Cross-document mismatches & RLS
│       └── 05_family_consent.sql    # Family circles, temporary QR consent & audit logs
├── demo-data/            # Synthetic clinical datasets & journey scenarios for demonstrations
│   ├── cardiology_prescription.txt
│   ├── metabolic_panel_report.txt
│   ├── dental_treatment_plan.txt
│   ├── dental_referral_discrepancy.txt
│   ├── surgical_discharge_summary.txt
│   ├── synthetic_patient_journey.json
│   └── README.md
├── docs/                 # Architectural specifications and engineering guides
│   ├── ARCHITECTURE.md   # System architecture, guardrails, and roadmap
│   ├── SPRINT_5_AUDIT.md # Pre-Sprint 5 comprehensive audit report
│   └── TECHNICAL_NOTES.md # Technical explanations for hackathon judges
└── README.md             # Project documentation and getting started guide
```

---

## ⚙️ Prerequisites

Before running the project, ensure you have the following installed:
- **Node.js**: v18.18.0 or later (v22+ recommended)
- **Python**: v3.10 or later
- **npm**: v9.0.0 or later
- **Git**
- A **Supabase project** (Free tier or self-hosted)
- An **OpenAI API Key** (for multimodal extraction)

---

## 🚀 Setup & Installation Instructions

1. **Clone the repository:**
   ```bash
   git clone <repo-url>
   cd carepath
   ```

2. **Configure Frontend Environment Variables:**
   Create `frontend/.env.local` based on `frontend/.env.example`:
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<your-supabase-anon-key>
   NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
   ```

3. **Configure Backend Environment Variables:**
   Create `backend/.env` based on `backend/.env.example`:
   ```bash
   SUPABASE_URL=https://<your-project-ref>.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=<your-supabase-service-role-key>
   OPENAI_API_KEY=<your-openai-api-key>
   OPENAI_MODEL=gpt-4o-mini
   PORT=8000
   HOST=0.0.0.0
   CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
   ```

4. **Run Database Migrations in Supabase:**
   - Open your Supabase Project Dashboard &rarr; **SQL Editor**.
   - Sequentially execute:
     1. [`database/migrations/01_patients.sql`](database/migrations/01_patients.sql) (Patients table & RLS)
     2. [`database/migrations/02_documents.sql`](database/migrations/02_documents.sql) (Documents vault & Storage bucket RLS)
     3. [`database/migrations/03_clinical_records.sql`](database/migrations/03_clinical_records.sql) (Relational clinical entities & RLS)
     4. [`database/migrations/04_mismatches.sql`](database/migrations/04_mismatches.sql) (Cross-document mismatches & RLS)
     5. [`database/migrations/05_family_consent.sql`](database/migrations/05_family_consent.sql) (Family circles, QR consent & audit trail RLS)

5. **Install Dependencies:**
   ```bash
   # Frontend
   cd frontend
   npm install

   # Backend
   cd ../backend
   python -m venv .venv
   source .venv/bin/activate  # On Windows: .venv\Scripts\activate
   pip install -r requirements.txt
   ```

---

## 💻 Development Commands

### 1. Run the Frontend (Next.js 16)
```bash
cd frontend
npm run dev
```
Navigate to **[http://localhost:3000](http://localhost:3000)**.

### 2. Run the Backend AI Microservice (FastAPI)
```bash
cd backend
.venv\Scripts\activate  # On Windows
uvicorn app.main:app --reload --port 8000
```
Interactive API documentation: **[http://localhost:8000/docs](http://localhost:8000/docs)**.

### Available Routes & Services:
- `http://localhost:3000/` — CarePath Home / Platform Overview
- `http://localhost:3000/login` — Patient Sign In Portal
- `http://localhost:3000/register` — Patient Registration & Onboarding
- `http://localhost:3000/dashboard` — Patient Health Journey Command Center (Protected)
- `http://localhost:3000/profile` — Patient Profile Management (Protected)
- `http://localhost:3000/documents` — Secure Medical Document Vault & AI Insights (Protected)
- `http://localhost:3000/timeline` — Unified Health Journey Timeline & Provenance Viewer (Protected)
- `http://localhost:3000/calendar` — AI Healthcare Calendar & Review Milestone Schedule (Protected)
- `http://localhost:3000/family` — Family Health Circles & Dependent Records (Protected)
- `http://localhost:3000/consent` — Time-bound QR Doctor Consent & Access Audit Logs (Protected)
- `http://localhost:3000/doctor/access` — Provider In-Person Encounter Portal (Token-Authorized)
- `http://localhost:8000/health` — FastAPI Health & Operational Readiness
- `http://localhost:8000/api/timeline` — Chronological clinical timeline API
- `http://localhost:8000/api/calendar` — Confirmed appointments & deterministic review projections API
- `http://localhost:8000/api/mismatches` — Cross-document mismatch detection API
- `http://localhost:8000/api/family` — Family groups and dependent records API
- `http://localhost:8000/api/consent` — Time-bound QR consent and audit trail API
- `http://localhost:8000/api/doctor` — Clinician capability token verification API
- `http://localhost:8000/docs` — Swagger / OpenAPI Documentation

---

## 🔒 Architectural & Security Guardrails

CarePath strictly adheres to clinical data privacy standards:
- **Zero-Password Storage**: Passwords are never stored or logged by CarePath; authentication is delegated to Supabase Auth's salted bcrypt implementation.
- **Cookie-Based SSR Sessions**: Authentication uses `@supabase/ssr` cookies rather than `localStorage`, preventing auth state desync and flashing during server rendering.
- **Deterministic Server-Side Authorization**: The LLM is never permitted to control user permissions, access tokens, or business logic. All security gates are deterministic.
- **Database Row Level Security (RLS)**: Access to documents, patient profiles, and extracted clinical records is restricted at the PostgreSQL engine level (`auth.uid() = user_id`). Users can never access or modify records belonging to other patients.
- **Evidence-Based Provenance**: Extracted medical entities retain exact source citations (`document_id`, `source_page`, and verbatim text). No speculative diagnoses or inferred dates are saved as confirmed facts.

For comprehensive architectural specifications, live judging guides, and project status, refer to:
- 📖 [Presenter Live Demonstration Guide (docs/DEMO_GUIDE.md)](docs/DEMO_GUIDE.md)
- 📊 [Final Project Status & Limitations (docs/FINAL_PROJECT_STATUS.md)](docs/FINAL_PROJECT_STATUS.md)
- 🏗️ [Architectural Blueprint (docs/ARCHITECTURE.md)](docs/ARCHITECTURE.md)
- 📝 [Technical Architecture Notes (docs/TECHNICAL_NOTES.md)](docs/TECHNICAL_NOTES.md)


