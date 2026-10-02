from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


class PlanFeature(BaseModel):
    title: str
    included: bool
    detail: Optional[str] = None


class PlanTier(BaseModel):
    id: str  # 'free', 'premium'
    name: str  # 'Free Journey', 'Premium Intelligence'
    price_inr: int  # 0, 199
    billing_interval: str  # 'month'
    description: str
    is_current: bool = False
    badge: Optional[str] = None
    features: List[PlanFeature]


class SubscriptionStatusResponse(BaseModel):
    patient_id: str
    plan: str  # 'free', 'premium', 'trial', 'cancelled', 'expired'
    status: str  # 'active', 'past_due', 'cancelled', 'expired'
    billing_period_start: str
    billing_period_end: Optional[str] = None
    ai_analyses_used: int
    ai_analyses_limit: int
    ai_analyses_remaining: int
    documents_limit: int
    upgrade_available: bool
    tiers: List[PlanTier]


class CreateOrderRequest(BaseModel):
    plan_id: str = Field(default="premium", description="Target plan to purchase (e.g. 'premium')")


class CreateOrderResponse(BaseModel):
    order_id: str
    amount: int  # in paise (e.g. 19900)
    currency: str = "INR"
    key_id: str
    plan_id: str
    patient_name: str
    patient_email: Optional[str] = None


class VerifyPaymentRequest(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str
    plan_id: str = "premium"


class VerifyPaymentResponse(BaseModel):
    success: bool
    plan: str
    status: str
    message: str
    billing_period_end: Optional[str] = None


class CancelSubscriptionResponse(BaseModel):
    success: bool
    plan: str
    status: str
    message: str
