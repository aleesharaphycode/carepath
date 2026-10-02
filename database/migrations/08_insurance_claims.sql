-- ==============================================================================
-- CarePath Database Migration: Sprint 8 (AI Insurance Claim Assistant)
-- Tables: public.insurance_claims, public.insurance_claim_items
-- Description: Insurance claim preparation assistant with deterministic checklist
--              document matching and strict Row Level Security (RLS).
-- ==============================================================================

-- 1. Create insurance_claims table
CREATE TABLE IF NOT EXISTS public.insurance_claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    insurance_provider TEXT NOT NULL,
    claim_type TEXT NOT NULL DEFAULT 'hospitalization',
    hospital_name TEXT NOT NULL,
    admission_date DATE NOT NULL,
    discharge_date DATE NOT NULL,
    claim_amount NUMERIC(12, 2),
    policy_number TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT chk_claim_dates CHECK (discharge_date >= admission_date)
);

-- 2. Create insurance_claim_items table
CREATE TABLE IF NOT EXISTS public.insurance_claim_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id UUID NOT NULL REFERENCES public.insurance_claims(id) ON DELETE CASCADE,
    requirement TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'missing',
    matched_document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
    explanation TEXT,
    confidence_score NUMERIC(3, 2) DEFAULT 1.0,
    evidence JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT chk_claim_item_status CHECK (status IN ('found', 'needs_verification', 'missing'))
);

-- Ensure column exists if table was previously created without it
ALTER TABLE public.insurance_claim_items ADD COLUMN IF NOT EXISTS evidence JSONB DEFAULT '{}'::jsonb;

-- 3. Indexes for high performance queries
CREATE INDEX IF NOT EXISTS idx_insurance_claims_patient_id ON public.insurance_claims(patient_id);
CREATE INDEX IF NOT EXISTS idx_insurance_claims_created_at ON public.insurance_claims(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_insurance_claim_items_claim_id ON public.insurance_claim_items(claim_id);
CREATE INDEX IF NOT EXISTS idx_insurance_claim_items_status ON public.insurance_claim_items(status);
CREATE INDEX IF NOT EXISTS idx_insurance_claim_items_matched_doc ON public.insurance_claim_items(matched_document_id);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.insurance_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insurance_claim_items ENABLE ROW LEVEL SECURITY;

-- 5. Drop existing policies if any
DROP POLICY IF EXISTS "Patients can view their own insurance claims" ON public.insurance_claims;
DROP POLICY IF EXISTS "Patients can insert their own insurance claims" ON public.insurance_claims;
DROP POLICY IF EXISTS "Patients can update their own insurance claims" ON public.insurance_claims;
DROP POLICY IF EXISTS "Patients can delete their own insurance claims" ON public.insurance_claims;

DROP POLICY IF EXISTS "Patients can view their own claim items" ON public.insurance_claim_items;
DROP POLICY IF EXISTS "Patients can insert their own claim items" ON public.insurance_claim_items;
DROP POLICY IF EXISTS "Patients can update their own claim items" ON public.insurance_claim_items;
DROP POLICY IF EXISTS "Patients can delete their own claim items" ON public.insurance_claim_items;

-- 6. Strict RLS Policies for public.insurance_claims
-- Ownership: auth.uid() -> public.patients.user_id -> public.patients.id -> public.insurance_claims.patient_id

CREATE POLICY "Patients can view their own insurance claims"
    ON public.insurance_claims FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.patients WHERE patients.id = insurance_claims.patient_id AND patients.user_id = auth.uid()));

CREATE POLICY "Patients can insert their own insurance claims"
    ON public.insurance_claims FOR INSERT TO authenticated
    WITH CHECK (EXISTS (SELECT 1 FROM public.patients WHERE patients.id = insurance_claims.patient_id AND patients.user_id = auth.uid()));

CREATE POLICY "Patients can update their own insurance claims"
    ON public.insurance_claims FOR UPDATE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.patients WHERE patients.id = insurance_claims.patient_id AND patients.user_id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM public.patients WHERE patients.id = insurance_claims.patient_id AND patients.user_id = auth.uid()));

CREATE POLICY "Patients can delete their own insurance claims"
    ON public.insurance_claims FOR DELETE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.patients WHERE patients.id = insurance_claims.patient_id AND patients.user_id = auth.uid()));

-- 7. Strict RLS Policies for public.insurance_claim_items
-- Ownership: auth.uid() -> public.patients.user_id -> public.insurance_claims -> public.insurance_claim_items

CREATE POLICY "Patients can view their own claim items"
    ON public.insurance_claim_items FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.insurance_claims
        JOIN public.patients ON patients.id = insurance_claims.patient_id
        WHERE insurance_claims.id = insurance_claim_items.claim_id
          AND patients.user_id = auth.uid()
    ));

CREATE POLICY "Patients can insert their own claim items"
    ON public.insurance_claim_items FOR INSERT TO authenticated
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.insurance_claims
        JOIN public.patients ON patients.id = insurance_claims.patient_id
        WHERE insurance_claims.id = insurance_claim_items.claim_id
          AND patients.user_id = auth.uid()
    ));

CREATE POLICY "Patients can update their own claim items"
    ON public.insurance_claim_items FOR UPDATE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.insurance_claims
        JOIN public.patients ON patients.id = insurance_claims.patient_id
        WHERE insurance_claims.id = insurance_claim_items.claim_id
          AND patients.user_id = auth.uid()
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.insurance_claims
        JOIN public.patients ON patients.id = insurance_claims.patient_id
        WHERE insurance_claims.id = insurance_claim_items.claim_id
          AND patients.user_id = auth.uid()
    ));

CREATE POLICY "Patients can delete their own claim items"
    ON public.insurance_claim_items FOR DELETE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.insurance_claims
        JOIN public.patients ON patients.id = insurance_claims.patient_id
        WHERE insurance_claims.id = insurance_claim_items.claim_id
          AND patients.user_id = auth.uid()
    ));
