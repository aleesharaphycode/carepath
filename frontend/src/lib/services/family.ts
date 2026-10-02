import { SupabaseClient } from "@supabase/supabase-js";
import {
  FamilyDashboardResponse,
  FamilyGroupItem,
  FamilyMemberProfile,
  AddFamilyMemberRequest,
  UpdateFamilyMemberRequest,
  FamilyMemberClinicalRecords,
  FamilyInvitationsResponse,
} from "@/lib/types";

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

interface FamilyCacheEntry {
  data: FamilyDashboardResponse;
  timestamp: number;
  userId: string;
}

const DEFAULT_FAMILY_TTL_MS = 60 * 1000; // 60 seconds
let familyCache: FamilyCacheEntry | null = null;
let inFlightFamily: Promise<{ data: FamilyDashboardResponse | null; error: Error | null }> | null = null;

/**
 * Invalidates cached family dashboard data.
 */
export function invalidateFamilyCache() {
  familyCache = null;
}

/**
 * Synchronous accessor for cached family dashboard data to permit 0ms instant UI rendering.
 */
export function getCachedFamilyDashboard(userId?: string): FamilyDashboardResponse | null {
  if (!familyCache) return null;
  if (userId && familyCache.userId !== userId) return null;
  if (Date.now() - familyCache.timestamp > DEFAULT_FAMILY_TTL_MS) return null;
  return familyCache.data;
}

/**
 * Fetches family groups and member identities for the authenticated patient.
 * Uses in-memory caching and request deduplication to make screen switching snappy.
 */
export async function fetchFamilyDashboard(
  supabase: SupabaseClient,
  options?: { forceRefresh?: boolean }
): Promise<{ data: FamilyDashboardResponse | null; error: Error | null }> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      return { data: null, error: new Error("Authentication required to access Family Dashboard.") };
    }

    const userId = session.user?.id || "unknown";

    if (familyCache && familyCache.userId !== userId) {
      familyCache = null;
    }

    if (!options?.forceRefresh && familyCache) {
      if (Date.now() - familyCache.timestamp <= DEFAULT_FAMILY_TTL_MS) {
        return { data: familyCache.data, error: null };
      }
    }

    if (inFlightFamily) {
      return await inFlightFamily;
    }

    const authHeader = { Authorization: `Bearer ${session.access_token}` };

    const fetchPromise = (async () => {
      try {
        const response = await fetch(`${BACKEND_URL}/api/family`, {
          method: "GET",
          headers: {
            ...authHeader,
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          return {
            data: null,
            error: new Error(errData.detail || `Error (${response.status}) loading family dashboard.`),
          };
        }

        const data: FamilyDashboardResponse = await response.json();
        familyCache = {
          data,
          timestamp: Date.now(),
          userId,
        };
        return { data, error: null };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to load family dashboard.";
        return { data: null, error: new Error(msg) };
      } finally {
        inFlightFamily = null;
      }
    })();

    inFlightFamily = fetchPromise;
    return await fetchPromise;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load family dashboard.";
    return { data: null, error: new Error(msg) };
  }
}

/**
 * Creates a new family circle group.
 */
export async function createFamilyGroup(
  supabase: SupabaseClient,
  name: string
): Promise<{ data: FamilyGroupItem | null; error: Error | null }> {
  try {
    const authHeader = await getAuthHeader(supabase);
    if (!authHeader) {
      return { data: null, error: new Error("Authentication required.") };
    }

    const response = await fetch(`${BACKEND_URL}/api/family`, {
      method: "POST",
      headers: {
        ...authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      return {
        data: null,
        error: new Error(errData.detail || `Failed to create family group (${response.status}).`),
      };
    }

    const data: FamilyGroupItem = await response.json();
    invalidateFamilyCache();
    return { data, error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to create family group.";
    return { data: null, error: new Error(msg) };
  }
}

/**
 * Registers a family member/dependent with their own independent record isolation.
 */
export async function addFamilyMember(
  supabase: SupabaseClient,
  req: AddFamilyMemberRequest
): Promise<{ data: FamilyMemberProfile | null; error: Error | null }> {
  try {
    const authHeader = await getAuthHeader(supabase);
    if (!authHeader) {
      return { data: null, error: new Error("Authentication required.") };
    }

    const response = await fetch(`${BACKEND_URL}/api/family/members`, {
      method: "POST",
      headers: {
        ...authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(req),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      return {
        data: null,
        error: new Error(errData.detail || `Failed to add family member (${response.status}).`),
      };
    }

    const data: FamilyMemberProfile = await response.json();
    invalidateFamilyCache();
    return { data, error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to add family member.";
    return { data: null, error: new Error(msg) };
  }
}

/**
 * Updates permissions (e.g. can_view_records) or relationship for a member.
 */
export async function updateFamilyMember(
  supabase: SupabaseClient,
  membershipId: string,
  req: UpdateFamilyMemberRequest
): Promise<{ success: boolean; error: Error | null }> {
  try {
    const authHeader = await getAuthHeader(supabase);
    if (!authHeader) {
      return { success: false, error: new Error("Authentication required.") };
    }

    const response = await fetch(`${BACKEND_URL}/api/family/members/${membershipId}`, {
      method: "PATCH",
      headers: {
        ...authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(req),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: new Error(errData.detail || `Failed to update member (${response.status}).`),
      };
    }

    invalidateFamilyCache();
    return { success: true, error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to update member.";
    return { success: false, error: new Error(msg) };
  }
}

/**
 * Retrieves clinical records of an authorized family member.
 * Server returns 403 if can_view_records is not true.
 */
export async function fetchFamilyMemberRecords(
  supabase: SupabaseClient,
  targetPatientId: string
): Promise<{ data: FamilyMemberClinicalRecords | null; error: Error | null }> {
  try {
    const authHeader = await getAuthHeader(supabase);
    if (!authHeader) {
      return { data: null, error: new Error("Authentication required.") };
    }

    const response = await fetch(`${BACKEND_URL}/api/family/members/${targetPatientId}/records`, {
      method: "GET",
      headers: {
        ...authHeader,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      return {
        data: null,
        error: new Error(errData.detail || `Access denied (${response.status}).`),
      };
    }

    const data = await response.json();
    return { data, error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load family member records.";
    return { data: null, error: new Error(msg) };
  }
}

/**
 * Safely removes a family member from a group.
 * The member's patient profile and health records remain completely intact.
 */
export async function removeFamilyMember(
  supabase: SupabaseClient,
  membershipId: string
): Promise<{ success: boolean; error: Error | null }> {
  try {
    const authHeader = await getAuthHeader(supabase);
    if (!authHeader) {
      return { success: false, error: new Error("Authentication required.") };
    }

    const response = await fetch(`${BACKEND_URL}/api/family/members/${membershipId}`, {
      method: "DELETE",
      headers: {
        ...authHeader,
      },
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: new Error(errData.detail || `Failed to remove family member (${response.status}).`),
      };
    }

    invalidateFamilyCache();
    return { success: true, error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to remove family member.";
    return { success: false, error: new Error(msg) };
  }
}

/**
 * Accepts a pending family invitation.
 */
export async function getFamilyInvitations(
  supabase: SupabaseClient
): Promise<{ data: FamilyInvitationsResponse | null; error: Error | null }> {
  try {
    const authHeader = await getAuthHeader(supabase);
    if (!authHeader) {
      return { data: null, error: new Error("Authentication required.") };
    }

    const response = await fetch(`${BACKEND_URL}/api/family/invitations`, {
      method: "GET",
      headers: {
        ...authHeader,
      },
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      return {
        data: null,
        error: new Error(errData.detail || `Failed to fetch invitations (${response.status}).`),
      };
    }

    const data: FamilyInvitationsResponse = await response.json();
    return { data, error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load invitations.";
    return { data: null, error: new Error(msg) };
  }
}

export async function declineFamilyInvitation(
  supabase: SupabaseClient,
  membershipId: string
): Promise<{ success: boolean; error: Error | null }> {
  try {
    const authHeader = await getAuthHeader(supabase);
    if (!authHeader) {
      return { success: false, error: new Error("Authentication required.") };
    }

    const response = await fetch(`${BACKEND_URL}/api/family/members/invitations/${membershipId}/decline`, {
      method: "POST",
      headers: {
        ...authHeader,
      },
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: new Error(errData.detail || `Failed to decline invitation (${response.status}).`),
      };
    }

    invalidateFamilyCache();
    return { success: true, error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to decline invitation.";
    return { success: false, error: new Error(msg) };
  }
}

export async function acceptFamilyInvitation(
  supabase: SupabaseClient,
  membershipId: string
): Promise<{ success: boolean; error: Error | null }> {
  try {
    const authHeader = await getAuthHeader(supabase);
    if (!authHeader) {
      return { success: false, error: new Error("Authentication required.") };
    }

    const response = await fetch(`${BACKEND_URL}/api/family/members/invitations/${membershipId}/accept`, {
      method: "POST",
      headers: {
        ...authHeader,
      },
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: new Error(errData.detail || `Failed to accept invitation (${response.status}).`),
      };
    }

    invalidateFamilyCache();
    return { success: true, error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to accept invitation.";
    return { success: false, error: new Error(msg) };
  }
}
