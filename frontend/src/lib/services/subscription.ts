import { SupabaseClient } from "@supabase/supabase-js";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "http://localhost:8000";

export interface PlanFeature {
  title: string;
  included: boolean;
  detail?: string;
}

export interface PlanTier {
  id: string;
  name: string;
  price_inr: number;
  billing_interval: string;
  description: string;
  is_current: boolean;
  badge?: string;
  features: PlanFeature[];
}

export interface SubscriptionStatusResponse {
  patient_id: string;
  plan: "free" | "premium" | "trial" | "cancelled" | "expired";
  status: "active" | "past_due" | "cancelled" | "expired";
  billing_period_start: string;
  billing_period_end?: string | null;
  ai_analyses_used: number;
  ai_analyses_limit: number;
  ai_analyses_remaining: number;
  documents_limit: number;
  upgrade_available: boolean;
  tiers: PlanTier[];
}

export interface CreateOrderResponse {
  order_id: string;
  amount: number;
  currency: string;
  key_id: string;
  plan_id: string;
  patient_name: string;
  patient_email?: string;
}

export interface VerifyPaymentPayload {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
  plan_id?: string;
}

export interface VerifyPaymentResponse {
  success: boolean;
  plan: string;
  status: string;
  message: string;
  billing_period_end?: string;
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

interface SubCacheEntry {
  data: SubscriptionStatusResponse;
  timestamp: number;
  userId: string;
}

const DEFAULT_SUB_TTL_MS = 60 * 1000; // 60 seconds
let subCache: SubCacheEntry | null = null;
let inFlightSub: Promise<{ data: SubscriptionStatusResponse | null; error: Error | null }> | null = null;

/**
 * Invalidates cached subscription status.
 */
export function invalidateSubscriptionCache() {
  subCache = null;
}

/**
 * Synchronous accessor for cached subscription status to permit 0ms instant UI rendering.
 */
export function getCachedSubscriptionStatus(userId?: string): SubscriptionStatusResponse | null {
  if (!subCache) return null;
  if (userId && subCache.userId !== userId) return null;
  if (Date.now() - subCache.timestamp > DEFAULT_SUB_TTL_MS) return null;
  return subCache.data;
}

export async function fetchSubscriptionStatus(
  supabase: SupabaseClient,
  options?: { forceRefresh?: boolean }
): Promise<{ data: SubscriptionStatusResponse | null; error: Error | null }> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      return { data: null, error: new Error("Authentication session required.") };
    }

    const userId = session.user?.id || "unknown";

    if (subCache && subCache.userId !== userId) {
      subCache = null;
    }

    if (!options?.forceRefresh && subCache) {
      if (Date.now() - subCache.timestamp <= DEFAULT_SUB_TTL_MS) {
        return { data: subCache.data, error: null };
      }
    }

    if (inFlightSub) {
      return await inFlightSub;
    }

    const authHeader = { Authorization: `Bearer ${session.access_token}` };

    const fetchPromise = (async () => {
      try {
        const response = await fetch(`${BACKEND_URL}/api/subscription/current`, {
          method: "GET",
          headers: {
            ...authHeader,
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          return { data: null, error: new Error(err.detail || `HTTP ${response.status}`) };
        }

        const data: SubscriptionStatusResponse = await response.json();
        subCache = {
          data,
          timestamp: Date.now(),
          userId,
        };
        return { data, error: null };
      } catch (err: unknown) {
        return { data: null, error: new Error(err instanceof Error ? err.message : "Failed to load subscription") };
      } finally {
        inFlightSub = null;
      }
    })();

    inFlightSub = fetchPromise;
    return await fetchPromise;
  } catch (err: unknown) {
    return { data: null, error: new Error(err instanceof Error ? err.message : "Failed to load subscription") };
  }
}

export async function createCheckoutOrder(
  supabase: SupabaseClient,
  planId = "premium"
): Promise<{ data: CreateOrderResponse | null; error: Error | null }> {
  try {
    const authHeader = await getAuthHeader(supabase);
    if (!authHeader) {
      return { data: null, error: new Error("Authentication session required.") };
    }

    const response = await fetch(`${BACKEND_URL}/api/subscription/create-order`, {
      method: "POST",
      headers: {
        ...authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ plan_id: planId }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return { data: null, error: new Error(err.detail || `HTTP ${response.status}`) };
    }

    const data: CreateOrderResponse = await response.json();
    return { data, error: null };
  } catch (err: unknown) {
    return { data: null, error: new Error(err instanceof Error ? err.message : "Failed to create order") };
  }
}

export async function verifyPaymentAndUpgrade(
  supabase: SupabaseClient,
  payload: VerifyPaymentPayload
): Promise<{ data: VerifyPaymentResponse | null; error: Error | null }> {
  try {
    const authHeader = await getAuthHeader(supabase);
    if (!authHeader) {
      return { data: null, error: new Error("Authentication session required.") };
    }

    const response = await fetch(`${BACKEND_URL}/api/subscription/verify`, {
      method: "POST",
      headers: {
        ...authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return { data: null, error: new Error(err.detail || `Payment verification failed (${response.status})`) };
    }

    const data: VerifyPaymentResponse = await response.json();
    invalidateSubscriptionCache();
    return { data, error: null };
  } catch (err: unknown) {
    return { data: null, error: new Error(err instanceof Error ? err.message : "Failed to verify payment") };
  }
}

export async function cancelSubscription(
  supabase: SupabaseClient
): Promise<{ success: boolean; error: Error | null }> {
  try {
    const authHeader = await getAuthHeader(supabase);
    if (!authHeader) {
      return { success: false, error: new Error("Authentication session required.") };
    }

    const response = await fetch(`${BACKEND_URL}/api/subscription/cancel`, {
      method: "POST",
      headers: {
        ...authHeader,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return { success: false, error: new Error(err.detail || `Cancel failed (${response.status})`) };
    }

    invalidateSubscriptionCache();
    return { success: true, error: null };
  } catch (err: unknown) {
    return { success: false, error: new Error(err instanceof Error ? err.message : "Failed to cancel subscription") };
  }
}
