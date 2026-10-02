-- ==============================================================================
-- CarePath Database Migration: Sprint 3 (Structured Clinical Health Records)
-- Tables: public.diagnoses, public.medications, public.investigations,
--         public.procedures, public.allergies, public.follow_ups,
--         public.document_extractions
-- Description: Normalized relational storage for AI-extracted clinical records
--              with source provenance (document_id, source_page, source_text)
--              and strict Row Level Security (RLS) isolating patient records.
-- ==============================================================================

-- 1. DIAGNOSES TABLE
CREATE TABLE IF NOT EXISTS public.diagnoses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    status TEXT, -- active, resolved, suspected, chronic
    date DATE,
    source_page INT,
    source_text TEXT,
    confidence_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_diagnoses_patient_id ON public.diagnoses(patient_id);
CREATE INDEX IF NOT EXISTS idx_diagnoses_document_id ON public.diagnoses(document_id);

ALTER TABLE public.diagnoses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Patients can view their own diagnoses" ON public.diagnoses;
DROP POLICY IF EXISTS "Patients can insert their own diagnoses" ON public.diagnoses;
DROP POLICY IF EXISTS "Patients can update their own diagnoses" ON public.diagnoses;
DROP POLICY IF EXISTS "Patients can delete their own diagnoses" ON public.diagnoses;

CREATE POLICY "Patients can view their own diagnoses"
    ON public.diagnoses FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.patients WHERE patients.id = diagnoses.patient_id AND patients.user_id = auth.uid()));

CREATE POLICY "Patients can insert their own diagnoses"
    ON public.diagnoses FOR INSERT TO authenticated
    WITH CHECK (EXISTS (SELECT 1 FROM public.patients WHERE patients.id = diagnoses.patient_id AND patients.user_id = auth.uid()));

CREATE POLICY "Patients can update their own diagnoses"
    ON public.diagnoses FOR UPDATE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.patients WHERE patients.id = diagnoses.patient_id AND patients.user_id = auth.uid()));

CREATE POLICY "Patients can delete their own diagnoses"
    ON public.diagnoses FOR DELETE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.patients WHERE patients.id = diagnoses.patient_id AND patients.user_id = auth.uid()));


-- 2. MEDICATIONS TABLE
CREATE TABLE IF NOT EXISTS public.medications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    dose TEXT,
    route TEXT,
    frequency TEXT,
    duration TEXT,
    instructions TEXT,
    start_date DATE,
    end_date DATE,
    source_page INT,
    source_text TEXT,
    confidence_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_medications_patient_id ON public.medications(patient_id);
CREATE INDEX IF NOT EXISTS idx_medications_document_id ON public.medications(document_id);

ALTER TABLE public.medications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Patients can view their own medications" ON public.medications;
DROP POLICY IF EXISTS "Patients can insert their own medications" ON public.medications;
DROP POLICY IF EXISTS "Patients can update their own medications" ON public.medications;
DROP POLICY IF EXISTS "Patients can delete their own medications" ON public.medications;

CREATE POLICY "Patients can view their own medications"
    ON public.medications FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.patients WHERE patients.id = medications.patient_id AND patients.user_id = auth.uid()));

CREATE POLICY "Patients can insert their own medications"
    ON public.medications FOR INSERT TO authenticated
    WITH CHECK (EXISTS (SELECT 1 FROM public.patients WHERE patients.id = medications.patient_id AND patients.user_id = auth.uid()));

CREATE POLICY "Patients can update their own medications"
    ON public.medications FOR UPDATE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.patients WHERE patients.id = medications.patient_id AND patients.user_id = auth.uid()));

CREATE POLICY "Patients can delete their own medications"
    ON public.medications FOR DELETE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.patients WHERE patients.id = medications.patient_id AND patients.user_id = auth.uid()));


-- 3. INVESTIGATIONS TABLE
CREATE TABLE IF NOT EXISTS public.investigations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    date DATE,
    result TEXT,
    unit TEXT,
    reference_range TEXT,
    abnormal_flag BOOLEAN DEFAULT false,
    source_page INT,
    source_text TEXT,
    confidence_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_investigations_patient_id ON public.investigations(patient_id);
CREATE INDEX IF NOT EXISTS idx_investigations_document_id ON public.investigations(document_id);

ALTER TABLE public.investigations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Patients can view their own investigations" ON public.investigations;
DROP POLICY IF EXISTS "Patients can insert their own investigations" ON public.investigations;
DROP POLICY IF EXISTS "Patients can update their own investigations" ON public.investigations;
DROP POLICY IF EXISTS "Patients can delete their own investigations" ON public.investigations;

CREATE POLICY "Patients can view their own investigations"
    ON public.investigations FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.patients WHERE patients.id = investigations.patient_id AND patients.user_id = auth.uid()));

CREATE POLICY "Patients can insert their own investigations"
    ON public.investigations FOR INSERT TO authenticated
    WITH CHECK (EXISTS (SELECT 1 FROM public.patients WHERE patients.id = investigations.patient_id AND patients.user_id = auth.uid()));

CREATE POLICY "Patients can update their own investigations"
    ON public.investigations FOR UPDATE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.patients WHERE patients.id = investigations.patient_id AND patients.user_id = auth.uid()));

CREATE POLICY "Patients can delete their own investigations"
    ON public.investigations FOR DELETE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.patients WHERE patients.id = investigations.patient_id AND patients.user_id = auth.uid()));


-- 4. PROCEDURES TABLE
CREATE TABLE IF NOT EXISTS public.procedures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    date DATE,
    details TEXT,
    source_page INT,
    source_text TEXT,
    confidence_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_procedures_patient_id ON public.procedures(patient_id);
CREATE INDEX IF NOT EXISTS idx_procedures_document_id ON public.procedures(document_id);

ALTER TABLE public.procedures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Patients can view their own procedures" ON public.procedures;
DROP POLICY IF EXISTS "Patients can insert their own procedures" ON public.procedures;
DROP POLICY IF EXISTS "Patients can update their own procedures" ON public.procedures;
DROP POLICY IF EXISTS "Patients can delete their own procedures" ON public.procedures;

CREATE POLICY "Patients can view their own procedures"
    ON public.procedures FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.patients WHERE patients.id = procedures.patient_id AND patients.user_id = auth.uid()));

CREATE POLICY "Patients can insert their own procedures"
    ON public.procedures FOR INSERT TO authenticated
    WITH CHECK (EXISTS (SELECT 1 FROM public.patients WHERE patients.id = procedures.patient_id AND patients.user_id = auth.uid()));

CREATE POLICY "Patients can update their own procedures"
    ON public.procedures FOR UPDATE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.patients WHERE patients.id = procedures.patient_id AND patients.user_id = auth.uid()));

CREATE POLICY "Patients can delete their own procedures"
    ON public.procedures FOR DELETE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.patients WHERE patients.id = procedures.patient_id AND patients.user_id = auth.uid()));


-- 5. ALLERGIES TABLE
CREATE TABLE IF NOT EXISTS public.allergies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
    substance TEXT NOT NULL,
    reaction TEXT,
    severity TEXT, -- mild, moderate, severe, life-threatening
    source_page INT,
    source_text TEXT,
    confidence_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_allergies_patient_id ON public.allergies(patient_id);
CREATE INDEX IF NOT EXISTS idx_allergies_document_id ON public.allergies(document_id);

ALTER TABLE public.allergies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Patients can view their own allergies" ON public.allergies;
DROP POLICY IF EXISTS "Patients can insert their own allergies" ON public.allergies;
DROP POLICY IF EXISTS "Patients can update their own allergies" ON public.allergies;
DROP POLICY IF EXISTS "Patients can delete their own allergies" ON public.allergies;

CREATE POLICY "Patients can view their own allergies"
    ON public.allergies FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.patients WHERE patients.id = allergies.patient_id AND patients.user_id = auth.uid()));

CREATE POLICY "Patients can insert their own allergies"
    ON public.allergies FOR INSERT TO authenticated
    WITH CHECK (EXISTS (SELECT 1 FROM public.patients WHERE patients.id = allergies.patient_id AND patients.user_id = auth.uid()));

CREATE POLICY "Patients can update their own allergies"
    ON public.allergies FOR UPDATE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.patients WHERE patients.id = allergies.patient_id AND patients.user_id = auth.uid()));

CREATE POLICY "Patients can delete their own allergies"
    ON public.allergies FOR DELETE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.patients WHERE patients.id = allergies.patient_id AND patients.user_id = auth.uid()));


-- 6. FOLLOW-UPS TABLE
CREATE TABLE IF NOT EXISTS public.follow_ups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    confirmed_date DATE,
    relative_time TEXT, -- e.g., "3 months", "2 weeks" (never guessed/inferred by AI)
    source_page INT,
    source_text TEXT,
    confidence_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_follow_ups_patient_id ON public.follow_ups(patient_id);
CREATE INDEX IF NOT EXISTS idx_follow_ups_document_id ON public.follow_ups(document_id);

ALTER TABLE public.follow_ups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Patients can view their own follow_ups" ON public.follow_ups;
DROP POLICY IF EXISTS "Patients can insert their own follow_ups" ON public.follow_ups;
DROP POLICY IF EXISTS "Patients can update their own follow_ups" ON public.follow_ups;
DROP POLICY IF EXISTS "Patients can delete their own follow_ups" ON public.follow_ups;

CREATE POLICY "Patients can view their own follow_ups"
    ON public.follow_ups FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.patients WHERE patients.id = follow_ups.patient_id AND patients.user_id = auth.uid()));

CREATE POLICY "Patients can insert their own follow_ups"
    ON public.follow_ups FOR INSERT TO authenticated
    WITH CHECK (EXISTS (SELECT 1 FROM public.patients WHERE patients.id = follow_ups.patient_id AND patients.user_id = auth.uid()));

CREATE POLICY "Patients can update their own follow_ups"
    ON public.follow_ups FOR UPDATE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.patients WHERE patients.id = follow_ups.patient_id AND patients.user_id = auth.uid()));

CREATE POLICY "Patients can delete their own follow_ups"
    ON public.follow_ups FOR DELETE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.patients WHERE patients.id = follow_ups.patient_id AND patients.user_id = auth.uid()));


-- 7. DOCUMENT EXTRACTIONS SUMMARY TABLE (Cached structured JSON payload)
CREATE TABLE IF NOT EXISTS public.document_extractions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    document_id UUID NOT NULL UNIQUE REFERENCES public.documents(id) ON DELETE CASCADE,
    document_type TEXT,
    document_date TEXT,
    provider_name TEXT,
    patient_name_as_written TEXT,
    clinical_notes TEXT,
    confidence_notes TEXT,
    raw_extraction JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_document_extractions_patient_id ON public.document_extractions(patient_id);
CREATE INDEX IF NOT EXISTS idx_document_extractions_document_id ON public.document_extractions(document_id);

ALTER TABLE public.document_extractions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Patients can view their own extractions" ON public.document_extractions;
DROP POLICY IF EXISTS "Patients can insert their own extractions" ON public.document_extractions;
DROP POLICY IF EXISTS "Patients can update their own extractions" ON public.document_extractions;
DROP POLICY IF EXISTS "Patients can delete their own extractions" ON public.document_extractions;

CREATE POLICY "Patients can view their own extractions"
    ON public.document_extractions FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.patients WHERE patients.id = document_extractions.patient_id AND patients.user_id = auth.uid()));

CREATE POLICY "Patients can insert their own extractions"
    ON public.document_extractions FOR INSERT TO authenticated
    WITH CHECK (EXISTS (SELECT 1 FROM public.patients WHERE patients.id = document_extractions.patient_id AND patients.user_id = auth.uid()));

CREATE POLICY "Patients can update their own extractions"
    ON public.document_extractions FOR UPDATE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.patients WHERE patients.id = document_extractions.patient_id AND patients.user_id = auth.uid()));

CREATE POLICY "Patients can delete their own extractions"
    ON public.document_extractions FOR DELETE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.patients WHERE patients.id = document_extractions.patient_id AND patients.user_id = auth.uid()));
