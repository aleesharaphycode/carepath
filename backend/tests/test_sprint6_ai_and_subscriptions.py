import sys
import os
import unittest
import hmac
import hashlib
from unittest.mock import MagicMock, patch

# Add backend directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi import HTTPException
from app.services.ai_provider import (
    AIProviderService,
    AIQuotaExhaustedError,
)
from app.schemas.extraction import (
    MedicalDocumentExtraction,
    DiagnosisItem,
    MedicationItem,
    SourceReference,
)
from app.services.usage_service import usage_service
from app.services.subscription_service import subscription_service
from app.services.family_service import family_service
from app.services.consent_service import consent_service


class TestSprint6AIAndSubscriptions(unittest.TestCase):
    """
    Automated verification suite for Sprint 6:
    - AI Provider abstraction & OpenAI to Gemini controlled fallback on 429
    - Server-side AI usage quota enforcement (AI_USAGE_LIMIT_REACHED)
    - Freemium / Premium Razorpay signature verification & sandbox upgrades
    - Demo data isolation (new users start 100% empty)
    """

    def setUp(self):
        self.mock_client = MagicMock()
        self.patient_id = "test-patient-fresh-001"
        self.user_id = "test-user-fresh-001"

    # =========================================================================
    # 1. AI PROVIDER ABSTRACTION & CONTROLLED FALLBACK
    # =========================================================================

    def test_ai_fallback_on_openai_429(self):
        """
        Verify that when OpenAI encounters 429 quota exhaustion,
        AIProviderService performs controlled fallback to Gemini without inventing data.
        """
        mock_openai = MagicMock()
        mock_openai.extract_from_document.side_effect = AIQuotaExhaustedError("OpenAI quota exhausted (429).")

        mock_gemini = MagicMock()
        expected_extraction = MedicalDocumentExtraction(
            document_type="prescription",
            document_date="2026-09-30",
            diagnoses=[
                DiagnosisItem(
                    name="Essential Hypertension",
                    source_reference=SourceReference(
                        document_id="doc-1",
                        page=1,
                        source_text="Dx: Essential HTN"
                    )
                )
            ],
            medications=[
                MedicationItem(
                    name="Amlodipine",
                    dose="5mg",
                    frequency="Once daily",
                    source_reference=SourceReference(
                        document_id="doc-1",
                        page=1,
                        source_text="Amlodipine 5mg OD"
                    )
                )
            ],
            source_references=[
                SourceReference(document_id="doc-1", page=1, source_text="Prescription text")
            ]
        )
        mock_gemini.extract_from_document.return_value = expected_extraction

        service = AIProviderService()
        service.openai_provider = mock_openai
        service.gemini_provider = mock_gemini

        with patch("app.services.ai_provider.settings.AI_PROVIDER", "openai"), \
             patch("app.services.ai_provider.settings.OPENAI_API_KEY", "sk-test-openai"), \
             patch("app.services.ai_provider.settings.GEMINI_API_KEY", "test-gemini-key"):
            result, provider_used = service.extract_from_document(
                file_bytes=b"dummy file content",
                file_name="prescription.pdf",
                file_type="application/pdf",
                document_id="doc-1",
                document_type="prescription"
            )

        self.assertIsNotNone(result)
        self.assertEqual(provider_used, "gemini")
        self.assertEqual(result.document_type, "prescription")
        self.assertEqual(len(result.medications), 1)
        self.assertEqual(result.medications[0].name, "Amlodipine")
        mock_openai.extract_from_document.assert_called_once()
        mock_gemini.extract_from_document.assert_called_once()

    def test_ai_clear_error_when_no_provider_available(self):
        """
        When OpenAI is exhausted and Gemini is not configured,
        a clear user-facing AIQuotaExhaustedError is returned without fabricating results.
        """
        mock_openai = MagicMock()
        mock_openai.extract_from_document.side_effect = AIQuotaExhaustedError("OpenAI quota exhausted.")

        service = AIProviderService()
        service.openai_provider = mock_openai

        with patch("app.services.ai_provider.settings.AI_PROVIDER", "openai"), \
             patch("app.services.ai_provider.settings.OPENAI_API_KEY", "sk-test-openai"), \
             patch("app.services.ai_provider.settings.GEMINI_API_KEY", ""):
            with self.assertRaises(AIQuotaExhaustedError):
                service.extract_from_document(
                    file_bytes=b"sample text",
                    file_name="report.txt",
                    file_type="text/plain",
                    document_id="doc-1"
                )

    # =========================================================================
    # 2. SERVER-SIDE AI USAGE QUOTA ENFORCEMENT
    # =========================================================================

    def test_server_side_ai_usage_limit_enforced(self):
        """
        Server tracks monthly analysis count and strictly raises 403
        AI_USAGE_LIMIT_REACHED once the quota is reached.
        """
        test_patient = "patient-limit-test-999"

        # Mock current analysis count = 3 (limit for Free plan)
        with patch.object(usage_service, "_get_analysis_count", return_value=3):
            with self.assertRaises(HTTPException) as ctx:
                usage_service.check_ai_allowance(
                    client=self.mock_client,
                    patient_id=test_patient,
                    plan="free"
                )

        self.assertEqual(ctx.exception.status_code, 403)
        self.assertEqual(ctx.exception.detail["code"], "AI_USAGE_LIMIT_REACHED")
        self.assertEqual(ctx.exception.detail["limit"], 3)
        self.assertTrue(ctx.exception.detail["upgrade_available"])

    # =========================================================================
    # 3. SUBSCRIPTIONS & RAZORPAY SIGNATURE VERIFICATION
    # =========================================================================

    def test_subscription_plans_config(self):
        """Verify Free and Premium tier pricing and limits."""
        mock_sub = MagicMock()
        mock_sub.data = {
            "patient_id": self.patient_id,
            "plan": "free",
            "status": "active",
            "billing_period_start": "2026-09-01T00:00:00Z",
            "billing_period_end": None,
        }
        self.mock_client.from_().select().eq().maybe_single().execute.return_value = mock_sub

        res = subscription_service.get_subscription_status(
            client=self.mock_client,
            patient_id=self.patient_id
        )
        self.assertEqual(len(res.tiers), 2)
        free_tier = next(t for t in res.tiers if t.id == "free")
        premium_tier = next(t for t in res.tiers if t.id == "premium")

        self.assertEqual(free_tier.price_inr, 0)
        self.assertEqual(premium_tier.price_inr, 199)

    def test_razorpay_signature_verification_and_upgrade(self):
        """
        Verify cryptographic HMAC-SHA256 signature verification in sandbox
        and successful upgrade to Premium.
        """
        order_id = "order_test_12345"
        payment_id = "pay_test_67890"
        secret = "carepath_sandbox_test_secret"

        body = f"{order_id}|{payment_id}".encode("utf-8")
        expected_sig = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()

        # Mock database upsert
        mock_upsert = MagicMock()
        mock_upsert.data = [{"plan": "premium", "status": "active"}]
        self.mock_client.from_().upsert().execute.return_value = mock_upsert

        with patch("app.services.subscription_service.settings.RAZORPAY_KEY_SECRET", secret):
            res = subscription_service.verify_payment_and_upgrade(
                client=self.mock_client,
                patient_id="patient-upgrade-test",
                razorpay_order_id=order_id,
                razorpay_payment_id=payment_id,
                razorpay_signature=expected_sig,
                plan_id="premium"
            )

        self.assertTrue(res.success)
        self.assertEqual(res.plan, "premium")
        self.assertEqual(res.status, "active")

    def test_invalid_razorpay_signature_rejected(self):
        """Verify that forged/tampered payment signatures are strictly rejected with 400."""
        with patch("app.services.subscription_service.settings.RAZORPAY_KEY_SECRET", "secret_123"):
            with self.assertRaises(HTTPException) as ctx:
                subscription_service.verify_payment_and_upgrade(
                    client=self.mock_client,
                    patient_id="patient-fake-payment",
                    razorpay_order_id="order_fake_111",
                    razorpay_payment_id="pay_fake_222",
                    razorpay_signature="invalid_tampered_signature_hex",
                    plan_id="premium"
                )

        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("Payment signature verification failed", ctx.exception.detail)

    # =========================================================================
    # 4. DEMO DATA ISOLATION & FRESH USER PURITY
    # =========================================================================

    def test_new_user_consent_sessions_empty(self):
        """
        Verify that a new user with no active consent sessions receives empty list,
        NEVER synthetic Eleanor Vance / Dr. Jenkins session.
        """
        mock_res = MagicMock()
        mock_res.data = []
        self.mock_client.from_().select().eq().execute.return_value = mock_res

        res = consent_service.get_consent_sessions(
            client=self.mock_client,
            user_id="user-fresh-999",
            patient_id="brand-new-patient-999"
        )

        self.assertEqual(len(res.sessions), 0)

    def test_new_user_family_groups_empty(self):
        """
        Verify that a new user with no family circles established receives empty list,
        NEVER synthetic Vance family circle.
        """
        mock_res = MagicMock()
        mock_res.data = []
        self.mock_client.from_().select().eq().execute.return_value = mock_res

        res = family_service.get_family_dashboard(
            client=self.mock_client,
            user_id="user-fresh-888",
            patient_id="brand-new-patient-888"
        )

        self.assertEqual(len(res.groups), 0)


if __name__ == "__main__":
    unittest.main()
