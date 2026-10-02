import { SupabaseClient } from "@supabase/supabase-js";
import {
  InsuranceClaim,
  CreateClaimRequest,
} from "@/lib/types";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "http://localhost:8000";

// Client-side cache to speed up navigation and avoid repeated fetches
let _claimsCache: { data: InsuranceClaim[]; timestamp: number } | null = null;
const CACHE_TTL_MS = 30_000;

function getErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) {
    return err.message;
  }
  return fallback;
}

/**
 * Creates an insurance claim and evaluates the vault deterministically.
 */
export async function createInsuranceClaim(
  supabase: SupabaseClient,
  payload: CreateClaimRequest
): Promise<{ data: InsuranceClaim | null; error: Error | null }> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      return {
        data: null,
        error: new Error("Authentication required. Please sign in to create an insurance claim."),
      };
    }

    const res = await fetch(`${BACKEND_URL}/api/insurance/claims`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      const msg = typeof errData.detail === "string" ? errData.detail : "Failed to create insurance claim.";
      return { data: null, error: new Error(msg) };
    }

    const data: InsuranceClaim = await res.json();
    // Invalidate cache on new claim
    _claimsCache = null;
    return { data, error: null };
  } catch (err: unknown) {
    return {
      data: null,
      error: new Error(getErrorMessage(err, "Network error while creating claim.")),
    };
  }
}

/**
 * Retrieves all claims belonging to the authenticated patient.
 */
export async function fetchInsuranceClaims(
  supabase: SupabaseClient,
  forceRefresh = false
): Promise<{ data: InsuranceClaim[]; error: Error | null }> {
  try {
    if (!forceRefresh && _claimsCache && Date.now() - _claimsCache.timestamp < CACHE_TTL_MS) {
      return { data: _claimsCache.data, error: null };
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      return {
        data: [],
        error: new Error("Authentication required to view insurance claims."),
      };
    }

    const res = await fetch(`${BACKEND_URL}/api/insurance/claims`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      const msg = typeof errData.detail === "string" ? errData.detail : "Failed to load claims.";
      return { data: [], error: new Error(msg) };
    }

    const body = await res.json();
    const claims: InsuranceClaim[] = body.claims || [];
    _claimsCache = { data: claims, timestamp: Date.now() };

    return { data: claims, error: null };
  } catch (err: unknown) {
    return {
      data: _claimsCache ? _claimsCache.data : [],
      error: new Error(getErrorMessage(err, "Network error loading claims.")),
    };
  }
}

/**
 * Retrieves a single claim with its full checklist and source links.
 */
export async function fetchInsuranceClaimById(
  supabase: SupabaseClient,
  claimId: string
): Promise<{ data: InsuranceClaim | null; error: Error | null }> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      return {
        data: null,
        error: new Error("Authentication required."),
      };
    }

    const res = await fetch(`${BACKEND_URL}/api/insurance/claims/${claimId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    if (!res.ok) {
      return { data: null, error: new Error("Claim not found.") };
    }

    const data: InsuranceClaim = await res.json();
    return { data, error: null };
  } catch (err: unknown) {
    return {
      data: null,
      error: new Error(getErrorMessage(err, "Error fetching claim details.")),
    };
  }
}

/**
 * Re-runs deterministic vault matching for a claim.
 */
export async function recheckInsuranceClaim(
  supabase: SupabaseClient,
  claimId: string
): Promise<{ data: InsuranceClaim | null; error: Error | null }> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      return {
        data: null,
        error: new Error("Authentication required."),
      };
    }

    const res = await fetch(`${BACKEND_URL}/api/insurance/claims/${claimId}/recheck`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    if (!res.ok) {
      return { data: null, error: new Error("Failed to re-check claim checklist.") };
    }

    const data: InsuranceClaim = await res.json();
    // Invalidate list cache
    _claimsCache = null;
    return { data, error: null };
  } catch (err: unknown) {
    return {
      data: null,
      error: new Error(getErrorMessage(err, "Error rechecking claim.")),
    };
  }
}

/**
 * Deletes an insurance claim.
 */
export async function deleteInsuranceClaim(
  supabase: SupabaseClient,
  claimId: string
): Promise<{ success: boolean; error: Error | null }> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      return { success: false, error: new Error("Authentication required.") };
    }

    const res = await fetch(`${BACKEND_URL}/api/insurance/claims/${claimId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    if (!res.ok) {
      return { success: false, error: new Error("Failed to delete claim.") };
    }

    _claimsCache = null;
    return { success: true, error: null };
  } catch (err: unknown) {
    return { success: false, error: new Error(getErrorMessage(err, "Error deleting claim.")) };
  }
}
