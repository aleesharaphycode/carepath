"""
CarePath AI Doctor Unit & Safety Tests
======================================
Tests:
1. Red-flag emergency detection
2. Patient contraindications computation (allergies, pregnancy, pediatric)
3. Post-response safety detector (allergy conflict, pregnancy unsafe, pediatric aspirin, dosage alteration)
4. Deterministic response sanitization
5. Patient brief generation logic and caps
6. Graceful degradation fallback on Gemini downtime / quota limit
"""

import unittest
from unittest.mock import MagicMock, patch

from app.services.medical_safety import (
    detect_red_flags,
    compute_patient_contraindications,
    detect_safety_violations,
    sanitize_response_if_unsafe,
)
from app.services.patient_brief import build_patient_medical_brief
from app.services.ai_doctor_service import ai_doctor_service
from app.schemas.ai_doctor import AIDoctorChatRequest, ChatMessage


class TestMedicalSafetyEngine(unittest.TestCase):

    def test_detect_red_flags_cardiac(self):
        msg = "Doctor, I have severe chest pain and pressure since 20 minutes."
        alert = detect_red_flags(msg)
        self.assertIsNotNone(alert)
        self.assertIn("chest pain", alert["matched_phrase"])
        self.assertIn("cardiac", alert["reason"].lower())

    def test_detect_red_flags_stroke(self):
        msg = "My mother has sudden face drooping and slurred speech."
        alert = detect_red_flags(msg)
        self.assertIsNotNone(alert)
        self.assertIn("stroke", alert["reason"].lower())

    def test_detect_red_flags_none_for_routine_query(self):
        msg = "What medicines am I taking for my blood pressure?"
        alert = detect_red_flags(msg)
        self.assertIsNone(alert)

    def test_compute_patient_contraindications_allergy(self):
        allergies = ["Penicillin"]
        contra = compute_patient_contraindications(allergies=allergies, is_pregnant=False, age_years=35)
        self.assertTrue(any("amoxicillin" in c.lower() for c in contra))

    def test_compute_patient_contraindications_pregnant(self):
        contra = compute_patient_contraindications(allergies=[], is_pregnant=True, age_years=28)
        self.assertTrue(any("pregnant" in c.lower() or "nsaids" in c.lower() for c in contra))

    def test_compute_patient_contraindications_pediatric(self):
        contra = compute_patient_contraindications(allergies=[], is_pregnant=False, age_years=9)
        self.assertTrue(any("aspirin" in c.lower() and "reye" in c.lower() for c in contra))

    def test_safety_detector_catches_allergy_conflict(self):
        patient_context = {"allergies": ["Penicillin"], "is_pregnant": False, "age_years": 30}
        ai_resp = {
            "urgency": "yellow",
            "reply": "You could take Amoxicillin 500mg for your throat infection.",
            "what_to_do": ["Take amoxicillin twice daily."],
            "otc_medicines": [],
        }
        violations = detect_safety_violations(ai_resp, patient_context, "I have a sore throat")
        self.assertTrue(any("conflicts with patient's documented allergy" in v for v in violations))

    def test_safety_detector_catches_pregnancy_unsafe_drug(self):
        patient_context = {"allergies": [], "is_pregnant": True, "age_years": 26}
        ai_resp = {
            "urgency": "yellow",
            "reply": "You can take ibuprofen for the joint ache.",
            "what_to_do": ["Take ibuprofen after food."],
            "otc_medicines": [{"name": "Ibuprofen"}],
        }
        violations = detect_safety_violations(ai_resp, patient_context, "My knees are aching")
        self.assertTrue(any("pregnancy-unsafe" in v for v in violations))

    def test_safety_detector_catches_pediatric_aspirin(self):
        patient_context = {"allergies": [], "is_pregnant": False, "age_years": 7}
        ai_resp = {
            "urgency": "yellow",
            "reply": "Give the child some aspirin to reduce the fever.",
            "what_to_do": [],
            "otc_medicines": [{"name": "Disprin"}],
        }
        violations = detect_safety_violations(ai_resp, patient_context, "Child has fever")
        self.assertTrue(any("reye's syndrome" in v.lower() for v in violations))

    def test_safety_detector_catches_dangerous_dosage_change(self):
        patient_context = {"allergies": [], "is_pregnant": False, "age_years": 45}
        ai_resp = {
            "urgency": "yellow",
            "reply": "You should stop taking your metformin right away.",
            "what_to_do": ["Stop taking your pills."],
            "otc_medicines": [],
        }
        violations = detect_safety_violations(ai_resp, patient_context, "Feeling dizzy")
        self.assertTrue(any("dosage alteration" in v for v in violations))

    def test_sanitize_response_escalates_red_flags(self):
        ai_resp = {
            "urgency": "green",
            "urgency_label": "Low Risk",
            "reply": "Just drink warm water.",
            "what_to_do": ["Rest"],
            "otc_medicines": [{"name": "Paracetamol"}],
        }
        red_flag = {
            "matched_phrase": "chest pain",
            "reason": "Potential acute coronary syndrome",
            "action": "Immediate emergency care required.",
        }
        sanitized = sanitize_response_if_unsafe(ai_resp, violations=[], red_flag=red_flag)
        self.assertEqual(sanitized["urgency"], "red")
        self.assertIn("Emergency", sanitized["urgency_label"])
        self.assertIsNotNone(sanitized["safety_alert"])
        self.assertIn("chest pain", sanitized["safety_alert"])

    def test_sanitize_response_strips_unsafe_otc_on_violation(self):
        ai_resp = {
            "urgency": "yellow",
            "urgency_label": "Consult Doctor Soon",
            "reply": "Take these medicines.",
            "what_to_do": ["Take rest"],
            "otc_medicines": [{"name": "Amoxicillin"}],
        }
        sanitized = sanitize_response_if_unsafe(
            ai_resp,
            violations=["AI suggested substance 'Amoxicillin' conflicting with allergy"],
        )
        self.assertEqual(sanitized["otc_medicines"], [])
        self.assertIsNotNone(sanitized["safety_alert"])


class TestPatientMedicalBriefBuilder(unittest.TestCase):

    def test_brief_builder_formats_cleanly(self):
        mock_client = MagicMock()
        mock_patient = {
            "id": "pat-123",
            "full_name": "Eleanor Vance",
            "date_of_birth": "1980-05-14",
            "gender": "female",
            "phone": "+1-555-0101",
        }
        mock_allergies = [{"id": "a1", "substance": "Penicillin", "reaction": "Rash", "severity": "moderate"}]
        mock_diagnoses = [{"id": "d1", "name": "Essential Hypertension", "status": "active", "date": "2024-01-10"}]
        mock_meds = [{"id": "m1", "name": "Amlodipine", "dose": "5mg", "frequency": "once daily", "instructions": "morning"}]
        mock_invs = [{"id": "i1", "name": "HbA1c", "date": "2024-08-01", "result": "6.8", "unit": "%", "reference_range": "<5.7", "abnormal_flag": True}]
        mock_procs = [{"id": "p1", "name": "Appendectomy", "date": "2018-03-22", "details": "Laparoscopic"}]
        mock_fu = [{"id": "f1", "description": "Cardiology Follow-up", "confirmed_date": "2026-11-15"}]
        mock_docs = [{"id": "doc-1", "file_name": "Cardio_Report.pdf", "document_type": "prescription", "uploaded_at": "2026-01-10T10:00:00Z"}]

        # Setup mock returns
        mock_client.from_().select().eq().maybe_single().execute.return_value.data = mock_patient
        mock_client.from_().select().eq().order().limit().execute.side_effect = [
            MagicMock(data=mock_docs),     # documents
            MagicMock(data=mock_diagnoses),# diagnoses
            MagicMock(data=mock_meds),     # medications
            MagicMock(data=mock_invs),     # investigations
            MagicMock(data=mock_procs),    # procedures
            MagicMock(data=mock_fu),       # follow-ups
        ]
        mock_client.from_().select().eq().limit().execute.return_value.data = mock_allergies

        brief = build_patient_medical_brief(mock_client, "pat-123")

        self.assertEqual(brief.patient_name, "Eleanor Vance")
        self.assertIn("Eleanor Vance", brief.brief_text)
        self.assertIn("Amlodipine", brief.brief_text)
        self.assertIn("Penicillin", brief.brief_text)
        self.assertIn("Essential Hypertension", brief.brief_text)
        self.assertIn("HbA1c", brief.brief_text)
        self.assertIn("Appendectomy", brief.brief_text)
        self.assertIn("Cardiology Follow-up", brief.brief_text)
        self.assertIn("Cardio_Report.pdf", brief.brief_text)
        self.assertTrue(len(brief.contraindications) > 0)


class TestAIDoctorServiceDegradation(unittest.TestCase):

    @patch("app.services.ai_doctor_service.ai_doctor_service._call_gemini_rest")
    @patch("app.services.ai_doctor_service.build_patient_medical_brief")
    def test_gemini_outage_graceful_fallback(self, mock_build_brief, mock_call_gemini):
        # Simulate Gemini failure (returns None)
        mock_call_gemini.return_value = None
        mock_brief = MagicMock()
        mock_brief.patient_name = "Lucas Vance"
        mock_brief.patient_id = "pat-lucas"
        mock_brief.source_documents = []
        mock_build_brief.return_value = mock_brief

        mock_client = MagicMock()
        req = AIDoctorChatRequest(message="What medicines am I taking?")

        resp = ai_doctor_service.chat(mock_client, "pat-lucas", req)

        self.assertIsNotNone(resp)
        self.assertEqual(resp.urgency, "yellow")
        self.assertIn("CarePath AI Doctor is temporarily", resp.reply)
        self.assertIn("Your health records are still available", resp.safety_alert)


if __name__ == "__main__":
    unittest.main()
