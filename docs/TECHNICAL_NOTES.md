# CarePath — Technical Architecture Notes (Sprint 5)

This document provides architectural explanations of CarePath's authentication, authorization, session management, database schema, private storage, document upload pipeline, patient dashboard, FastAPI AI intelligence engine, multimodal document extraction, normalized clinical record persistence, unified health timeline, AI health calendar, cross-document mismatch detection, family health record isolation, temporary QR doctor consent, and immutable audit logging for engineering reviews and hackathon judging.

---

## 1. Why Supabase Auth is Used

CarePath is a patient-owned healthcare records platform where data privacy and strict tenant isolation are non-negotiable. 

- **Managed Identity & Security:** Supabase Auth provides battle-tested identity management built on GoTrue and PostgreSQL. It manages password hashing (using salted bcrypt), token generation, rate limiting, and email verification without requiring CarePath to build or maintain high-risk custom auth plumbing.
- **Native PostgreSQL Integration:** Supabase Auth is directly coupled with PostgreSQL's security layer. The authenticated user ID (`auth.uid()`) is seamlessly accessible inside SQL queries and Row Level Security (RLS) policies.

---

## 2. Why `@supabase/ssr` is Used

Modern Next.js applications (such as Next.js 16 App Router) execute on both the server and the browser:

- Legacy auth packages (`@supabase/auth-helpers-nextjs`) are deprecated.
- `@supabase/ssr` is the current, first-class library for Server-Side Rendering (SSR).
- It provides unified cookie management across Server Components, Server Actions, Route Handlers, and Next.js 16 `proxy.ts` (middleware), avoiding inconsistent auth states across hydration boundaries.

---

## 3. Browser Client vs. Server Client

CarePath explicitly separates client and server Supabase instantiation:

| Component Type | Instantiation Function | Location | Capabilities & Responsibilities |
| :--- | :--- | :--- | :--- |
| **Browser Client** | `createBrowserClient` | [`frontend/src/lib/supabase/client.ts`](file:///c:/Users/Akshya%20Anand/OneDrive/Desktop/carepath/frontend/src/lib/supabase/client.ts) | Used in `"use client"` components for interactive forms (`signUp`, `signInWithPassword`, `signOut`, `onAuthStateChange`). Reads and writes standard browser cookies. |
| **Server Client** | `createServerClient` | [`frontend/src/lib/supabase/server.ts`](file:///c:/Users/Akshya%20Anand/OneDrive/Desktop/carepath/frontend/src/lib/supabase/server.ts) | Used in Server Components and Route Handlers. Accesses request cookies via `await cookies()` from `next/headers` to verify sessions before server rendering. |

---

## 4. Why Cookies are Used for SSR Sessions (vs. `localStorage`)

- **Server Availability:** `localStorage` is accessible *only* within the browser JavaScript execution environment. A server rendering a page (SSR) cannot read `localStorage`.
- **Zero-Flash Protected Rendering:** With cookie-based sessions, every HTTP request transports the session token in the `Cookie` header. The server inspects the session *before* sending any HTML to the browser, eliminating content flashing and unauthorized layout leaks.
- **Security:** Session cookies can be protected with `HttpOnly`, `SameSite=Lax`, and `Secure` attributes, preventing cross-site scripting (XSS) extraction.

---

## 5. How Route Protection Works (Dashboard & Documents)

Route protection in CarePath operates at two complementary levels:

1. **Next.js 16 Proxy Layer ([`src/proxy.ts`](file:///c:/Users/Akshya%20Anand/OneDrive/Desktop/carepath/frontend/src/proxy.ts)):**
   - Intercepts requests before they hit page components.
   - Refreshes expiring access tokens automatically and writes refreshed tokens to response cookies.
   - If an unauthenticated user attempts to visit `/dashboard`, `/profile`, or `/documents`, the proxy intercepts the request and issues an immediate `NextResponse.redirect` to `/login?redirectedFrom=...`.
2. **Server Component Auth Guard ([`src/app/dashboard/page.tsx`](file:///c:/Users/Akshya%20Anand/OneDrive/Desktop/carepath/frontend/src/app/dashboard/page.tsx) & [`src/app/documents/page.tsx`](file:///c:/Users/Akshya%20Anand/OneDrive/Desktop/carepath/frontend/src/app/documents/page.tsx)):**
   - Uses `getAuthenticatedUser()` (via `getClaims()` and `getUser()`) to verify the token server-side.
   - Does NOT rely solely on `getSession()`, preventing forged or expired tokens from rendering data.
   - If the user is unauthenticated, redirects to `/login`.

---

## 6. Supabase PostgreSQL Architecture

CarePath uses Supabase managed PostgreSQL as its authoritative system of record.
- Migrations are sequential, declarative, and reproducible in [`database/migrations/`](file:///c:/Users/Akshya%20Anand/OneDrive/Desktop/carepath/database/migrations/).
- `01_patients.sql` sets up patient demographics and identity bindings.
- `02_documents.sql` sets up medical document vault records and private storage bucket policies.
- Every table enforces strict foreign key relational integrity with `ON DELETE CASCADE`.

---

## 7. Document Schema (`public.documents`)

The documents table represents the source medical artifact uploaded by the patient. No premature clinical or speculative AI extraction fields are added:

```sql
CREATE TABLE public.documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    file_type TEXT NOT NULL,
    file_size BIGINT,
    document_type TEXT DEFAULT 'general',
    processing_status TEXT NOT NULL DEFAULT 'pending',
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT chk_documents_processing_status CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed')),
    CONSTRAINT chk_documents_file_size CHECK (file_size > 0)
);
```

### Status Constraints
Document processing status is strictly controlled:
- `pending`: Document safely uploaded to private storage and recorded in PostgreSQL; awaiting background AI processing (Sprint 3).
- `processing`: Document currently being processed by clinical ingestion microservice.
- `completed`: Clinical entities successfully extracted into structured health models.
- `failed`: Document could not be processed due to corruption, illegibility, or unparseable format.

---

## 8. Row Level Security (RLS) & The Patient Ownership Model

Row Level Security is CarePath's primary database defense:

- Instead of trusting browser parameters or application-layer `WHERE` clauses, the PostgreSQL engine inspects every statement.
- **Patient Ownership Chain:**
  ```
  auth.uid() (JWT session)
       ↓
  public.patients.user_id = auth.uid()
       ↓
  public.patients.id
       ↓
  public.documents.patient_id = public.patients.id
  ```

### RLS Policies on `public.documents`:
```sql
CREATE POLICY "Patients can view their own documents"
    ON public.documents FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.patients
        WHERE patients.id = documents.patient_id AND patients.user_id = auth.uid()
    ));

CREATE POLICY "Patients can insert their own documents"
    ON public.documents FOR INSERT TO authenticated
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.patients
        WHERE patients.id = documents.patient_id AND patients.user_id = auth.uid()
    ));

CREATE POLICY "Patients can update their own documents"
    ON public.documents FOR UPDATE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.patients
        WHERE patients.id = documents.patient_id AND patients.user_id = auth.uid()
    ));

CREATE POLICY "Patients can delete their own documents"
    ON public.documents FOR DELETE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.patients
        WHERE patients.id = documents.patient_id AND patients.user_id = auth.uid()
    ));
```
Even if a compromised client attempts to pass a different `patient_id`, PostgreSQL rejects the transaction immediately.

---

## 9. Supabase Storage & Private Storage Buckets

Medical documents contain sensitive Protected Health Information (PHI).

1. **Private Bucket Configuration:**
   - Bucket: `medical-documents`.
   - `public = false`: Permanent public URLs do not exist and return 400/403 errors.
   - Max file size: 25 MB.
   - Allowed MIME types: `application/pdf`, `image/png`, `image/jpeg`, `image/jpg`, `image/webp`.
2. **Path Isolation:**
   - Files are stored using the structure:
     `{patient_id}/{file_id}-{sanitized_file_name}`
3. **Storage Object RLS:**
   - In `storage.objects`, RLS checks `split_part(storage.objects.name, '/', 1) = patients.id::text` for the authenticated `auth.uid()`.
   - Patients cannot upload to or read from directories assigned to another patient.
4. **Time-Limited Signed URLs:**
   - Viewing or downloading a document generates a short-lived HMAC signed URL (5-minute expiration) via `supabase.storage.from('medical-documents').createSignedUrl(storage_path, 300)`.
   - Never exposes persistent public links or service-role keys.

---

## 10. Document Upload Flow

```
[Patient in /documents]
        │
        ▼ 1. Selects PDF/JPG/PNG
[Frontend Validation]
        │   • Checks MIME type & extension
        │   • Verifies file size <= 25MB
        ▼
[Supabase Storage]
        │   • Uploads to private bucket `medical-documents`
        │   • Encrypted path: {patientId}/{fileId}-{sanitizedName}
        │   • Guarded by storage.objects RLS
        ▼
[PostgreSQL Database]
        │   • Inserts record in `public.documents`
        │   • patient_id derived from verified session profile
        │   • processing_status = 'pending'
        ▼
[Document Vault UI]
        • Displays file card with "Pending Analysis" badge
        • Enables secure signed URL preview and download
```

If the database insert fails, an automated rollback removes the newly uploaded storage object to prevent orphan artifacts.

---

## 11. Dashboard Data Flow

The patient dashboard (`/dashboard`) acts as a real-time command center:
1. **Server Auth Guard:** Next.js Server Component verifies JWT claims via `getAuthenticatedUser()`.
2. **Profile Retrieval:** Queries `public.patients` for `full_name`, `date_of_birth`, `phone`, and computes completion percentage.
3. **Live Document Metrics:**
   - Queries `public.documents` for all records belonging to `patient_id`.
   - Computes total count, pending count, and completed count from real data.
   - Retrieves recent uploads (top 4 ordered by `uploaded_at DESC`).
   - Zero hard-coded fake numbers or simulated metrics.
4. **Upcoming Module Architecture:**
   - Renders clear placeholders for upcoming capabilities (AI Extraction, Timeline, Calendar, Mismatch Engine, QR Access) explicitly tagged with their scheduled sprint numbers.

---

## 12. FastAPI Intelligence Engine & Ingestion Pipeline

The FastAPI microservice in [`backend/`](file:///c:/Users/Akshya%20Anand/OneDrive/Desktop/carepath/backend/) acts as the deterministic coordinator between patient-owned medical documents in private storage and OpenAI's multimodal models:

1. **Deterministic Security Gateway:**
   - The LLM **never** controls authentication, user permissions, or tenant isolation.
   - When a patient triggers extraction from the frontend (`POST /api/documents/{document_id}/process`), the backend authenticates the caller via Supabase JWT bearer token (`get_current_patient`).
   - Resolves caller identity deterministically (`auth.users -> patients.user_id -> patients.id`).
   - Verifies that `documents.patient_id == patient.id`. If mismatched, immediately aborts with `404 Not Found` without disclosing record existence.

2. **Atomic Processing State Machine:**
   - Prevents duplicate or overlapping AI extraction jobs (`chk_documents_processing_status`).
   - Sets `processing_status = 'processing'` prior to starting retrieval.
   - If processing fails at any stage (network drop, API rate limit, invalid file), the exception handler cleanly resets `processing_status = 'failed'` without corrupting data or leaking API credentials.
   - Upon successful persistence, atomically promotes `processing_status = 'completed'`.

3. **Private Document Stream Retrieval:**
   - Uses Supabase Admin Client server-side to stream the document binary directly into memory from private Supabase Storage (`storage_service.download_document`).
   - The raw storage object is never made public or exposed to unauthorized parties.

---

## 13. OpenAI Multimodal Structured Outputs & Pydantic Validation

CarePath utilizes OpenAI's native **Structured Outputs** (`client.beta.chat.completions.parse`) with strict Pydantic schemas:

- **Strict Schema Enforcement:** Responses conform guaranteed to `MedicalDocumentExtraction` ([`backend/app/schemas/extraction.py`](file:///c:/Users/Akshya%20Anand/OneDrive/Desktop/carepath/backend/app/schemas/extraction.py)).
- **Multimodal Ingestion:** Handles PDF documents (parsing embedded images and textual streams via `pypdf`) and visual formats (`image/png`, `image/jpeg`, `image/webp`).
- **Entity Decomposition:** Accurately isolates:
  - **Diagnoses**: Name, status (`active`, `resolved`, `suspected`, `chronic`), date, and confidence notes.
  - **Medications**: Name, dosage, route, frequency, duration, explicit instructions, start and end dates.
  - **Investigations (Labs & Tests)**: Test name, recorded date, numeric or textual result, unit of measurement, reference range, and boolean `abnormal_flag`.
  - **Procedures**: Surgical, diagnostic, or therapeutic interventions and recorded dates.
  - **Allergies**: Causative substance, observed reaction, and severity classification.
  - **Follow-ups & Appointments**: Description, confirmed calendar dates, or relative timeframe descriptions.

---

## 14. Normalized Relational Schema & Provenance Tracking

Rather than storing AI extractions as an opaque JSON blob, CarePath normalizes entities into relational PostgreSQL tables ([`database/migrations/03_clinical_records.sql`](file:///c:/Users/Akshya%20Anand/OneDrive/Desktop/carepath/database/migrations/03_clinical_records.sql)):

- **Normalized Tables:** `public.diagnoses`, `public.medications`, `public.investigations`, `public.procedures`, `public.allergies`, `public.follow_ups`.
- **Source Provenance:** Every row references `patient_id`, `document_id`, `source_page`, and verbatim `source_text`.
- **Cached Raw Payload:** `public.document_extractions` caches the full structured extraction for rapid frontend hydration and timeline indexing.
- **Relational Row Level Security:** Every table enforces strict RLS policies:
  ```sql
  CREATE POLICY "Patients can view their own diagnoses"
      ON public.diagnoses FOR SELECT TO authenticated
      USING (EXISTS (
          SELECT 1 FROM public.patients 
          WHERE patients.id = diagnoses.patient_id 
            AND patients.user_id = auth.uid()
      ));
  ```
- **Idempotency:** Re-processing a document safely clears prior extracted records for that `document_id` before inserting updated records, preventing duplicate clinical entries.

---

## 15. Medical Safety Guardrails

CarePath enforces strict clinical safety principles during ingestion:

1. **No Inferred Dates Stored as Confirmed:**
   - If a prescription says *"review in 3 weeks"*, the AI stores `relative_time = '3 weeks'` and leaves `confirmed_date = null`.
   - The model is **never** permitted to compute speculative appointment dates. Confirmed calendar dates are strictly reserved for dates explicitly recorded on the document.
2. **No Hallucinated Diagnoses:**
   - System prompts forbid extrapolating unmentioned conditions from medication lists (e.g., prescribing Metformin does NOT allow the model to invent a "Type 2 Diabetes" diagnosis unless written by the physician).
3. **Abnormal Test Flags:**
   - Lab investigation values outside reference ranges are flagged objectively (`abnormal_flag = true`) without diagnosing acute conditions or offering speculative medical advice.

---

## 16. Implementation Summary

### Implemented in Sprint 1 (Phases 1 + 2):
- Next.js 16 + React 19 + TypeScript + Tailwind CSS
- Supabase Auth (Sign Up, Sign In, Sign Out, Cookie Session Sync)
- Next.js 16 `proxy.ts` route protection
- `public.patients` table with Row Level Security
- Patient profile onboarding and management (`/profile`)

### Implemented in Sprint 2 (Phases 3 + 4 + 5):
- `public.documents` table with CHECK constraints and performance indexes
- Sequential database migration: [`database/migrations/02_documents.sql`](file:///c:/Users/Akshya%20Anand/OneDrive/Desktop/carepath/database/migrations/02_documents.sql)
- Row Level Security for documents table (`SELECT`, `INSERT`, `UPDATE`, `DELETE`)
- Private Supabase Storage bucket (`medical-documents`, `public = false`)
- Storage Object RLS isolating patient directories
- Secure Document Vault interface at [`/documents`](file:///c:/Users/Akshya%20Anand/OneDrive/Desktop/carepath/frontend/src/app/documents/page.tsx)
- Drag-and-drop file upload with format and size validation
- Controlled `processing_status` (`pending`, `processing`, `completed`, `failed`)
- Time-limited signed URL document viewer modal and download
- Functional Patient Command Center at [`/dashboard`](file:///c:/Users/Akshya%20Anand/OneDrive/Desktop/carepath/frontend/src/app/dashboard/page.tsx) with live Supabase metrics
- Zero fake data, zero premature AI calls

### Implemented in Sprint 3 (Phases 6 + 7 + 8):
- Deterministic FastAPI backend with CORS, Pydantic BaseSettings, and health monitoring
- Supabase JWT token verification and patient identity resolution middleware
- Private document stream retrieval from Supabase Storage using service role credentials
- Multimodal document analysis pipeline (supporting PDFs and images) with OpenAI Structured Outputs
- Strict Pydantic validation schemas (`MedicalDocumentExtraction`) for diagnoses, medications, labs, procedures, allergies, and follow-ups
- Normalized PostgreSQL migration ([`database/migrations/03_clinical_records.sql`](file:///c:/Users/Akshya%20Anand/OneDrive/Desktop/carepath/database/migrations/03_clinical_records.sql)) with RLS across all 7 clinical tables
- Clinical provenance tracking (`document_id`, `source_page`, `source_text`, `confidence_note`)
- Frontend AI client service (`triggerDocumentAnalysis`, `fetchDocumentExtraction`)
- Extraction Insights Modal ([`frontend/src/components/documents/extraction-insights-modal.tsx`](file:///c:/Users/Akshya%20Anand/OneDrive/Desktop/carepath/frontend/src/components/documents/extraction-insights-modal.tsx)) displaying interactive clinical entities, abnormal flags, and source citations
- Atomic document status transitions (`pending` -> `processing` -> `completed` / `failed`)

---

## 17. Unified Health Timeline Architecture (Sprint 4)

The Unified Health Timeline ([`/timeline`](file:///c:/Users/Akshya%20Anand/OneDrive/Desktop/carepath/frontend/src/app/timeline/page.tsx)) synthesizes fragmented clinical records into a single chronological health journey:

1. **Multi-Table Relational Ingestion:**
   - Aggregates records across `public.diagnoses`, `public.medications`, `public.investigations`, `public.procedures`, and `public.follow_ups`.
   - Resolves source document metadata (`file_name`, `document_type`, `storage_path`) via indexed foreign key relationships.
2. **Deterministic Chronological Sorting:**
   - Confirmed records are strictly ordered in reverse chronological order (newest encounters first).
   - Events lacking an official calendar date are never assigned speculative AI timestamps; they are explicitly presented with a distinct `Date not specified` indicator and grouped safely.
3. **Multi-Factor Filtering:**
   - Type-level filtering (`All`, `Diagnoses`, `Medications`, `Investigations`, `Procedures`, `Follow-ups`, `Mismatches`).
   - ISO date range bounding (`From Date`, `To Date`).
   - Verbatim full-text search across titles, clinical attributes, and source quotations.

---

## 18. AI Health Calendar & Deterministic Date Calculations

The AI Health Calendar ([`/calendar`](file:///c:/Users/Akshya%20Anand/OneDrive/Desktop/carepath/frontend/src/app/calendar/page.tsx)) provides schedule tracking while preserving medical integrity:

1. **Zero Hallucinated Dates by AI:**
   - The LLM is **strictly forbidden** from doing date arithmetic or generating speculative future appointment dates during extraction.
   - When a physician documents a relative follow-up (e.g., *"Review in 3 months"*), the AI extracts `relative_time = '3 months'` and leaves `confirmed_date = null`.
2. **Deterministic Python Date Arithmetic:**
   - Future milestone projections are executed deterministically on the FastAPI backend:
     $$\text{Projected Date} = \text{Encounter Date} + \Delta_{\text{relative}}$$
   - Uses calendar month rollover logic, ensuring deterministic date derivation without external dependencies.
3. **Rigorous Visual & Semantic Distinction:**
   - **Confirmed Clinical Dates**: Solid emerald badge (`Confirmed Clinical Date`) signifying an explicit appointment documented on the medical record.
   - **AI-derived / Projected Dates**: Dashed amber border (`AI-derived / projected date`) accompanied by `Relative timeframe: X` and explanation of base date origin.

---

## 19. Bidirectional Source Linking & Page-Level PDF Inspection

Every timeline event and calendar milestone retains bidirectional provenance to its underlying vault document:

1. **Stored Provenance Fields:**
   - `document_id`: UUID foreign key linking directly to `public.documents`.
   - `source_page`: 1-indexed page integer if identifiable on multi-page PDFs. If unpaged or unavailable, clearly labeled as `Source page unavailable`—never invented.
   - `source_text`: Verbatim quotation captured during Structured Outputs extraction.
2. **Interactive Inspection Drawer ([`SourceLinkingModal`](file:///c:/Users/Akshya%20Anand/OneDrive/Desktop/carepath/frontend/src/components/timeline/source-linking-modal.tsx)):**
   - Clicking any event displays the exact source citation, document name, page badge, and quotation block.
3. **Direct Document Viewer Navigation:**
   - Clicking *"Open Original Document"* loads [`DocumentViewerModal`](file:///c:/Users/Akshya%20Anand/OneDrive/Desktop/carepath/frontend/src/components/documents/document-viewer-modal.tsx).
   - If the source is a PDF and a page number exists, passes `#page={source_page}` to the viewer iframe, scrolling the reader to the exact cited page.

---

## 20. Cross-Document Information Mismatch Detection Engine

The Information Mismatch Engine identifies potential discrepancies across records without making clinical judgments:

1. **Comparison Pipeline:**
   - **Medication Regimens**: Groups medications by normalized active ingredient. If the same drug appears in two documents with differing dosages (e.g., Amoxicillin 500 mg vs 250 mg), a discrepancy is flagged.
   - **Anatomical & Dental Identifiers**: Scans procedures and notes for anatomical references and tooth numbering (e.g., Treatment Plan referencing Tooth #36 vs Lab Prescription referencing Tooth #37).
2. **Medical Safety Guardrails & Non-Judgmental Wording:**
   - The system **never** states *"Doctor made an error"* or decides which record is correct.
   - All flags strictly display the standardized verification banner:
     > *"Potential Information Mismatch — Verify against original source."*
   - Explanations are purely objective: *"Different tooth numbers (Tooth #36 vs Tooth #37) were found in two source records. Verify against the original documents."*

---

## 21. Backend API Endpoints (Sprint 4)

All endpoints enforce Supabase JWT bearer token authentication, server-side patient derivation, and strict tenant isolation:

| Endpoint | Method | Role | Response Schema |
| :--- | :---: | :--- | :--- |
| `GET /api/timeline` | `GET` | Aggregates all clinical events for caller | `TimelineResponse` (`events`, `categories`) |
| `GET /api/calendar` | `GET` | Compiles confirmed and projected milestones | `CalendarResponse` (`confirmed_count`, `projected_count`) |
| `GET /api/mismatches` | `GET` | Executes cross-document discrepancy detection | `MismatchResponse` (`mismatches`, `total_count`) |

---

## 22. Implementation Summary

### Implemented in Sprint 1–3:
- Full authentication, patient onboarding, and Next.js 16 SSR cookie proxy.
- PostgreSQL vault (`public.documents`) with private storage RLS.
- FastAPI backend with OpenAI multimodal Structured Outputs (`pypdf` + vision).
- Normalized PostgreSQL tables (`diagnoses`, `medications`, `investigations`, `procedures`, `allergies`, `follow_ups`, `document_extractions`).

### Implemented in Sprint 4:
- **Unified Health Timeline (`/timeline`)**: Complete chronological health journey with multi-category filtering, date-range bounding, and search.
- **AI Health Calendar (`/calendar`)**: Schedule tracking with solid confirmed date badges vs dashed AI-derived / projected date badges.
- **Deterministic Date Calculations**: Backend relative duration arithmetic (`base_date + relative_time`).
- **Bidirectional Source Linking**: Modal inspection displaying source citations and direct page-level PDF viewer navigation (`#page=N`).
- **Cross-Document Mismatch Detector**: Discrepancy flagging across medications, tooth numbers, and anatomical sites with objective safety wording.
- **Live Dashboard Timeline Widget**: Replaced placeholder on `/dashboard` with live recent health events and mismatch alert card.
- **Automated Test Suite**: 5 unit & integration tests in [`backend/tests/test_sprint4_intelligence.py`](file:///c:/Users/Akshya%20Anand/OneDrive/Desktop/carepath/backend/tests/test_sprint4_intelligence.py) verifying sorting, missing dates, relative projections, and mismatch detection.

### Implemented in Sprint 5:
- **Family Health Circles (`/family`)**: Multi-member household management preserving independent medical record isolation for each family member or dependent. Explicit patient-controlled permissions (`can_view_records`).
- **Temporary QR Doctor Consent (`/consent`)**: Patient-generated cryptographic capability tokens granting least-privilege access during clinic encounters (15 min, 1 hr, 24 hr). Instant one-click server-side revocation.
- **Provider Access Portal (`/doctor/access`)**: Clinician read-only portal authenticated exclusively via temporary capability tokens without requiring patient login. Scoped display of timeline, diagnoses, medications, and labs.
- **Immutable Append-Only Audit Trail**: Every session creation, scan, records view, and revocation event is logged deterministically to `public.access_audit_logs`. Raw clinical records are never stored in audit logs.
- **Sanitized Synthetic Datasets (`demo-data/`)**: Realistic synthetic clinical encounters covering prescriptions, metabolic lab reports, dental chart discrepancy records, and surgical discharge summaries.
- **Automated Security & Consent Test Suite**: 7 automated security tests in [`backend/tests/test_sprint5_security_consent.py`](backend/tests/test_sprint5_security_consent.py) covering family permissions, token verification, expiration, revocation, and scope isolation.

---

## 23. Family Health Architecture & Record Isolation

CarePath implements a multi-tenant family model with uncompromising medical record isolation:
- **Independent Patient Entities**: Each family member or dependent is assigned a distinct `patient_id` in `public.patients`. Medical records (`diagnoses`, `medications`, `investigations`, `procedures`, `documents`) are partitioned by `patient_id`.
- **Relational Independence**: Family records are **never merged or co-mingled**. A parent managing a dependent's records interacts with that dependent's distinct timeline, calendar, and vault.
- **Discrete Granular Permissions**: Access is controlled via `public.family_memberships` using explicit boolean flags (`can_view_records = true`) and status controls (`access_status = 'active'`). Unauthorized access returns `403 Forbidden` both at the FastAPI routing layer and at the PostgreSQL RLS engine.

---

## 24. Cryptographic Capability Tokens & QR Doctor Sessions

In-clinic physician consultations require zero-friction yet mathematically secure temporary access:
- **Opaque Capability Tokens**: The platform generates 32-byte cryptographically secure random tokens (`secrets.token_urlsafe(32)`) upon patient request.
- **Time-Bound Ephemerality**: Sessions enforce explicit expiration timestamps (`expires_at`), supporting presets of 15 minutes (quick consult), 1 hour (standard visit), or 24 hours (day encounter).
- **Least-Privilege Scoping**: Patients select granular scopes (`timeline`, `medications`, `investigations`, `diagnoses`, `procedures`, `follow_ups`, `documents`, `profile`). The FastAPI backend strictly filters data returning only entities authorized in the session's `scope` JSONB array.
- **Instant Revocation**: Patients can terminate access instantly with a single click. The backend validates token status in real-time, blocking subsequent physician requests immediately.

---

## 25. Immutable Access Audit Logs & Compliance Design

To satisfy healthcare compliance and patient peace of mind:
- **Immutable Append-Only Architecture**: `public.access_audit_logs` has zero `UPDATE` or `DELETE` SQL permissions granted. Records can only be inserted.
- **Comprehensive Lifecycle Tracking**: Audit entries log `consent_created`, `qr_accessed`, `records_viewed`, `consent_revoked`, `access_denied`, and `session_expired` events with ISO-8601 timestamps and client IP addresses.
- **Zero Raw Clinical Data in Logs**: To prevent secondary exposure, audit log entries record only high-level factual narratives (e.g., *"Provider accessed records under scope: [timeline, medications]"*) and never serialize raw clinical notes, lab numbers, or diagnoses.

---

## 26. Sprint 6 Final Demo Readiness, Quality Gates & EHR Prototype Positioning

Sprint 6 completes the production validation, UI polish, and end-to-end integration of CarePath:
- **Coherent Synthetic Demonstration Dataset**: Centered around Eleanor Vance (42yo female, DOB: `1984-06-14`), featuring 5 distinct clinical documents spanning surgery (Laparoscopic Cholecystectomy), cardiology (Type 2 Diabetes & HTN regimen), metabolic lab panels (abnormal glucose and lipid biomarkers), and dentistry (mandibular molar extraction planning).
- **Cross-Document Discrepancy Integrity**: Preserves an intentional cross-document contradiction between Apex Dental (planned extraction of Tooth #36) and Metropolis Oral Surgery (referral slip citing Tooth #37). The mismatch engine flags this with responsible, non-accusatory language (*"Potential Information Mismatch — Verify against original source"*).
- **Six-Pillar Health Dashboard**: Implements the CarePath patient journey story across 6 core pillars: Past (Timeline), Present (Vault & Meds), Next (Predictive Calendar), Family (Health Circles), Share (Temporary Doctor QR), and Verify (Information Mismatches).
- **Zero-Warning Quality Gates**: Formally verified against `npx tsc --noEmit` (0 errors), `npm run lint` (0 errors, 0 warnings), Next.js 16 production build (`next build`, 14/14 static and dynamic routes compiled cleanly), and Python `unittest` suite (12/12 passing).
- **Transparent Healthcare Prototype Positioning**: CarePath is positioned as an intelligent patient-owned health journey and documentation coordination platform. It explicitly disclaims medical device certification (FDA/CE-mark), HIPAA/GDPR hospital business associate agreements, and speculative automated diagnostic claims. All extracted entities preserve verifiable source citations.



