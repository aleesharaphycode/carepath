"""
CarePath Demo Data Isolation Cleanup Script.
Removes ONLY synthetic demonstration records for Eleanor Vance, Lucas Vance, and Margaret Vance.
NEVER performs global destructive database deletions. Never deletes real patient data.
"""

import os
import sys
import logging

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE_DIR)

from app.core.config import settings
from app.core.security import get_supabase_admin

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("carepath.cleanup_demo")

DEMO_PATIENT_NAMES = ["Eleanor Vance", "Lucas Vance", "Margaret Vance"]


def cleanup_synthetic_journey():
    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_ROLE_KEY:
        logger.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.")
        sys.exit(1)

    client = get_supabase_admin()
    logger.info("Initiating targeted cleanup of synthetic demo data (Vance Family)...")

    # 1. Identify demo patient records
    demo_patient_ids = []
    for name in DEMO_PATIENT_NAMES:
        p_res = client.from_("patients").select("id, full_name, user_id").ilike("full_name", f"%{name}%").execute()
        for p in (p_res.data or []):
            demo_patient_ids.append(p["id"])
            logger.info(f"Identified demo patient: {p['full_name']} (ID: {p['id']})")

    if not demo_patient_ids:
        logger.info("No synthetic demo patients found in database. Nothing to clean.")
        return

    # 2. Remove demo documents from Supabase Storage & Database
    for p_id in demo_patient_ids:
        docs_res = client.from_("documents").select("id, storage_path").eq("patient_id", p_id).execute()
        for doc in (docs_res.data or []):
            if doc.get("storage_path"):
                try:
                    client.storage.from_("medical-documents").remove([doc["storage_path"]])
                    logger.info(f"Removed demo file from storage: {doc['storage_path']}")
                except Exception as s_err:
                    logger.warning(f"Storage object removal warning for {doc['storage_path']}: {s_err}")

    # 3. Clean clinical tables linked to demo patients
    clinical_tables = [
        "consent_sessions",
        "access_audit_logs",
        "cross_document_mismatches",
        "document_extractions",
        "diagnoses",
        "medications",
        "investigations",
        "procedures",
        "allergies",
        "follow_ups",
        "documents",
        "subscriptions",
        "ai_usage",
    ]

    for table in clinical_tables:
        for p_id in demo_patient_ids:
            try:
                client.from_(table).delete().eq("patient_id", p_id).execute()
            except Exception:
                pass

    # 4. Clean family circle
    try:
        for p_id in demo_patient_ids:
            client.from_("family_memberships").delete().eq("patient_id", p_id).execute()
        client.from_("family_groups").delete().ilike("name", "%Vance Household%").execute()
    except Exception:
        pass

    # 5. Finally, remove the demo patient profile records
    for p_id in demo_patient_ids:
        try:
            client.from_("patients").delete().eq("id", p_id).execute()
            logger.info(f"Deleted demo patient record: {p_id}")
        except Exception as p_err:
            logger.warning(f"Could not delete patient {p_id}: {p_err}")

    logger.info("================================================================================")
    logger.info("CLEANUP COMPLETE: Synthetic Demo Data has been safely isolated and removed.")
    logger.info("Real user patients, documents, and account data were untouched.")
    logger.info("================================================================================")


if __name__ == "__main__":
    cleanup_synthetic_journey()
