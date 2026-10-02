-- ==============================================================================
-- CarePath Database Migration: Sprint 4 (Cross-Document Information Mismatches)
-- Table: public.cross_document_mismatches
-- Description: Stores detected cross-document potential information mismatches
--              with bidirectional source provenance and strict Row Level Security.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.cross_document_mismatches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    category TEXT NOT NULL, -- medication, investigation, procedure, anatomical_site, follow_up
    title TEXT NOT NULL,
    field_name TEXT NOT NULL,
    source_a_document_id UUID REFERENCES public.documents(id) ON DELETE CASCADE,
    source_a_page INT,
    source_a_text TEXT,
    source_a_value TEXT NOT NULL,
    source_b_document_id UUID REFERENCES public.documents(id) ON DELETE CASCADE,
    source_b_page INT,
    source_b_text TEXT,
    source_b_value TEXT NOT NULL,
    explanation TEXT NOT NULL,
    verification_message TEXT NOT NULL DEFAULT 'Potential Information Mismatch — Verify against original source.',
    status TEXT NOT NULL DEFAULT 'flagged', -- flagged, verified, dismissed
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_mismatches_patient_id ON public.cross_document_mismatches(patient_id);
CREATE INDEX IF NOT EXISTS idx_mismatches_source_a ON public.cross_document_mismatches(source_a_document_id);
CREATE INDEX IF NOT EXISTS idx_mismatches_source_b ON public.cross_document_mismatches(source_b_document_id);

ALTER TABLE public.cross_document_mismatches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Patients can view their own mismatches" ON public.cross_document_mismatches;
DROP POLICY IF EXISTS "Patients can insert their own mismatches" ON public.cross_document_mismatches;
DROP POLICY IF EXISTS "Patients can update their own mismatches" ON public.cross_document_mismatches;
DROP POLICY IF EXISTS "Patients can delete their own mismatches" ON public.cross_document_mismatches;

CREATE POLICY "Patients can view their own mismatches"
    ON public.cross_document_mismatches FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.patients 
        WHERE patients.id = cross_document_mismatches.patient_id 
          AND patients.user_id = auth.uid()
    ));

CREATE POLICY "Patients can insert their own mismatches"
    ON public.cross_document_mismatches FOR INSERT TO authenticated
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.patients 
        WHERE patients.id = cross_document_mismatches.patient_id 
          AND patients.user_id = auth.uid()
    ));

CREATE POLICY "Patients can update their own mismatches"
    ON public.cross_document_mismatches FOR UPDATE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.patients 
        WHERE patients.id = cross_document_mismatches.patient_id 
          AND patients.user_id = auth.uid()
    ));

CREATE POLICY "Patients can delete their own mismatches"
    ON public.cross_document_mismatches FOR DELETE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.patients 
        WHERE patients.id = cross_document_mismatches.patient_id 
          AND patients.user_id = auth.uid()
    ));
