-- ==============================================================================
-- CarePath Database Migration: Sprint 6 (Subscriptions, Payment & AI Usage Limits)
-- Tables: public.subscriptions, public.ai_usage
-- Description: Server-side tracking of freemium/premium plans, payment status,
--              and monthly AI analysis usage quotas per patient.
-- Security: Row Level Security (RLS) strictly enforced with default-deny semantics.
-- ==============================================================================

-- 1. SUBSCRIPTIONS TABLE
CREATE TABLE IF NOT EXISTS public.subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'premium', 'trial', 'cancelled', 'expired')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'past_due', 'cancelled', 'expired')),
    billing_period_start TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    billing_period_end TIMESTAMPTZ,
    provider TEXT DEFAULT 'razorpay',
    provider_subscription_id TEXT,
    provider_order_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_patient_subscription UNIQUE (patient_id)
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_patient_id ON public.subscriptions(patient_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Patients can view their own subscription" ON public.subscriptions;
CREATE POLICY "Patients can view their own subscription"
    ON public.subscriptions FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.patients p
            WHERE p.id = subscriptions.patient_id
              AND p.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Service role can manage subscriptions" ON public.subscriptions;
CREATE POLICY "Service role can manage subscriptions"
    ON public.subscriptions FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);


-- 2. AI USAGE LIMITS TABLE
CREATE TABLE IF NOT EXISTS public.ai_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    billing_period TEXT NOT NULL, -- e.g. '2026-09'
    analysis_count INT NOT NULL DEFAULT 0,
    successful_analyses INT NOT NULL DEFAULT 0,
    provider TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_patient_period UNIQUE (patient_id, billing_period)
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_patient_period ON public.ai_usage(patient_id, billing_period);

ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Patients can view their own AI usage" ON public.ai_usage;
CREATE POLICY "Patients can view their own AI usage"
    ON public.ai_usage FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.patients p
            WHERE p.id = ai_usage.patient_id
              AND p.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Service role can manage AI usage" ON public.ai_usage;
CREATE POLICY "Service role can manage AI usage"
    ON public.ai_usage FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);
