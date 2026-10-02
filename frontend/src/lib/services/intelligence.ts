import { SupabaseClient } from "@supabase/supabase-js";
import { TimelineResponse, CalendarResponse, MismatchResponse } from "@/lib/types";

// Centralized backend URL configuration
const BACKEND_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "http://localhost:8000";

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  userId: string;
}

const DEFAULT_CACHE_TTL_MS = 60 * 1000; // 60 seconds

// Module-level in-memory cache (zero localStorage for medical records)
let timelineCache: CacheEntry<TimelineResponse> | null = null;
let calendarCache: CacheEntry<CalendarResponse> | null = null;
let mismatchCache: CacheEntry<MismatchResponse> | null = null;

// In-flight promise references for concurrent request coalescing
let inFlightTimeline: Promise<{ data: TimelineResponse | null; error: Error | null }> | null = null;
let inFlightCalendar: Promise<{ data: CalendarResponse | null; error: Error | null }> | null = null;
let inFlightMismatches: Promise<{ data: MismatchResponse | null; error: Error | null }> | null = null;

/**
 * Invalidates cached intelligence responses (e.g. after uploading or processing documents, or creating health events).
 */
export function invalidateIntelligenceCache(scope?: "timeline" | "calendar" | "mismatches" | "all") {
  if (!scope || scope === "all") {
    timelineCache = null;
    calendarCache = null;
    mismatchCache = null;
  } else if (scope === "timeline") {
    timelineCache = null;
  } else if (scope === "calendar") {
    calendarCache = null;
  } else if (scope === "mismatches") {
    mismatchCache = null;
  }
}

/**
 * Synchronous accessor for cached timeline data to permit 0ms instant UI rendering on screen transitions.
 */
export function getCachedTimeline(userId?: string): TimelineResponse | null {
  if (!timelineCache) return null;
  if (userId && timelineCache.userId !== userId) return null;
  if (Date.now() - timelineCache.timestamp > DEFAULT_CACHE_TTL_MS) return null;
  return timelineCache.data;
}

/**
 * Synchronous accessor for cached calendar data to permit 0ms instant UI rendering on screen transitions.
 */
export function getCachedCalendar(userId?: string): CalendarResponse | null {
  if (!calendarCache) return null;
  if (userId && calendarCache.userId !== userId) return null;
  if (Date.now() - calendarCache.timestamp > DEFAULT_CACHE_TTL_MS) return null;
  return calendarCache.data;
}

/**
 * Synchronous accessor for cached mismatch data to permit 0ms instant UI rendering on screen transitions.
 */
export function getCachedMismatches(userId?: string): MismatchResponse | null {
  if (!mismatchCache) return null;
  if (userId && mismatchCache.userId !== userId) return null;
  if (Date.now() - mismatchCache.timestamp > DEFAULT_CACHE_TTL_MS) return null;
  return mismatchCache.data;
}

/**
 * Fetches the unified chronological health timeline for the authenticated patient.
 * Employs safe in-memory caching and request coalescing to eliminate screen-switching lag.
 */
export async function fetchTimeline(
  supabase: SupabaseClient,
  options?: { forceRefresh?: boolean }
): Promise<{ data: TimelineResponse | null; error: Error | null }> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      return { data: null, error: new Error("Authentication required to access timeline.") };
    }

    const userId = session.user?.id || "unknown";

    // Isolate by authenticated user
    if (timelineCache && timelineCache.userId !== userId) {
      timelineCache = null;
    }

    // Return active cache if valid and fresh
    if (!options?.forceRefresh && timelineCache) {
      if (Date.now() - timelineCache.timestamp <= DEFAULT_CACHE_TTL_MS) {
        return { data: timelineCache.data, error: null };
      }
    }

    // Coalesce duplicate in-flight requests
    if (inFlightTimeline) {
      return await inFlightTimeline;
    }

    const authHeader = { Authorization: `Bearer ${session.access_token}` };

    const fetchPromise = (async () => {
      try {
        const response = await fetch(`${BACKEND_URL}/api/timeline`, {
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
            error: new Error(errData.detail || `Server error (${response.status}) fetching timeline`),
          };
        }

        const data: TimelineResponse = await response.json();
        timelineCache = {
          data,
          timestamp: Date.now(),
          userId,
        };
        return { data, error: null };
      } catch (err: unknown) {
        const msg =
          err instanceof Error
            ? err.message
            : "Failed to connect to backend intelligence service. Please verify the service is running.";
        return { data: null, error: new Error(msg) };
      } finally {
        inFlightTimeline = null;
      }
    })();

    inFlightTimeline = fetchPromise;
    return await fetchPromise;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load timeline.";
    return { data: null, error: new Error(msg) };
  }
}

/**
 * Fetches the healthcare calendar with confirmed and projected dates.
 * Employs safe in-memory caching and request coalescing to eliminate screen-switching lag.
 */
export async function fetchCalendar(
  supabase: SupabaseClient,
  options?: { forceRefresh?: boolean }
): Promise<{ data: CalendarResponse | null; error: Error | null }> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      return { data: null, error: new Error("Authentication required to access calendar.") };
    }

    const userId = session.user?.id || "unknown";

    // Isolate by authenticated user
    if (calendarCache && calendarCache.userId !== userId) {
      calendarCache = null;
    }

    // Return active cache if valid and fresh
    if (!options?.forceRefresh && calendarCache) {
      if (Date.now() - calendarCache.timestamp <= DEFAULT_CACHE_TTL_MS) {
        return { data: calendarCache.data, error: null };
      }
    }

    // Coalesce duplicate in-flight requests
    if (inFlightCalendar) {
      return await inFlightCalendar;
    }

    const authHeader = { Authorization: `Bearer ${session.access_token}` };

    const fetchPromise = (async () => {
      try {
        const response = await fetch(`${BACKEND_URL}/api/calendar`, {
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
            error: new Error(errData.detail || `Server error (${response.status}) fetching calendar`),
          };
        }

        const data: CalendarResponse = await response.json();
        calendarCache = {
          data,
          timestamp: Date.now(),
          userId,
        };
        return { data, error: null };
      } catch (err: unknown) {
        const msg =
          err instanceof Error
            ? err.message
            : "Failed to connect to backend intelligence service. Please verify the service is running.";
        return { data: null, error: new Error(msg) };
      } finally {
        inFlightCalendar = null;
      }
    })();

    inFlightCalendar = fetchPromise;
    return await fetchPromise;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load calendar.";
    return { data: null, error: new Error(msg) };
  }
}

/**
 * Fetches cross-document information mismatches with bidirectional provenance.
 * Employs safe in-memory caching and request coalescing to eliminate screen-switching lag.
 */
export async function fetchMismatches(
  supabase: SupabaseClient,
  options?: { forceRefresh?: boolean }
): Promise<{ data: MismatchResponse | null; error: Error | null }> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      return { data: null, error: new Error("Authentication required to access mismatches.") };
    }

    const userId = session.user?.id || "unknown";

    // Isolate by authenticated user
    if (mismatchCache && mismatchCache.userId !== userId) {
      mismatchCache = null;
    }

    // Return active cache if valid and fresh
    if (!options?.forceRefresh && mismatchCache) {
      if (Date.now() - mismatchCache.timestamp <= DEFAULT_CACHE_TTL_MS) {
        return { data: mismatchCache.data, error: null };
      }
    }

    // Coalesce duplicate in-flight requests
    if (inFlightMismatches) {
      return await inFlightMismatches;
    }

    const authHeader = { Authorization: `Bearer ${session.access_token}` };

    const fetchPromise = (async () => {
      try {
        const response = await fetch(`${BACKEND_URL}/api/mismatches`, {
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
            error: new Error(errData.detail || `Server error (${response.status}) fetching mismatches`),
          };
        }

        const data: MismatchResponse = await response.json();
        mismatchCache = {
          data,
          timestamp: Date.now(),
          userId,
        };
        return { data, error: null };
      } catch (err: unknown) {
        const msg =
          err instanceof Error
            ? err.message
            : "Failed to connect to backend intelligence service. Please verify the service is running.";
        return { data: null, error: new Error(msg) };
      } finally {
        inFlightMismatches = null;
      }
    })();

    inFlightMismatches = fetchPromise;
    return await fetchPromise;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load mismatches.";
    return { data: null, error: new Error(msg) };
  }
}
