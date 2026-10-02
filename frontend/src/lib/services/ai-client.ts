import { SupabaseClient } from "@supabase/supabase-js";
import { MedicalDocumentExtraction } from "@/lib/types";
import { invalidateIntelligenceCache } from "@/lib/services/intelligence";
import { invalidateDocumentCache } from "@/lib/services/documents";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "http://localhost:8000";

/**
 * Triggers multimodal AI document understanding and structured entity extraction on the FastAPI backend.
 * Uses the authenticated user's access token.
 */
export async function triggerDocumentAnalysis(
  supabase: SupabaseClient,
  documentId: string
): Promise<{
  extraction: MedicalDocumentExtraction | null;
  error: Error | null;
}> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session || !session.access_token) {
      return {
        extraction: null,
        error: new Error("Authentication required. Please sign in to analyze medical documents."),
      };
    }

    const response = await fetch(`${BACKEND_URL}/api/documents/${documentId}/process`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      let errorMsg = `Server error (${response.status}): Failed to process document`;
      if (typeof data.detail === "string") {
        errorMsg = data.detail;
      } else if (data.detail && typeof data.detail === "object") {
        errorMsg = data.detail.message || JSON.stringify(data.detail);
      }
      return { extraction: null, error: new Error(errorMsg) };
    }

    invalidateDocumentCache();
    invalidateIntelligenceCache();
    return { extraction: data.extraction as MedicalDocumentExtraction, error: null };
  } catch (err: unknown) {
    const message =
      err instanceof Error
        ? err.message
        : "Failed to connect to FastAPI intelligence engine. Is the backend server running?";
    return { extraction: null, error: new Error(message) };
  }
}

/**
 * Retrieves the structured clinical extraction for an analyzed document from the FastAPI backend.
 */
export async function fetchDocumentExtraction(
  supabase: SupabaseClient,
  documentId: string
): Promise<{
  extraction: MedicalDocumentExtraction | null;
  processing_status?: string;
  error: Error | null;
}> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session || !session.access_token) {
      return {
        extraction: null,
        error: new Error("Authentication required. Please sign in."),
      };
    }

    const response = await fetch(`${BACKEND_URL}/api/documents/${documentId}/extraction`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return { extraction: null, error: null };
      }
      const data = await response.json().catch(() => ({}));
      return {
        extraction: null,
        error: new Error(data.detail || "Failed to load extraction details."),
      };
    }

    const data = await response.json();
    return {
      extraction: data.extraction as MedicalDocumentExtraction | null,
      processing_status: data.processing_status,
      error: null,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load document extraction";
    return { extraction: null, error: new Error(message) };
  }
}
