-- ==============================================================================
-- CarePath Database Migration: Sprint 5 (Family Dashboard, Consent & QR Access)
-- Tables: public.family_groups, public.family_memberships,
--         public.consent_sessions, public.access_audit_logs
-- Description: Patient-controlled family records isolation, temporary doctor
--              consent sessions with cryptographic tokens, and immutable audit logs.
-- Security: Row Level Security (RLS) strictly enforced with default-deny semantics.
-- ==============================================================================

-- 0. SCHEMA ENHANCEMENT FOR DEPENDENT FAMILY PROFILES
-- Allow dependent family members (e.g. children, elderly parents) who do not have an independent auth.users account yet
ALTER TABLE public.patients ALTER COLUMN user_id DROP NOT NULL;

-- Allow family group owners and authorized members to view dependent patient profiles
DROP POLICY IF EXISTS "Users can view family group patients" ON public.patients;
CREATE POLICY "Users can view family group patients"
    ON public.patients FOR SELECT TO authenticated
    USING (
        user_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.family_memberships fm
            JOIN public.family_groups fg ON fg.id = fm.family_group_id
            WHERE fm.patient_id = patients.id
              AND (
                  fg.created_by = auth.uid() OR
                  EXISTS (
                      SELECT 1 FROM public.family_memberships my_fm
                      JOIN public.patients my_p ON my_p.id = my_fm.patient_id
                      WHERE my_fm.family_group_id = fg.id AND my_p.user_id = auth.uid()
                  )
              )
        )
    );


-- 1. FAMILY GROUPS TABLE
CREATE TABLE IF NOT EXISTS public.family_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_family_groups_created_by ON public.family_groups(created_by);

ALTER TABLE public.family_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view family groups they created or belong to" ON public.family_groups;
DROP POLICY IF EXISTS "Users can create family groups" ON public.family_groups;
DROP POLICY IF EXISTS "Users can update family groups they created" ON public.family_groups;
DROP POLICY IF EXISTS "Users can delete family groups they created" ON public.family_groups;

CREATE POLICY "Users can view family groups they created or belong to"
    ON public.family_groups FOR SELECT TO authenticated
    USING (
        created_by = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.family_memberships fm
            JOIN public.patients p ON p.id = fm.patient_id
            WHERE fm.family_group_id = family_groups.id
              AND p.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can create family groups"
    ON public.family_groups FOR INSERT TO authenticated
    WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can update family groups they created"
    ON public.family_groups FOR UPDATE TO authenticated
    USING (created_by = auth.uid())
    WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can delete family groups they created"
    ON public.family_groups FOR DELETE TO authenticated
    USING (created_by = auth.uid());


-- 2. FAMILY MEMBERSHIPS TABLE
-- Each family member retains their own separate patient identity and records.
CREATE TABLE IF NOT EXISTS public.family_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_group_id UUID NOT NULL REFERENCES public.family_groups(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    relationship TEXT NOT NULL, -- e.g. 'Spouse', 'Child', 'Parent', 'Sibling', 'Guardian', 'Other'
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
    can_view_records BOOLEAN NOT NULL DEFAULT false, -- Explicit authorization required!
    access_status TEXT NOT NULL DEFAULT 'active' CHECK (access_status IN ('active', 'pending', 'revoked')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_family_group_patient UNIQUE (family_group_id, patient_id)
);

CREATE INDEX IF NOT EXISTS idx_family_memberships_group ON public.family_memberships(family_group_id);
CREATE INDEX IF NOT EXISTS idx_family_memberships_patient ON public.family_memberships(patient_id);

ALTER TABLE public.family_memberships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view family memberships for their groups" ON public.family_memberships;
DROP POLICY IF EXISTS "Group creators and patients can insert memberships" ON public.family_memberships;
DROP POLICY IF EXISTS "Group creators and patients can update memberships" ON public.family_memberships;
DROP POLICY IF EXISTS "Group creators and patients can delete memberships" ON public.family_memberships;

CREATE POLICY "Users can view family memberships for their groups"
    ON public.family_memberships FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.family_groups fg
            WHERE fg.id = family_memberships.family_group_id
              AND fg.created_by = auth.uid()
        ) OR
        EXISTS (
            SELECT 1 FROM public.patients p
            WHERE p.id = family_memberships.patient_id
              AND p.user_id = auth.uid()
        )
    );

CREATE POLICY "Group creators and patients can insert memberships"
    ON public.family_memberships FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.family_groups fg
            WHERE fg.id = family_memberships.family_group_id
              AND fg.created_by = auth.uid()
        ) OR
        EXISTS (
            SELECT 1 FROM public.patients p
            WHERE p.id = family_memberships.patient_id
              AND p.user_id = auth.uid()
        )
    );

CREATE POLICY "Group creators and patients can update memberships"
    ON public.family_memberships FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.family_groups fg
            WHERE fg.id = family_memberships.family_group_id
              AND fg.created_by = auth.uid()
        ) OR
        EXISTS (
            SELECT 1 FROM public.patients p
            WHERE p.id = family_memberships.patient_id
              AND p.user_id = auth.uid()
        )
    );

CREATE POLICY "Group creators and patients can delete memberships"
    ON public.family_memberships FOR DELETE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.family_groups fg
            WHERE fg.id = family_memberships.family_group_id
              AND fg.created_by = auth.uid()
        ) OR
        EXISTS (
            SELECT 1 FROM public.patients p
            WHERE p.id = family_memberships.patient_id
              AND p.user_id = auth.uid()
        )
    );


-- 3. CONSENT SESSIONS TABLE (Temporary QR Doctor Access)
CREATE TABLE IF NOT EXISTS public.consent_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    recipient_name TEXT NOT NULL DEFAULT 'Attending Physician',
    access_token TEXT NOT NULL UNIQUE,
    scope JSONB NOT NULL DEFAULT '["timeline", "diagnoses", "medications", "investigations"]'::jsonb,
    duration_minutes INT NOT NULL DEFAULT 60,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired')),
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_consent_sessions_patient_id ON public.consent_sessions(patient_id);
CREATE INDEX IF NOT EXISTS idx_consent_sessions_token ON public.consent_sessions(access_token);
CREATE INDEX IF NOT EXISTS idx_consent_sessions_status ON public.consent_sessions(status);
CREATE INDEX IF NOT EXISTS idx_consent_sessions_expires_at ON public.consent_sessions(expires_at);

ALTER TABLE public.consent_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Patients can view their own consent sessions" ON public.consent_sessions;
DROP POLICY IF EXISTS "Patients can create their own consent sessions" ON public.consent_sessions;
DROP POLICY IF EXISTS "Patients can update/revoke their own consent sessions" ON public.consent_sessions;
DROP POLICY IF EXISTS "Patients can delete their own consent sessions" ON public.consent_sessions;

CREATE POLICY "Patients can view their own consent sessions"
    ON public.consent_sessions FOR SELECT TO authenticated
    USING (
        created_by = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.patients p
            WHERE p.id = consent_sessions.patient_id
              AND p.user_id = auth.uid()
        )
    );

CREATE POLICY "Patients can create their own consent sessions"
    ON public.consent_sessions FOR INSERT TO authenticated
    WITH CHECK (
        created_by = auth.uid() AND
        EXISTS (
            SELECT 1 FROM public.patients p
            WHERE p.id = consent_sessions.patient_id
              AND p.user_id = auth.uid()
        )
    );

CREATE POLICY "Patients can update/revoke their own consent sessions"
    ON public.consent_sessions FOR UPDATE TO authenticated
    USING (created_by = auth.uid());

CREATE POLICY "Patients can delete their own consent sessions"
    ON public.consent_sessions FOR DELETE TO authenticated
    USING (created_by = auth.uid());


-- 4. ACCESS AUDIT LOGS TABLE
-- Immutable append-only audit trail. Medical records are never stored in audit logs.
CREATE TABLE IF NOT EXISTS public.access_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES public.consent_sessions(id) ON DELETE SET NULL,
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    actor TEXT NOT NULL, -- 'patient', 'doctor', 'system'
    action TEXT NOT NULL, -- 'consent_created', 'qr_accessed', 'records_viewed', 'consent_revoked', 'access_denied', 'session_expired'
    details TEXT NOT NULL, -- High-level factual narrative (NO raw clinical records)
    ip_address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_patient_id ON public.access_audit_logs(patient_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_session_id ON public.access_audit_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.access_audit_logs(created_at DESC);

ALTER TABLE public.access_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Patients can view audit logs for their profile" ON public.access_audit_logs;
DROP POLICY IF EXISTS "Authenticated users can insert audit logs for their profile" ON public.access_audit_logs;

-- SELECT: Patients can view only audit events pertaining to their own profile
CREATE POLICY "Patients can view audit logs for their profile"
    ON public.access_audit_logs FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.patients p
            WHERE p.id = access_audit_logs.patient_id
              AND p.user_id = auth.uid()
        )
    );

-- INSERT: Only audit logs for the authenticated patient's profile can be inserted
CREATE POLICY "Authenticated users can insert audit logs for their profile"
    ON public.access_audit_logs FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.patients p
            WHERE p.id = access_audit_logs.patient_id
              AND p.user_id = auth.uid()
        )
    );

-- Note: No UPDATE or DELETE policies are granted to anyone.
-- The audit log is strictly immutable and append-only.


-- 5. FAMILY AUTHORIZED CLINICAL RECORDS VIEWING POLICIES
-- Allows an authenticated patient to view a family member's records ONLY IF
-- can_view_records = true AND access_status = 'active' in family_memberships.

DROP POLICY IF EXISTS "Authorized family members can view diagnoses" ON public.diagnoses;
DROP POLICY IF EXISTS "Authorized family members can view medications" ON public.medications;
DROP POLICY IF EXISTS "Authorized family members can view investigations" ON public.investigations;
DROP POLICY IF EXISTS "Authorized family members can view procedures" ON public.procedures;
DROP POLICY IF EXISTS "Authorized family members can view follow_ups" ON public.follow_ups;
DROP POLICY IF EXISTS "Authorized family members can view documents" ON public.documents;
DROP POLICY IF EXISTS "Authorized family members can view allergies" ON public.allergies;
DROP POLICY IF EXISTS "Authorized family members can view mismatches" ON public.cross_document_mismatches;

-- Diagnoses
CREATE POLICY "Authorized family members can view diagnoses"
    ON public.diagnoses FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.family_memberships fm
            JOIN public.family_groups fg ON fg.id = fm.family_group_id
            JOIN public.family_memberships my_fm ON my_fm.family_group_id = fg.id
            JOIN public.patients my_p ON my_p.id = my_fm.patient_id
            WHERE fm.patient_id = diagnoses.patient_id
              AND fm.can_view_records = true
              AND fm.access_status = 'active'
              AND my_p.user_id = auth.uid()
        )
    );

-- Medications
CREATE POLICY "Authorized family members can view medications"
    ON public.medications FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.family_memberships fm
            JOIN public.family_groups fg ON fg.id = fm.family_group_id
            JOIN public.family_memberships my_fm ON my_fm.family_group_id = fg.id
            JOIN public.patients my_p ON my_p.id = my_fm.patient_id
            WHERE fm.patient_id = medications.patient_id
              AND fm.can_view_records = true
              AND fm.access_status = 'active'
              AND my_p.user_id = auth.uid()
        )
    );

-- Investigations
CREATE POLICY "Authorized family members can view investigations"
    ON public.investigations FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.family_memberships fm
            JOIN public.family_groups fg ON fg.id = fm.family_group_id
            JOIN public.family_memberships my_fm ON my_fm.family_group_id = fg.id
            JOIN public.patients my_p ON my_p.id = my_fm.patient_id
            WHERE fm.patient_id = investigations.patient_id
              AND fm.can_view_records = true
              AND fm.access_status = 'active'
              AND my_p.user_id = auth.uid()
        )
    );

-- Procedures
CREATE POLICY "Authorized family members can view procedures"
    ON public.procedures FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.family_memberships fm
            JOIN public.family_groups fg ON fg.id = fm.family_group_id
            JOIN public.family_memberships my_fm ON my_fm.family_group_id = fg.id
            JOIN public.patients my_p ON my_p.id = my_fm.patient_id
            WHERE fm.patient_id = procedures.patient_id
              AND fm.can_view_records = true
              AND fm.access_status = 'active'
              AND my_p.user_id = auth.uid()
        )
    );

-- Follow-ups
CREATE POLICY "Authorized family members can view follow_ups"
    ON public.follow_ups FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.family_memberships fm
            JOIN public.family_groups fg ON fg.id = fm.family_group_id
            JOIN public.family_memberships my_fm ON my_fm.family_group_id = fg.id
            JOIN public.patients my_p ON my_p.id = my_fm.patient_id
            WHERE fm.patient_id = follow_ups.patient_id
              AND fm.can_view_records = true
              AND fm.access_status = 'active'
              AND my_p.user_id = auth.uid()
        )
    );

-- Documents
CREATE POLICY "Authorized family members can view documents"
    ON public.documents FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.family_memberships fm
            JOIN public.family_groups fg ON fg.id = fm.family_group_id
            JOIN public.family_memberships my_fm ON my_fm.family_group_id = fg.id
            JOIN public.patients my_p ON my_p.id = my_fm.patient_id
            WHERE fm.patient_id = documents.patient_id
              AND fm.can_view_records = true
              AND fm.access_status = 'active'
              AND my_p.user_id = auth.uid()
        )
    );

-- Allergies
CREATE POLICY "Authorized family members can view allergies"
    ON public.allergies FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.family_memberships fm
            JOIN public.family_groups fg ON fg.id = fm.family_group_id
            JOIN public.family_memberships my_fm ON my_fm.family_group_id = fg.id
            JOIN public.patients my_p ON my_p.id = my_fm.patient_id
            WHERE fm.patient_id = allergies.patient_id
              AND fm.can_view_records = true
              AND fm.access_status = 'active'
              AND my_p.user_id = auth.uid()
        )
    );

-- Cross Document Mismatches
CREATE POLICY "Authorized family members can view mismatches"
    ON public.cross_document_mismatches FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.family_memberships fm
            JOIN public.family_groups fg ON fg.id = fm.family_group_id
            JOIN public.family_memberships my_fm ON my_fm.family_group_id = fg.id
            JOIN public.patients my_p ON my_p.id = my_fm.patient_id
            WHERE fm.patient_id = cross_document_mismatches.patient_id
              AND fm.can_view_records = true
              AND fm.access_status = 'active'
              AND my_p.user_id = auth.uid()
        )
    );

