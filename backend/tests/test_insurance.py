"""
CarePath AI Insurance Claim Assistant — Comprehensive Unit & Attribution Tests
=============================================================================
Verifies Accuracy, Episode Attribution, Hospital Normalization, Date Windows,
Explainable Evidence, and Gemini Hard Guardrails.

Mandatory Test Suite:
TEST 1:  Same patient, Same hospital, Matching claim period, Correct document type => FOUND
TEST 2:  Same patient, Different hospital, Correct document type => NEVER FOUND (NEEDS_VERIFICATION)
TEST 3:  Same patient, Same hospital, Document clearly outside claim period => NEVER FOUND (NEEDS_VERIFICATION)
TEST 4:  Same patient, Same hospital, Correct date, Wrong document type => Not matched to requirement
TEST 5:  Same patient, Same hospital, No date metadata, Correct document type => NEEDS_VERIFICATION
TEST 6:  Different patient, Matching hospital/type/date => MUST NOT MATCH (Patient isolation)
TEST 7:  No documents => All applicable requirements MISSING
TEST 8:  Gemini unavailable => Deterministic results still returned safely
TEST 9:  Gemini quota exhausted (429) => Deterministic results still returned
TEST 10: Gemini must NOT be called when deterministic matching is sufficient (ZERO Gemini calls)
TEST 11: Gemini cannot override explicit hospital mismatch
TEST 12: Gemini cannot override explicit date mismatch
TEST 13: Recheck uses the CURRENT claim details and CURRENT document metadata
TEST 14: No hardcoded/demo document can satisfy a claim
"""

import sys
import os
import unittest
from datetime import datetime, date
from unittest.mock import MagicMock, patch

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.schemas.insurance import InsuranceClaimCreate
from app.services.insurance_service import (
    InsuranceClaimService,
    HOSPITALIZATION_CHECKLIST,
    normalize_hospital_name,
    evaluate_hospital_match,
    evaluate_date_match,
    _IN_MEMORY_CLAIMS,
)


class TestInsuranceEpisodeAttribution(unittest.TestCase):
    """
    Validates hospital normalization, date tolerance, and claim episode attribution.
    """

    def setUp(self):
        self.service = InsuranceClaimService()
        self.claim_details = {
            "hospital_name": "Amala Institute of Medical Sciences",
            "admission_date": "2026-09-10",
            "discharge_date": "2026-09-14",
            "claim_type": "hospitalization_reimbursement",
            "insurance_provider": "Star Health Insurance",
        }

    # =========================================================================
    # TEST 1: Same patient, Same hospital, Matching claim period, Correct type => FOUND
    # =========================================================================
    def test_01_same_patient_same_hospital_matching_period_correct_type_is_found(self):
        """
        TEST 1: Strong evidence across all dimensions attributes document to this claim episode.
        Must result in FOUND with complete explainable evidence.
        """
        documents = [
            {
                "id": "doc-amala-ds-1",
                "patient_id": "patient-1",
                "file_name": "Amala_Discharge_Summary_Sep2026.pdf",
                "document_type": "discharge_summary",
            }
        ]
        extractions = {
            "doc-amala-ds-1": {
                "document_type": "discharge_summary",
                "document_date": "2026-09-14",
                "provider_name": "Amala Hospital",
                "clinical_notes": "Patient admitted on 2026-09-10 and discharged on 2026-09-14 following appendectomy.",
            }
        }

        results = self.service.match_documents_deterministically(
            HOSPITALIZATION_CHECKLIST, documents, extractions, self.claim_details
        )

        item = next(r for r in results if r["requirement"] == "Discharge Summary")
        self.assertEqual(item["status"], "found")
        self.assertEqual(item["matched_document_id"], "doc-amala-ds-1")
        self.assertGreaterEqual(item["confidence_score"], 0.85)

        # Verify explainable evidence structure
        ev = item["evidence"]
        self.assertTrue(ev["patient_match"])
        self.assertEqual(ev["hospital_match"], "matched")
        self.assertEqual(ev["date_match"], "in_range")
        self.assertEqual(ev["type_match"], "matched")
        self.assertEqual(ev["decision"], "FOUND")

    # =========================================================================
    # TEST 2: Same patient, Different hospital, Correct document type => NEVER FOUND
    # =========================================================================
    def test_02_different_hospital_is_never_found(self):
        """
        TEST 2: Document type is Discharge Summary, but hospital is Aster Hospital
        when claim is for Amala Hospital. Must NEVER be FOUND.
        """
        documents = [
            {
                "id": "doc-aster-ds-1",
                "patient_id": "patient-1",
                "file_name": "Aster_Discharge_Summary.pdf",
                "document_type": "discharge_summary",
            }
        ]
        extractions = {
            "doc-aster-ds-1": {
                "document_type": "discharge_summary",
                "document_date": "2026-09-14",
                "provider_name": "Aster Medcity Hospital",
                "clinical_notes": "Discharged stable.",
            }
        }

        results = self.service.match_documents_deterministically(
            HOSPITALIZATION_CHECKLIST, documents, extractions, self.claim_details
        )

        item = next(r for r in results if r["requirement"] == "Discharge Summary")
        # Document type match ALONE must NEVER override a hospital mismatch
        self.assertNotEqual(item["status"], "found")
        self.assertEqual(item["status"], "needs_verification")
        self.assertIn("Aster Medcity", item["explanation"])
        self.assertEqual(item["evidence"]["hospital_match"], "mismatch")

    # =========================================================================
    # TEST 3: Same patient, Same hospital, Document outside claim period => NEVER FOUND
    # =========================================================================
    def test_03_document_outside_claim_period_is_never_found(self):
        """
        TEST 3: Document belongs to Amala Hospital, but is dated 2024 or Jan 2026
        (different hospitalization episode from Sep 2026). Must NEVER be FOUND.
        """
        documents = [
            {
                "id": "doc-amala-old-1",
                "patient_id": "patient-1",
                "file_name": "Amala_Hospital_Bill_2024.pdf",
                "document_type": "hospital_bill",
            }
        ]
        extractions = {
            "doc-amala-old-1": {
                "document_type": "hospital_bill",
                "document_date": "2024-05-15",
                "provider_name": "Amala Hospital",
                "clinical_notes": "Inpatient billing for May 2024 stay.",
            }
        }

        results = self.service.match_documents_deterministically(
            HOSPITALIZATION_CHECKLIST, documents, extractions, self.claim_details
        )

        bill_item = next(r for r in results if r["requirement"] == "Final Hospital Bill")
        self.assertNotEqual(bill_item["status"], "found")
        self.assertEqual(bill_item["status"], "needs_verification")
        self.assertEqual(bill_item["evidence"]["date_match"], "mismatch")
        self.assertIn("outside the claim episode", bill_item["explanation"])

    # =========================================================================
    # TEST 4: Same patient, Same hospital, Correct date, Wrong document type => Not matched
    # =========================================================================
    def test_04_wrong_document_type_not_matched_to_requirement(self):
        """
        TEST 4: Document is an investigation report from Amala Hospital on 2026-09-12.
        It must match Investigation Reports, NOT Discharge Summary or Final Bill.
        """
        documents = [
            {
                "id": "doc-amala-lab-1",
                "patient_id": "patient-1",
                "file_name": "Amala_CBC_Report.pdf",
                "document_type": "lab_report",
            }
        ]
        extractions = {
            "doc-amala-lab-1": {
                "document_type": "lab_report",
                "document_date": "2026-09-12",
                "provider_name": "Amala Hospital",
                "clinical_notes": "Complete blood count performed during admission.",
            }
        }

        results = self.service.match_documents_deterministically(
            HOSPITALIZATION_CHECKLIST, documents, extractions, self.claim_details
        )

        ds_item = next(r for r in results if r["requirement"] == "Discharge Summary")
        bill_item = next(r for r in results if r["requirement"] == "Final Hospital Bill")
        lab_item = next(r for r in results if r["requirement"] == "Investigation / Lab Reports")

        # Wrong type requirements remain MISSING
        self.assertEqual(ds_item["status"], "missing")
        self.assertEqual(bill_item["status"], "missing")

        # Matching requirement is FOUND
        self.assertEqual(lab_item["status"], "found")
        self.assertEqual(lab_item["matched_document_id"], "doc-amala-lab-1")

    # =========================================================================
    # TEST 5: Same patient, Same hospital, No date metadata => NEEDS_VERIFICATION
    # =========================================================================
    def test_05_no_date_metadata_yields_needs_verification(self):
        """
        TEST 5: Document has matching type and hospital, but NO date metadata.
        Because episode cannot be confirmed, it must yield NEEDS_VERIFICATION.
        """
        documents = [
            {
                "id": "doc-amala-nodate-1",
                "patient_id": "patient-1",
                "file_name": "Amala_Prescription_Undated.pdf",
                "document_type": "prescription",
            }
        ]
        extractions = {
            "doc-amala-nodate-1": {
                "document_type": "prescription",
                "document_date": None,
                "provider_name": "Amala Hospital",
                "clinical_notes": "Oral medications prescribed.",
            }
        }

        results = self.service.match_documents_deterministically(
            HOSPITALIZATION_CHECKLIST, documents, extractions, self.claim_details
        )

        rx_item = next(r for r in results if r["requirement"] == "Prescription")
        self.assertEqual(rx_item["status"], "needs_verification")
        self.assertEqual(rx_item["evidence"]["date_match"], "unknown")
        self.assertIn("date metadata unavailable", rx_item["explanation"].lower())

    # =========================================================================
    # TEST 6: Different patient => MUST NOT MATCH
    # =========================================================================
    def test_06_different_patient_must_not_match(self):
        """
        TEST 6: Another patient's documents must be strictly filtered out by patient isolation.
        """
        mock_client = MagicMock()
        mock_client.from_().select().eq.return_value.order.return_value.execute.return_value = MagicMock(data=[])

        docs = self.service._get_patient_documents(mock_client, "patient-bob-999")
        # Query must be strictly constrained to patient-bob-999
        mock_client.from_().select().eq.assert_called_with("patient_id", "patient-bob-999")
        self.assertEqual(docs, [])

    # =========================================================================
    # TEST 7: No documents => All applicable requirements MISSING
    # =========================================================================
    def test_07_no_documents_yields_missing(self):
        """
        TEST 7: When patient Document Vault is empty, all checklist items are MISSING.
        """
        results = self.service.match_documents_deterministically(
            HOSPITALIZATION_CHECKLIST, [], {}, self.claim_details
        )
        self.assertEqual(len(results), len(HOSPITALIZATION_CHECKLIST))
        for item in results:
            self.assertEqual(item["status"], "missing")
            self.assertIsNone(item["matched_document_id"])
            self.assertEqual(item["confidence_score"], 0.0)

    # =========================================================================
    # TEST 8: Gemini unavailable => Deterministic results still returned
    # =========================================================================
    @patch("app.services.insurance_service.InsuranceClaimService._call_gemini_classification")
    def test_08_gemini_unavailable_returns_deterministic_results(self, mock_gemini):
        """
        TEST 8: If Gemini connection raises an exception, the system degrades gracefully
        without failing the claim evaluation.
        """
        checklist = [
            {"requirement": "Payment Receipt", "status": "missing", "matched_document_id": None, "explanation": "No document."}
        ]
        amb_doc = {"id": "d-img", "file_name": "IMG_0001.jpg", "document_type": "unknown"}

        mock_gemini.side_effect = Exception("Gemini service offline")

        evaluated = self.service.apply_gemini_fallback_if_needed(checklist, [amb_doc], {}, self.claim_details)
        self.assertEqual(evaluated[0]["status"], "missing")

    # =========================================================================
    # TEST 9: Gemini quota exhausted => Deterministic results still returned
    # =========================================================================
    @patch("app.services.insurance_service.InsuranceClaimService._call_gemini_classification")
    def test_09_gemini_quota_exhausted_returns_deterministic_results(self, mock_gemini):
        """
        TEST 9: Gemini HTTP 429 quota exhaustion returns None and leaves deterministic states intact.
        """
        checklist = [
            {"requirement": "Payment Receipt", "status": "missing", "matched_document_id": None, "explanation": "No document."}
        ]
        amb_doc = {"id": "d-img", "file_name": "IMG_0001.jpg", "document_type": "unknown"}

        mock_gemini.return_value = None  # Simulates 429 handler returning None

        evaluated = self.service.apply_gemini_fallback_if_needed(checklist, [amb_doc], {}, self.claim_details)
        self.assertEqual(evaluated[0]["status"], "missing")

    # =========================================================================
    # TEST 10: Gemini must NOT be called when deterministic matching is sufficient
    # =========================================================================
    @patch("app.services.insurance_service.InsuranceClaimService._call_gemini_classification")
    def test_10_gemini_not_called_when_deterministic_matching_sufficient(self, mock_gemini):
        """
        TEST 10: ZERO Gemini calls when all requirements are satisfied or no ambiguous docs exist.
        """
        checklist = [
            {"requirement": "Discharge Summary", "status": "found", "matched_document_id": "d1"},
            {"requirement": "Final Hospital Bill", "status": "found", "matched_document_id": "d2"},
        ]
        docs = [
            {"id": "d1", "file_name": "Amala_Discharge.pdf", "document_type": "discharge_summary"},
            {"id": "d2", "file_name": "Amala_Bill.pdf", "document_type": "hospital_bill"},
        ]

        self.service.apply_gemini_fallback_if_needed(checklist, docs, {}, self.claim_details)
        self.assertEqual(mock_gemini.call_count, 0)

    # =========================================================================
    # TEST 11: Gemini cannot override explicit hospital mismatch
    # =========================================================================
    @patch("app.services.insurance_service.InsuranceClaimService._call_gemini_classification")
    def test_11_gemini_cannot_override_explicit_hospital_mismatch(self, mock_gemini):
        """
        TEST 11: Even if Gemini classifies an ambiguous document with 0.95 confidence,
        if the document belongs to a different hospital, it CANNOT be marked FOUND.
        """
        checklist = [
            {"requirement": "Final Hospital Bill", "status": "missing", "matched_document_id": None}
        ]
        amb_doc = {
            "id": "doc-img-aster",
            "file_name": "IMG_Aster_Invoice.jpg",
            "document_type": "unknown",
        }
        extractions = {
            "doc-img-aster": {
                "provider_name": "Aster Medcity",
                "document_date": "2026-09-12",
            }
        }

        mock_gemini.return_value = {
            "matched_requirement": "Final Hospital Bill",
            "confidence": 0.95,
            "reason": "Clear itemized hospital bill.",
        }

        evaluated = self.service.apply_gemini_fallback_if_needed(
            checklist, [amb_doc], extractions, self.claim_details
        )

        item = evaluated[0]
        # Gemini MUST NOT override hospital mismatch!
        self.assertNotEqual(item["status"], "found")
        self.assertEqual(item["status"], "needs_verification")
        self.assertIn("conflicting claim evidence", item["explanation"].lower())

    # =========================================================================
    # TEST 12: Gemini cannot override explicit date mismatch
    # =========================================================================
    @patch("app.services.insurance_service.InsuranceClaimService._call_gemini_classification")
    def test_12_gemini_cannot_override_explicit_date_mismatch(self, mock_gemini):
        """
        TEST 12: Even if Gemini classifies an ambiguous document with 0.95 confidence,
        if the document date is clearly outside the claim episode (e.g. 2024), it CANNOT be marked FOUND.
        """
        checklist = [
            {"requirement": "Payment Receipt", "status": "missing", "matched_document_id": None}
        ]
        amb_doc = {
            "id": "doc-img-old",
            "file_name": "Scan_Payment_2024.jpg",
            "document_type": "unknown",
        }
        extractions = {
            "doc-img-old": {
                "provider_name": "Amala Hospital",
                "document_date": "2024-03-10",
            }
        }

        mock_gemini.return_value = {
            "matched_requirement": "Payment Receipt",
            "confidence": 0.95,
            "reason": "Official paid cashier stamp.",
        }

        evaluated = self.service.apply_gemini_fallback_if_needed(
            checklist, [amb_doc], extractions, self.claim_details
        )

        item = evaluated[0]
        # Gemini MUST NOT override date mismatch!
        self.assertNotEqual(item["status"], "found")
        self.assertEqual(item["status"], "needs_verification")
        self.assertIn("conflicting claim evidence", item["explanation"].lower())

    # =========================================================================
    # TEST 13: Recheck uses CURRENT claim details and CURRENT document metadata
    # =========================================================================
    def test_13_recheck_uses_current_claim_details_and_metadata(self):
        """
        TEST 13: Rechecking a claim re-runs evaluation using the updated claim details and vault docs.
        """
        mock_client = MagicMock()
        patient_id = "pat-test-recheck-01"
        _IN_MEMORY_CLAIMS.clear()

        # Step 1: Patient starts claim when no documents exist
        mock_client.from_().select().eq().order().execute.return_value = MagicMock(data=[])
        mock_client.from_().select().in_().execute.return_value = MagicMock(data=[])

        claim_in = InsuranceClaimCreate(
            insurance_provider="HDFC ERGO",
            claim_type="hospitalization_reimbursement",
            hospital_name="Amala Hospital",
            admission_date="2026-09-10",
            discharge_date="2026-09-14",
        )
        created = self.service.create_claim(mock_client, patient_id, claim_in)
        self.assertEqual(created.found_count, 0)

        # Step 2: Patient subsequently uploads Amala Discharge Summary to vault
        new_doc = {
            "id": "doc-new-ds",
            "patient_id": patient_id,
            "file_name": "Amala_Discharge_Summary.pdf",
            "document_type": "discharge_summary",
        }
        new_ext = {
            "doc-new-ds": {
                "document_id": "doc-new-ds",
                "document_type": "discharge_summary",
                "document_date": "2026-09-14",
                "provider_name": "Amala Hospital",
            }
        }
        # Update mock returns for recheck
        mock_client.from_().select().eq().order().execute.return_value = MagicMock(data=[new_doc])
        mock_client.from_().select().eq().execute.return_value = MagicMock(data=list(new_ext.values()))

        rechecked = self.service.recheck_claim(mock_client, patient_id, created.id)
        self.assertIsNotNone(rechecked)
        self.assertEqual(rechecked.found_count, 1)
        ds_item = next(it for it in rechecked.items if it.requirement == "Discharge Summary")
        self.assertEqual(ds_item.status, "found")

    # =========================================================================
    # TEST 14: No hardcoded or demo documents satisfy a claim
    # =========================================================================
    def test_14_no_hardcoded_or_demo_documents_satisfy_claim(self):
        """
        TEST 14: Every match must strictly derive from the actual patient's uploaded documents.
        If the vault is empty, zero items can be marked FOUND.
        """
        mock_client = MagicMock()
        mock_client.from_().select().eq().order().execute.return_value = MagicMock(data=[])

        claim_in = InsuranceClaimCreate(
            insurance_provider="Care Health Insurance",
            claim_type="hospitalization_reimbursement",
            hospital_name="Random Hospital",
            admission_date="2026-09-10",
            discharge_date="2026-09-14",
        )
        claim = self.service.create_claim(mock_client, "pat-clean-user", claim_in)
        self.assertEqual(claim.found_count, 0)
        self.assertEqual(claim.readiness_percentage, 0)
        self.assertEqual(claim.missing_count, len(HOSPITALIZATION_CHECKLIST))


class TestHospitalNormalizationAndEdgeCases(unittest.TestCase):
    """
    Unit tests for hospital name normalization rules.
    """

    def test_hospital_normalization_rules(self):
        self.assertEqual(normalize_hospital_name("Amala Institute of Medical Sciences"), "amala")
        self.assertEqual(normalize_hospital_name("Amala Hospital"), "amala")
        self.assertEqual(normalize_hospital_name("AMALA HOSPITAL"), "amala")
        self.assertEqual(normalize_hospital_name("Aster Medcity Hospital"), "aster medcity")
        self.assertEqual(normalize_hospital_name("Apollo Multispeciality Hospital"), "apollo")
        self.assertEqual(normalize_hospital_name("Fortis Escorts Hospital"), "fortis escorts")

    def test_evaluate_hospital_match_same_provider(self):
        status, detected, reasons, disc = evaluate_hospital_match(
            claim_hospital_raw="Amala Institute of Medical Sciences",
            doc_provider_raw="Amala Hospital",
            file_name="invoice.pdf",
            clinical_notes="",
            category="clinical_hospital",
        )
        self.assertEqual(status, "matched")
        self.assertEqual(detected, "Amala Hospital")
        self.assertEqual(disc, [])

    def test_evaluate_hospital_match_different_provider(self):
        status, detected, reasons, disc = evaluate_hospital_match(
            claim_hospital_raw="Amala Hospital",
            doc_provider_raw="Aster Hospital",
            file_name="invoice.pdf",
            clinical_notes="",
            category="clinical_hospital",
        )
        self.assertEqual(status, "mismatch")
        self.assertEqual(detected, "Aster Hospital")
        self.assertTrue(len(disc) > 0)


if __name__ == "__main__":
    unittest.main()
