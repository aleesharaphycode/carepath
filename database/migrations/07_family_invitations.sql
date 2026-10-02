-- ==============================================================================
-- CarePath Database Migration: Sprint 7 (Family Invitations)
-- Tables: public.family_invitations
-- Description: Supports inviting 16+ members who may not have accounts yet.
-- Security: Row Level Security (RLS) strictly enforced.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.family_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_group_id UUID NOT NULL REFERENCES public.family_groups(id) ON DELETE CASCADE,
    inviter_patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    target_email TEXT NOT NULL,
    target_name TEXT NOT NULL,
    target_dob DATE NOT NULL,
    relationship TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'dependent', 'admin', 'owner')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'revoked', 'expired')),
    invitation_token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_family_invitations_email ON public.family_invitations(target_email);
CREATE INDEX IF NOT EXISTS idx_family_invitations_token ON public.family_invitations(invitation_token);
CREATE INDEX IF NOT EXISTS idx_family_invitations_group ON public.family_invitations(family_group_id);

ALTER TABLE public.family_invitations ENABLE ROW LEVEL SECURITY;

-- 5. Strict RLS Policies

-- SELECT: Inviter or recipient by email
CREATE POLICY "Users can view invitations they sent or received"
    ON public.family_invitations FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.patients p
            WHERE p.id = family_invitations.inviter_patient_id
              AND p.user_id = auth.uid()
        ) OR
        lower(target_email) = lower(auth.jwt()->>'email')
    );

-- INSERT: Inviter
CREATE POLICY "Users can create invitations"
    ON public.family_invitations FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.patients p
            WHERE p.id = family_invitations.inviter_patient_id
              AND p.user_id = auth.uid()
        )
    );

-- UPDATE: Inviter or Recipient
CREATE POLICY "Users can update invitations"
    ON public.family_invitations FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.patients p
            WHERE p.id = family_invitations.inviter_patient_id
              AND p.user_id = auth.uid()
        ) OR
        lower(target_email) = lower(auth.jwt()->>'email')
    );

-- DELETE: Inviter
CREATE POLICY "Users can delete invitations"
    ON public.family_invitations FOR DELETE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.patients p
            WHERE p.id = family_invitations.inviter_patient_id
              AND p.user_id = auth.uid()
        )
    );
