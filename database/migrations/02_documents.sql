-- ==============================================================================
-- CarePath Database Migration: Sprint 2 (Data Foundation + Document Vault)
-- Table: public.documents
-- Storage: Bucket 'medical-documents' (private) & storage.objects RLS policies
-- Description: Secure medical document vault metadata and file storage policies.
-- Security: Row Level Security (RLS) strictly enforced across database and storage.
-- ==============================================================================

-- 1. Create documents table
CREATE TABLE IF NOT EXISTS public.documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    file_type TEXT NOT NULL,
    file_size BIGINT,
    document_type TEXT DEFAULT 'general',
    processing_status TEXT NOT NULL DEFAULT 'pending',
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT chk_documents_processing_status CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed')),
    CONSTRAINT chk_documents_file_size CHECK (file_size > 0)
);

-- 2. Performance indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_documents_patient_id ON public.documents(patient_id);
CREATE INDEX IF NOT EXISTS idx_documents_uploaded_at ON public.documents(uploaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_processing_status ON public.documents(processing_status);

-- 3. Enable Row Level Security
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- 4. Clean up any existing policies
DROP POLICY IF EXISTS "Patients can view their own documents" ON public.documents;
DROP POLICY IF EXISTS "Patients can insert their own documents" ON public.documents;
DROP POLICY IF EXISTS "Patients can update their own documents" ON public.documents;
DROP POLICY IF EXISTS "Patients can delete their own documents" ON public.documents;

-- 5. Strict RLS Policies for public.documents
-- Ownership path: auth.uid() -> public.patients.user_id -> public.patients.id -> public.documents.patient_id

-- SELECT: Patients can view ONLY their own documents
CREATE POLICY "Patients can view their own documents"
    ON public.documents
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.patients
            WHERE patients.id = documents.patient_id
              AND patients.user_id = auth.uid()
        )
    );

-- INSERT: Patients can insert ONLY their own documents
CREATE POLICY "Patients can insert their own documents"
    ON public.documents
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.patients
            WHERE patients.id = documents.patient_id
              AND patients.user_id = auth.uid()
        )
    );

-- UPDATE: Patients can update ONLY their own documents
CREATE POLICY "Patients can update their own documents"
    ON public.documents
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.patients
            WHERE patients.id = documents.patient_id
              AND patients.user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.patients
            WHERE patients.id = documents.patient_id
              AND patients.user_id = auth.uid()
        )
    );

-- DELETE: Patients can delete ONLY their own documents
CREATE POLICY "Patients can delete their own documents"
    ON public.documents
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.patients
            WHERE patients.id = documents.patient_id
              AND patients.user_id = auth.uid()
        )
    );

-- 6. Trigger to keep updated_at in sync
CREATE OR REPLACE FUNCTION public.handle_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_documents_updated_at ON public.documents;
CREATE TRIGGER trigger_documents_updated_at
    BEFORE UPDATE ON public.documents
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_documents_updated_at();

-- 7. Supabase Storage: Initialize Private Storage Bucket
-- Ensure the 'medical-documents' bucket exists and is marked private (public = false)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'medical-documents',
    'medical-documents',
    false,
    26214400, -- 25MB max per document
    ARRAY['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = 26214400,
    allowed_mime_types = ARRAY['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp'];

-- 8. Storage Object RLS Policies on storage.objects
-- Files are stored under the path format: {patient_id}/{document_id}-{sanitized_name}
-- Access is granted only when the authenticated user owns the corresponding patient profile.
DROP POLICY IF EXISTS "Authenticated patients can view their own document objects" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated patients can upload their own document objects" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated patients can update their own document objects" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated patients can delete their own document objects" ON storage.objects;

-- SELECT: Patients can download/view only storage objects in their own patient directory
CREATE POLICY "Authenticated patients can view their own document objects"
    ON storage.objects
    FOR SELECT
    TO authenticated
    USING (
        bucket_id = 'medical-documents' AND
        EXISTS (
            SELECT 1 FROM public.patients
            WHERE patients.id::text = split_part(storage.objects.name, '/', 1)
              AND patients.user_id = auth.uid()
        )
    );

-- INSERT: Patients can upload storage objects only to their own patient directory
CREATE POLICY "Authenticated patients can upload their own document objects"
    ON storage.objects
    FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'medical-documents' AND
        EXISTS (
            SELECT 1 FROM public.patients
            WHERE patients.id::text = split_part(storage.objects.name, '/', 1)
              AND patients.user_id = auth.uid()
        )
    );

-- UPDATE: Patients can update storage objects only in their own patient directory
CREATE POLICY "Authenticated patients can update their own document objects"
    ON storage.objects
    FOR UPDATE
    TO authenticated
    USING (
        bucket_id = 'medical-documents' AND
        EXISTS (
            SELECT 1 FROM public.patients
            WHERE patients.id::text = split_part(storage.objects.name, '/', 1)
              AND patients.user_id = auth.uid()
        )
    );

-- DELETE: Patients can delete storage objects only in their own patient directory
CREATE POLICY "Authenticated patients can delete their own document objects"
    ON storage.objects
    FOR DELETE
    TO authenticated
    USING (
        bucket_id = 'medical-documents' AND
        EXISTS (
            SELECT 1 FROM public.patients
            WHERE patients.id::text = split_part(storage.objects.name, '/', 1)
              AND patients.user_id = auth.uid()
        )
    );
