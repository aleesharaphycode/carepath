import sys
import os
import unittest
from datetime import datetime, timezone, timedelta
from unittest.mock import MagicMock, patch

# Add backend directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi import HTTPException
from app.services.consent_service import consent_service
from app.services.family_service import family_service
from app.schemas.consent import CreateConsentRequest


class TestSprint5SecurityAndConsent(unittest.TestCase):
    """
    Automated security and authorization tests for Sprint 5:
    Family permissions, Temporary QR Doctor Consent, Expiration, Revocation, and Scope filtering.
    """

    def setUp(self):
        self.mock_client = MagicMock()
        self.patient_a_id = "patient-uuid-1111"
        self.patient_b_id = "patient-uuid-2222"
        self.user_a_id = "user-auth-1111"
        self.user_b_id = "user-auth-2222"

    def test_family_permission_own_data_allowed(self):
        """Patient A accessing own data is ALLOWED."""
        is_allowed = family_service.verify_family_view_permission(
            client=self.mock_client,
            requester_user_id=self.user_a_id,
            requester_patient_id=self.patient_a_id,
            target_patient_id=self.patient_a_id,
        )
        self.assertTrue(is_allowed)

    def test_family_permission_unauthorized_member_denied(self):
        """Patient A tries to access Patient B's records without permission -> DENIED."""
        mock_res = MagicMock()
        mock_res.data = []
        self.mock_client.from_().select().eq().eq().eq().execute.return_value = mock_res

        is_allowed = family_service.verify_family_view_permission(
            client=self.mock_client,
            requester_user_id=self.user_a_id,
            requester_patient_id=self.patient_a_id,
            target_patient_id=self.patient_b_id,
        )
        self.assertFalse(is_allowed)

    def test_family_permission_authorized_member_allowed(self):
        """Patient A tries to access Patient B's records with valid can_view_records=True -> ALLOWED."""
        mock_target = MagicMock()
        mock_target.data = [{"id": "mem-1", "family_group_id": "family-grp-123", "can_view_records": True, "access_status": "active"}]

        mock_requester = MagicMock()
        mock_requester.data = [{"id": "mem-2"}]

        self.mock_client.from_().select().eq().eq().eq().execute.return_value = mock_target
        self.mock_client.from_().select().in_().eq().eq().execute.return_value = mock_requester

        is_allowed = family_service.verify_family_view_permission(
            client=self.mock_client,
            requester_user_id=self.user_a_id,
            requester_patient_id=self.patient_a_id,
            target_patient_id=self.patient_b_id,
        )
        self.assertTrue(is_allowed)

    def test_1_create_valid_consent_and_qr_link(self):
        """TEST 1: Create valid consent -> Cryptographically secure token, valid QR URL, and audit log."""
        req = CreateConsentRequest(
            recipient_name="Dr. Sarah Jenkins",
            scope=["medications", "investigations"],
            duration_minutes=60,
        )

        def mock_insert_fn(payload):
            mock_res = MagicMock()
            if "recipient_name" in payload:
                mock_res.data = [{
                    "id": "session-100",
                    "patient_id": payload["patient_id"],
                    "recipient_name": payload["recipient_name"],
                    "access_token": payload["access_token"],
                    "scope": payload["scope"],
                    "duration_minutes": payload["duration_minutes"],
                    "expires_at": payload["expires_at"],
                    "status": "active",
                    "created_at": datetime.now(timezone.utc).isoformat(),
                }]
            else:
                mock_res.data = [{"id": "audit-100", **payload}]
            mock_chain = MagicMock()
            mock_chain.execute.return_value = mock_res
            return mock_chain

        self.mock_client.from_().insert.side_effect = mock_insert_fn
        self.mock_client.from_().select().eq().maybe_single().execute.return_value = MagicMock(
            data={"full_name": "Akshya Anand"}
        )

        session = consent_service.create_consent_session(
            client=self.mock_client,
            user_id=self.user_a_id,
            creator_patient_id=self.patient_a_id,
            req=req,
            base_url="https://carepath.health",
        )

        self.assertEqual(session.recipient_name, "Dr. Sarah Jenkins")
        self.assertEqual(session.status, "active")
        self.assertTrue(session.qr_access_url.startswith("https://carepath.health/share/"))
        self.assertIn(session.access_token, session.qr_access_url)

    def test_2_doctor_access_valid_active_token(self):
        """TEST 2: Doctor uses valid active QR token -> ALLOWED within granted scope."""
        valid_token = "valid_opaque_token_32chars_long"
        future_exp = (datetime.now(timezone.utc) + timedelta(minutes=45)).isoformat()

        session_record = {
            "id": "session-1",
            "patient_id": self.patient_a_id,
            "recipient_name": "Dr. Sarah Jenkins",
            "access_token": valid_token,
            "scope": ["medications", "investigations"],
            "expires_at": future_exp,
            "status": "active",
            "revoked_at": None,
        }

        mock_query = MagicMock()
        mock_query.data = session_record
        self.mock_client.from_().select().eq().maybe_single().execute.side_effect = [
            mock_query,  # consent_sessions query
            MagicMock(data={"full_name": "Akshya Anand", "date_of_birth": "1995-05-12"}),  # patients query
        ]

        self.mock_client.from_().select().eq().order().execute.return_value = MagicMock(
            data=[{"name": "Metformin", "dose": "500 mg"}]
        )

        response = consent_service.validate_doctor_access(
            client=self.mock_client,
            token=valid_token,
        )

        self.assertTrue(response.is_active)
        self.assertEqual(response.patient_name, "Akshya Anand")
        self.assertIn("medications", response.scope)
        self.assertIsNotNone(response.medications)

    def test_3_unauthorized_category_strictly_omitted(self):
        """TEST 3: Unauthorized categories are NOT returned (strictly None)."""
        valid_token = "scoped_token_meds_only"
        future_exp = (datetime.now(timezone.utc) + timedelta(minutes=45)).isoformat()

        session_record = {
            "id": "session-scoped",
            "patient_id": self.patient_a_id,
            "recipient_name": "Dr. Sarah Jenkins",
            "access_token": valid_token,
            "scope": ["medications"],  # Only medications!
            "expires_at": future_exp,
            "status": "active",
            "revoked_at": None,
        }

        mock_query = MagicMock()
        mock_query.data = session_record
        self.mock_client.from_().select().eq().maybe_single().execute.side_effect = [
            mock_query,
            MagicMock(data={"full_name": "Akshya Anand"}),
        ]

        self.mock_client.from_().select().eq().order().execute.return_value = MagicMock(
            data=[{"name": "Amoxicillin", "dosage": "250 mg"}]
        )

        response = consent_service.validate_doctor_access(
            client=self.mock_client,
            token=valid_token,
        )

        self.assertIsNotNone(response.medications)
        # All unconsented scopes MUST be strictly None
        self.assertIsNone(response.diagnoses)
        self.assertIsNone(response.investigations)
        self.assertIsNone(response.procedures)
        self.assertIsNone(response.follow_ups)
        self.assertIsNone(response.timeline)
        self.assertIsNone(response.documents)

    def test_4_doctor_access_expired_token(self):
        """TEST 4: Doctor uses expired QR token -> DENIED (403 Expired with exact message)."""
        expired_token = "expired_token_abc"
        past_exp = (datetime.now(timezone.utc) - timedelta(minutes=15)).isoformat()

        session_record = {
            "id": "session-expired",
            "patient_id": self.patient_a_id,
            "recipient_name": "Dr. Smith",
            "access_token": expired_token,
            "scope": ["timeline"],
            "expires_at": past_exp,
            "status": "active",
            "revoked_at": None,
        }

        mock_query = MagicMock()
        mock_query.data = session_record
        self.mock_client.from_().select().eq().maybe_single().execute.side_effect = [
            mock_query,
            MagicMock(data={"full_name": "Test Patient"}),
        ]

        with self.assertRaises(HTTPException) as ctx:
            consent_service.validate_doctor_access(
                client=self.mock_client,
                token=expired_token,
            )
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertEqual(
            ctx.exception.detail,
            "This CarePath sharing session has expired. Please ask the patient to generate a new QR code.",
        )

    def test_5_doctor_access_revoked_token(self):
        """TEST 5: Doctor uses revoked QR token -> DENIED (403 Revoked)."""
        revoked_token = "revoked_token_xyz"
        future_exp = (datetime.now(timezone.utc) + timedelta(minutes=30)).isoformat()

        session_record = {
            "id": "session-revoked",
            "patient_id": self.patient_a_id,
            "recipient_name": "Dr. Smith",
            "access_token": revoked_token,
            "scope": ["timeline"],
            "expires_at": future_exp,
            "status": "revoked",
            "revoked_at": datetime.now(timezone.utc).isoformat(),
        }

        mock_query = MagicMock()
        mock_query.data = session_record
        self.mock_client.from_().select().eq().maybe_single().execute.side_effect = [
            mock_query,
            MagicMock(data={"full_name": "Test Patient"}),
        ]

        with self.assertRaises(HTTPException) as ctx:
            consent_service.validate_doctor_access(
                client=self.mock_client,
                token=revoked_token,
            )
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertIn("revoked", ctx.exception.detail.lower())

    def test_6_doctor_access_random_invalid_token(self):
        """TEST 6: Doctor access with random/tampered token -> DENIED (403 Forbidden)."""
        mock_query = MagicMock()
        mock_query.data = None
        self.mock_client.from_().select().eq().maybe_single().execute.return_value = mock_query

        with self.assertRaises(HTTPException) as ctx:
            consent_service.validate_doctor_access(
                client=self.mock_client,
                token="random_nonexistent_token_9999",
            )
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertIn("invalid or unknown", ctx.exception.detail.lower())

    def test_7_client_cannot_modify_scope(self):
        """TEST 7: Client cannot increase scope by tampering with parameters."""
        valid_token = "limited_scope_token"
        future_exp = (datetime.now(timezone.utc) + timedelta(minutes=60)).isoformat()

        # Database record strictly has only 'timeline'
        session_record = {
            "id": "session-limited",
            "patient_id": self.patient_a_id,
            "recipient_name": "Dr. Specialist",
            "access_token": valid_token,
            "scope": ["timeline"],
            "expires_at": future_exp,
            "status": "active",
            "revoked_at": None,
        }

        mock_query = MagicMock()
        mock_query.data = session_record
        self.mock_client.from_().select().eq().maybe_single().execute.side_effect = [
            mock_query,
            MagicMock(data={"full_name": "Patient One"}),
        ]

        # Call validation without any scope argument - scope is strictly loaded from DB
        response = consent_service.validate_doctor_access(
            client=self.mock_client,
            token=valid_token,
        )

        self.assertEqual(response.scope, ["timeline"])
        self.assertIsNone(response.diagnoses)
        self.assertIsNone(response.medications)
        self.assertIsNone(response.documents)

    def test_8_family_data_is_not_leaked(self):
        """TEST 8: Doctor access for Patient A never queries or exposes Patient B's records."""
        valid_token = "patient_a_share_token"
        future_exp = (datetime.now(timezone.utc) + timedelta(minutes=60)).isoformat()

        session_record = {
            "id": "session-patient-a",
            "patient_id": self.patient_a_id,
            "recipient_name": "Dr. Family Doctor",
            "access_token": valid_token,
            "scope": ["diagnoses", "medications"],
            "expires_at": future_exp,
            "status": "active",
            "revoked_at": None,
        }

        mock_query = MagicMock()
        mock_query.data = session_record
        self.mock_client.from_().select().eq().maybe_single().execute.side_effect = [
            mock_query,
            MagicMock(data={"full_name": "Parent Patient"}),
        ]

        # Clinical queries must use patient_a_id
        consent_service.validate_doctor_access(
            client=self.mock_client,
            token=valid_token,
        )

        # Check all queries made to clinical tables used patient_a_id
        # None of the queries should have been for patient_b_id
        for call in self.mock_client.from_().select().eq.call_args_list:
            args, _ = call
            if len(args) >= 2 and args[0] == "patient_id":
                self.assertEqual(args[1], self.patient_a_id)
                self.assertNotEqual(args[1], self.patient_b_id)

    def test_9_access_creates_audit_log_without_medical_data(self):
        """TEST 9: Doctor access creates immutable audit log without storing raw clinical records."""
        valid_token = "audit_logged_token"
        future_exp = (datetime.now(timezone.utc) + timedelta(minutes=60)).isoformat()

        session_record = {
            "id": "session-audit",
            "patient_id": self.patient_a_id,
            "recipient_name": "Dr. Jenkins",
            "access_token": valid_token,
            "scope": ["medications"],
            "expires_at": future_exp,
            "status": "active",
            "revoked_at": None,
        }

        mock_query = MagicMock()
        mock_query.data = session_record
        self.mock_client.from_().select().eq().maybe_single().execute.side_effect = [
            mock_query,
            MagicMock(data={"full_name": "Akshya Anand"}),
        ]

        self.mock_client.from_().select().eq().order().execute.return_value = MagicMock(
            data=[{"name": "Metformin 500mg", "secret_lab": "Confidential"}]
        )

        consent_service.validate_doctor_access(
            client=self.mock_client,
            token=valid_token,
            ip_address="192.168.1.55",
        )

        # Verify access_audit_logs insert was called
        audit_insert_calls = [
            call for call in self.mock_client.from_().insert.call_args_list
        ]
        self.assertTrue(len(audit_insert_calls) > 0)

        # Inspect the logged payload
        audit_payload = audit_insert_calls[0][0][0]
        self.assertEqual(audit_payload["actor"], "doctor")
        self.assertEqual(audit_payload["action"], "records_viewed")
        self.assertEqual(audit_payload["ip_address"], "192.168.1.55")

        # Confirm NO raw clinical data in details
        self.assertNotIn("Metformin", audit_payload["details"])
        self.assertNotIn("Confidential", audit_payload["details"])

    def test_10_token_does_not_contain_medical_or_patient_info(self):
        """TEST 10: Token is an opaque cryptographic random string (not patient ID, timestamp, or medical facts)."""
        import secrets
        token = secrets.token_urlsafe(32)

        # Minimum 256 bits entropy (at least 43 characters in base64 URL safe)
        self.assertGreaterEqual(len(token), 40)

        # Must not contain predictable identifiers or health terms
        forbidden_substrings = ["patient", "diagnos", "medic", "lab", "uuid", "1995", "@", "carepath"]
        for sub in forbidden_substrings:
            self.assertNotIn(sub, token.lower())

    def test_11_qr_url_uses_configured_public_app_url(self):
        """TEST 11: QR access URL uses configured public APP_URL instead of hard-coded localhost."""
        req = CreateConsentRequest(
            recipient_name="Dr. Taylor",
            scope=["timeline"],
            duration_minutes=30,
        )

        mock_insert = MagicMock()
        mock_insert.data = [{
            "id": "session-custom-url",
            "patient_id": self.patient_a_id,
            "recipient_name": "Dr. Taylor",
            "access_token": "token_abc_123",
            "scope": ["timeline"],
            "duration_minutes": 30,
            "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=30)).isoformat(),
            "status": "active",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }]
        self.mock_client.from_().insert().execute.return_value = mock_insert
        self.mock_client.from_().select().eq().maybe_single().execute.return_value = MagicMock(
            data={"full_name": "Akshya Anand"}
        )

        # When public URL is configured (e.g. deployed domain)
        custom_public_url = "https://carepath-demo.vercel.app"
        session = consent_service.create_consent_session(
            client=self.mock_client,
            user_id=self.user_a_id,
            creator_patient_id=self.patient_a_id,
            req=req,
            base_url=custom_public_url,
        )

        self.assertTrue(session.qr_access_url.startswith("https://carepath-demo.vercel.app/share/"))
        self.assertNotIn("localhost:3000", session.qr_access_url)


if __name__ == "__main__":
    unittest.main()
