"""
CarePath Patient Medical Brief Builder
=====================================
Constructs a compact, structured medical brief from existing PostgreSQL records.
Follows the architectural concept of MediFamily's brief.ts:
- Hard caps on entries to minimize token consumption (<450 tokens).
- Prioritizes active medications, abnormal labs, and recent diagnoses.
- Enforces strict grounding: provides the explicit ground truth for the AI assistant.
- Computes deterministic contraindications based on patient profile.
"""

import logging
from datetime import datetime, date
from typing import Dict, Any, List, Optional
from dataclasses import dataclass, field
from supabase import Client

from app.services.medical_safety import compute_patient_contraindications

logger = logging.getLogger("carepath.patient_brief")

# Caps to keep token usage small, fast, and deterministic
MAX_MEDS = 6
MAX_DIAGNOSES = 6
MAX_INVESTIGATIONS = 6
MAX_PROCEDURES = 4
MAX_FOLLOW_UPS = 4
MAX_DOCS = 8


@dataclass
class PatientMedicalBrief:
    patient_id: str
    patient_name: str
    age_years: Optional[int]
    gender: Optional[str]
    is_pregnant: bool
    allergies: List[str] = field(default_factory=list)
    active_medications: List[Dict[str, Any]] = field(default_factory=list)
    diagnoses: List[Dict[str, Any]] = field(default_factory=list)
    investigations: List[Dict[str, Any]] = field(default_factory=list)
    procedures: List[Dict[str, Any]] = field(default_factory=list)
    follow_ups: List[Dict[str, Any]] = field(default_factory=list)
    source_documents: List[Dict[str, Any]] = field(default_factory=list)
    contraindications: List[str] = field(default_factory=list)
    brief_text: str = ""


def _calculate_age(dob_str: Optional[str]) -> Optional[int]:
    """Calculates age in years from date of birth string."""
    if not dob_str:
        return None
    try:
        clean = str(dob_str).split("T")[0]
        dob = datetime.strptime(clean, "%Y-%m-%d").date()
        today = date.today()
        return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
    except Exception:
        return None


def _format_item_text(val: Optional[str], max_len: int = 80) -> str:
    if not val:
        return ""
    clean = " ".join(str(val).split())
    return clean[:max_len] + "…" if len(clean) > max_len else clean


def build_patient_medical_brief(client: Client, patient_id: str) -> PatientMedicalBrief:
    """
    Fetches real structured clinical records for patient_id from CarePath PostgreSQL
    and constructs a normalized, compact patient medical brief for Gemini.
    """
    # 1. Demographic profile
    p_res = (
        client.from_("patients")
        .select("id, full_name, date_of_birth, gender, phone")
        .eq("id", patient_id)
        .maybe_single()
        .execute()
    )
    p_data = p_res.data or {}
    patient_name = p_data.get("full_name") or "CarePath Patient"
    dob_str = p_data.get("date_of_birth")
    age_years = _calculate_age(dob_str)
    gender = p_data.get("gender")

    # 2. Documents mapping (for source attribution)
    docs_res = (
        client.from_("documents")
        .select("id, file_name, document_type, uploaded_at")
        .eq("patient_id", patient_id)
        .order("uploaded_at", desc=True)
        .limit(MAX_DOCS)
        .execute()
    )
    docs_data = docs_res.data or []
    doc_map = {d["id"]: d for d in docs_data}

    # 3. Clinical entities: Parallel relational fetch
    allergies_res = (
        client.from_("allergies")
        .select("id, substance, reaction, severity, document_id")
        .eq("patient_id", patient_id)
        .limit(10)
        .execute()
    )
    allergies_data = allergies_res.data or []
    allergy_names = [a["substance"] for a in allergies_data if a.get("substance")]

    diag_res = (
        client.from_("diagnoses")
        .select("id, name, status, date, document_id")
        .eq("patient_id", patient_id)
        .order("created_at", desc=True)
        .limit(MAX_DIAGNOSES)
        .execute()
    )
    diag_data = diag_res.data or []

    med_res = (
        client.from_("medications")
        .select("id, name, dose, route, frequency, duration, instructions, start_date, document_id")
        .eq("patient_id", patient_id)
        .order("created_at", desc=True)
        .limit(MAX_MEDS)
        .execute()
    )
    med_data = med_res.data or []

    inv_res = (
        client.from_("investigations")
        .select("id, name, date, result, unit, reference_range, abnormal_flag, document_id")
        .eq("patient_id", patient_id)
        .order("abnormal_flag", desc=True)
        .limit(MAX_INVESTIGATIONS)
        .execute()
    )
    inv_data = inv_res.data or []

    proc_res = (
        client.from_("procedures")
        .select("id, name, date, details, document_id")
        .eq("patient_id", patient_id)
        .order("created_at", desc=True)
        .limit(MAX_PROCEDURES)
        .execute()
    )
    proc_data = proc_res.data or []

    fu_res = (
        client.from_("follow_ups")
        .select("id, description, confirmed_date, relative_time, document_id")
        .eq("patient_id", patient_id)
        .order("created_at", desc=True)
        .limit(MAX_FOLLOW_UPS)
        .execute()
    )
    fu_data = fu_res.data or []

    # 4. Pregnancy status heuristic
    chronic_conditions = [d["name"] for d in diag_data if d.get("name")]
    is_pregnant = any("pregnan" in str(d.get("name", "")).lower() for d in diag_data)

    # 5. Compute deterministic contraindications
    contraindications = compute_patient_contraindications(
        allergies=allergy_names,
        is_pregnant=is_pregnant,
        age_years=age_years,
        chronic_conditions=chronic_conditions,
    )

    # 6. Format Compact Plain-Text Medical Brief
    lines: List[str] = []
    demo_parts = [patient_name]
    if age_years is not None:
        demo_parts.append(f"{age_years} yrs")
    if gender:
        demo_parts.append(gender.capitalize())
    lines.append(f"PATIENT: {', '.join(demo_parts)}")

    if allergy_names:
        lines.append(f"DOCUMENTED ALLERGIES: {', '.join(allergy_names)}")
    else:
        lines.append("DOCUMENTED ALLERGIES: None recorded in CarePath")

    if diag_data:
        diag_str_list = []
        for d in diag_data:
            s = d.get("name", "Unknown")
            if d.get("status"):
                s += f" ({d['status']})"
            if d.get("date"):
                s += f" [{d['date']}]"
            diag_str_list.append(s)
        lines.append(f"DIAGNOSES / CONDITIONS: {'; '.join(diag_str_list)}")
    else:
        lines.append("DIAGNOSES / CONDITIONS: None recorded in CarePath")

    if med_data:
        lines.append(f"\nACTIVE MEDICATIONS ({len(med_data)}):")
        for m in med_data:
            parts = [m.get("name", "Medication")]
            if m.get("dose"):
                parts.append(m["dose"])
            if m.get("frequency"):
                parts.append(m["frequency"])
            if m.get("instructions"):
                parts.append(m["instructions"])
            lines.append(f"- {', '.join(parts)}")
    else:
        lines.append("\nACTIVE MEDICATIONS: None recorded in CarePath")

    if inv_data:
        lines.append(f"\nRECENT INVESTIGATIONS & LABS ({len(inv_data)}):")
        for i in inv_data:
            res_str = f"{i.get('result', '')} {i.get('unit', '')}".strip()
            abn = " [⚠️ ABNORMAL]" if i.get("abnormal_flag") else ""
            ref = f" (Ref: {i['reference_range']})" if i.get("reference_range") else ""
            dt = f" on {i['date']}" if i.get("date") else ""
            lines.append(f"- {i.get('name')}: {res_str}{ref}{abn}{dt}")

    if proc_data:
        lines.append(f"\nRECENT PROCEDURES / SURGERIES ({len(proc_data)}):")
        for p in proc_data:
            dt = f" ({p['date']})" if p.get("date") else ""
            det = f" - {_format_item_text(p.get('details'))}" if p.get("details") else ""
            lines.append(f"- {p.get('name')}{dt}{det}")

    if fu_data:
        lines.append(f"\nSCHEDULED FOLLOW-UPS ({len(fu_data)}):")
        for f in fu_data:
            when = f.get("confirmed_date") or f.get("relative_time") or "Follow-up scheduled"
            lines.append(f"- {f.get('description')} ({when})")

    if docs_data:
        lines.append(f"\nSOURCE DOCUMENTS ON FILE ({len(docs_data)}):")
        for doc in docs_data:
            lines.append(f"- [{doc['id'][:8]}] {doc['file_name']} ({doc.get('document_type', 'Medical Record')})")

    if contraindications:
        lines.append("\nPATIENT-SPECIFIC CONTRAINDICATIONS (MANDATORY TO RESPECT):")
        for c in contraindications:
            lines.append(f"- {c}")

    brief_text = "\n".join(lines)

    return PatientMedicalBrief(
        patient_id=patient_id,
        patient_name=patient_name,
        age_years=age_years,
        gender=gender,
        is_pregnant=is_pregnant,
        allergies=allergy_names,
        active_medications=med_data,
        diagnoses=diag_data,
        investigations=inv_data,
        procedures=proc_data,
        follow_ups=fu_data,
        source_documents=docs_data,
        contraindications=contraindications,
        brief_text=brief_text,
    )
