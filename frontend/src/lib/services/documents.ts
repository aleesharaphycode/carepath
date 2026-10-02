import { SupabaseClient } from "@supabase/supabase-js";
import { MedicalDocument, DocumentProcessingStatus, DocumentType } from "@/lib/types";

export const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB
export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
];
export const ALLOWED_EXTENSIONS = [".pdf", ".png", ".jpg", ".jpeg", ".webp"];
export const STORAGE_BUCKET = "medical-documents";

/**
 * Validates a file for type and size restrictions.
 */
export function validateMedicalFile(file: File): { valid: boolean; error?: string } {
  if (!file) {
    return { valid: false, error: "No file provided for upload." };
  }

  // Check file size
  if (file.size === 0) {
    return { valid: false, error: "Selected file is empty (0 bytes)." };
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    const sizeInMb = (file.size / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: `File size (${sizeInMb} MB) exceeds the maximum allowed limit of 25 MB.`,
    };
  }

  // Check MIME type
  const isMimeAllowed = ALLOWED_MIME_TYPES.includes(file.type.toLowerCase());

  // Check file extension as a fallback/secondary check
  const lowerName = file.name.toLowerCase();
  const hasAllowedExtension = ALLOWED_EXTENSIONS.some((ext) => lowerName.endsWith(ext));

  if (!isMimeAllowed && !hasAllowedExtension) {
    return {
      valid: false,
      error: `Unsupported file format (${file.type || "unknown"}). Allowed formats: PDF, PNG, JPG, JPEG, WEBP.`,
    };
  }

  return { valid: true };
}

/**
 * Formats bytes into a human-readable string.
 */
export function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/**
 * Sanitizes a file name for secure storage paths.
 */
export function sanitizeFileName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 100);
}

import { invalidateIntelligenceCache } from "@/lib/services/intelligence";

interface DocumentCacheEntry {
  documents: MedicalDocument[];
  timestamp: number;
  patientId: string;
}

const DEFAULT_DOCS_TTL_MS = 60 * 1000; // 60 seconds
let documentCache: { [patientId: string]: DocumentCacheEntry } = {};

/**
 * Invalidates cached patient documents.
 */
export function invalidateDocumentCache(patientId?: string) {
  if (patientId) {
    delete documentCache[patientId];
  } else {
    documentCache = {};
  }
}

/**
 * Synchronous accessor for cached patient documents.
 */
export function getCachedDocuments(patientId: string): MedicalDocument[] | null {
  const entry = documentCache[patientId];
  if (!entry) return null;
  if (Date.now() - entry.timestamp > DEFAULT_DOCS_TTL_MS) return null;
  return entry.documents;
}

/**
 * Retrieves all documents for a patient from public.documents.
 * Protected by Row Level Security and accelerated with in-memory caching.
 */
export async function getPatientDocuments(
  supabase: SupabaseClient,
  patientId: string,
  options?: { forceRefresh?: boolean }
): Promise<{
  documents: MedicalDocument[];
  error: Error | null;
  tableMissing?: boolean;
}> {
  try {
    if (!options?.forceRefresh && documentCache[patientId]) {
      const entry = documentCache[patientId];
      if (Date.now() - entry.timestamp <= DEFAULT_DOCS_TTL_MS) {
        return { documents: entry.documents, error: null };
      }
    }

    const { data, error } = await supabase
      .from("documents")
      .select("*")
      .eq("patient_id", patientId)
      .order("uploaded_at", { ascending: false });

    if (error) {
      if (
        error.code === "PGRST205" ||
        error.message.includes("does not exist") ||
        error.message.includes("schema cache")
      ) {
        return { documents: [], error: new Error(error.message), tableMissing: true };
      }
      return { documents: [], error: new Error(error.message) };
    }

    const docs = (data as MedicalDocument[]) || [];
    documentCache[patientId] = {
      documents: docs,
      timestamp: Date.now(),
      patientId,
    };

    return { documents: docs, error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load medical documents";
    return { documents: [], error: new Error(message) };
  }
}

/**
 * Retrieves the count of documents for a patient profile.
 */
export async function getPatientDocumentCount(
  supabase: SupabaseClient,
  patientId: string
): Promise<{ count: number; error: Error | null; tableMissing?: boolean }> {
  try {
    const { count, error } = await supabase
      .from("documents")
      .select("*", { count: "exact", head: true })
      .eq("patient_id", patientId);

    if (error) {
      if (
        error.code === "PGRST205" ||
        error.message.includes("does not exist") ||
        error.message.includes("schema cache")
      ) {
        return { count: 0, error: new Error(error.message), tableMissing: true };
      }
      return { count: 0, error: new Error(error.message) };
    }

    return { count: count ?? 0, error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load document count";
    return { count: 0, error: new Error(message) };
  }
}

/**
 * Generates a time-bound signed URL for securely viewing a private medical document.
 * Never generates permanent public URLs.
 */
export async function getDocumentSignedUrl(
  supabase: SupabaseClient,
  storagePath: string,
  expiresInSeconds = 300
): Promise<{ signedUrl: string | null; error: Error | null }> {
  try {
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(storagePath, expiresInSeconds);

    if (error) {
      return { signedUrl: null, error: new Error(error.message) };
    }

    return { signedUrl: data.signedUrl, error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to generate signed document URL";
    return { signedUrl: null, error: new Error(message) };
  }
}

/**
 * Uploads a medical file to Supabase Storage and creates the documents table record.
 * Rolls back the uploaded storage object if database row creation fails.
 */
export async function uploadMedicalDocument(
  supabase: SupabaseClient,
  params: {
    file: File;
    patientId: string;
    documentType?: DocumentType | string;
  }
): Promise<{
  document: MedicalDocument | null;
  error: Error | null;
  tableMissing?: boolean;
  bucketMissing?: boolean;
}> {
  const { file, patientId, documentType = "general" } = params;

  // 1. Client/service-side validation
  const validation = validateMedicalFile(file);
  if (!validation.valid) {
    return { document: null, error: new Error(validation.error) };
  }

  // 2. Generate isolated storage path: {patient_id}/{doc_uuid}_{sanitized_name}
  const fileId = crypto.randomUUID();
  const safeName = sanitizeFileName(file.name);
  const storagePath = `${patientId}/${fileId}-${safeName}`;

  try {
    // 3. Upload to private Supabase storage bucket
    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type || "application/octet-stream",
      });

    if (uploadError) {
      const isBucketError =
        uploadError.message.includes("Bucket not found") ||
        uploadError.message.includes("NoSuchBucket") ||
        (uploadError as unknown as { statusCode?: string }).statusCode === "404";

      return {
        document: null,
        error: new Error(
          isBucketError
            ? `Storage bucket '${STORAGE_BUCKET}' not found in Supabase project. Please run database migration 02_documents.sql.`
            : `Storage upload failed: ${uploadError.message}`
        ),
        bucketMissing: isBucketError,
      };
    }

    // 4. Insert row into public.documents with processing_status = 'pending'
    const insertPayload = {
      id: fileId,
      patient_id: patientId,
      file_name: file.name,
      storage_path: storagePath,
      file_type: file.type || "application/octet-stream",
      file_size: file.size,
      document_type: documentType,
      processing_status: "pending" as DocumentProcessingStatus,
    };

    const { data: docData, error: dbError } = await supabase
      .from("documents")
      .insert(insertPayload)
      .select()
      .single();

    if (dbError) {
      // Clean up orphaned storage object if database insert fails
      await supabase.storage.from(STORAGE_BUCKET).remove([storagePath]);

      if (
        dbError.code === "PGRST205" ||
        dbError.message.includes("does not exist") ||
        dbError.message.includes("schema cache")
      ) {
        return {
          document: null,
          error: new Error("Database table 'public.documents' not found. Please run migration 02_documents.sql."),
          tableMissing: true,
        };
      }

      return {
        document: null,
        error: new Error(`Database error saving document record: ${dbError.message}`),
      };
    }

    invalidateDocumentCache(patientId);
    invalidateIntelligenceCache();
    return { document: docData as MedicalDocument, error: null };
  } catch (err: unknown) {
    // Attempt cleanup on unexpected failure
    try {
      await supabase.storage.from(STORAGE_BUCKET).remove([storagePath]);
    } catch {
      // Ignore secondary cleanup error
    }

    const message = err instanceof Error ? err.message : "Failed to upload medical document";
    return { document: null, error: new Error(message) };
  }
}

/**
 * Deletes a medical document from both database and storage.
 */
export async function deleteMedicalDocument(
  supabase: SupabaseClient,
  documentId: string,
  storagePath: string
): Promise<{ success: boolean; error: Error | null }> {
  try {
    // 1. Delete database row (protected by RLS)
    const { error: dbError } = await supabase
      .from("documents")
      .delete()
      .eq("id", documentId);

    if (dbError) {
      return { success: false, error: new Error(dbError.message) };
    }

    // 2. Delete storage object
    const { error: storageError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .remove([storagePath]);

    if (storageError) {
      // Database row is deleted, log storage warning
      console.warn("Storage object removal warning:", storageError.message);
    }

    invalidateDocumentCache();
    invalidateIntelligenceCache();
    return { success: true, error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to delete medical document";
    return { success: false, error: new Error(message) };
  }
}
