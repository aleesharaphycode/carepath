import { SupabaseClient } from "@supabase/supabase-js";
import {
  CreateConsentRequest,
  ConsentSessionItem,
  ConsentSessionListResponse,
  RevokeConsentResponse,
  AuditLogResponse,
  DoctorAccessResponse,
} from "@/lib/types";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "http://localhost:8000";

/**
 * Returns configured public app URL (e.g. for real mobile phone scanning or deployment).
 */
export function getPublicAppUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (envUrl && envUrl.trim()) {
    return envUrl.trim().replace(/\/+$/, "");
  }
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin.replace(/\/+$/, "");
  }
  return "http://localhost:3000";
}

/**
 * Formats the public QR share URL, prioritizing NEXT_PUBLIC_APP_URL over localhost.
 */
export function formatShareUrl(accessToken: string, serverQrUrl?: string): string {
  const publicAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (publicAppUrl && publicAppUrl.trim()) {
    return `${publicAppUrl.trim().replace(/\/+$/, "")}/share/${encodeURIComponent(accessToken)}`;
  }
  if (serverQrUrl && !serverQrUrl.includes("localhost:3000")) {
    return serverQrUrl;
  }
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin.replace(/\/+$/, "")}/share/${encodeURIComponent(accessToken)}`;
  }
  return serverQrUrl || `http://localhost:3000/share/${encodeURIComponent(accessToken)}`;
}

async function getAuthHeader(supabase: SupabaseClient): Promise<{ Authorization: string } | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return null;
  }
  return { Authorization: `Bearer ${session.access_token}` };
}

interface ConsentCacheEntry {
  data: ConsentSessionListResponse;
  timestamp: number;
  userId: string;
}

const DEFAULT_CONSENT_TTL_MS = 60 * 1000; // 60 seconds
let consentCache: ConsentCacheEntry | null = null;
let inFlightConsent: Promise<{ data: ConsentSessionListResponse | null; error: Error | null }> | null = null;

/**
 * Invalidates cached consent sessions.
 */
export function invalidateConsentCache() {
  consentCache = null;
}

/**
 * Synchronous accessor for cached consent sessions to permit 0ms instant UI rendering.
 */
export function getCachedConsentSessions(userId?: string): ConsentSessionListResponse | null {
  if (!consentCache) return null;
  if (userId && consentCache.userId !== userId) return null;
  if (Date.now() - consentCache.timestamp > DEFAULT_CONSENT_TTL_MS) return null;
  return consentCache.data;
}

/**
 * Creates a time-bound doctor access session with opaque cryptographic token.
 */
export async function createConsentSession(
  supabase: SupabaseClient,
  req: CreateConsentRequest
): Promise<{ data: ConsentSessionItem | null; error: Error | null }> {
  try {
    const authHeader = await getAuthHeader(supabase);
    if (!authHeader) {
      return { data: null, error: new Error("Authentication required.") };
    }

    const publicAppUrl = getPublicAppUrl();

    const response = await fetch(`${BACKEND_URL}/api/consent`, {
      method: "POST",
      headers: {
        ...authHeader,
        "Content-Type": "application/json",
        "x-app-url": publicAppUrl,
      },
      body: JSON.stringify(req),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      return {
        data: null,
        error: new Error(errData.detail || `Failed to create consent session (${response.status}).`),
      };
    }

    const data: ConsentSessionItem = await response.json();
    data.qr_access_url = formatShareUrl(data.access_token, data.qr_access_url);
    invalidateConsentCache();
    return { data, error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to create consent session.";
    return { data: null, error: new Error(msg) };
  }
}

/**
 * Fetches all active, expired, and revoked consent sessions for the patient.
 * Uses in-memory caching and request deduplication to prevent screen switching delays.
 */
export async function fetchConsentSessions(
  supabase: SupabaseClient,
  options?: { forceRefresh?: boolean }
): Promise<{ data: ConsentSessionListResponse | null; error: Error | null }> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      return { data: null, error: new Error("Authentication required.") };
    }

    const userId = session.user?.id || "unknown";

    if (consentCache && consentCache.userId !== userId) {
      consentCache = null;
    }

    if (!options?.forceRefresh && consentCache) {
      if (Date.now() - consentCache.timestamp <= DEFAULT_CONSENT_TTL_MS) {
        return { data: consentCache.data, error: null };
      }
    }

    if (inFlightConsent) {
      return await inFlightConsent;
    }

    const authHeader = { Authorization: `Bearer ${session.access_token}` };

    const fetchPromise = (async () => {
      try {
        const response = await fetch(`${BACKEND_URL}/api/consent`, {
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
            error: new Error(errData.detail || `Failed to load consent sessions (${response.status}).`),
          };
        }

        const data: ConsentSessionListResponse = await response.json();
        if (data.sessions && Array.isArray(data.sessions)) {
          data.sessions = data.sessions.map((s) => ({
            ...s,
            qr_access_url: formatShareUrl(s.access_token, s.qr_access_url),
          }));
        }

        consentCache = {
          data,
          timestamp: Date.now(),
          userId,
        };
        return { data, error: null };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to load consent sessions.";
        return { data: null, error: new Error(msg) };
      } finally {
        inFlightConsent = null;
      }
    })();

    inFlightConsent = fetchPromise;
    return await fetchPromise;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load consent sessions.";
    return { data: null, error: new Error(msg) };
  }
}

/**
 * Revokes an active consent session immediately.
 */
export async function revokeConsentSession(
  supabase: SupabaseClient,
  sessionId: string
): Promise<{ data: RevokeConsentResponse | null; error: Error | null }> {
  try {
    const authHeader = await getAuthHeader(supabase);
    if (!authHeader) {
      return { data: null, error: new Error("Authentication required.") };
    }

    const response = await fetch(`${BACKEND_URL}/api/consent/${sessionId}/revoke`, {
      method: "POST",
      headers: {
        ...authHeader,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      return {
        data: null,
        error: new Error(errData.detail || `Failed to revoke session (${response.status}).`),
      };
    }

    const data: RevokeConsentResponse = await response.json();
    invalidateConsentCache();
    return { data, error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to revoke session.";
    return { data: null, error: new Error(msg) };
  }
}

/**
 * Retrieves the append-only access audit log for the patient.
 */
export async function fetchAccessAuditLogs(
  supabase: SupabaseClient
): Promise<{ data: AuditLogResponse | null; error: Error | null }> {
  try {
    const authHeader = await getAuthHeader(supabase);
    if (!authHeader) {
      return { data: null, error: new Error("Authentication required.") };
    }

    const response = await fetch(`${BACKEND_URL}/api/consent/audit`, {
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
        error: new Error(errData.detail || `Failed to fetch audit log (${response.status}).`),
      };
    }

    const data: AuditLogResponse = await response.json();
    return { data, error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load audit log.";
    return { data: null, error: new Error(msg) };
  }
}

/**
 * Validates doctor access token and returns consented clinical data.
 * Unauthenticated endpoint: capability token is the authorization.
 * If called from browser, utilizes local Next.js Route Handler to prevent
 * CORS, port 8000 reachability, and localhost issues on real mobile devices.
 */
export async function fetchDoctorAccess(
  token: string
): Promise<{ data: DoctorAccessResponse | null; error: Error | null }> {
  try {
    const cleanToken = token.trim();
    if (!cleanToken) {
      return { data: null, error: new Error("Doctor access token is required.") };
    }

    const url =
      typeof window !== "undefined"
        ? `/api/doctor/access/${encodeURIComponent(cleanToken)}`
        : `${BACKEND_URL}/api/doctor/access/${encodeURIComponent(cleanToken)}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
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

    const data: DoctorAccessResponse = await response.json();
    return { data, error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to validate doctor access token.";
    return { data: null, error: new Error(msg) };
  }
}
