import unittest
from unittest.mock import MagicMock
from fastapi import HTTPException
from app.services.intelligence_service import intelligence_service
from app.services.health_event_service import health_event_service
from app.services.family_service import family_service
from app.schemas.health_events import HealthEventCreate, HealthEventUpdate


class TestSprint7CalendarAndFamilyDelete(unittest.TestCase):
    """
    Test suite for Sprint 7 improvements:
    1. Health Calendar: health_events integration, confirmed vs planned distinction,
       candidate discovery without silent fallback to uploaded_at.
    2. Family Management: Safe family member removal with authorization guards,
       protecting the primary account holder and patient clinical records.
    """

    def setUp(self):
        self.patient_id = "test-patient-uuid-1234"
        self.user_id = "test-user-auth-5678"
        self.doc_id = "test-doc-uuid-9999"

    def _build_mock_client(
        self,
        health_events=None,
        follow_ups=None,
        procedures=None,
        documents=None,
        extractions=None,
        family_memberships=None,
    ):
        """Constructs a chainable mock Supabase client."""
        client = MagicMock()

        def table_router(table_name):
            query = MagicMock()

            # Default return values
            data_map = {
                "health_events": health_events or [],
                "follow_ups": follow_ups or [],
                "procedures": procedures or [],
                "documents": documents or [],
                "document_extractions": extractions or [],
                "family_memberships": family_memberships or [],
                "family_groups": [],
                "patients": [],
            }

            table_data = data_map.get(table_name, [])

            # Chainable mock methods
            query.select.return_value = query
            query.eq.return_value = query
            query.not_ = MagicMock()
            query.not_.is_.return_value = query
            query.order.return_value = query
            query.insert.return_value = query
            query.update.return_value = query
            query.delete.return_value = query
            query.maybe_single.return_value = query

            result = MagicMock()
            result.data = table_data
            query.execute.return_value = result
            query.maybe_single.return_value.execute.return_value = result

            return query

        client.from_.side_effect = table_router
        return client

    # -------------------------------------------------------------------------
    # PART 1: HEALTH CALENDAR TESTS
    # -------------------------------------------------------------------------

    def test_calendar_with_health_events_distinguishes_completed_and_planned(self):
        """Calendar includes health_events, correctly classifying completed vs planned."""
        events_data = [
            {
                "id": "he-1",
                "patient_id": self.patient_id,
                "document_id": self.doc_id,
                "event_date": "2026-09-18",
                "event_type": "visit",
                "title": "Cardiology Consultation",
                "doctor_name": "Dr. Sarah Jenkins",
                "clinic_name": "City Care Hospital",
                "status": "completed",
                "created_at": "2026-10-01T12:00:00Z",
            },
            {
                "id": "he-2",
                "patient_id": self.patient_id,
                "document_id": None,
                "event_date": "2026-11-20",
                "event_type": "follow_up",
                "title": "Scheduled Cardiac Review",
                "doctor_name": "Dr. Sarah Jenkins",
                "clinic_name": "City Care Hospital",
                "status": "planned",
                "created_at": "2026-10-01T12:00:00Z",
            },
        ]
        docs_data = [
            {"id": self.doc_id, "file_name": "Prescription_Cardio.pdf", "patient_id": self.patient_id}
        ]

        client = self._build_mock_client(health_events=events_data, documents=docs_data)
        cal_res = intelligence_service.get_calendar(client, self.patient_id)

        self.assertEqual(cal_res.total_events, 2)
        self.assertEqual(cal_res.confirmed_count, 1)
        self.assertEqual(cal_res.projected_count, 1)

        # Verify completed visit
        visit = next(e for e in cal_res.events if e.event_type == "visit")
        self.assertEqual(visit.date, "2026-09-18")
        self.assertFalse(visit.is_projected)
        self.assertEqual(visit.status, "completed")
        self.assertEqual(visit.doctor_name, "Dr. Sarah Jenkins")

        # Verify planned follow-up
        planned = next(e for e in cal_res.events if e.event_type == "follow_up")
        self.assertEqual(planned.date, "2026-11-20")
        self.assertTrue(planned.is_projected)
        self.assertEqual(planned.status, "planned")

    def test_health_event_service_date_validation(self):
        """Reject malformed date strings to prevent corrupting healthcare chronology."""
        client = MagicMock()

        # Invalid date format
        bad_req = HealthEventCreate(
            event_date="invalid-date-string",
            event_type="visit",
            title="General Checkup",
        )
        with self.assertRaises(HTTPException) as ctx:
            health_event_service.create_health_event(client, self.patient_id, bad_req)
        self.assertEqual(ctx.exception.status_code, 400)

    def test_health_event_candidates_preserves_unconfirmed_date_flag(self):
        """If AI cannot determine the date, confidence_is_date_confirmed must be False without falling back to upload date."""
        doc_with_date = {
            "id": "doc-dated",
            "file_name": "Lab_Result.pdf",
            "document_type": "lab_report",
            "processing_status": "completed",
            "uploaded_at": "2026-10-01T10:00:00Z",
        }
        doc_without_date = {
            "id": "doc-undated",
            "file_name": "Notes_Scan.pdf",
            "document_type": "general",
            "processing_status": "completed",
            "uploaded_at": "2026-10-01T10:00:00Z",
        }

        # Setup mock client that returns docs and extractions
        client = MagicMock()
        mock_docs_res = MagicMock()
        mock_docs_res.data = [doc_with_date, doc_without_date]

        mock_events_res = MagicMock()
        mock_events_res.data = []  # No events confirmed yet

        mock_ext_dated = MagicMock()
        mock_ext_dated.data = {
            "document_date": "2026-08-15",
            "provider_name": "Metro Pathology",
            "raw_extraction": {"document_date": "2026-08-15"},
        }

        mock_ext_undated = MagicMock()
        mock_ext_undated.data = {
            "document_date": None,
            "provider_name": None,
            "raw_extraction": {},
        }

        ext_query = MagicMock()
        ext_query.select.return_value = ext_query
        ext_query.eq.return_value = ext_query
        ext_query.maybe_single.return_value = ext_query
        ext_query.execute.side_effect = [mock_ext_dated, mock_ext_undated]

        def router(table):
            query = MagicMock()
            query.select.return_value = query
            query.eq.return_value = query
            query.not_ = MagicMock()
            query.not_.is_.return_value = query
            query.maybe_single.return_value = query

            if table == "documents":
                query.execute.return_value = mock_docs_res
            elif table == "health_events":
                query.execute.return_value = mock_events_res
            elif table == "document_extractions":
                return ext_query
            return query

        client.from_.side_effect = router
        candidates = health_event_service.get_candidates(client, self.patient_id)

        self.assertEqual(len(candidates), 2)
        dated_cand = next(c for c in candidates if c.document_id == "doc-dated")
        self.assertTrue(dated_cand.confidence_is_date_confirmed)
        self.assertEqual(dated_cand.detected_date, "2026-08-15")

        undated_cand = next(c for c in candidates if c.document_id == "doc-undated")
        self.assertFalse(undated_cand.confidence_is_date_confirmed)
        self.assertIsNone(undated_cand.detected_date)

    # -------------------------------------------------------------------------
    # PART 2: FAMILY MEMBER DELETE TESTS
    # -------------------------------------------------------------------------

    def test_remove_family_member_success_as_group_owner(self):
        """Group owner can safely remove a member membership without touching patient records."""
        client = MagicMock()
        mock_mem_res = MagicMock()
        mock_mem_res.data = {
            "id": "mem-dependent-1",
            "patient_id": "patient-dependent-99",
            "role": "member",
            "relationship": "Child",
            "family_groups": {
                "id": "grp-1",
                "name": "Vance Family",
                "created_by": self.user_id,
            },
        }
        client.from_().select().eq().maybe_single().execute.return_value = mock_mem_res

        res = family_service.remove_family_member(
            client=client,
            user_id=self.user_id,
            requester_patient_id=self.patient_id,
            membership_id="mem-dependent-1",
        )

        self.assertTrue(res["success"])
        self.assertEqual(res["membership_id"], "mem-dependent-1")
        # Ensure DELETE was called on family_memberships table
        client.from_.assert_any_call("family_memberships")

    def test_remove_family_member_unauthorized_user_blocked(self):
        """Non-owner who is not the member cannot remove someone else's membership."""
        client = MagicMock()
        mock_mem_res = MagicMock()
        mock_mem_res.data = {
            "id": "mem-dependent-1",
            "patient_id": "patient-dependent-99",
            "role": "member",
            "relationship": "Child",
            "family_groups": {
                "id": "grp-1",
                "created_by": "different-owner-uid",
            },
        }
        client.from_().select().eq().maybe_single().execute.return_value = mock_mem_res

        with self.assertRaises(HTTPException) as ctx:
            family_service.remove_family_member(
                client=client,
                user_id="unauthorized-intruder-uid",
                requester_patient_id="attacker-patient-id",
                membership_id="mem-dependent-1",
            )
        self.assertEqual(ctx.exception.status_code, 403)

    def test_remove_family_member_primary_account_holder_protected(self):
        """Primary account holder (circle owner) cannot be removed from the circle."""
        client = MagicMock()
        mock_mem_res = MagicMock()
        mock_mem_res.data = {
            "id": "mem-primary-owner",
            "patient_id": self.patient_id,
            "role": "owner",
            "relationship": "Primary Account Holder",
            "family_groups": {
                "id": "grp-1",
                "created_by": self.user_id,
            },
        }
        client.from_().select().eq().maybe_single().execute.return_value = mock_mem_res

        with self.assertRaises(HTTPException) as ctx:
            family_service.remove_family_member(
                client=client,
                user_id=self.user_id,
                requester_patient_id=self.patient_id,
                membership_id="mem-primary-owner",
            )
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("primary account holder cannot be removed", ctx.exception.detail.lower())


if __name__ == "__main__":
    unittest.main()
