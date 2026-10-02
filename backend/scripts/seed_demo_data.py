#!/usr/bin/env python3
"""
CarePath — Synthetic Demo Data Seed Script (Sprint 6)

Seeds the complete Eleanor Vance synthetic patient journey into the Supabase database:
- Patient Profile: Eleanor Vance (DOB: 1984-06-14)
- Family Health Circle: Vance Household (Lucas Vance [Child, records visible], Margaret Vance [Parent, private])
- 5 Clinical Documents:
    1. surgical_discharge_summary.txt (Laparoscopic Cholecystectomy, wound review in 2 weeks)
    2. cardiology_prescription.txt (Metformin 500mg, Lisinopril 10mg, Atorvastatin 20mg)
    3. metabolic_panel_report.txt (Fasting Glucose 146 mg/dL, HbA1c 7.2%, Total Cholesterol 218 mg/dL)
    4. dental_treatment_plan.txt (Pulpitis, planned extraction on Tooth #36)
    5. dental_referral_discrepancy.txt (Oral surgery referral referencing Tooth #37)
- Structured Clinical Entities: Diagnoses, Medications, Investigations, Procedures, Follow-ups
- Cross-Document Mismatch: Tooth #36 vs Tooth #37 with "Potential Information Mismatch" banner
- Temporary Doctor Consent Session: Dr. Sarah Jenkins (token: demo_dr_jenkins_capability_token)
- Immutable Access Audit Logs

Usage:
    cd backend
    .\\.venv\\Scripts\\python scripts\\seed_demo_data.py
"""

import os
import sys
import json
import logging
from datetime import datetime, timezone, timedelta

# Add backend directory to sys.path
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, BASE_DIR)

from app.core.config import settings
from app.core.security import get_supabase_admin

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("seed_demo_data")


def seed_synthetic_journey():
    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_ROLE_KEY:
        logger.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.")
        sys.exit(1)

    client = get_supabase_admin()
    now_utc = datetime.now(timezone.utc)
    now_iso = now_utc.isoformat()

    # Load synthetic_patient_journey.json if present
    journey_path = os.path.abspath(os.path.join(BASE_DIR, "..", "demo-data", "synthetic_patient_journey.json"))
    journey_data = {}
    if os.path.exists(journey_path):
        with open(journey_path, "r", encoding="utf-8") as f:
            journey_data = json.load(f)
        logger.info(f"Loaded synthetic scenario definition: {journey_data.get('scenario_name')}")

    # 1. UPSERT DEMO PATIENT PROFILE (Eleanor Vance)
    # NEVER overwrite an existing user's profile. Only match Eleanor Vance or insert a dedicated demo profile.
    p_check = client.from_("patients").select("id, user_id").ilike("full_name", "%Eleanor Vance%").execute()
    if p_check.data:
        patient_id = p_check.data[0]["id"]
        logger.info(f"Existing demo patient 'Eleanor Vance' found with ID: {patient_id}")
    else:
        p_res = client.from_("patients").insert({
            "full_name": "Eleanor Vance",
            "date_of_birth": "1984-06-14",
            "gender": "Female",
            "phone": "+1-555-019-2834",
        }).execute()
        patient_id = p_res.data[0]["id"]
        logger.info(f"Created primary dedicated demo patient 'Eleanor Vance' with ID: {patient_id}")
    # 2. FAMILY CIRCLE & MEMBERSHIPS (Vance Household)
    logger.info("Setting up Family Health Circle: 'Vance Household'...")
    try:
        fg_check = client.from_("family_groups").select("id").ilike("name", "%Vance Household%").execute()
        if fg_check.data:
            group_id = fg_check.data[0]["id"]
        else:
            p_owner = client.from_("patients").select("user_id").eq("id", patient_id).execute()
            owner_user_id = p_owner.data[0].get("user_id") if p_owner.data else None
            if not owner_user_id:
                owner_user_id = "00000000-0000-0000-0000-000000000001"

            fg_res = client.from_("family_groups").insert({
                "name": "Vance Household",
                "created_by": owner_user_id,
            }).execute()
            group_id = fg_res.data[0]["id"]
            logger.info(f"Created Family Group 'Vance Household' ID: {group_id}")

        # Owner membership
        client.from_("family_memberships").upsert({
            "family_group_id": group_id,
            "patient_id": patient_id,
            "relationship": "Primary Account Holder",
            "role": "owner",
            "can_view_records": True,
            "access_status": "active",
        }, on_conflict="family_group_id,patient_id").execute()

        # Dependent 1: Lucas Vance (Child, can_view_records=True)
        lucas_check = client.from_("patients").select("id").ilike("full_name", "%Lucas Vance%").execute()
        if lucas_check.data:
            lucas_id = lucas_check.data[0]["id"]
        else:
            lucas_res = client.from_("patients").insert({
                "full_name": "Lucas Vance",
                "date_of_birth": "2015-03-22",
                "gender": "Male",
                "phone": "+1-555-019-2835",
            }).execute()
            lucas_id = lucas_res.data[0]["id"]
        client.from_("family_memberships").upsert({
            "family_group_id": group_id,
            "patient_id": lucas_id,
            "relationship": "Child",
            "role": "member",
            "can_view_records": True,
            "access_status": "active",
        }, on_conflict="family_group_id,patient_id").execute()

        # Dependent 2: Margaret Vance (Parent, can_view_records=False)
        margaret_check = client.from_("patients").select("id").ilike("full_name", "%Margaret Vance%").execute()
        if margaret_check.data:
            margaret_id = margaret_check.data[0]["id"]
        else:
            margaret_res = client.from_("patients").insert({
                "full_name": "Margaret Vance",
                "date_of_birth": "1952-11-09",
                "gender": "Female",
                "phone": "+1-555-019-2836",
            }).execute()
            margaret_id = margaret_res.data[0]["id"]
        client.from_("family_memberships").upsert({
            "family_group_id": group_id,
            "patient_id": margaret_id,
            "relationship": "Parent",
            "role": "member",
            "can_view_records": False,
            "access_status": "active",
        }, on_conflict="family_group_id,patient_id").execute()
        logger.info("Family circle seeded with 3 distinct member records.")
    except Exception as e:
        logger.warning(f"Family tables not yet available or failed to seed: {e}. Note: migration database/migrations/05_family_consent.sql can be executed in Supabase SQL editor.")

    # 3. CLINICAL DOCUMENTS SEEDING
    logger.info("Registering synthetic clinical documents in Document Vault...")
    docs_to_seed = [
        {
            "file_name": "surgical_discharge_summary.txt",
            "storage_path": f"{patient_id}/doc-1-surgical_discharge_summary.txt",
            "file_type": "text/plain",
            "file_size": 2032,
            "document_type": "discharge_summary",
            "uploaded_at": "2026-07-12T14:30:00Z",
        },
        {
            "file_name": "cardiology_prescription.txt",
            "storage_path": f"{patient_id}/doc-2-cardiology_prescription.txt",
            "file_type": "text/plain",
            "file_size": 1993,
            "document_type": "prescription",
            "uploaded_at": "2026-08-15T10:15:00Z",
        },
        {
            "file_name": "metabolic_panel_report.txt",
            "storage_path": f"{patient_id}/doc-3-metabolic_panel_report.txt",
            "file_type": "text/plain",
            "file_size": 3387,
            "document_type": "lab_report",
            "uploaded_at": "2026-09-01T09:00:00Z",
        },
        {
            "file_name": "dental_treatment_plan.txt",
            "storage_path": f"{patient_id}/doc-4-dental_treatment_plan.txt",
            "file_type": "text/plain",
            "file_size": 1668,
            "document_type": "dental_record",
            "uploaded_at": "2026-09-10T11:45:00Z",
        },
        {
            "file_name": "dental_referral_discrepancy.txt",
            "storage_path": f"{patient_id}/doc-5-dental_referral_discrepancy.txt",
            "file_type": "text/plain",
            "file_size": 1449,
            "document_type": "referral_slip",
            "uploaded_at": "2026-09-18T16:20:00Z",
        },
    ]

    doc_ids = {}
    for d in docs_to_seed:
        existing = client.from_("documents").select("id").eq("patient_id", patient_id).eq("file_name", d["file_name"]).execute()
        if existing.data:
            doc_id = existing.data[0]["id"]
        else:
            ins = client.from_("documents").insert({
                "patient_id": patient_id,
                "file_name": d["file_name"],
                "storage_path": d["storage_path"],
                "file_type": d["file_type"],
                "file_size": d["file_size"],
                "document_type": d["document_type"],
                "processing_status": "completed",
                "uploaded_at": d["uploaded_at"],
            }).execute()
            doc_id = ins.data[0]["id"]
        doc_ids[d["file_name"]] = doc_id

        # Upload physical file to private Supabase Storage 'medical-documents'
        disk_path = os.path.abspath(os.path.join(BASE_DIR, "..", "demo-data", d["file_name"]))
        if os.path.exists(disk_path):
            try:
                with open(disk_path, "rb") as f:
                    content_bytes = f.read()
                client.storage.from_("medical-documents").upload(
                    path=d["storage_path"],
                    file=content_bytes,
                    file_options={"content-type": "text/plain", "upsert": "true"},
                )
                logger.info(f"Uploaded physical document to Supabase storage: {d['storage_path']}")
            except Exception as storage_err:
                logger.info(f"Storage upload note for {d['storage_path']}: {storage_err}")

    # 4. STRUCTURED CLINICAL DATA INGESTION
    logger.info("Persisting structured clinical entities (Diagnoses, Medications, Labs, Procedures, Follow-ups)...")

    # Diagnoses
    diagnoses_records = [
        {
            "patient_id": patient_id,
            "document_id": doc_ids["surgical_discharge_summary.txt"],
            "name": "Symptomatic Cholelithiasis with Chronic Cholecystitis",
            "status": "resolved",
            "date": "2026-07-11",
            "source_page": 1,
            "source_text": "Final Diagnosis: Acute on chronic cholelithiasis with recurrent biliary colic.",
            "confidence_note": "High confidence extraction from inpatient discharge record.",
        },
        {
            "patient_id": patient_id,
            "document_id": doc_ids["cardiology_prescription.txt"],
            "name": "Type 2 Diabetes Mellitus & Essential Hypertension",
            "status": "active",
            "date": "2026-08-15",
            "source_page": 1,
            "source_text": "Indication: Management of T2D with early microvascular surveillance and Stage 1 HTN.",
            "confidence_note": "Confirmed outpatient clinical regimen.",
        },
        {
            "patient_id": patient_id,
            "document_id": doc_ids["dental_treatment_plan.txt"],
            "name": "Irreversible Pulpitis — Tooth #36",
            "status": "active",
            "date": "2026-09-10",
            "source_page": 1,
            "source_text": "Primary Dental Finding: Irreversible pulpitis involving mandibular left first molar (#36).",
            "confidence_note": "Clinical pulp vitality testing and periapical radiograph confirmation.",
        },
    ]
    for diag in diagnoses_records:
        client.from_("diagnoses").upsert(diag, on_conflict="id").execute()

    # Medications
    medications_records = [
        {
            "patient_id": patient_id,
            "document_id": doc_ids["cardiology_prescription.txt"],
            "name": "Metformin Hydrochloride",
            "dose": "500 mg",
            "route": "Oral",
            "frequency": "Twice daily with meals (BID)",
            "duration": "90 days",
            "instructions": "Take with breakfast and dinner to minimize GI disturbance.",
            "start_date": "2026-08-15",
            "source_page": 1,
            "source_text": "Rx: Metformin 500mg PO BID with meals. Refills: 3.",
            "confidence_note": "Structured prescription dosage verified.",
        },
        {
            "patient_id": patient_id,
            "document_id": doc_ids["cardiology_prescription.txt"],
            "name": "Lisinopril",
            "dose": "10 mg",
            "route": "Oral",
            "frequency": "Once daily in morning (QD)",
            "duration": "90 days",
            "instructions": "Monitor seated blood pressure weekly.",
            "start_date": "2026-08-15",
            "source_page": 1,
            "source_text": "Rx: Lisinopril 10mg PO QD morning. Refills: 3.",
            "confidence_note": "Cardiovascular regimen verified.",
        },
        {
            "patient_id": patient_id,
            "document_id": doc_ids["cardiology_prescription.txt"],
            "name": "Atorvastatin Calcium",
            "dose": "20 mg",
            "route": "Oral",
            "frequency": "Once daily at bedtime (QHS)",
            "duration": "90 days",
            "instructions": "Evening administration recommended.",
            "start_date": "2026-08-15",
            "source_page": 1,
            "source_text": "Rx: Atorvastatin 20mg PO QHS. Refills: 3.",
            "confidence_note": "Lipid-lowering therapy confirmed.",
        },
    ]
    for med in medications_records:
        client.from_("medications").upsert(med, on_conflict="id").execute()

    # Investigations
    investigations_records = [
        {
            "patient_id": patient_id,
            "document_id": doc_ids["metabolic_panel_report.txt"],
            "name": "Fasting Plasma Glucose",
            "date": "2026-09-01",
            "result": "146",
            "unit": "mg/dL",
            "reference_range": "70 - 99 mg/dL",
            "abnormal_flag": True,
            "source_page": 1,
            "source_text": "GLUCOSE, FASTING: 146 mg/dL [Reference: 70 - 99 mg/dL] (HIGH)",
            "confidence_note": "Serum fluorinated specimen verified.",
        },
        {
            "patient_id": patient_id,
            "document_id": doc_ids["metabolic_panel_report.txt"],
            "name": "Hemoglobin A1c (HbA1c)",
            "date": "2026-09-01",
            "result": "7.2",
            "unit": "%",
            "reference_range": "< 5.7 %",
            "abnormal_flag": True,
            "source_page": 1,
            "source_text": "HEMOGLOBIN A1c: 7.2 % [Reference: < 5.7 %] (HIGH)",
            "confidence_note": "HPLC spectrophotometry method.",
        },
        {
            "patient_id": patient_id,
            "document_id": doc_ids["metabolic_panel_report.txt"],
            "name": "Total Serum Cholesterol",
            "date": "2026-09-01",
            "result": "218",
            "unit": "mg/dL",
            "reference_range": "< 200 mg/dL",
            "abnormal_flag": True,
            "source_page": 1,
            "source_text": "TOTAL CHOLESTEROL: 218 mg/dL [Reference: < 200 mg/dL] (BORDERLINE HIGH)",
            "confidence_note": "Enzymatic colorimetric assay.",
        },
    ]
    for inv in investigations_records:
        client.from_("investigations").upsert(inv, on_conflict="id").execute()

    # Procedures
    procedures_records = [
        {
            "patient_id": patient_id,
            "document_id": doc_ids["surgical_discharge_summary.txt"],
            "name": "Elective Laparoscopic Cholecystectomy",
            "date": "2026-07-11",
            "details": "Four-port laparoscopic extraction of gall bladder with intraoperative cholangiogram. No surgical complications.",
            "source_page": 1,
            "source_text": "Procedure Performed: Laparoscopic Cholecystectomy with critical view of safety established.",
            "confidence_note": "Operative surgical report.",
        },
        {
            "patient_id": patient_id,
            "document_id": doc_ids["dental_treatment_plan.txt"],
            "name": "Planned Endodontic Therapy / Extraction of Tooth #36",
            "date": "2026-09-10",
            "details": "Root canal therapy or simple surgical extraction of mandibular left first molar (Tooth #36).",
            "source_page": 1,
            "source_text": "Recommended Treatment: Endodontic Root Canal Therapy on Tooth #36 or surgical extraction of Tooth #36.",
            "confidence_note": "Apex Dental examination treatment plan.",
        },
        {
            "patient_id": patient_id,
            "document_id": doc_ids["dental_referral_discrepancy.txt"],
            "name": "Referral for Surgical Extraction of Tooth #37",
            "date": "2026-09-18",
            "details": "Surgical tooth extraction of Tooth #37 with site preservation bone graft.",
            "source_page": 1,
            "source_text": "Procedural Order: Please evaluate and perform surgical tooth extraction of Tooth #37 (Lower left second molar).",
            "confidence_note": "Metropolis Oral Surgery intake referral slip.",
        },
    ]
    for proc in procedures_records:
        client.from_("procedures").upsert(proc, on_conflict="id").execute()

    # Follow-ups (Confirmed vs Projected)
    follow_ups_records = [
        {
            "patient_id": patient_id,
            "document_id": doc_ids["surgical_discharge_summary.txt"],
            "description": "Post-Surgical Port Site & Wound Healing Evaluation",
            "confirmed_date": None,
            "relative_time": "2 weeks",
            "source_page": 1,
            "source_text": "Follow-Up Instructions: Return to surgical outpatient clinic in 2 weeks for port suture check.",
            "confidence_note": "Relative timeframe parsed deterministically into calendar projection.",
        },
        {
            "patient_id": patient_id,
            "document_id": doc_ids["cardiology_prescription.txt"],
            "description": "Comprehensive Metabolic & Cardiovascular Follow-Up",
            "confirmed_date": None,
            "relative_time": "3 months",
            "source_page": 1,
            "source_text": "Follow-up: Comprehensive cardiometabolic review and repeat lipid panel in 3 months.",
            "confidence_note": "Cardiovascular interval review milestone.",
        }
    ]
    for fu in follow_ups_records:
        client.from_("follow_ups").upsert(fu, on_conflict="id").execute()

    # 5. CROSS-DOCUMENT INFORMATION MISMATCH (Tooth #36 vs Tooth #37)
    logger.info("Configuring Cross-Document Information Mismatch between Dental Chart and Referral...")
    try:
        m_check = client.from_("cross_document_mismatches").select("id").eq("patient_id", patient_id).eq("field_name", "anatomical_tooth_number").execute()
        mismatch_payload = {
            "patient_id": patient_id,
            "category": "anatomical_site",
            "title": "Mandibular Molar Extraction Site Discrepancy",
            "field_name": "anatomical_tooth_number",
            "source_a_document_id": doc_ids["dental_treatment_plan.txt"],
            "source_a_page": 1,
            "source_a_text": "Primary Plan: Root canal treatment or simple extraction of tooth #36 (mandibular left first molar).",
            "source_a_value": "Tooth #36",
            "source_b_document_id": doc_ids["dental_referral_discrepancy.txt"],
            "source_b_page": 1,
            "source_b_text": "Reason for referral: Surgical extraction of tooth #37 due to extensive carious breakdown.",
            "source_b_value": "Tooth #37",
            "explanation": "Different anatomical tooth numbers (Tooth #36 vs Tooth #37) were cited between the Apex Dental treatment plan (2026-09-10) and the Metropolis Oral Surgery referral slip (2026-09-18).",
            "verification_message": "Potential Information Mismatch — Verify against original source.",
            "status": "flagged",
        }
        if m_check.data:
            client.from_("cross_document_mismatches").update(mismatch_payload).eq("id", m_check.data[0]["id"]).execute()
            logger.info("Updated existing cross-document mismatch record.")
        else:
            client.from_("cross_document_mismatches").insert(mismatch_payload).execute()
            logger.info("Inserted cross-document mismatch record.")
    except Exception as e:
        logger.warning(f"Cross-document mismatches table not available or failed: {e}. Note: migration database/migrations/04_mismatches.sql can be executed in Supabase SQL editor.")

    # 6. TEMPORARY DOCTOR CONSENT SESSION & AUDIT LOGS
    logger.info("Generating Active Doctor Consent Session (Recipient: Dr. Sarah Jenkins)...")
    demo_token = "demo_dr_jenkins_capability_token"
    expires_dt = now_utc + timedelta(hours=2)

    try:
        # Check or create consent session
        sess_res = client.from_("consent_sessions").select("id").eq("access_token", demo_token).execute()
        if sess_res.data:
            session_id = sess_res.data[0]["id"]
            client.from_("consent_sessions").update({
                "status": "active",
                "expires_at": expires_dt.isoformat(),
                "revoked_at": None,
            }).eq("id", session_id).execute()
            logger.info(f"Updated existing doctor consent session {session_id}")
        else:
            p_row = client.from_("patients").select("user_id").eq("id", patient_id).execute()
            creator_uid = p_row.data[0].get("user_id") if p_row.data else None or "00000000-0000-0000-0000-000000000001"

            new_sess = client.from_("consent_sessions").insert({
                "patient_id": patient_id,
                "recipient_name": "Dr. Sarah Jenkins - General Hospital Emergency Dept",
                "access_token": demo_token,
                "scope": ["timeline", "medications", "investigations", "diagnoses"],
                "duration_minutes": 120,
                "expires_at": expires_dt.isoformat(),
                "status": "active",
                "created_by": creator_uid,
            }).execute()
            session_id = new_sess.data[0]["id"]
            logger.info(f"Created new doctor consent session {session_id}")

        # Audit Logs
        logger.info("Recording verifiable audit trail in access_audit_logs...")
        audit_events = [
            {
                "session_id": session_id,
                "patient_id": patient_id,
                "actor": "patient",
                "action": "consent_created",
                "details": "Patient generated temporary access QR for 'Dr. Sarah Jenkins - General Hospital Emergency Dept' with 120m duration and scope [timeline, medications, investigations, diagnoses].",
                "ip_address": "127.0.0.1",
            },
            {
                "session_id": session_id,
                "patient_id": patient_id,
                "actor": "doctor",
                "action": "records_viewed",
                "details": "Doctor 'Dr. Sarah Jenkins - General Hospital Emergency Dept' accessed consented patient health records (scope: timeline, medications, investigations, diagnoses).",
                "ip_address": "192.168.1.45",
            }
        ]
        for ev in audit_events:
            client.from_("access_audit_logs").insert(ev).execute()
    except Exception as e:
        logger.warning(f"Consent sessions or audit logs table not available: {e}. Note: migration database/migrations/05_family_consent.sql can be executed in Supabase SQL editor.")

    logger.info("================================================================================")
    logger.info("DEMO SEED COMPLETE: Synthetic Patient Journey for 'Eleanor Vance' is Active!")
    logger.info(f"Patient ID: {patient_id}")
    logger.info(f"Doctor Access Capability Token: {demo_token}")
    logger.info(f"Doctor Access URL: http://localhost:3000/doctor/access?token={demo_token}")
    logger.info("================================================================================")


if __name__ == "__main__":
    seed_synthetic_journey()
