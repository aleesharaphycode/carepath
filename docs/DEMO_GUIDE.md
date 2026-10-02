# CarePath — Live Demonstration & Judge Presentation Guide

> **Project:** CarePath — Unified Intelligent Healthcare Journey  
> **Status:** Final Demo Ready (v1.0 — Architecture Frozen)  
> **Synthetic Patient Scenario:** Eleanor Vance (42yo female, DOB: 1984-06-14)  
> **Preset Doctor Credential:** Dr. Sarah Jenkins (Metropolis General Emergency Dept)

---

## 🎯 Executive Summary for Presenters

CarePath is an intelligent, patient-owned health journey platform that transforms fragmented clinical documents (prescriptions, lab panels, operative summaries, dental referrals) into a structured, chronological medical record with bidirectional provenance, cross-document discrepancy detection, family circles, and zero-knowledge QR provider sharing.

This guide provides an exact, step-by-step click script designed for a 3-to-5 minute live hackathon judging demonstration.

---

## 🚀 12-Step Live Demonstration Sequence

```
1. LOGIN ➔ 2. DASHBOARD ➔ 3. DOCUMENTS ➔ 4. AI EXTRACTION ➔ 5. TIMELINE ➔ 6. CALENDAR
      ➔ 7. MISMATCH ➔ 8. FAMILY ➔ 9. CONSENT ➔ 10. QR CODE ➔ 11. DOCTOR PORTAL ➔ 12. REVOCATION
```

---

### Step 1: Authentication & Patient Identity
* **What to Click:** Navigate to `http://localhost:3000/login` and log in with the demo patient credentials (or register a fresh account and select Eleanor Vance onboarding).
* **What the Judge Should Notice:**
  * Clean, accessible healthcare authentication with email/password protection.
  * Instant session hydration via Supabase Auth and deterministic patient profile linkage.
* **Why It Matters:** Demonstrates security from first touch. CarePath enforces strict user-to-patient ownership at the PostgreSQL Row Level Security (RLS) layer.

---

### Step 2: The Unified Dashboard (The CarePath Story)
* **What to Click:** Arrive at `/dashboard`.
* **What the Judge Should Notice:**
  * **6 CarePath Journey Pillars:**
    1. **PAST (Timeline):** Chronological summary of clinical history.
    2. **PRESENT (Vault & Meds):** Active medication regimens (Metformin, Lisinopril, Atorvastatin) and document vault status.
    3. **NEXT (Calendar):** Upcoming healthcare milestones with visual badges distinguishing Confirmed vs Projected dates.
    4. **FAMILY (Circles):** Household circles with independent dependents.
    5. **SHARE (Doctor QR):** Time-bound capability tokens for clinical encounters.
    6. **VERIFY (Mismatches):** Discrepancy detection engine status.
  * Real-time metrics aggregated without fabricated statistics.
* **Why It Matters:** Solves healthcare fragmentation immediately. Rather than sorting through disparate patient portals, the patient has an intuitive 360-degree overview of their care.

---

### Step 3: Medical Document Vault
* **What to Click:** Click **"Documents"** in the top navigation or the "Explore Vault" card on the dashboard (`/documents`).
* **What the Judge Should Notice:**
  * 5 registered clinical documents spanning surgery, cardiology, metabolic labs, and dental care:
    * `surgical_discharge_summary.txt` (Laparoscopic Cholecystectomy)
    * `cardiology_prescription.txt` (Hypertension & T2D Regimen)
    * `metabolic_panel_report.txt` (Comprehensive Metabolic Labs)
    * `dental_treatment_plan.txt` (Apex Dental Chart — Tooth #36)
    * `dental_referral_discrepancy.txt` (Metropolis Oral Surgery Slip — Tooth #37)
  * File metadata: file size, uploaded date, processing status badge (`completed`), and private storage path.
* **Why It Matters:** Raw medical files are safely preserved in isolated storage buckets while their extracted structured clinical data is queryable.

---

### Step 4: AI Extraction with Verifiable Provenance
* **What to Click:** On any document card (e.g. `metabolic_panel_report.txt` or `cardiology_prescription.txt`), click **"AI Insights"**.
* **What the Judge Should Notice:**
  * Clean modal organized into structured clinical tabs: **Diagnoses**, **Medications**, **Lab Tests**, **Procedures & Allergies**, **Care Plan**.
  * Specific lab values highlighted with normal vs abnormal reference ranges (e.g. Fasting Glucose `146 mg/dL [High]`, HbA1c `7.2% [High]`).
  * Verifiable source citations displaying verbatim document excerpts and page numbers.
  * **Prominent Medical Disclaimer:** *"CarePath extracts and organizes clinical records. It does not provide medical diagnosis. Always verify against original documents."*
* **Why It Matters:** Transparent AI that assists patients and clinicians without overstepping into unverified automated diagnostic claims. Provenance builds trust.

---

### Step 5: Chronological Health Timeline & Source Linking
* **What to Click:** Click **"Timeline"** in the top navigation (`/timeline`).
* **What the Judge Should Notice:**
  * 26 chronological events combining consultations, surgeries, medications, and lab tests into a single historical feed.
  * Filtering tabs for event types (All, Diagnoses, Medications, Lab Tests, Procedures, Follow-ups).
  * Clicking **"Inspect Source"** on any event opens the bidirectional **Source Linking Modal**, citing the exact file, page number, and original quote.
* **Why It Matters:** Solves the "Where did this diagnosis come from?" problem. Eliminates clinical telephone game during patient handoffs.

---

### Step 6: Predictive Care Calendar (Confirmed vs Projected Dates)
* **What to Click:** Click **"Calendar"** in the top navigation (`/calendar`).
* **What the Judge Should Notice:**
  * Two clearly distinct types of events:
    1. **Confirmed Dates (Emerald Badge):** Explicit appointment dates (e.g. Surgical encounter on `2026-07-11`).
    2. **Projected / Derived Dates (Amber Badge):** Follow-ups calculated deterministically from relative narrative intervals:
       * *"Wound evaluation in 2 weeks"* ➔ Deterministically projected to `2026-07-26`.
       * *"Comprehensive cardiometabolic review in 3 months"* ➔ Deterministically projected to `2026-11-15`.
  * Tooltips and badges explicitly state the deterministic calculation basis.
* **Why It Matters:** Patients frequently miss critical post-operative or chronic care follow-ups because discharge instructions state "follow up in 3 months" without booking an explicit date. CarePath surfaces these projected milestones without fabricating false confirmed bookings.

---

### Step 7: Cross-Document Information Mismatch Engine
* **What to Click:** On the Timeline page, notice the amber warning banner at the top: *"1 Potential Information Mismatch Detected"*, and click **"Review Mismatches"**.
* **What the Judge Should Notice:**
  * **Side-by-side discrepancy card:**
    * **Source Record A (`dental_treatment_plan.txt`):** Value = `Tooth #36` (Mandibular left first molar).
    * **Source Record B (`dental_referral_discrepancy.txt`):** Value = `Tooth #37` (Mandibular left second molar).
  * Clear, objective wording: *"Potential Information Mismatch — Verify against original source documents."*
  * Zero accusatory language (no *"Doctor Error"* or AI claim of which tooth is right).
  * Direct "Inspect Source A" and "Inspect Source B" buttons linking back to the respective clinical records.
* **Why It Matters:** Medical errors and surgical site discrepancies often occur during specialty referrals. CarePath catches contradictions across multiple encounters before invasive procedures take place.

---

### Step 8: Family Health Circles (Independent Records Isolation)
* **What to Click:** Click **"Family"** in the top navigation (`/family`).
* **What the Judge Should Notice:**
  * The **Vance Household** circle displays 3 family members:
    1. **Eleanor Vance:** Badge = `Primary Account`, Role = `Circle Owner`.
    2. **Lucas Vance (Child):** Badge = `Managed Dependent (No Direct Login)`, Access = `Authorized to view medical records`. Clicking "View Records" displays Lucas's isolated medical records.
    3. **Margaret Vance (Parent):** Badge = `Managed Dependent (No Direct Login)`, Access = `Access Restricted`.
  * **Interactive Permission Toggle:** Toggling Margaret's access checkbox immediately updates her permission status.
* **Why It Matters:** Real families care for elderly parents and minor children. CarePath maintains strict relational record isolation—family members can manage access without merging health histories.

---

### Step 9: Time-Bound Consent Session Creation
* **What to Click:** Click **"Consent & QR"** in the top navigation (`/consent`).
* **What the Judge Should Notice:**
  * The Consent Manager interface displaying active access sessions and history.
  * Click **"Create Temporary Access"** to show the 4-step wizard:
    1. **Who:** Select patient (Self or authorized family dependent).
    2. **Recipient:** Enter clinician name (e.g. `Dr. Sarah Jenkins - Emergency Dept`).
    3. **What (Scope):** Checkboxes for Timeline, Medications, Lab Tests, Diagnoses, Procedures (Documents vault is left unselected to demonstrate least privilege).
    4. **Duration:** 15 min, 1 hour, or 24 hours.
* **Why It Matters:** Patients control exactly who sees what, and for how long. Replaces handing over an entire chart for a focused consultation.

---

### Step 10: Cryptographic QR Capability Token
* **What to Click:** On the active Dr. Sarah Jenkins session card, click **"Show QR Code"**.
* **What the Judge Should Notice:**
  * Scannable QR code generated client-side using `qrcode`.
  * **Security Watermark:** *"Zero Data in QR: This QR contains only a cryptographically opaque access token. No medical facts, diagnoses, or credentials are encoded."*
  * Real-time countdown timer displaying session expiration.
  * Direct action links: "Copy Link", "Open Doctor Portal Preview", and "Revoke Access Immediately".
* **Why It Matters:** If someone photographs or intercepts the QR code in a waiting room, no patient health data or credentials can be extracted from the image.

---

### Step 11: The Doctor Portal Experience (Enforced Least Privilege)
* **What to Click:** Click **"Open Doctor Portal Preview"** or navigate directly in a new private window to:
  `http://localhost:3000/doctor/access?token=demo_dr_jenkins_capability_token`
* **What the Judge Should Notice:**
  * Dedicated dark clinical theme (`CarePath Provider Portal`) authenticated via the temporary capability token. No login prompt.
  * Shows **Verified Patient: Eleanor Vance**, recipient name, and active countdown timer.
  * **Enforced Least-Privilege Scoping:**
    * Consented categories (Timeline, Medications, Investigations, Diagnoses) are accessible and fully populated.
    * Unconsented categories (Document Vault files, Family Circles, raw credentials) are **completely hidden and omitted from backend payloads**.
* **Why It Matters:** Attending doctors get instantaneous, zero-friction access to the patient's critical medical history at point of care, while respecting strict scope boundaries.

---

### Step 12: Instant Server-Side Revocation & Audit Verification
* **What to Click:**
  1. Return to the patient's Consent tab (`/consent`).
  2. Click **"Revoke Access Immediately"** on the Dr. Sarah Jenkins session.
  3. Return to the Doctor Portal tab and refresh the page.
* **What the Judge Should Notice:**
  * The Doctor Portal immediately switches to **"Access Denied: This healthcare access session has been revoked by the patient."** (HTTP 403 Forbidden).
  * Subsequent access attempts with the token are rejected.
  * The audit trail records the revocation event with timestamp, actor (`patient`), and session identifier.
* **Why It Matters:** Complete sovereignty. Once a clinical visit concludes, the patient can terminate access in one click, preventing persistent backdoor exposure.

---

## 💡 Quick Answers to Tough Judge Questions

| Question | CarePath Answer |
|---|---|
| **"Where is the patient data stored?"** | Normalized PostgreSQL tables with Row Level Security (RLS) in Supabase. Documents are in private S3-compatible storage buckets. |
| **"What if the AI hallucinates a diagnosis?"** | CarePath AI only extracts structured entities from uploaded clinical source documents; it never generates speculative diagnoses. Every extracted fact has a verifiable source page and verbatim quote. |
| **"What data is inside the QR code?"** | Only a random, cryptographically opaque capability token (e.g. `https://carepath.app/doctor/access?token=xyz...`). Zero medical data or keys exist in the QR. |
| **"Can family members see each other's private records?"** | No. Each family member has an isolated patient identity. Cross-member record viewing is blocked at both the database RLS layer and API service layer unless explicit `can_view_records` permission is granted. |
| **"Is CarePath claiming clinical certification?"** | No. CarePath is positioned as a patient-owned healthcare information management and journey coordination prototype, strictly disclaiming diagnostic or device approval. |

---

*CarePath — Transforming fragmented medical records into unified, verified healthcare journeys.*
