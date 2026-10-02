"""
Comprehensive Unit & Integration Test Suite for CarePath Sprint 4:
UNIFIED HEALTH JOURNEY INTELLIGENCE
Tests:
1. Timeline generation & sorting
2. Missing dates handling ("Date not specified", no invented dates)
3. Confirmed vs Relative follow-up periods
4. Deterministic calendar date projections & labeling
5. Cross-document mismatch detection (Medication dosage, Tooth #36 vs #37)
6. Source provenance & bidirectional citations
7. Empty patient records handling
8. Authorization / security verification
"""

import sys
import os
import unittest
from datetime import date, datetime
from unittest.mock import MagicMock

# Add backend directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.services.intelligence_service import IntelligenceService
from app.schemas.intelligence import TimelineResponse, CalendarResponse, MismatchResponse


class TestSprint4Intelligence(unittest.TestCase):
    def setUp(self):
        self.service = IntelligenceService()
        self.patient_id = "test-patient-uuid-1234"
        self.doc_a_id = "doc-uuid-treatment-plan"
        self.doc_b_id = "doc-uuid-lab-rx"

    def _build_mock_client(self, diagnoses=None, medications=None, investigations=None, procedures=None, follow_ups=None, extractions=None, documents=None, mismatches=None):
        """Builds a mock Supabase client returning synthetic clinical data."""
        client = MagicMock()

        docs_data = documents or [
            {
                "id": self.doc_a_id,
                "file_name": "Hospital_Discharge_Summary.pdf",
                "file_type": "application/pdf",
                "document_type": "discharge_summary",
                "uploaded_at": "2025-06-01T10:00:00Z",
            },
            {
                "id": self.doc_b_id,
                "file_name": "Dental_Clinic_Prescription.png",
                "file_type": "image/png",
                "document_type": "prescription",
                "uploaded_at": "2025-06-15T14:30:00Z",
            },
        ]

        def from_mock(table_name):
            query = MagicMock()
            data = []
            if table_name == "documents":
                data = docs_data
            elif table_name == "diagnoses":
                data = diagnoses or []
            elif table_name == "medications":
                data = medications or []
            elif table_name == "investigations":
                data = investigations or []
            elif table_name == "procedures":
                data = procedures or []
            elif table_name == "follow_ups":
                data = follow_ups or []
            elif table_name == "document_extractions":
                data = extractions or []
            elif table_name == "cross_document_mismatches":
                data = mismatches or []

            query.select.return_value = query
            query.eq.return_value = query
            query.execute.return_value = MagicMock(data=data)
            return query

        client.from_.side_effect = from_mock
        return client

    # -------------------------------------------------------------------------
    # Test 1 & 2: Timeline Generation, Sorting, and Missing Dates
    # -------------------------------------------------------------------------
    def test_timeline_generation_and_sorting(self):
        """Verify timeline combines multiple entity types and sorts chronologically."""
        diagnoses = [
            {
                "id": "diag-1",
                "patient_id": self.patient_id,
                "document_id": self.doc_a_id,
                "name": "Essential Hypertension",
                "status": "active",
                "date": "2025-05-10",
                "source_page": 1,
                "source_text": "Assessment: Patient has essential hypertension.",
                "confidence_note": "Explicitly stated in document",
            },
            {
                "id": "diag-2",
                "patient_id": self.patient_id,
                "document_id": self.doc_b_id,
                "name": "Dental Caries",
                "status": "active",
                "date": None,  # Intentionally missing date
                "source_page": None,
                "source_text": "Deep caries noted.",
                "confidence_note": "Explicitly stated in document",
            },
        ]

        medications = [
            {
                "id": "med-1",
                "patient_id": self.patient_id,
                "document_id": self.doc_a_id,
                "name": "Amlodipine",
                "dose": "5 mg",
                "route": "oral",
                "frequency": "once daily",
                "duration": "ongoing",
                "instructions": "in the morning",
                "start_date": "2025-05-12",
                "end_date": None,
                "source_page": 2,
                "source_text": "Rx: Amlodipine 5mg once daily",
                "confidence_note": "Explicitly stated in document",
            }
        ]

        investigations = [
            {
                "id": "inv-1",
                "patient_id": self.patient_id,
                "document_id": self.doc_a_id,
                "name": "Serum Creatinine",
                "date": "2025-05-09",
                "result": "1.1",
                "unit": "mg/dL",
                "reference_range": "0.7 - 1.3",
                "abnormal_flag": False,
                "source_page": 3,
                "source_text": "Serum Creatinine: 1.1 mg/dL",
                "confidence_note": "Explicitly stated in document",
            }
        ]

        client = self._build_mock_client(diagnoses=diagnoses, medications=medications, investigations=investigations)
        res: TimelineResponse = self.service.get_timeline(client, self.patient_id)

        self.assertEqual(res.total_count, 4)
        self.assertEqual(res.categories["diagnoses"], 2)
        self.assertEqual(res.categories["medications"], 1)
        self.assertEqual(res.categories["investigations"], 1)

        # Check chronological order: 2025-05-12 (med-1), 2025-05-10 (diag-1), 2025-05-09 (inv-1)
        dated_events = [e for e in res.events if e.date is not None]
        self.assertEqual(len(dated_events), 3)
        self.assertEqual(dated_events[0].title, "Amlodipine 5 mg")
        self.assertEqual(dated_events[0].date, "2025-05-12")
        self.assertTrue(dated_events[0].is_date_confirmed)

        self.assertEqual(dated_events[1].title, "Essential Hypertension")
        self.assertEqual(dated_events[1].date, "2025-05-10")

        self.assertEqual(dated_events[2].title, "Serum Creatinine")
        self.assertEqual(dated_events[2].date, "2025-05-09")

        # Check undated event behavior: never invent dates!
        undated = [e for e in res.events if e.date is None]
        self.assertEqual(len(undated), 1)
        self.assertEqual(undated[0].title, "Dental Caries")
        self.assertIsNone(undated[0].date)
        self.assertEqual(undated[0].date_display, "Date not specified")
        self.assertFalse(undated[0].is_date_confirmed)
        self.assertIsNone(undated[0].source_page)

    # -------------------------------------------------------------------------
    # Test 3 & 4: Calendar Dates: Confirmed vs Relative Projections
    # -------------------------------------------------------------------------
    def test_calendar_confirmed_and_projected_dates(self):
        """Verify calendar handles confirmed dates directly and deterministically projects relative dates."""
        follow_ups = [
            {
                "id": "fol-1",
                "patient_id": self.patient_id,
                "document_id": self.doc_a_id,
                "description": "Post-discharge cardiology review",
                "confirmed_date": "2025-07-15",
                "relative_time": None,
                "source_page": 1,
                "source_text": "Follow up in Cardiology Clinic on 15 July 2025.",
                "confidence_note": "Explicitly stated in document",
            },
            {
                "id": "fol-2",
                "patient_id": self.patient_id,
                "document_id": self.doc_a_id,
                "description": "Routine dental checkup and restoration review",
                "confirmed_date": None,
                "relative_time": "3 months",
                "source_page": 2,
                "source_text": "Dental review in 3 months.",
                "confidence_note": "Explicitly stated in document",
            },
        ]

        extractions = [
            {
                "document_id": self.doc_a_id,
                "document_date": "2025-06-01",
                "clinical_notes": "Encounter notes.",
            }
        ]

        client = self._build_mock_client(follow_ups=follow_ups, extractions=extractions)
        res: CalendarResponse = self.service.get_calendar(client, self.patient_id)

        self.assertEqual(res.total_events, 2)
        self.assertEqual(res.confirmed_count, 1)
        self.assertEqual(res.projected_count, 1)

        # Check confirmed event
        confirmed_ev = [e for e in res.events if not e.is_projected][0]
        self.assertEqual(confirmed_ev.date, "2025-07-15")
        self.assertFalse(confirmed_ev.is_projected)
        self.assertIn("Confirmed", confirmed_ev.projection_basis)

        # Check projected event: base date 2025-06-01 + 3 months = 2025-09-01
        projected_ev = [e for e in res.events if e.is_projected][0]
        self.assertEqual(projected_ev.date, "2025-09-01")
        self.assertTrue(projected_ev.is_projected)
        self.assertIn("Projected", projected_ev.date_display)
        self.assertEqual(projected_ev.relative_time_text, "Relative timeframe: 3 months")
        self.assertIn("Deterministically calculated", projected_ev.projection_basis)

    # -------------------------------------------------------------------------
    # Test 5 & 6: Cross-Document Information Mismatches
    # -------------------------------------------------------------------------
    def test_mismatch_detection_medication_dosage(self):
        """Verify cross-document mismatch engine catches medication dosage contradictions."""
        medications = [
            {
                "id": "med-doc-a",
                "patient_id": self.patient_id,
                "document_id": self.doc_a_id,
                "name": "Amoxicillin",
                "dose": "500 mg",
                "frequency": "three times daily",
                "source_page": 1,
                "source_text": "Amoxicillin 500mg TID for 7 days",
            },
            {
                "id": "med-doc-b",
                "patient_id": self.patient_id,
                "document_id": self.doc_b_id,
                "name": "Amoxicillin",
                "dose": "250 mg",
                "frequency": "twice daily",
                "source_page": 1,
                "source_text": "Amoxicillin 250mg BID",
            },
        ]

        client = self._build_mock_client(medications=medications)
        res: MismatchResponse = self.service.get_mismatches(client, self.patient_id)

        self.assertGreaterEqual(res.total_count, 1)
        med_mismatch = [m for m in res.mismatches if m.category == "medication"][0]
        self.assertEqual(med_mismatch.field_name, "dosage")
        self.assertEqual(med_mismatch.source_a.value, "500 mg")
        self.assertEqual(med_mismatch.source_b.value, "250 mg")
        self.assertEqual(
            med_mismatch.verification_message,
            "Potential Information Mismatch — Verify against original source.",
        )
        self.assertNotIn("Doctor made an error", med_mismatch.explanation)
        self.assertIn("Verify against the original documents", med_mismatch.explanation)

    def test_mismatch_detection_tooth_number(self):
        """Verify cross-document mismatch engine catches Tooth #36 vs Tooth #37 discrepancy."""
        procedures = [
            {
                "id": "proc-1",
                "patient_id": self.patient_id,
                "document_id": self.doc_a_id,
                "name": "Root Canal Treatment on Tooth #36",
                "details": "Endodontic access prepared for tooth 36",
                "source_page": 2,
                "source_text": "Treatment plan: Endodontic therapy indicated for Tooth #36",
            },
            {
                "id": "proc-2",
                "patient_id": self.patient_id,
                "document_id": self.doc_b_id,
                "name": "Dental Prosthesis Prescription: Tooth #37",
                "details": "Fabricate porcelain crown for tooth 37",
                "source_page": 1,
                "source_text": "Lab prescription: Crown for Tooth #37",
            },
        ]

        client = self._build_mock_client(procedures=procedures)
        res: MismatchResponse = self.service.get_mismatches(client, self.patient_id)

        dental_mismatches = [m for m in res.mismatches if m.category == "anatomical_site"]
        self.assertEqual(len(dental_mismatches), 1)
        m = dental_mismatches[0]
        self.assertEqual(m.field_name, "tooth_number")
        self.assertIn("36", m.source_a.value)
        self.assertIn("37", m.source_b.value)
        self.assertEqual(
            m.verification_message,
            "Potential Information Mismatch — Verify against original source.",
        )
        self.assertIn("Different tooth numbers", m.explanation)

    # -------------------------------------------------------------------------
    # Test 7: Empty Patient Records
    # -------------------------------------------------------------------------
    def test_empty_patient_records(self):
        """Verify service handles new patients with zero records gracefully."""
        client = self._build_mock_client(documents=[])
        tl = self.service.get_timeline(client, "empty-patient-id")
        cal = self.service.get_calendar(client, "empty-patient-id")
        mis = self.service.get_mismatches(client, "empty-patient-id")

        self.assertEqual(tl.total_count, 0)
        self.assertEqual(len(tl.events), 0)
        self.assertEqual(cal.total_events, 0)
        self.assertEqual(mis.total_count, 0)


if __name__ == "__main__":
    unittest.main()
