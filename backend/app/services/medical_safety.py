"""
CarePath Medical Safety Engine & Deterministic Rules
===================================================
Provides deterministic clinical safety guardrails, red-flag emergency screening,
allergy contraindication checks, and post-response validation.

Attribution Notice:
-------------------
Portions of the safety reference dictionaries (allergy conflict tables, pregnancy-unsafe
substances, approved OTC drugs, and red-flag patterns) are adapted from MediFamily
under the terms of the MIT License:
Copyright (c) 2025 MediFamily contributors.
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software.
"""

import re
import logging
from typing import List, Dict, Any, Optional, Tuple

logger = logging.getLogger("carepath.medical_safety")

# ==============================================================================
# 1. REFERENCE SAFETY DICTIONARIES (Deterministic, Pure In-Memory)
# ==============================================================================

ALLERGY_CONFLICTS: Dict[str, List[str]] = {
    "penicillin": ["amoxicillin", "ampicillin", "augmentin", "cephalexin", "cefixime", "cillin", "cephalosporin"],
    "sulfa": ["sulfamethoxazole", "bactrim", "septran", "cotrimoxazole", "sulfonamide"],
    "aspirin": ["aspirin", "ecosprin", "disprin", "ibuprofen", "diclofenac", "nsaid"],
    "nsaid": ["ibuprofen", "diclofenac", "naproxen", "brufen", "combiflam", "indomethacin", "meloxicam", "piroxicam"],
    "paracetamol": ["paracetamol", "acetaminophen", "crocin", "calpol", "dolo"],
    "iodine": ["betadine", "povidone iodine", "iodine contrast"],
    "latex": ["latex"],
    "peanut": ["peanut oil", "arachis oil"],
    "egg": ["egg-based vaccine"],
}

PREGNANCY_UNSAFE_DRUGS: List[str] = [
    "ibuprofen", "brufen", "combiflam",
    "aspirin", "ecosprin", "disprin",
    "diclofenac", "voveran",
    "naproxen",
    "warfarin",
    "isotretinoin", "accutane",
    "tetracycline", "doxycycline",
    "lisinopril", "enalapril", "ramipril", "captopril",
    "telmisartan", "losartan", "valsartan",
    "atorvastatin", "rosuvastatin", "simvastatin",
    "methotrexate",
    "fluconazole",
]

RED_FLAG_PATTERNS: List[Dict[str, Any]] = [
    {
        "matches": ["chest pain", "pressure in chest", "chest tightness", "seene mein dard", "angina"],
        "reason": "Potential acute coronary syndrome / cardiac emergency",
        "action": "Immediate emergency care required.",
    },
    {
        "matches": ["difficulty breathing", "shortness of breath", "gasping for air", "can't breathe", "cannot breathe", "stridor"],
        "reason": "Severe respiratory distress",
        "action": "Immediate emergency evaluation required.",
    },
    {
        "matches": ["unconscious", "passed out", "loss of consciousness", "fainted", "unresponsive"],
        "reason": "Loss of consciousness / neurological or cardiovascular compromise",
        "action": "Immediate medical resuscitation required.",
    },
    {
        "matches": ["seizure", "convulsion", "fits", "shaking uncontrollably"],
        "reason": "Active or recurrent seizure activity",
        "action": "Immediate neurological evaluation required.",
    },
    {
        "matches": ["face drooping", "slurred speech", "arm weakness", "sudden numbness", "stroke symptoms", "sudden vision loss"],
        "reason": "Signs of acute cerebrovascular accident (stroke)",
        "action": "Time-critical emergency stroke pathway activation required.",
    },
    {
        "matches": ["heavy bleeding", "uncontrolled bleeding", "bleeding profusely", "coughing blood", "blood in vomit"],
        "reason": "Severe acute hemorrhage",
        "action": "Immediate emergency intervention required.",
    },
    {
        "matches": ["anaphylaxis", "throat swelling", "swollen tongue", "severe allergic reaction", "lips swelling with wheeze"],
        "reason": "Life-threatening acute anaphylaxis",
        "action": "Immediate emergency intramuscular epinephrine and hospital care required.",
    },
    {
        "matches": ["suicidal", "want to die", "kill myself", "harm myself", "end my life"],
        "reason": "Acute psychiatric emergency / crisis",
        "action": "Immediate crisis intervention required (National Crisis Helpline: 988 in US / KIRAN 1800-599-0019 in India).",
    },
    {
        "matches": ["swallowed poison", "poisoning", "toxic ingestion", "overdose", "swallowed battery"],
        "reason": "Acute toxic ingestion / overdose",
        "action": "Immediate poison control and emergency hospital care required.",
    },
    {
        "matches": ["severe head injury", "head trauma with vomiting", "loss of memory after fall"],
        "reason": "Traumatic brain injury / intracranial hemorrhage risk",
        "action": "Immediate emergency imaging and neurosurgical evaluation required.",
    },
]

APPROVED_OTC_DRUGS: Dict[str, Dict[str, Any]] = {
    "paracetamol": {
        "aliases": ["crocin", "calpol", "dolo", "acetaminophen"],
        "uses": ["fever", "mild pain", "headache"],
        "adult_max_dose": "500-1000 mg every 4-6 hours (max 4000 mg/day)",
    },
    "ibuprofen": {
        "aliases": ["brufen", "advil", "motrin"],
        "uses": ["mild inflammatory pain", "fever"],
        "avoid_in": ["pregnancy", "peptic ulcer", "severe kidney disease", "active bleeding"],
        "adult_max_dose": "200-400 mg with or after food (max 1200 mg/day OTC)",
    },
    "ors": {
        "aliases": ["oral rehydration salts", "electral", "pedialyte"],
        "uses": ["dehydration", "fluid replacement in diarrhea or vomiting"],
    },
    "antacid": {
        "aliases": ["digene", "gelusil", "eno", "tums", "calcium carbonate"],
        "uses": ["occasional heartburn", "mild acid indigestion"],
    },
    "cetirizine": {
        "aliases": ["cetzine", "zyrtec"],
        "uses": ["mild allergic rhinitis", "sneezing", "hives"],
    },
    "saline nasal spray": {
        "aliases": ["nasivion saline", "saline drops"],
        "uses": ["nasal congestion relief"],
    },
    "throat lozenge": {
        "aliases": ["strepsils", "vicks cough drops"],
        "uses": ["temporary sore throat soothing"],
    },
}

# ==============================================================================
# 2. CORE DETERMINISTIC SYSTEM RULES (Injected into Gemini Prompt)
# ==============================================================================

CORE_MEDICAL_SAFETY_RULES = """
DETERMINISTIC CLINICAL SAFETY RULES (MUST FOLLOW STRICTLY):
1. GROUNDING IN PATIENT RECORDS:
   - Base all answers about medications, diagnoses, lab investigations, procedures, or allergies SOLELY on the provided Patient Medical Brief.
   - If the patient asks a question whose answer is NOT in their records (e.g. "What did my biopsy show?" when no biopsy report is listed), explicitly state: "The information is not available in your current CarePath records."
   - NEVER fabricate or extrapolate unrecorded diagnoses, lab values, or surgery details.

2. PRESCRIPTION & DOSAGE PROHIBITION:
   - NEVER prescribe or recommend any prescription-only medications.
   - NEVER tell a patient to start, change, double, or stop their prescription medication.
   - For any medicine adjustments, ALWAYS advise: "Please consult your prescribing physician before altering your medication schedule."
   - If recommending an over-the-counter aid, only suggest approved OTC options (e.g. ORS, Paracetamol, Saline spray) and never exceed safe standard limits.

3. ALLERGY & CONTRAINDICATION SAFETY:
   - Check the patient's listed allergies against any substance discussed. NEVER suggest a medication that conflicts with known allergies.
   - If the patient is pregnant or age-restricted (pediatric <18 or geriatric), apply the explicit contraindications noted in the brief.

4. DIAGNOSTIC HUMILITY & TONE:
   - NEVER present any condition as a confirmed diagnosis. Always use cautious phrases such as "This could possibly indicate...", "Potential reasons might include...".
   - Do NOT provide definitive clinical clearance.

5. EMERGENCY & RED-FLAG ESCALATION:
   - If the patient mentions red-flag symptoms (e.g. chest pain, severe shortness of breath, sudden numbness, stroke symptoms, uncontrolled bleeding, suicidal thoughts), immediately set urgency="red" and recommend emergency medical attention without delay.
   - Present the urgent advisory clearly before and alongside general information.

6. PROMPT CONSULTATION SIGNPOST:
   - Always encourage timely professional consultation for formal clinical evaluation and treatment.
"""

# ==============================================================================
# 3. SAFETY EVALUATION FUNCTIONS
# ==============================================================================

def detect_red_flags(message: str) -> Optional[Dict[str, str]]:
    """
    Scans user query for emergency / red-flag clinical presentations.
    Deterministic keyword & phrase matching. Returns matching alert or None.
    """
    if not message:
        return None
    msg_clean = message.lower()

    for pattern in RED_FLAG_PATTERNS:
        for phrase in pattern["matches"]:
            # Word boundary or phrase check
            if re.search(r"\b" + re.escape(phrase) + r"\b", msg_clean):
                return {
                    "matched_phrase": phrase,
                    "reason": pattern["reason"],
                    "action": pattern["action"],
                }
    return None


def compute_patient_contraindications(
    allergies: List[str],
    is_pregnant: bool,
    age_years: Optional[int],
    chronic_conditions: Optional[List[str]] = None,
) -> List[str]:
    """
    Computes deterministic contraindication constraints based on patient records.
    These are injected into the brief to strictly bound Gemini's suggestions.
    """
    contraindications: List[str] = []

    # 1. Allergy conflicts
    for allergy in allergies:
        a_clean = allergy.lower().strip()
        for key, drugs in ALLERGY_CONFLICTS.items():
            if key in a_clean:
                contraindications.append(
                    f"⚠️ ALLERGY CONTRAINDICATION: Patient allergic to '{allergy}'. NEVER suggest {', '.join(drugs[:4])}."
                )

    # 2. Pregnancy checks
    if is_pregnant:
        contraindications.append(
            f"⚠️ PREGNANCY SAFETY CAUTION: Patient is pregnant. NEVER suggest NSAIDs (ibuprofen, diclofenac, aspirin), ACE inhibitors, ARBs, or statins. Always recommend consulting an OB/GYN."
        )

    # 3. Pediatric checks
    if age_years is not None and age_years < 18:
        contraindications.append(
            f"⚠️ PEDIATRIC CAUTION: Patient is {age_years} years old (<18). NEVER recommend aspirin or aspirin-containing products (Reye's syndrome risk). Doses must be weight-adjusted under pediatric guidance."
        )
        if age_years < 2:
            contraindications.append(
                "⚠️ INFANT SAFETY: Children under 2 with fever or respiratory symptoms require prompt pediatrician evaluation."
            )

    # 4. Chronic condition contraindications
    if chronic_conditions:
        chronic_lower = " ".join(c.lower() for c in chronic_conditions)
        if any(term in chronic_lower for term in ["ulcer", "kidney", "renal", "asthma"]):
            contraindications.append(
                "⚠️ NSAID CAUTION: History of ulcer, renal disease, or asthma. Avoid systemic NSAIDs (ibuprofen, naproxen, diclofenac)."
            )

    return contraindications


def detect_safety_violations(
    response_data: Dict[str, Any],
    patient_context: Dict[str, Any],
    user_message: str,
) -> List[str]:
    """
    Post-response safety scanner (deterministic, pure in-memory, <1ms runtime).
    Inspects Gemini's structured response against patient constraints:
    - Checks for contraindicated medications suggested to allergic patients.
    - Checks for pregnancy-unsafe medications suggested to pregnant patients.
    - Checks for pediatric aspirin.
    - Checks for missed red-flag emergency escalation.
    - Checks for dangerous dosage modification directives ("stop taking", "double dose").
    """
    violations: List[str] = []

    # Collect all text output from AI response
    reply_text = str(response_data.get("reply", "")).lower()
    what_to_do = " ".join(str(x).lower() for x in response_data.get("what_to_do", []))
    otc_meds = response_data.get("otc_medicines", [])
    otc_names = [str(m.get("name", "")).lower() for m in otc_meds if isinstance(m, dict)]
    all_output_text = f"{reply_text} {what_to_do} {' '.join(otc_names)}"

    # 1. Missed Red-Flag Escalation Check
    red_flag = detect_red_flags(user_message)
    current_urgency = str(response_data.get("urgency", "yellow")).lower()
    if red_flag and current_urgency in ("green", "yellow"):
        violations.append(
            f"User presented red-flag symptoms ('{red_flag['matched_phrase']}' - {red_flag['reason']}) but response was categorized as '{current_urgency}' instead of 'red'."
        )

    # 2. Allergy Violation Check
    patient_allergies = patient_context.get("allergies", [])
    for allergy in patient_allergies:
        a_clean = str(allergy).lower().strip()
        for key, conflict_drugs in ALLERGY_CONFLICTS.items():
            if key in a_clean:
                for drug in conflict_drugs:
                    if re.search(r"\b" + re.escape(drug) + r"\b", all_output_text):
                        violations.append(
                            f"AI suggested substance '{drug}' which conflicts with patient's documented allergy '{allergy}'."
                        )

    # 3. Pregnancy Unsafe Drugs Check
    if patient_context.get("is_pregnant"):
        for drug in PREGNANCY_UNSAFE_DRUGS:
            if re.search(r"\b" + re.escape(drug) + r"\b", all_output_text):
                violations.append(
                    f"AI suggested medication '{drug}' to a pregnant patient (pregnancy-unsafe medication)."
                )

    # 4. Pediatric Aspirin Check
    age_years = patient_context.get("age_years")
    if age_years is not None and age_years < 18:
        for asp in ["aspirin", "ecosprin", "disprin"]:
            if re.search(r"\b" + re.escape(asp) + r"\b", all_output_text):
                violations.append(
                    f"AI suggested '{asp}' to a pediatric patient (age {age_years}) posing Reye's syndrome risk."
                )

    # 5. Direct Instruction to Discontinue or Change Prescription Dosage Check
    dangerous_actions = [
        r"\bstop taking\b",
        r"\bdiscontinue your\b",
        r"\bdouble your dose\b",
        r"\bhalve your dose\b",
        r"\bincrease your dose to\b",
        r"\bdecrease your dose to\b",
    ]
    for pattern in dangerous_actions:
        if re.search(pattern, all_output_text):
            violations.append(
                f"AI generated direct dosage alteration instruction matching '{pattern}'. Patients must consult their prescribing doctor."
            )

    return violations


def sanitize_response_if_unsafe(
    response_data: Dict[str, Any],
    violations: List[str],
    red_flag: Optional[Dict[str, str]] = None,
) -> Dict[str, Any]:
    """
    Deterministically sanitizes the AI output if safety violations were flagged.
    Removes dangerous suggestions, resets urgency to safe escalation levels,
    and prepends prominent safety alert warnings.
    """
    if not violations and not red_flag:
        return response_data

    sanitized = dict(response_data)

    # If red-flag detected or urgency escalation needed
    if red_flag:
        sanitized["urgency"] = "red"
        sanitized["urgency_label"] = "Emergency - Seek Immediate Medical Attention"
        urgent_notice = (
            f"🚨 URGENT MEDICAL ADVISORY: Your description indicates potential {red_flag['reason']} "
            f"({red_flag['matched_phrase']}). {red_flag['action']} Please call your emergency services (911/112/108) or go to the nearest emergency room immediately."
        )
        sanitized["safety_alert"] = urgent_notice
        # Ensure emergency action is first item in what_to_do
        what_to_do = sanitized.get("what_to_do", [])
        sanitized["what_to_do"] = [
            "Seek immediate emergency medical attention or call emergency services.",
            *[item for item in what_to_do if "emergency" not in item.lower()]
        ]

    # If medication safety violations detected, clear OTC recommendations and add warning
    if violations:
        sanitized["otc_medicines"] = []
        if sanitized.get("urgency") == "green":
            sanitized["urgency"] = "yellow"
            sanitized["urgency_label"] = "Consult Doctor Soon"

        safety_header = "⚠️ Clinical Safety Interception: " + "; ".join(violations)
        logger.warning(f"Safety violations intercepted: {safety_header}")
        sanitized["safety_violations"] = violations

        if not sanitized.get("safety_alert"):
            sanitized["safety_alert"] = (
                "⚠️ Important Health Caution: Certain medications or actions discussed carry contraindication "
                "risks with your documented health profile. Do not start or alter any medications without your physician's explicit approval."
            )

    return sanitized
