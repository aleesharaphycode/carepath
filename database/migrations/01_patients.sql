-- ==============================================================================
-- CarePath Database Migration: Phase 2 (Authentication & Patient Profile)
-- Table: public.patients
-- Description: Minimum patient profile storage linked to Supabase Auth user.
-- Security: Row Level Security (RLS) strictly enforced.
-- ==============================================================================

-- 1. Create table
CREATE TABLE IF NOT EXISTS public.patients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    date_of_birth DATE,
    gender TEXT,
    phone TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_patients_user_id UNIQUE (user_id)
);

-- 2. Indexes for efficient lookup
CREATE INDEX IF NOT EXISTS idx_patients_user_id ON public.patients(user_id);

-- 3. Enable Row Level Security
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;

-- 4. Clean up any previous policies
DROP POLICY IF EXISTS "Patients can view their own profile" ON public.patients;
DROP POLICY IF EXISTS "Patients can insert their own profile" ON public.patients;
DROP POLICY IF EXISTS "Patients can update their own profile" ON public.patients;

-- 5. Strict RLS Policies

-- SELECT: Patients can view ONLY their own profile
CREATE POLICY "Patients can view their own profile"
    ON public.patients
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- INSERT: Patients can insert ONLY their own profile with their own user_id
CREATE POLICY "Patients can insert their own profile"
    ON public.patients
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- UPDATE: Patients can update ONLY their own profile
CREATE POLICY "Patients can update their own profile"
    ON public.patients
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- 6. Trigger to automatically keep updated_at in sync
CREATE OR REPLACE FUNCTION public.handle_patients_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_patients_updated_at ON public.patients;
CREATE TRIGGER trigger_patients_updated_at
    BEFORE UPDATE ON public.patients
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_patients_updated_at();
