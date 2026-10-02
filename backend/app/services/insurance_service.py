"""
CarePath AI Insurance Claim Assistant Service
============================================
Assists patients in preparing insurance claims by checking required documents
against their existing CarePath Document Vault records.

Architecture & Design Principles:
1. Specific Claim Episode Attribution:
   Evaluates documents not merely by document type, but specifically attributes
   them to the claim's hospital, patient, and hospitalization date episode.
   A document type match ALONE is NEVER enough to mark an item FOUND.
2. Hospital Name Normalization:
   Normalizes hospital names safely (stripping corporate/facility suffixes and punctuation)
   while strictly preventing false positives between distinct institutions (e.g. Aster vs Amala).
   A hospital mismatch is a HARD NEGATIVE and cannot be overridden.
3. Date Episode Window & Clinical Tolerance:
   - In-range: [admission_date, discharge_date] -> Strong positive.
   - Clinically adjacent: <= 15 days pre-admission (pre-op lab/workup) or post-discharge -> Moderate positive.
   - Outside episode: > 30 days away or different year/episode -> HARD NEGATIVE.
   - A date mismatch cannot be overridden by Gemini.
4. Three Explicit Result States:
   - FOUND (Green): Strong evidence attributing document to this specific claim episode.
   - NEEDS_VERIFICATION (Yellow): Possible match, but hospital or date evidence is incomplete or ambiguous.
   - MISSING (Red): No eligible document found for this hospitalization episode.
5. Explainable Structured Evidence Model:
   Every checklist item stores structured evidence (Patient, Hospital, Claim Period, Type, Source)
   for transparent frontend "Why this matched?" inspection.
6. Gemini Fallback ONLY:
   Used exclusively as an ambiguity resolver for unclassified scans/photos.
   Gemini CANNOT override patient, hospital, or date episode mismatches.
7. Strict Patient Isolation & Security:
   Operates strictly on the authenticated patient's records under PostgreSQL RLS.
"""

import json
import logging
import re
import uuid
from datetime import datetime, date, timedelta
from typing import Dict, Any, List, Optional, Tuple
import httpx
from supabase import Client

from app.core.config import settings
from app.schemas.insurance import (
    InsuranceClaimCreate,
    InsuranceClaimResponse,
    InsuranceClaimItem,
    OtherDocumentMatch,
)

logger = logging.getLogger("carepath.insurance_service")

# ==============================================================================
# CONFIGURABLE CHECKLIST DEFINITIONS (HOSPITALIZATION / REIMBURSEMENT)
# ==============================================================================

HOSPITALIZATION_CHECKLIST = [
    {
        "id": "discharge_summary",
        "requirement": "Discharge Summary",
        "description": "Hospital discharge summary detailing admission diagnosis, clinical course, procedures, and discharge advice.",
        "category": "clinical_hospital",
        "primary_types": ["discharge_summary", "discharge", "discharge_report", "clinical_summary", "inpatient_summary"],
        "compatible_types": ["summary", "discharge_note", "hospital_summary"],
        "keywords": ["discharge summary", "discharge note", "discharge report", "inpatient summary", "discharge advice"],
    },
    {
        "id": "final_hospital_bill",
        "requirement": "Final Hospital Bill",
        "description": "Itemized final hospital bill breaking down room charges, nursing fees, medicines, and surgical costs.",
        "category": "billing_hospital",
        "primary_types": ["hospital_bill", "final_bill", "ipd_bill", "inpatient_bill", "hospital_invoice", "tax_invoice"],
        "compatible_types": ["bill", "invoice", "detailed_bill", "billing_summary"],
        "keywords": ["hospital bill", "final bill", "hospital invoice", "tax invoice", "detailed bill", "inpatient bill", "billing summary", "hospital charges"],
    },
    {
        "id": "payment_receipt",
        "requirement": "Payment Receipt",
        "description": "Signed or stamped hospital receipt acknowledging payment settlement or advance deposit.",
        "category": "billing_hospital",
        "primary_types": ["payment_receipt", "receipt", "payment", "money_receipt", "settlement"],
        "compatible_types": ["advance_receipt", "settlement_receipt", "transaction_receipt", "cash_receipt"],
        "keywords": ["payment receipt", "money receipt", "receipt", "paid receipt", "advance receipt", "settlement receipt", "transaction receipt", "cash receipt", "paid"],
    },
    {
        "id": "prescription",
        "requirement": "Prescription",
        "description": "Treating physician prescriptions for medications administered in-hospital or prescribed at discharge.",
        "category": "clinical_hospital",
        "primary_types": ["prescription", "rx", "medication", "discharge_medications", "medications"],
        "compatible_types": ["doctor_prescription", "medication_sheet", "rx_prescription"],
        "keywords": ["prescription", "rx", "doctor prescription", "medication sheet", "medicines advised", "rx prescription", "discharge prescription"],
    },
    {
        "id": "investigation_reports",
        "requirement": "Investigation / Lab Reports",
        "description": "Diagnostic reports supporting the hospitalization (blood work, pathology, radiology, MRI, CT, ultrasound).",
        "category": "diagnostic",
        "primary_types": ["investigation", "lab_report", "diagnostic", "pathology", "radiology", "blood_test", "scan", "mri", "ct_scan", "xray", "ultrasound"],
        "compatible_types": ["test_report", "biopsy", "lipid_profile", "cbc", "panel_report"],
        "keywords": ["lab report", "investigation", "blood test", "pathology", "radiology", "cholesterol report", "lipid profile", "cbc", "mri", "x-ray", "ultrasound", "scan report", "test report", "biopsy"],
    },
    {
        "id": "patient_id_proof",
        "requirement": "Patient ID Proof",
        "description": "Government-issued photo identification proof of the patient (Aadhaar, Passport, Voter ID, Driving License).",
        "category": "identity_patient",
        "primary_types": ["id_proof", "identity", "government_id", "passport", "aadhaar", "national_id", "driving_license"],
        "compatible_types": ["voter_id", "patient_id", "govt_id"],
        "keywords": ["id proof", "identity card", "aadhaar", "passport", "driving license", "voter id", "national id", "patient id", "govt id", "identity"],
    },
    {
        "id": "insurance_card",
        "requirement": "Insurance Card / Policy Document",
        "description": "Copy of the health insurance card, TPA card, or current active insurance policy schedule.",
        "category": "insurance_policy",
        "primary_types": ["insurance_card", "policy_document", "health_insurance", "tpa_card", "mediclaim"],
        "compatible_types": ["policy_schedule", "health_card", "insurance_policy"],
        "keywords": ["insurance card", "health card", "tpa card", "policy document", "insurance policy", "mediclaim", "policy schedule", "health insurance"],
    },
    {
        "id": "claim_form",
        "requirement": "Insurance Claim Form",
        "description": "Filled and signed reimbursement claim form (Part A signed by insured, Part B certified by hospital).",
        "category": "claim_administrative",
        "primary_types": ["claim_form", "insurance_claim_form", "reimbursement_form"],
        "compatible_types": ["claim_application", "claim_document"],
        "keywords": ["claim form", "part a", "part b", "reimbursement form", "claim application", "insurance claim form", "claim document"],
    },
]

DISCLAIMER_NOTE = (
    "CarePath checks your uploaded records to help prepare your claim. "
    "Requirements may vary by insurer and policy. Verify the final checklist with your insurance provider."
)

CHECKLIST_SOURCE = "General claim-preparation checklist (verify against your policy/insurer)"
NETWORK_STATUS = "Not verified"

# In-memory storage fallback when database table public.insurance_claims is not yet executed in Supabase
_IN_MEMORY_CLAIMS: Dict[str, List[Dict[str, Any]]] = {}


# ==============================================================================
# NORMALIZATION & CLINICAL EPISODE HELPERS
# ==============================================================================

def normalize_hospital_name(name: Optional[str]) -> str:
    """
    Normalizes healthcare provider / hospital names for safe, robust comparison.
    Lowercases, removes punctuation, and removes common facility and legal suffixes.
    Avoids over-aggressive fuzzy matching that could confuse unrelated institutions.
    """
    if not name:
        return ""

    s = name.lower().strip()
    # Normalize punctuation and dividers to spaces
    s = re.sub(r"[,\.\-\/\\&_()\[\]]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()

    # Ordered suffixes to strip safely
    suffixes = [
        "institute of medical sciences and research",
        "institute of medical sciences",
        "postgraduate institute",
        "multispeciality hospital and research centre",
        "multispeciality hospital and research center",
        "multispecialty hospital and research centre",
        "multispeciality hospital",
        "multispecialty hospital",
        "superspeciality hospital",
        "superspecialty hospital",
        "speciality hospital",
        "specialty hospital",
        "memorial hospital",
        "medical center",
        "medical centre",
        "health city",
        "health services",
        "healthcare system",
        "healthcare",
        "hospital",
        "hospitals",
        "clinic",
        "clinics",
        "dispensary",
        "sanatorium",
        "foundation",
        "trust",
        "pvt ltd",
        "private limited",
        "limited",
        "ltd",
        "inc",
        "corp",
    ]

    for sfx in suffixes:
        pattern = r"\b" + re.escape(sfx) + r"\b"
        s_clean = re.sub(pattern, "", s).strip()
        s_clean = re.sub(r"\s+", " ", s_clean).strip()
        if len(s_clean) >= 3:
            s = s_clean

    return s.strip()


def parse_date_safe(d_val: Any) -> Optional[date]:
    """
    Safely parses diverse clinical date formats into a datetime.date object.
    Supports YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, YYYY/MM/DD, and embedded dates.
    """
    if not d_val:
        return None
    if isinstance(d_val, date) and not isinstance(d_val, datetime):
        return d_val
    if isinstance(d_val, datetime):
        return d_val.date()

    d_str = str(d_val).strip()[:10]
    formats = ("%Y-%m-%d", "%Y/%m/%d", "%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y")
    for fmt in formats:
        try:
            return datetime.strptime(d_str, fmt).date()
        except ValueError:
            pass

    # Regex search for YYYY-MM-DD
    m = re.search(r"(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})", str(d_val))
    if m:
        try:
            return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        except ValueError:
            pass

    return None


def evaluate_hospital_match(
    claim_hospital_raw: str,
    doc_provider_raw: Optional[str],
    file_name: str,
    clinical_notes: str,
    category: str,
) -> Tuple[str, Optional[str], List[str], List[str]]:
    """
    Evaluates hospital attribution between claim context and document metadata.
    Returns:
      (status: 'matched' | 'unknown' | 'mismatch' | 'not_applicable',
       detected_hospital_name,
       reasons: List[str],
       discrepancies: List[str])
    """
    if category in ("identity_patient", "insurance_policy"):
        return "not_applicable", "Patient/Policy Document", ["Hospital attribution not required for personal identity/policy record."], []

    claim_norm = normalize_hospital_name(claim_hospital_raw)
    doc_prov = (doc_provider_raw or "").strip()
    doc_norm = normalize_hospital_name(doc_prov) if doc_prov else ""
    file_lower = file_name.lower()
    notes_lower = clinical_notes.lower()

    # Case 1: Explicit provider name documented in extraction
    if doc_prov and doc_norm:
        if claim_norm == doc_norm or claim_norm in doc_norm or doc_norm in claim_norm:
            return (
                "matched",
                doc_prov,
                [f"Hospital matches claim provider '{claim_hospital_raw}'"],
                [],
            )
        else:
            # Explicit hospital mismatch
            return (
                "mismatch",
                doc_prov,
                [],
                [f"Document explicitly belongs to '{doc_prov}', differing from claim hospital '{claim_hospital_raw}'"],
            )

    # Case 2: Provider name not structured, but claim hospital mentioned in filename or notes
    if claim_norm and (claim_norm in file_lower or claim_norm in notes_lower):
        return (
            "matched",
            f"{claim_hospital_raw} (referenced in document)",
            [f"Document text/filename references hospital '{claim_hospital_raw}'"],
            [],
        )

    # Case 3: Check if another distinct major hospital name is mentioned in file/notes
    known_hospitals = ["aster", "apollo", "manipal", "fortis", "max", "amrita", "lakeshore", "kims", "medanta", "narayana"]
    for kh in known_hospitals:
        if kh != claim_norm and (kh in file_lower or kh in notes_lower):
            return (
                "mismatch",
                f"{kh.capitalize()} Hospital",
                [],
                [f"Document references alternative hospital '{kh.capitalize()}', differing from claim hospital '{claim_hospital_raw}'"],
            )

    # Case 4: Hospital unknown
    return (
        "unknown",
        None,
        [],
        ["Hospital identity could not be verified from document metadata."],
    )


def evaluate_date_match(
    claim_adm_date: Optional[date],
    claim_disch_date: Optional[date],
    doc_date: Optional[date],
    category: str,
) -> Tuple[str, Optional[str], List[str], List[str]]:
    """
    Evaluates date episode attribution against claim admission and discharge dates.
    Returns:
      (status: 'in_range' | 'adjacent' | 'unknown' | 'mismatch' | 'not_applicable',
       detected_date_str,
       reasons: List[str],
       discrepancies: List[str])
    """
    if category in ("identity_patient", "insurance_policy"):
        return "not_applicable", str(doc_date) if doc_date else None, ["Date episode check not applicable for identity/policy document."], []

    if not claim_adm_date or not claim_disch_date:
        return "unknown", str(doc_date) if doc_date else None, [], ["Claim admission and discharge dates required for episode check."]

    if not doc_date:
        return (
            "unknown",
            None,
            [],
            ["Document date metadata unavailable in CarePath records."],
        )

    doc_str = doc_date.isoformat()
    adm_str = claim_adm_date.isoformat()
    disch_str = claim_disch_date.isoformat()

    # Rule A: In-range (within hospitalization stay)
    if claim_adm_date <= doc_date <= claim_disch_date:
        return (
            "in_range",
            doc_str,
            [f"Document date ({doc_str}) falls within hospitalization episode ({adm_str} to {disch_str})"],
            [],
        )

    # Rule B: Adjacent pre-admission diagnostic window (up to 15 days before admission)
    pre_window_start = claim_adm_date - timedelta(days=15)
    if pre_window_start <= doc_date < claim_adm_date:
        days_before = (claim_adm_date - doc_date).days
        return (
            "adjacent",
            doc_str,
            [f"Document date ({doc_str}) is within {days_before}-day pre-admission diagnostic workup window"],
            [],
        )

    # Rule C: Adjacent post-discharge care window (up to 15 days after discharge)
    post_window_end = claim_disch_date + timedelta(days=15)
    if claim_disch_date < doc_date <= post_window_end:
        days_after = (doc_date - claim_disch_date).days
        return (
            "adjacent",
            doc_str,
            [f"Document date ({doc_str}) is within {days_after}-day post-discharge care window"],
            [],
        )

    # Rule D: Explicit Episode Mismatch (> 30 days away, or different year/month)
    return (
        "mismatch",
        doc_str,
        [],
        [f"Document date ({doc_str}) is outside the claim episode ({adm_str} to {disch_str})"],
    )


# ==============================================================================
# INSURANCE CLAIM SERVICE (DOMAIN ENGINE)
# ==============================================================================

class InsuranceClaimService:
    """Core domain service for Insurance Claim preparation and document matching."""

    def __init__(self):
        self._api_key = settings.GEMINI_API_KEY
        self._model = settings.GEMINI_MODEL or "gemini-3.5-flash-lite"

    # ==========================================================================
    # DETERMINISTIC CLAIM-EPISODE MATCHING ENGINE
    # ==========================================================================

    def match_documents_deterministically(
        self,
        checklist_defs: List[Dict[str, Any]],
        documents: List[Dict[str, Any]],
        extractions: Dict[str, Dict[str, Any]],
        claim_details: Dict[str, Any],
    ) -> List[Dict[str, Any]]:
        """
        Evaluates patient documents specifically for attribution to THIS claim episode.
        Evaluates:
        1. Authenticated Patient ownership (strictly enforced).
        2. Hospital/Healthcare Provider match.
        3. Admission/Discharge date episode window.
        4. Document type & clinical extractions.
        5. Source document evidence.
        Produces explainable FOUND, NEEDS_VERIFICATION, or MISSING states.
        """
        results: List[Dict[str, Any]] = []

        claim_hospital_raw = (claim_details.get("hospital_name") or "").strip()
        claim_adm_date = parse_date_safe(claim_details.get("admission_date"))
        claim_disch_date = parse_date_safe(claim_details.get("discharge_date"))

        for req in checklist_defs:
            category = req.get("category", "clinical_hospital")
            primary_types = req.get("primary_types", [])
            compatible_types = req.get("compatible_types", [])
            keywords = req.get("keywords", [])

            # Candidate matches: List of (status, score, doc, evidence_dict)
            candidate_matches: List[Tuple[str, float, Dict[str, Any], Dict[str, Any]]] = []

            for doc in documents:
                doc_id = str(doc.get("id"))
                file_name = doc.get("file_name") or ""
                file_name_lower = file_name.lower()
                doc_type_raw = (doc.get("document_type") or "").strip()
                doc_type_lower = doc_type_raw.lower()

                ext = extractions.get(doc_id, {})
                ext_type_lower = (ext.get("document_type") or "").lower().strip()
                provider_raw = ext.get("provider_name")
                clinical_notes = ext.get("clinical_notes") or ""

                # Find document date from extraction or filename
                doc_date = parse_date_safe(ext.get("document_date"))
                if not doc_date:
                    doc_date = parse_date_safe(file_name)

                # 1. Evaluate Document Type Match
                type_status = "unrelated"
                type_detected = doc_type_raw or ext_type_lower or "unknown"
                type_reasons: List[str] = []

                if doc_type_lower in primary_types or ext_type_lower in primary_types:
                    type_status = "matched"
                    matched_tag = doc_type_lower if doc_type_lower in primary_types else ext_type_lower
                    type_reasons.append(f"Verified CarePath record type: '{matched_tag}'")
                elif doc_type_lower in compatible_types or ext_type_lower in compatible_types:
                    type_status = "compatible"
                    matched_tag = doc_type_lower if doc_type_lower in compatible_types else ext_type_lower
                    type_reasons.append(f"Compatible record type: '{matched_tag}'")
                else:
                    # Check filename keyword support
                    for kw in keywords:
                        if kw in file_name_lower:
                            type_status = "partial"
                            type_reasons.append(f"Document name '{file_name}' contains keyword '{kw}'")
                            break
                    if type_status == "unrelated":
                        for kw in keywords:
                            if kw in clinical_notes.lower():
                                type_status = "partial"
                                type_reasons.append(f"Clinical notes mention '{kw}'")
                                break

                # If document type is completely unrelated, it cannot satisfy this requirement
                if type_status == "unrelated":
                    continue

                # 2. Evaluate Hospital Match
                hosp_status, hosp_detected, hosp_reasons, hosp_discrepancies = evaluate_hospital_match(
                    claim_hospital_raw=claim_hospital_raw,
                    doc_provider_raw=provider_raw,
                    file_name=file_name,
                    clinical_notes=clinical_notes,
                    category=category,
                )

                # 3. Evaluate Date Episode Match
                date_status, date_detected, date_reasons, date_discrepancies = evaluate_date_match(
                    claim_adm_date=claim_adm_date,
                    claim_disch_date=claim_disch_date,
                    doc_date=doc_date,
                    category=category,
                )

                # 4. Multi-Factor Attribution & Scoring
                reasons: List[str] = ["Same authenticated patient record"] + type_reasons + hosp_reasons + date_reasons
                discrepancies: List[str] = hosp_discrepancies + date_discrepancies

                # Determine item status for this document
                candidate_status = "missing"
                score = 0.0

                # Special case: Identity / Policy administrative documents
                if category in ("identity_patient", "insurance_policy"):
                    if type_status in ("matched", "compatible"):
                        candidate_status = "found"
                        score = 0.95
                    else:
                        candidate_status = "needs_verification"
                        score = 0.65
                else:
                    # Clinical / Hospital episode requirements:
                    # HARD NEGATIVE 1: Hospital mismatch (clearly from another hospital)
                    # HARD NEGATIVE 2: Date episode mismatch (clearly outside episode)
                    if hosp_status == "mismatch" or date_status == "mismatch":
                        candidate_status = "needs_verification"
                        score = 0.40  # Under 0.50 so it never qualifies as found
                    # POSITIVE MATCH: Hospital matched + Date in range or adjacent + Type matched
                    elif hosp_status == "matched" and date_status in ("in_range", "adjacent") and type_status in ("matched", "compatible"):
                        candidate_status = "found"
                        score = 0.95 if date_status == "in_range" else 0.88
                    # INCOMPLETE EVIDENCE: Hospital unknown or Date unknown
                    elif hosp_status in ("matched", "unknown") and date_status in ("in_range", "adjacent", "unknown"):
                        candidate_status = "needs_verification"
                        score = 0.65
                    else:
                        candidate_status = "needs_verification"
                        score = 0.50

                evidence_dict = {
                    "patient_match": True,
                    "patient_status": "matched",
                    "hospital_match": hosp_status,
                    "hospital_name_in_doc": hosp_detected or "Not documented",
                    "claim_hospital": claim_hospital_raw,
                    "date_match": date_status,
                    "document_date": date_detected or "Not documented",
                    "claim_period": f"{claim_details.get('admission_date')} to {claim_details.get('discharge_date')}",
                    "type_match": type_status,
                    "document_type": type_detected,
                    "source_file": file_name,
                    "reasons": reasons,
                    "discrepancies": discrepancies,
                    "decision": candidate_status.upper(),
                }

                candidate_matches.append((candidate_status, score, doc, evidence_dict))

            # Sort candidate matches: FOUND first, then highest score
            candidate_matches.sort(
                key=lambda m: (1 if m[0] == "found" else 0, m[1]),
                reverse=True,
            )

            if candidate_matches:
                top_status, top_score, top_doc, top_evidence = candidate_matches[0]

                # Format human-readable explanation
                if top_status == "found":
                    explanation_text = "; ".join(top_evidence["reasons"])
                else:
                    explanation_text = "; ".join(top_evidence["discrepancies"]) if top_evidence["discrepancies"] else "; ".join(top_evidence["reasons"])

                other_matches = [
                    OtherDocumentMatch(
                        document_id=str(m[2]["id"]),
                        file_name=str(m[2]["file_name"]),
                        document_type=m[2].get("document_type"),
                        confidence=round(m[1], 2),
                    )
                    for m in candidate_matches[1:4]
                ]

                results.append({
                    "id": str(uuid.uuid4()),
                    "requirement": req["requirement"],
                    "status": top_status,
                    "matched_document_id": str(top_doc["id"]),
                    "matched_document_name": str(top_doc["file_name"]),
                    "explanation": explanation_text,
                    "confidence_score": round(top_score, 2),
                    "evidence": top_evidence,
                    "other_matches": other_matches,
                })
            else:
                # No candidate document found
                missing_evidence = {
                    "patient_match": True,
                    "patient_status": "matched",
                    "hospital_match": "unknown",
                    "hospital_name_in_doc": "None",
                    "claim_hospital": claim_hospital_raw,
                    "date_match": "unknown",
                    "document_date": "None",
                    "claim_period": f"{claim_details.get('admission_date')} to {claim_details.get('discharge_date')}",
                    "type_match": "unrelated",
                    "document_type": "None",
                    "source_file": "None",
                    "reasons": [],
                    "discrepancies": ["No eligible document found for this claim episode."],
                    "decision": "MISSING",
                }
                results.append({
                    "id": str(uuid.uuid4()),
                    "requirement": req["requirement"],
                    "status": "missing",
                    "matched_document_id": None,
                    "matched_document_name": None,
                    "explanation": "No matching document found in your CarePath Document Vault for this claim episode.",
                    "confidence_score": 0.0,
                    "evidence": missing_evidence,
                    "other_matches": [],
                })

        return results

    # ==========================================================================
    # GEMINI FALLBACK CLASSIFIER (CONTROLLED AMBIGUITY RESOLUTION)
    # ==========================================================================

    def _call_gemini_classification(
        self,
        document_meta: Dict[str, Any],
        missing_requirements: List[str],
    ) -> Optional[Dict[str, Any]]:
        """
        Calls Gemini REST API strictly as fallback to categorize an ambiguous document.
        Never called for normal deterministic evaluation.
        """
        if not self._api_key:
            logger.info("Gemini API key not configured; skipping AI fallback classification.")
            return None

        prompt = f"""You are an insurance document classifier assisting a patient in preparing an insurance claim.
Analyze this medical record metadata and classify if it matches one of the missing checklist requirements.

DOCUMENT TO CLASSIFY:
- File Name: {document_meta.get('file_name')}
- Current Type: {document_meta.get('document_type', 'unknown')}
- Clinical Summary Snippet: {str(document_meta.get('clinical_notes', ''))[:300]}

MISSING CHECKLIST REQUIREMENTS:
{json.dumps(missing_requirements)}

Return a strict JSON object with:
{{
  "matched_requirement": "<one of the missing requirements, or null if none match>",
  "confidence": <float between 0.0 and 1.0>,
  "reason": "<short 1-sentence explanation of why it satisfies or does not satisfy this requirement>"
}}
"""
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self._model}:generateContent"
        headers = {
            "x-goog-api-key": self._api_key,
            "Content-Type": "application/json",
        }
        payload = {
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": {
                "responseMimeType": "application/json",
                "temperature": 0.1,
                "maxOutputTokens": 300,
            },
        }

        try:
            with httpx.Client(timeout=10.0) as client:
                resp = client.post(url, headers=headers, json=payload)
            if resp.status_code == 200:
                data = resp.json()
                candidates = data.get("candidates", [])
                if candidates and "content" in candidates[0]:
                    parts = candidates[0]["content"].get("parts", [])
                    if parts and "text" in parts[0]:
                        return json.loads(parts[0]["text"])
            elif resp.status_code == 429:
                logger.warning("Gemini 429 quota reached during insurance fallback classification.")
            else:
                logger.warning(f"Gemini returned HTTP {resp.status_code} on fallback.")
        except Exception as e:
            logger.warning(f"Gemini fallback classification error (graceful degradation): {e}")

        return None

    def apply_gemini_fallback_if_needed(
        self,
        checklist_items: List[Dict[str, Any]],
        documents: List[Dict[str, Any]],
        extractions: Dict[str, Dict[str, Any]],
        claim_details: Optional[Dict[str, Any]] = None,
    ) -> List[Dict[str, Any]]:
        """
        Applies Gemini fallback only for missing requirements when ambiguous unclassified documents exist.
        HARD GUARDRAILS:
        - Gemini CANNOT override patient mismatch.
        - Gemini CANNOT override explicit hospital mismatch.
        - Gemini CANNOT override explicit date mismatch.
        """
        claim_details = claim_details or {}
        missing_items = [it for it in checklist_items if it["status"] == "missing"]
        if not missing_items:
            return checklist_items

        matched_doc_ids = {it["matched_document_id"] for it in checklist_items if it.get("matched_document_id")}

        # Ambiguous documents: generic/unknown type or camera photo names (e.g. IMG_..., Scan_...)
        ambiguous_docs = [
            d for d in documents
            if str(d.get("id")) not in matched_doc_ids
            and (
                d.get("document_type") in ("general", "unknown", "other", None, "")
                or re.match(r"^(img_|scan_|doc_|image|photo|\d+)", (d.get("file_name") or "").lower())
            )
        ]

        if not ambiguous_docs:
            return checklist_items

        claim_hospital_raw = (claim_details.get("hospital_name") or "").strip()
        claim_adm_date = parse_date_safe(claim_details.get("admission_date"))
        claim_disch_date = parse_date_safe(claim_details.get("discharge_date"))

        missing_requirements = [m["requirement"] for m in missing_items]

        # Limit to at most 2 ambiguous documents to respect quota & performance
        for amb_doc in ambiguous_docs[:2]:
            doc_id = str(amb_doc.get("id"))
            ext = extractions.get(doc_id, {})
            meta = {
                "file_name": amb_doc.get("file_name"),
                "document_type": amb_doc.get("document_type"),
                "clinical_notes": ext.get("clinical_notes"),
            }

            try:
                ai_res = self._call_gemini_classification(meta, missing_requirements)
            except Exception as e:
                logger.warning(f"Unexpected error in Gemini fallback call: {e}")
                ai_res = None

            if not ai_res or not ai_res.get("matched_requirement"):
                continue

            matched_req_name = ai_res.get("matched_requirement")
            confidence = float(ai_res.get("confidence", 0.0))
            reason = ai_res.get("reason", "AI categorized document.")

            # Validate hospital and date constraints for this ambiguous document
            # GEMINI CANNOT OVERRIDE HARD MISMATCHES
            doc_date = parse_date_safe(ext.get("document_date")) or parse_date_safe(amb_doc.get("file_name"))
            hosp_status, hosp_detected, hosp_reasons, hosp_discrepancies = evaluate_hospital_match(
                claim_hospital_raw=claim_hospital_raw,
                doc_provider_raw=ext.get("provider_name"),
                file_name=amb_doc.get("file_name") or "",
                clinical_notes=ext.get("clinical_notes") or "",
                category="clinical_hospital",
            )
            date_status, date_detected, date_reasons, date_discrepancies = evaluate_date_match(
                claim_adm_date=claim_adm_date,
                claim_disch_date=claim_disch_date,
                doc_date=doc_date,
                category="clinical_hospital",
            )

            # Update the checklist item if matched
            for it in checklist_items:
                if it["requirement"] == matched_req_name and it["status"] == "missing":
                    # Check for hard negative blockers
                    has_hard_mismatch = (hosp_status == "mismatch") or (date_status == "mismatch")

                    if has_hard_mismatch:
                        # Gemini CANNOT override hospital or date mismatch!
                        it["status"] = "needs_verification"
                        it["explanation"] = f"AI suggested category, but conflicting claim evidence: {'; '.join(hosp_discrepancies + date_discrepancies)}"
                    elif confidence >= 0.85 and hosp_status == "matched" and date_status in ("in_range", "adjacent"):
                        it["status"] = "found"
                        it["explanation"] = f"AI verified: {reason}"
                    elif confidence >= 0.50:
                        it["status"] = "needs_verification"
                        it["explanation"] = f"AI possible match ({int(confidence * 100)}%): {reason}"
                    else:
                        continue

                    it["matched_document_id"] = doc_id
                    it["matched_document_name"] = str(amb_doc.get("file_name"))
                    it["confidence_score"] = round(confidence, 2)
                    it["evidence"] = {
                        "patient_match": True,
                        "patient_status": "matched",
                        "hospital_match": hosp_status,
                        "hospital_name_in_doc": hosp_detected or "Not documented",
                        "claim_hospital": claim_hospital_raw,
                        "date_match": date_status,
                        "document_date": date_detected or "Not documented",
                        "claim_period": f"{claim_details.get('admission_date')} to {claim_details.get('discharge_date')}",
                        "type_match": "ai_classified",
                        "document_type": amb_doc.get("document_type") or "unknown",
                        "source_file": str(amb_doc.get("file_name")),
                        "reasons": [f"AI classification ({int(confidence * 100)}%): {reason}"] + hosp_reasons + date_reasons,
                        "discrepancies": hosp_discrepancies + date_discrepancies,
                        "decision": it["status"].upper(),
                    }

                    if matched_req_name in missing_requirements:
                        missing_requirements.remove(matched_req_name)
                    break

        return checklist_items

    # ==========================================================================
    # DATA RETRIEVAL & CRUD OPERATIONS
    # ==========================================================================

    def _get_patient_documents(self, client: Client, patient_id: str) -> List[Dict[str, Any]]:
        """Retrieves documents strictly belonging to the given patient."""
        try:
            doc_res = (
                client.from_("documents")
                .select("id, file_name, document_type, file_type, file_size, storage_path, uploaded_at")
                .eq("patient_id", patient_id)
                .order("uploaded_at", desc=True)
                .execute()
            )
            return doc_res.data or []
        except Exception as e:
            logger.warning(f"Error reading documents for patient {patient_id}: {e}")
            return []

    def _get_patient_documents_and_extractions(
        self,
        client: Client,
        patient_id: str,
    ) -> Tuple[List[Dict[str, Any]], Dict[str, Dict[str, Any]]]:
        """Loads all documents and structured extractions belonging to the patient in a single roundtrip."""
        documents = self._get_patient_documents(client, patient_id)

        try:
            ext_res = (
                client.from_("document_extractions")
                .select("document_id, document_type, document_date, provider_name, clinical_notes")
                .eq("patient_id", patient_id)
                .execute()
            )
            extractions = {str(r["document_id"]): r for r in (ext_res.data or [])}
        except Exception as e:
            logger.warning(f"Error reading document extractions for patient {patient_id}: {e}")
            extractions = {}

        return documents, extractions

    def create_claim(
        self,
        client: Client,
        patient_id: str,
        claim_in: InsuranceClaimCreate,
    ) -> InsuranceClaimResponse:
        """
        Creates an insurance claim record, evaluates the checklist deterministically,
        and saves the claim and item results.
        """
        claim_id = str(uuid.uuid4())
        now_iso = datetime.utcnow().isoformat() + "Z"

        # 1. Fetch patient's vault documents & extractions (Single batched query)
        documents, extractions = self._get_patient_documents_and_extractions(client, patient_id)

        # 2. Run deterministic checklist matching against this specific claim episode
        claim_details = {
            "hospital_name": claim_in.hospital_name,
            "admission_date": claim_in.admission_date,
            "discharge_date": claim_in.discharge_date,
            "claim_type": claim_in.claim_type,
            "insurance_provider": claim_in.insurance_provider,
        }
        raw_items = self.match_documents_deterministically(
            HOSPITALIZATION_CHECKLIST,
            documents,
            extractions,
            claim_details,
        )

        # 3. Apply Gemini fallback only if ambiguous documents exist and items remain missing
        final_items = self.apply_gemini_fallback_if_needed(
            raw_items, documents, extractions, claim_details
        )

        # 4. Save to PostgreSQL database with fallback to in-memory store
        claim_row = {
            "id": claim_id,
            "patient_id": patient_id,
            "insurance_provider": claim_in.insurance_provider,
            "claim_type": claim_in.claim_type,
            "hospital_name": claim_in.hospital_name,
            "admission_date": claim_in.admission_date,
            "discharge_date": claim_in.discharge_date,
            "claim_amount": claim_in.claim_amount,
            "policy_number": claim_in.policy_number,
            "created_at": now_iso,
            "updated_at": now_iso,
        }

        try:
            client.from_("insurance_claims").insert(claim_row).execute()
            # Insert claim items with structured evidence
            item_rows = []
            for it in final_items:
                item_rows.append({
                    "id": it["id"],
                    "claim_id": claim_id,
                    "requirement": it["requirement"],
                    "status": it["status"],
                    "matched_document_id": it["matched_document_id"],
                    "explanation": it["explanation"],
                    "confidence_score": it.get("confidence_score", 1.0),
                    "evidence": it.get("evidence", {}),
                    "created_at": now_iso,
                    "updated_at": now_iso,
                })
            client.from_("insurance_claim_items").insert(item_rows).execute()
        except Exception as e:
            logger.warning(f"Could not persist claim to Supabase database (using in-memory store): {e}")

        # In-memory storage cache
        in_mem_entry = {
            **claim_row,
            "items": final_items,
        }
        if patient_id not in _IN_MEMORY_CLAIMS:
            _IN_MEMORY_CLAIMS[patient_id] = []
        _IN_MEMORY_CLAIMS[patient_id].insert(0, in_mem_entry)

        return self._format_claim_response(in_mem_entry)

    def get_claims(
        self,
        client: Client,
        patient_id: str,
    ) -> List[InsuranceClaimResponse]:
        """Retrieves all insurance claims for the authenticated patient."""
        try:
            res = (
                client.from_("insurance_claims")
                .select("*, insurance_claim_items(*)")
                .eq("patient_id", patient_id)
                .order("created_at", desc=True)
                .execute()
            )
            rows = res.data if isinstance(res.data, list) else []
            if rows:
                claims: List[InsuranceClaimResponse] = []
                for r in rows:
                    raw_items = r.get("insurance_claim_items") or []
                    items_formatted = []
                    for it in raw_items:
                        items_formatted.append({
                            "id": str(it["id"]),
                            "claim_id": str(r["id"]),
                            "requirement": it["requirement"],
                            "status": it["status"],
                            "matched_document_id": it.get("matched_document_id"),
                            "matched_document_name": None,
                            "explanation": it.get("explanation"),
                            "confidence_score": float(it.get("confidence_score") or 1.0),
                            "evidence": it.get("evidence"),
                            "other_matches": [],
                            "created_at": it.get("created_at"),
                            "updated_at": it.get("updated_at"),
                        })
                    claims.append(self._format_claim_response({**r, "items": items_formatted}))
                return claims
        except Exception as e:
            logger.debug(f"Reading from in-memory claims for patient {patient_id}: {e}")

        # Fallback to in-memory store
        user_claims = _IN_MEMORY_CLAIMS.get(patient_id, [])
        return [self._format_claim_response(c) for c in user_claims]

    def get_claim_by_id(
        self,
        client: Client,
        patient_id: str,
        claim_id: str,
    ) -> Optional[InsuranceClaimResponse]:
        """Retrieves a single claim by ID with strict patient ownership check."""
        claims = self.get_claims(client, patient_id)
        for c in claims:
            if c.id == claim_id and c.patient_id == patient_id:
                return c
        return None

    def recheck_claim(
        self,
        client: Client,
        patient_id: str,
        claim_id: str,
    ) -> Optional[InsuranceClaimResponse]:
        """Re-runs the claim episode evaluation against the latest documents in the patient vault."""
        claim = self.get_claim_by_id(client, patient_id, claim_id)
        if not claim:
            return None

        documents, extractions = self._get_patient_documents_and_extractions(client, patient_id)
        claim_details = {
            "hospital_name": claim.hospital_name,
            "admission_date": claim.admission_date,
            "discharge_date": claim.discharge_date,
            "claim_type": claim.claim_type,
            "insurance_provider": claim.insurance_provider,
        }

        raw_items = self.match_documents_deterministically(
            HOSPITALIZATION_CHECKLIST,
            documents,
            extractions,
            claim_details,
        )
        final_items = self.apply_gemini_fallback_if_needed(
            raw_items, documents, extractions, claim_details
        )

        # Update in-memory
        if patient_id in _IN_MEMORY_CLAIMS:
            for entry in _IN_MEMORY_CLAIMS[patient_id]:
                if entry["id"] == claim_id:
                    entry["items"] = final_items
                    entry["updated_at"] = datetime.utcnow().isoformat() + "Z"
                    return self._format_claim_response(entry)

        # Update DB if available
        try:
            now_iso = datetime.utcnow().isoformat() + "Z"
            client.from_("insurance_claim_items").delete().eq("claim_id", claim_id).execute()
            item_rows = [
                {
                    "id": it["id"],
                    "claim_id": claim_id,
                    "requirement": it["requirement"],
                    "status": it["status"],
                    "matched_document_id": it["matched_document_id"],
                    "explanation": it["explanation"],
                    "confidence_score": it.get("confidence_score", 1.0),
                    "evidence": it.get("evidence", {}),
                    "created_at": now_iso,
                    "updated_at": now_iso,
                }
                for it in final_items
            ]
            client.from_("insurance_claim_items").insert(item_rows).execute()
        except Exception as e:
            logger.warning(f"Could not recheck claim in DB: {e}")

        updated_dict = {
            "id": claim.id,
            "patient_id": claim.patient_id,
            "insurance_provider": claim.insurance_provider,
            "claim_type": claim.claim_type,
            "hospital_name": claim.hospital_name,
            "admission_date": claim.admission_date,
            "discharge_date": claim.discharge_date,
            "claim_amount": claim.claim_amount,
            "policy_number": claim.policy_number,
            "items": final_items,
            "created_at": claim.created_at,
            "updated_at": datetime.utcnow().isoformat() + "Z",
        }
        return self._format_claim_response(updated_dict)

    def delete_claim(
        self,
        client: Client,
        patient_id: str,
        claim_id: str,
    ) -> bool:
        """Deletes a claim and its checklist items with patient ownership validation."""
        deleted = False
        try:
            res = (
                client.from_("insurance_claims")
                .delete()
                .eq("id", claim_id)
                .eq("patient_id", patient_id)
                .execute()
            )
            if res.data:
                deleted = True
        except Exception as e:
            logger.debug(f"DB delete fallback: {e}")

        # Also remove from in-memory
        if patient_id in _IN_MEMORY_CLAIMS:
            initial_len = len(_IN_MEMORY_CLAIMS[patient_id])
            _IN_MEMORY_CLAIMS[patient_id] = [
                c for c in _IN_MEMORY_CLAIMS[patient_id] if c["id"] != claim_id
            ]
            if len(_IN_MEMORY_CLAIMS[patient_id]) < initial_len:
                deleted = True

        return deleted

    # ==========================================================================
    # HELPER FORMATTERS
    # ==========================================================================

    def _format_claim_response(self, data: Dict[str, Any]) -> InsuranceClaimResponse:
        """Calculates readiness counts and formats the response model."""
        raw_items = data.get("items") or []
        items: List[InsuranceClaimItem] = []

        found_count = 0
        needs_verification_count = 0
        missing_count = 0

        for it in raw_items:
            status = it.get("status", "missing")
            if status == "found":
                found_count += 1
            elif status == "needs_verification":
                needs_verification_count += 1
            else:
                missing_count += 1

            other_matches = []
            for om in it.get("other_matches", []):
                if isinstance(om, dict):
                    other_matches.append(OtherDocumentMatch(**om))
                elif isinstance(om, OtherDocumentMatch):
                    other_matches.append(om)

            items.append(
                InsuranceClaimItem(
                    id=str(it.get("id", uuid.uuid4())),
                    claim_id=str(data.get("id")),
                    requirement=str(it.get("requirement")),
                    status=status,
                    matched_document_id=it.get("matched_document_id"),
                    matched_document_name=it.get("matched_document_name"),
                    explanation=it.get("explanation"),
                    confidence_score=it.get("confidence_score", 1.0),
                    evidence=it.get("evidence"),
                    other_matches=other_matches,
                    created_at=it.get("created_at"),
                    updated_at=it.get("updated_at"),
                )
            )

        total_items = len(items) or 1
        readiness = int((found_count / total_items) * 100)

        return InsuranceClaimResponse(
            id=str(data["id"]),
            patient_id=str(data["patient_id"]),
            insurance_provider=str(data["insurance_provider"]),
            claim_type=str(data.get("claim_type", "hospitalization")),
            hospital_name=str(data["hospital_name"]),
            admission_date=str(data["admission_date"]),
            discharge_date=str(data["discharge_date"]),
            claim_amount=float(data["claim_amount"]) if data.get("claim_amount") is not None else None,
            policy_number=data.get("policy_number"),
            items=items,
            found_count=found_count,
            needs_verification_count=needs_verification_count,
            missing_count=missing_count,
            total_items=len(items),
            readiness_percentage=readiness,
            network_status=NETWORK_STATUS,
            checklist_source=CHECKLIST_SOURCE,
            disclaimer_note=DISCLAIMER_NOTE,
            created_at=str(data.get("created_at")),
            updated_at=str(data.get("updated_at")),
        )


# Singleton instance
insurance_claim_service = InsuranceClaimService()
