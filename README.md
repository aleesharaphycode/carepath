# 🏥 CarePath

## Intelligent Personal Healthcare Management Platform

CarePath is a secure, AI-powered healthcare management platform designed to help patients organize, understand, and manage their medical information in one place.

It brings together **medical document management, AI-powered document analysis, health records, family health management, secure doctor access, consent-based sharing, health intelligence, insurance claim assistance, and an AI healthcare assistant** into a single platform.

---

## 🚀 Overview

Managing healthcare information often involves scattered prescriptions, laboratory reports, diagnoses, medications, procedures, doctor consultations, and insurance documents.

CarePath provides a centralized platform where patients can:

- Create and manage their personal health profile
- Upload and organize medical documents
- Analyze medical documents using AI
- Extract useful medical information
- Maintain medications, diagnoses, investigations, and procedures
- View their healthcare journey through a timeline
- Manage family members securely
- Share medical information with doctors through consent-based access
- Generate secure QR-based doctor access
- Use AI-powered health intelligence
- Prepare insurance claims using medical documents
- Generate insurance document checklists
- Interact with an AI healthcare assistant

The goal of CarePath is to make healthcare information **organized, accessible, understandable, and privacy-aware**.

---

# ✨ Key Features

## 1. 🔐 Authentication & Patient Profile

CarePath uses secure authentication to create and manage patient accounts.

### Workflow

```text
User
 ↓
Registration / Login
 ↓
Supabase Authentication
 ↓
Authenticated User
 ↓
Patient Profile
```

Each authenticated user is linked to their patient profile.

The patient profile can contain:

- Name
- Date of birth
- Gender
- Contact information
- Medical documents
- Medications
- Diagnoses
- Investigations
- Procedures
- Health events

---

# 2. 📄 Medical Document Management

Patients can upload and organize their healthcare documents in their personal health record.

Supported document types can include:

- Prescriptions
- Laboratory reports
- Medical reports
- Discharge summaries
- Imaging reports
- Treatment documents
- Insurance-related documents
- Other healthcare documents

### Document Workflow

```text
Patient
 ↓
Upload Document
 ↓
Next.js Frontend
 ↓
Supabase Storage
 ↓
Document Record
 ↓
FastAPI Backend
 ↓
AI Processing
 ↓
Extracted Medical Information
```

Uploaded documents are associated with the patient's health record and can be used by other CarePath features.

---

# 3. 🤖 AI-Powered Medical Document Analysis

CarePath uses AI to analyze uploaded medical documents and extract useful information.

The system can identify information such as:

- Diagnoses
- Medications
- Investigations
- Procedures
- Medical dates
- Clinical information
- Relevant document details

### AI Processing Workflow

```text
Medical Document
       ↓
Document Processing
       ↓
Text / Content Extraction
       ↓
AI Model
       ↓
Structured Medical Information
       ↓
CarePath Health Record
```

The backend manages document processing and communication with the configured AI provider.

> AI-generated information is intended to assist with healthcare information organization and understanding. It should not replace professional medical advice.

---

# 4. 🧠 Health Intelligence

CarePath provides an intelligence layer that organizes information from different parts of the patient's health record.

It can work with information such as:

- Medical documents
- Diagnoses
- Medications
- Investigations
- Procedures
- Health events
- Medical timelines

### Health Intelligence Workflow

```text
Documents
   +
Medications
   +
Diagnoses
   +
Investigations
   +
Procedures
   +
Health Events
        ↓
Health Intelligence Engine
        ↓
Organized Patient Health Information
```

This helps patients understand their healthcare history in a more organized way.

---

# 5. 📅 Health Timeline & Events

CarePath organizes important medical events chronologically.

Example:

```text
2026-01-10
↓
Blood Test

2026-01-15
↓
Doctor Consultation

2026-01-20
↓
Prescription

2026-02-05
↓
Follow-up

2026-02-20
↓
Laboratory Investigation
```

The timeline provides a structured view of the patient's healthcare journey.

---

# 6. 👨‍👩‍👧 Family Health Management

CarePath provides family health management with separate authorization rules for dependent and independent family members.

## Under 16

For a family member below 16:

```text
Parent Account
      ↓
Family Member
      ↓
Age < 16
      ↓
Dependent
      ↓
Parent-managed Records
```

The dependent can be managed by the parent or primary account holder without requiring an independent CarePath account.

---

## 16 and Older

Family members aged 16 or older require their own CarePath account.

The parent sends an invitation using the person's CarePath email address.

```text
Parent
 ↓
Family Invitation
 ↓
16+ Member
 ↓
Own CarePath Account
 ↓
Accept Invitation
 ↓
Family Membership Active
 ↓
Explicitly Authorize Medical Access
```

Accepting the family invitation does **not automatically grant access to medical records**.

The 16+ member must explicitly authorize record sharing.

### Access Lifecycle

```text
Invitation
   ↓
Accept
   ↓
Family Membership Active
   ↓
Medical Record Access = OFF
   ↓
Member Explicitly Grants Access
   ↓
Medical Record Access = ON
```

The member can later revoke access.

This separates:

```text
Family Membership
        ≠
Medical Record Authorization
```

---

# 7. 🔒 Secure Doctor Access

CarePath provides a consent-based mechanism for patients to securely share medical information with doctors.

Doctors do not automatically receive access to a patient's medical records.

### Doctor Access Workflow

```text
Patient
 ↓
Generate Secure Access
 ↓
QR Code
 ↓
Doctor Scans QR
 ↓
Access Request
 ↓
Patient Approval
 ↓
PIN Verification
 ↓
Authorized Doctor Access
```

Security controls include:

- Temporary access sessions
- Expiration
- Patient approval
- PIN verification
- Attempt limits
- Revocation
- Single-use access controls
- Scoped access
- Audit logging

The doctor-facing access identifier is separate from permanent internal patient identifiers.

---

# 8. 🛡️ Consent & Privacy

CarePath follows a consent-based approach for sensitive healthcare information.

The overall access model is:

```text
Identity
   +
Authentication
   +
Authorization
   +
Consent
   +
Scoped Access
```

Important principles include:

- Access is checked server-side
- Users cannot access arbitrary patient records
- Medical access is separate from family membership
- Doctor access requires patient consent
- Access can expire
- Access can be revoked
- Sensitive operations can be audited
- Stable patient identifiers are not used as public sharing identifiers

---

# 9. 🏥 Insurance Claim Assistance

CarePath includes an insurance assistance workflow designed to help patients understand and organize the documents and steps that may be required for an insurance claim.

Instead of requiring the patient to manually enter all treatment details, CarePath can use uploaded medical documents such as:

- Doctor prescriptions
- Laboratory reports
- Medical reports
- Discharge documents
- Treatment-related documents

### Insurance Workflow

```text
Prescription
     +
Lab Reports
     +
Medical Documents
          ↓
      AI Analysis
          ↓
Identify Treatment / Medical Context
          ↓
Generate Insurance Checklist
          ↓
Required Documents
          ↓
Claim Readiness
```

Example:

```text
Insurance Document Checklist

✓ Doctor Prescription
✓ Laboratory Report
✓ Medical Report
□ Hospital Bill
□ Discharge Summary
□ Insurance Policy Document
□ ID Proof
□ Claim Form
```

The exact requirements can vary depending on the insurance policy, insurer, treatment, and claim type.

CarePath is designed to assist with claim preparation and does not replace the official requirements of an insurance provider.

---

# 10. 💬 AI Healthcare Assistant

CarePath includes an AI-powered conversational interface designed to help users understand information related to their healthcare records.

Possible uses include:

- Explaining medical terminology
- Asking questions about uploaded documents
- Finding information in health records
- Summarizing medical information
- Explaining reports in simpler language
- Helping users navigate their health information

The AI assistant is an information-support tool and is not a replacement for a qualified healthcare professional.

---

# 🏗️ System Architecture

CarePath follows a modern full-stack architecture.

```text
                         ┌───────────────────┐
                         │      Patient      │
                         └─────────┬─────────┘
                                   │
                                   ▼
                         ┌───────────────────┐
                         │   Next.js Web App │
                         │     Frontend      │
                         └─────────┬─────────┘
                                   │
                                   │ REST API
                                   ▼
                         ┌───────────────────┐
                         │   FastAPI Backend │
                         │      Python       │
                         └─────────┬─────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              │                    │                    │
              ▼                    ▼                    ▼
       ┌────────────┐      ┌──────────────┐      ┌─────────────┐
       │  Supabase  │      │  AI Services │      │  Application│
       │            │      │              │      │  Services   │
       │ Auth       │      │ Gemini/OpenAI│      │             │
       │ PostgreSQL │      │              │      │ Documents   │
       │ Storage    │      │              │      │ Consent     │
       └────────────┘      └──────────────┘      │ Family      │
                                                  │ Insurance   │
                                                  │ Intelligence│
                                                  └─────────────┘
```

---

# 🧰 Technology Stack

## Frontend

| Technology | Purpose |
|---|---|
| Next.js | Web application framework |
| React | User interface |
| TypeScript | Type-safe development |
| CSS / UI Components | Application interface |
| Supabase Client | Authentication and backend communication |

---

## Backend

| Technology | Purpose |
|---|---|
| Python | Backend programming language |
| FastAPI | REST API framework |
| Pydantic | Request and response validation |
| Uvicorn | ASGI server |
| PyPDF | PDF processing |
| Python Services | Application business logic |

---

## Database & Storage

| Technology | Purpose |
|---|---|
| Supabase | Backend platform |
| PostgreSQL | Relational database |
| Supabase Auth | Authentication |
| Supabase Storage | Document storage |
| Row Level Security | Database-level access control |

---

## Artificial Intelligence

CarePath supports AI-powered functionality for:

- Medical document analysis
- Information extraction
- Health information organization
- Insurance checklist generation
- Healthcare assistant functionality

The backend provides an AI service layer that can communicate with the configured AI provider.

---

# 📂 Project Structure

```text
carepath-main/
│
├── backend/
│   │
│   ├── app/
│   │   ├── api/
│   │   │   └── routes/
│   │   │       ├── ai_doctor.py
│   │   │       ├── consent.py
│   │   │       ├── doctor.py
│   │   │       ├── documents.py
│   │   │       ├── family.py
│   │   │       ├── health.py
│   │   │       ├── health_events.py
│   │   │       ├── insurance.py
│   │   │       ├── intelligence.py
│   │   │       └── subscription.py
│   │   │
│   │   ├── schemas/
│   │   ├── services/
│   │   └── main.py
│   │
│   ├── tests/
│   ├── requirements.txt
│   └── .env
│
├── frontend/
│   │
│   ├── app/
│   ├── components/
│   ├── lib/
│   ├── public/
│   ├── package.json
│   └── .env.local
│
├── database/
│   └── migrations/
│
├── docs/
│
└── README.md
```

---

# 🗄️ Database Architecture

The healthcare data model is organized around authenticated patients.

```text
Users
  │
  ▼
Patients
  │
  ├── Documents
  ├── Medications
  ├── Diagnoses
  ├── Investigations
  ├── Procedures
  ├── Health Events
  ├── Family Memberships
  ├── Consent Sessions
  └── Insurance Claims
```

Database migrations include areas such as:

```text
01_patients.sql
02_documents.sql
03_clinical_records.sql
04_mismatches.sql
05_family_consent.sql
06_subscriptions_and_usage.sql
07_health_events.sql
08_insurance_claims.sql
```

---

# 🔐 Security Architecture

Healthcare data requires strong access control.

CarePath uses multiple security layers.

## Authentication

```text
User
 ↓
Supabase Auth
 ↓
Authenticated Identity
```

## Authorization

```text
Authenticated User
 ↓
Patient Identity
 ↓
Permission Check
 ↓
Requested Resource
```

## Consent

For sensitive sharing:

```text
Patient
 ↓
Consent
 ↓
Scoped Access
 ↓
Doctor / Family Member
```

## Security Controls

CarePath incorporates mechanisms such as:

- Authentication
- Server-side authorization
- Row Level Security
- Consent-based access
- Expiring access
- PIN verification
- Attempt limits
- Access revocation
- Audit logging
- Scoped sharing
- Separation of authentication and authorization
- Family membership authorization
- Medical record access authorization

---

# 🧪 Running the Project Locally

## Prerequisites

Install:

- Node.js
- npm
- Python 3
- Git

You also need the required Supabase and AI provider configuration.

---

## 1. Clone the Repository

```bash
git clone YOUR_REPOSITORY_URL
cd carepath-main
```

---

# 2. Backend Setup

Navigate to the backend:

```bash
cd backend
```

Create a Python virtual environment:

### Windows

```powershell
python -m venv .venv
```

Activate it:

```powershell
.venv\Scripts\Activate.ps1
```

Install dependencies:

```powershell
pip install -r requirements.txt
```

---

# 3. Backend Environment Variables

Create:

```text
backend/.env
```

Add the required environment variables for your project.

Example:

```env
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

AI_PROVIDER=gemini
GEMINI_API_KEY=your_gemini_api_key

OPENAI_MODEL=gpt-4o-mini
OPENAI_API_KEY=your_openai_api_key
```

Only configure variables that are required by the current application.

### ⚠️ Never commit secrets

Do not commit:

```text
backend/.env
frontend/.env.local
API keys
Supabase service-role keys
Gemini API keys
OpenAI API keys
Private credentials
```

Make sure sensitive files are included in `.gitignore`.

---

# 4. Start the Backend

From the `backend` directory:

```powershell
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

The API will be available at:

```text
http://127.0.0.1:8000
```

FastAPI documentation:

```text
http://127.0.0.1:8000/docs
```

Health endpoint:

```text
http://127.0.0.1:8000/health
```

---

# 5. Frontend Setup

Open another terminal.

Navigate to the frontend:

```powershell
cd frontend
```

Install dependencies:

```powershell
npm install
```

Start the development server:

```powershell
npm run dev
```

The frontend will normally be available at:

```text
http://localhost:3000
```

---

# 🔄 Complete Application Workflow

The overall CarePath workflow can be represented as:

```text
                         CAREPATH
                            │
                            ▼
                    Registration / Login
                            │
                            ▼
                     Patient Profile
                            │
          ┌─────────────────┼─────────────────┐
          │                 │                 │
          ▼                 ▼                 ▼
      Documents          Health            Family
          │              Records           Management
          │                 │                 │
          ▼                 ▼                 ▼
      AI Analysis        Timeline       Authorization
          │                 │                 │
          └─────────────────┼─────────────────┘
                            │
                            ▼
                   Health Intelligence
                            │
             ┌──────────────┼──────────────┐
             │              │              │
             ▼              ▼              ▼
          Doctor        Insurance          AI
          Consent         Claims        Assistant
             │              │              │
             └──────────────┼──────────────┘
                            ▼
                  Patient-Centered
                   Health Platform
```

---

# 👨‍⚕️ Doctor Consent Workflow

```text
Patient generates access
          ↓
Secure QR created
          ↓
Doctor scans QR
          ↓
Doctor requests access
          ↓
Patient receives approval request
          ↓
Patient approves
          ↓
PIN becomes available
          ↓
Doctor enters PIN
          ↓
PIN verified
          ↓
Scoped medical information displayed
```

---

# 👨‍👩‍👧 Family Authorization Workflow

## Dependent

```text
Parent
 ↓
Add family member
 ↓
Age < 16
 ↓
Dependent membership
 ↓
Parent-managed records
```

## Independent Member

```text
Parent
 ↓
Enter CarePath email
 ↓
Invitation created
 ↓
16+ user logs in
 ↓
Accept invitation
 ↓
Family membership becomes active
 ↓
Medical access remains OFF
 ↓
16+ user explicitly grants access
 ↓
Parent can access permitted records
```

---

# 🏥 Insurance Workflow

```text
Doctor Prescription
        +
Laboratory Reports
        +
Medical Documents
        ↓
     AI Analysis
        ↓
Treatment / Medical Context
        ↓
Insurance Document Checklist
        ↓
Required Documents
        ↓
Claim Readiness
        ↓
Claim Preparation
```

---

# 🌐 Deployment

CarePath can be deployed using:

```text
Frontend → Vercel
Backend  → Render
Database → Supabase
Storage  → Supabase Storage
AI       → Configured AI Provider
```

### Production Architecture

```text
                         USER
                           │
                           ▼
                  ┌─────────────────┐
                  │     Vercel      │
                  │ Next.js Frontend│
                  └────────┬────────┘
                           │
                           │ HTTPS
                           ▼
                  ┌─────────────────┐
                  │     Render      │
                  │ FastAPI Backend │
                  └────────┬────────┘
                           │
             ┌─────────────┼─────────────┐
             │             │             │
             ▼             ▼             ▼
        ┌─────────┐   ┌──────────┐  ┌──────────┐
        │Supabase │   │ AI       │  │ Backend  │
        │         │   │ Provider │  │ Services │
        │Auth     │   │          │  │          │
        │Database │   │Gemini /  │  │Documents │
        │Storage  │   │OpenAI    │  │Consent   │
        └─────────┘   └──────────┘  │Family    │
                                     │Insurance │
                                     └──────────┘
```

---

# 🚀 Backend Deployment with Render

Create a new Web Service in Render and connect the CarePath GitHub repository.

## Root Directory

```text
backend
```

## Build Command

```bash
pip install -r requirements.txt
```

## Start Command

```bash
uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

Configure all required backend environment variables in the Render dashboard.

After deployment, test:

```text
https://YOUR-RENDER-URL.onrender.com
```

FastAPI documentation:

```text
https://YOUR-RENDER-URL.onrender.com/docs
```

Health endpoint:

```text
https://YOUR-RENDER-URL.onrender.com/health
```

---

# 🚀 Frontend Deployment with Vercel

Connect the CarePath GitHub repository to Vercel.

## Root Directory

```text
frontend
```

Vercel will detect the Next.js application.

Configure the required production environment variables in the Vercel dashboard.

The frontend must use the deployed FastAPI backend URL instead of the local backend URL.

For example:

```text
Local:
http://localhost:8000

Production:
https://YOUR-RENDER-URL.onrender.com
```

---

# 🔗 Production Authentication Configuration

After deployment, configure the production frontend URL in the authentication provider.

The production configuration should include the deployed CarePath frontend URL.

Example:

```text
https://YOUR-VERCEL-URL.vercel.app
```

Authentication redirect URLs must match the production application URL.

---

# 🧪 Testing

The backend includes automated tests covering important application functionality.

Run:

```powershell
cd backend
pytest
```

Test areas include:

- AI doctor functionality
- Date normalization
- Insurance functionality
- Health intelligence
- Security and consent
- AI and subscription functionality
- Family functionality
- Access control

---

# 🔍 API Documentation

When the backend is running locally:

```text
http://127.0.0.1:8000/docs
```

The FastAPI Swagger interface provides interactive documentation for available backend endpoints.

Example API areas include:

```text
/api/timeline
/api/calendar
/api/health
/api/documents
/api/family
/api/consent
/api/insurance
/api/intelligence
```

The exact available endpoints depend on the current backend configuration.

---

# 📌 Important Development Principles

## 1. Privacy First

Healthcare information should only be accessible to authorized users.

## 2. Consent-Based Sharing

Sensitive information should only be shared through appropriate authorization mechanisms.

## 3. Authentication ≠ Authorization

Being logged in does not automatically give a user access to another patient's healthcare records.

## 4. Family Membership ≠ Medical Access

Joining a family does not automatically grant access to medical records.

## 5. Server-Side Authorization

Access decisions must be validated on the backend rather than relying only on frontend controls.

## 6. AI as an Assistant

AI is used to help organize, extract, and explain healthcare information.

## 7. Patient-Centered Design

The platform is designed around giving patients a centralized and understandable view of their healthcare information.

---

# 🎯 Project Objectives

CarePath aims to:

- Centralize healthcare information
- Reduce fragmentation of medical records
- Make medical documents easier to understand
- Provide secure healthcare information sharing
- Simplify family health management
- Assist with insurance claim preparation
- Reduce manual healthcare information processing
- Use AI to organize healthcare information
- Give patients greater control over their health information

---

# 🔮 Future Improvements

Potential future improvements include:

- Direct hospital integrations
- Insurance-provider integrations
- Automated claim submission
- Healthcare interoperability
- Advanced OCR
- Multilingual healthcare explanations
- Improved AI retrieval over patient records
- Hospital dashboards
- Doctor dashboards
- More granular consent scopes
- Healthcare notifications
- Medication reminders
- Advanced health analytics
- Mobile application
- Wearable health-data integration

---

# ⚠️ Medical Disclaimer

CarePath is a healthcare information management and assistance platform.

AI-generated information may contain errors and should not be considered a medical diagnosis or a substitute for professional medical advice.

Users should consult qualified healthcare professionals for diagnosis, treatment decisions, emergencies, and other medical concerns.

Insurance information provided by CarePath is intended to assist with claim preparation. Users should verify requirements with their insurance provider before submitting a claim.

---

# 👥 Team

## Aleesha K R, Anagha K B, Ainjana Jomon, Akshya Anand

Built using:

- Next.js
- React
- TypeScript
- FastAPI
- Python
- PostgreSQL
- Supabase
- AI-powered document processing

---

# ❤️ CarePath

### One place for your healthcare journey.
