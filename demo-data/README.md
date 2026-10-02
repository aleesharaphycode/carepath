# CarePath Synthetic Demonstration Datasets

**Status**: Verified & Populated for Demonstration Workflows

This directory contains sanitized, realistic, and clinically grounded synthetic healthcare documents for platform demonstration, end-to-end integration testing, and hackathon presentation.

> **Privacy & Compliance Assurance**: 
> Zero Protected Health Information (PHI) or personally identifiable clinical records are included. All patient names, provider identities, dates, and medical encounters are completely synthetic and generated for demonstration purposes only.

---

## 📁 Included Datasets & Test Scenarios

| File | Document Type | Key Clinical Entities | Platform Showcase Feature |
| :--- | :--- | :--- | :--- |
| [`cardiology_prescription.txt`](cardiology_prescription.txt) | Outpatient Prescription | Metformin 500mg BID, Lisinopril 10mg QD, Atorvastatin 20mg QHS | Multimodal AI entity extraction & normalized medication persistence |
| [`metabolic_panel_report.txt`](metabolic_panel_report.txt) | Clinical Laboratory Report | Fasting Glucose 146 mg/dL, HbA1c 7.2%, Total Cholesterol 218 mg/dL | Biomarker parsing with reference ranges and abnormal flags |
| [`dental_treatment_plan.txt`](dental_treatment_plan.txt) | Dental Clinical Chart Note | Pulpitis, planned extraction/RCT on **Tooth #36** | Anatomical site extraction and baseline dental chronology |
| [`dental_referral_discrepancy.txt`](dental_referral_discrepancy.txt) | Surgical Referral Slip | Discrepant procedural citation for **Tooth #37** | **Cross-Document Information Mismatch Engine** (*"Tooth #36 vs Tooth #37"*) |
| [`surgical_discharge_summary.txt`](surgical_discharge_summary.txt) | Hospital Inpatient Summary | Laparoscopic Cholecystectomy, wound review in 2 weeks | **AI Healthcare Calendar** with deterministic relative date projection |
| [`synthetic_patient_journey.json`](synthetic_patient_journey.json) | Complete End-to-End Journey | Eleanor Vance profile, Vance Household family circle, doctor QR session | Comprehensive scenario for automated demos & judging walk-throughs |

---

## 🧪 How to Use in Demonstrations

1. **Vault Upload & AI Extraction**:
   - Navigate to `/documents` in the CarePath portal.
   - Upload any of the above synthetic files to trigger the FastAPI OpenAI multimodal ingestion pipeline.
2. **Unified Health Timeline**:
   - Open `/timeline` to inspect chronological aggregation across diagnoses, procedures, medications, and labs with direct page-level source citations.
3. **AI Care Calendar**:
   - Open `/calendar` to view confirmed discharge dates (emerald solid badge) alongside deterministic projected review milestones (amber dashed badge).
4. **Cross-Document Mismatch Flagging**:
   - Inspect the mismatch warning triggered by the discrepancy between `dental_treatment_plan.txt` (Tooth #36) and `dental_referral_discrepancy.txt` (Tooth #37).
5. **Family Dashboard & QR Sharing**:
   - Open `/family` to observe separate dependent records under the Vance Household.
   - Open `/consent` to generate a time-bound QR code and simulate a doctor viewing the records at `/doctor/access`.
