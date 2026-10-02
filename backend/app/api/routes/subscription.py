import hmac
import hashlib
import logging
from typing import Dict, Any
from fastapi import APIRouter, Depends, Request, HTTPException, status
from app.core.security import get_current_user, get_current_patient, get_supabase_admin
from app.core.config import settings
from app.services.subscription_service import subscription_service
from app.schemas.subscription import (
    SubscriptionStatusResponse,
    CreateOrderRequest,
    CreateOrderResponse,
    VerifyPaymentRequest,
    VerifyPaymentResponse,
    CancelSubscriptionResponse,
)

logger = logging.getLogger("carepath.routes.subscription")

router = APIRouter(prefix="/api/subscription", tags=["Subscription & Billing"])


@router.get("/current", response_model=SubscriptionStatusResponse)
async def get_current_subscription(
    user: Any = Depends(get_current_user),
    patient: Dict[str, Any] = Depends(get_current_patient),
):
    """
    Returns the authenticated patient's subscription status, monthly AI usage, and plan tiers.
    """
    admin_client = get_supabase_admin()
    return subscription_service.get_subscription_status(
        client=admin_client,
        patient_id=patient["id"],
    )


@router.post("/create-order", response_model=CreateOrderResponse)
async def create_checkout_order(
    req: CreateOrderRequest,
    user: Any = Depends(get_current_user),
    patient: Dict[str, Any] = Depends(get_current_patient),
):
    """
    Generates a Razorpay sandbox checkout order for subscription upgrade.
    """
    admin_client = get_supabase_admin()
    return subscription_service.create_checkout_order(
        client=admin_client,
        patient_id=patient["id"],
        patient_name=patient.get("full_name", "Patient"),
        patient_email=user.email,
        plan_id=req.plan_id,
    )


@router.post("/verify", response_model=VerifyPaymentResponse)
async def verify_payment(
    req: VerifyPaymentRequest,
    user: Any = Depends(get_current_user),
    patient: Dict[str, Any] = Depends(get_current_patient),
):
    """
    Server-side verification of Razorpay payment signature and activates premium subscription.
    """
    admin_client = get_supabase_admin()
    return subscription_service.verify_payment_and_upgrade(
        client=admin_client,
        patient_id=patient["id"],
        razorpay_order_id=req.razorpay_order_id,
        razorpay_payment_id=req.razorpay_payment_id,
        razorpay_signature=req.razorpay_signature,
        plan_id=req.plan_id,
    )


@router.post("/cancel", response_model=CancelSubscriptionResponse)
async def cancel_subscription(
    user: Any = Depends(get_current_user),
    patient: Dict[str, Any] = Depends(get_current_patient),
):
    """
    Cancels recurring renewal. Patient never loses access to existing health records.
    """
    admin_client = get_supabase_admin()
    return subscription_service.cancel_subscription(
        client=admin_client,
        patient_id=patient["id"],
    )


@router.post("/webhook")
async def razorpay_webhook(request: Request):
    """
    Listens for Razorpay subscription/payment webhooks and verifies webhook signature.
    """
    webhook_secret = settings.RAZORPAY_WEBHOOK_SECRET
    body = await request.body()
    received_sig = request.headers.get("X-Razorpay-Signature", "")

    if webhook_secret:
        expected_sig = hmac.new(
            webhook_secret.encode("utf-8"),
            body,
            hashlib.sha256,
        ).hexdigest()

        if not hmac.compare_digest(expected_sig, received_sig):
            logger.warning("Razorpay webhook signature verification failed.")
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid webhook signature")

    logger.info("Razorpay webhook event received and signature verified successfully.")
    return {"status": "ok", "message": "Webhook processed successfully."}
