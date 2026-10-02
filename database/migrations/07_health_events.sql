-- ==============================================================================
-- CarePath Database Migration: Sprint 7 (Health Events & Calendar Fix)
-- Table: public.health_events
-- Description: Grounded patient healthcare events (visits, tests, medications,
--              procedures, follow-ups) separated from document upload timestamps.
-- Security: Row Level Security (RLS) strictly enforced for patient and family access.
-- ==============================================================================

-- 1. Create health_events table
CREATE TABLE IF NOT EXISTS public.health_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    document_id UUID NULL REFERENCES public.documents(id) ON DELETE SET NULL,
    event_date DATE NOT NULL,
    event_type TEXT NOT NULL,
    title TEXT NOT NULL,
    doctor_name TEXT NULL,
    clinic_name TEXT NULL,
    location TEXT NULL,
    description TEXT NULL,
    status TEXT NOT NULL DEFAULT 'completed',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT chk_health_events_event_type CHECK (event_type IN ('visit', 'test', 'medication', 'procedure', 'follow_up')),
    CONSTRAINT chk_health_events_status CHECK (status IN ('completed', 'planned'))
);

-- 2. Performance indexes
CREATE INDEX IF NOT EXISTS idx_health_events_patient_date ON public.health_events(patient_id, event_date);
CREATE INDEX IF NOT EXISTS idx_health_events_document_id ON public.health_events(document_id);

-- 3. Enable Row Level Security
ALTER TABLE public.health_events ENABLE ROW LEVEL SECURITY;

-- 4. Clean up existing policies if any
DROP POLICY IF EXISTS "Patients can view their own health events" ON public.health_events;
DROP POLICY IF EXISTS "Patients can insert their own health events" ON public.health_events;
DROP POLICY IF EXISTS "Patients can update their own health events" ON public.health_events;
DROP POLICY IF EXISTS "Patients can delete their own health events" ON public.health_events;
DROP POLICY IF EXISTS "Authorized family members can view health events" ON public.health_events;

-- 5. Strict RLS Policies for public.health_events
-- Ownership path: auth.uid() -> public.patients.user_id -> public.patients.id -> public.health_events.patient_id

-- SELECT: Patients can view ONLY their own health events
CREATE POLICY "Patients can view their own health events"
    ON public.health_events
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.patients
            WHERE patients.id = health_events.patient_id
              AND patients.user_id = auth.uid()
        )
    );

-- INSERT: Patients can insert ONLY their own health events
CREATE POLICY "Patients can insert their own health events"
    ON public.health_events
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.patients
            WHERE patients.id = health_events.patient_id
              AND patients.user_id = auth.uid()
        )
    );

-- UPDATE: Patients can update ONLY their own health events
CREATE POLICY "Patients can update their own health events"
    ON public.health_events
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.patients
            WHERE patients.id = health_events.patient_id
              AND patients.user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.patients
            WHERE patients.id = health_events.patient_id
              AND patients.user_id = auth.uid()
        )
    );

-- DELETE: Patients can delete ONLY their own health events
CREATE POLICY "Patients can delete their own health events"
    ON public.health_events
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.patients
            WHERE patients.id = health_events.patient_id
              AND patients.user_id = auth.uid()
        )
    );

-- Family access: Authorized family members can view health events if can_view_records is active
CREATE POLICY "Authorized family members can view health events"
    ON public.health_events
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.family_memberships fm
            JOIN public.family_groups fg ON fg.id = fm.family_group_id
            JOIN public.family_memberships my_fm ON my_fm.family_group_id = fg.id
            JOIN public.patients my_p ON my_p.id = my_fm.patient_id
            WHERE fm.patient_id = health_events.patient_id
              AND fm.can_view_records = true
              AND fm.access_status = 'active'
              AND my_p.user_id = auth.uid()
        )
    );
