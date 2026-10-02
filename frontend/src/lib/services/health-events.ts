import { SupabaseClient } from "@supabase/supabase-js";
import {
  HealthEventItem,
  HealthEventCreateRequest,
  HealthEventCandidate,
} from "@/lib/types";
import { invalidateIntelligenceCache } from "@/lib/services/intelligence";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "http://localhost:8000";

async function getAuthHeader(supabase: SupabaseClient): Promise<{ Authorization: string } | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return null;
  }
  return { Authorization: `Bearer ${session.access_token}` };
}

/**
 * Fetches all confirmed and planned health events for the current patient or dependent.
 */
export async function fetchHealthEvents(
  supabase: SupabaseClient,
  patientId?: string
): Promise<{ data: HealthEventItem[] | null; error: Error | null }> {
  try {
    const authHeader = await getAuthHeader(supabase);
    if (!authHeader) {
      return { data: null, error: new Error("Authentication required.") };
    }

    const url = patientId
      ? `${BACKEND_URL}/api/health-events?patient_id=${encodeURIComponent(patientId)}`
      : `${BACKEND_URL}/api/health-events`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        ...authHeader,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return {
        data: null,
        error: new Error(err.detail || `Server error (${response.status}) fetching health events`),
      };
    }

    const data: HealthEventItem[] = await response.json();
    return { data, error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load health events.";
    return { data: null, error: new Error(msg) };
  }
}

/**
 * Creates a confirmed or planned healthcare event.
 */
export async function createHealthEvent(
  supabase: SupabaseClient,
  req: HealthEventCreateRequest
): Promise<{ data: HealthEventItem | null; error: Error | null }> {
  try {
    const authHeader = await getAuthHeader(supabase);
    if (!authHeader) {
      return { data: null, error: new Error("Authentication required.") };
    }

    const response = await fetch(`${BACKEND_URL}/api/health-events`, {
      method: "POST",
      headers: {
        ...authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(req),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return {
        data: null,
        error: new Error(err.detail || `Failed to create health event (${response.status}).`),
      };
    }

    const data: HealthEventItem = await response.json();
    invalidateIntelligenceCache("calendar");
    return { data, error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to create health event.";
    return { data: null, error: new Error(msg) };
  }
}

/**
 * Deletes a healthcare event.
 */
export async function deleteHealthEvent(
  supabase: SupabaseClient,
  eventId: string
): Promise<{ success: boolean; error: Error | null }> {
  try {
    const authHeader = await getAuthHeader(supabase);
    if (!authHeader) {
      return { success: false, error: new Error("Authentication required.") };
    }

    const response = await fetch(`${BACKEND_URL}/api/health-events/${eventId}`, {
      method: "DELETE",
      headers: {
        ...authHeader,
      },
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return {
        success: false,
        error: new Error(err.detail || `Failed to delete health event (${response.status}).`),
      };
    }

    invalidateIntelligenceCache("calendar");
    return { success: true, error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to delete health event.";
    return { success: false, error: new Error(msg) };
  }
}

/**
 * Fetches event candidates from unconfirmed medical documents in the vault.
 */
export async function fetchEventCandidates(
  supabase: SupabaseClient,
  patientId?: string
): Promise<{ data: HealthEventCandidate[] | null; error: Error | null }> {
  try {
    const authHeader = await getAuthHeader(supabase);
    if (!authHeader) {
      return { data: null, error: new Error("Authentication required.") };
    }

    const url = patientId
      ? `${BACKEND_URL}/api/health-events/candidates?patient_id=${encodeURIComponent(patientId)}`
      : `${BACKEND_URL}/api/health-events/candidates`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        ...authHeader,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return {
        data: null,
        error: new Error(err.detail || `Error (${response.status}) fetching candidates`),
      };
    }

    const data: HealthEventCandidate[] = await response.json();
    return { data, error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load candidates.";
    return { data: null, error: new Error(msg) };
  }
}
