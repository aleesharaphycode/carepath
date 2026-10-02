import { SupabaseClient } from "@supabase/supabase-js";
import { AIDoctorResponse, AIDoctorFeedbackPayload } from "@/lib/types";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "http://localhost:8000";

interface SendAIDoctorMessageParams {
  message: string;
  targetPatientId?: string | null;
  chatHistory?: Array<{ role: string; text: string }>;
  quickAction?: string | null;
}

/**
 * Sends a patient query to the CarePath AI Doctor assistant engine.
 * Authenticates via the current Supabase session token.
 * Strictly resolves to the authenticated user and authorized patient records.
 */
export async function sendAIDoctorMessage(
  supabase: SupabaseClient,
  params: SendAIDoctorMessageParams
): Promise<{ data: AIDoctorResponse | null; error: Error | null }> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      return {
        data: null,
        error: new Error("Authentication required. Please sign in to consult Dr. CarePath."),
      };
    }

    const payload = {
      message: params.message.trim(),
      target_patient_id: params.targetPatientId || null,
      chat_history: (params.chatHistory || []).map((m) => ({
        role: m.role === "ai" ? "assistant" : m.role,
        text: m.text,
      })),
      quick_action: params.quickAction || null,
    };

    const response = await fetch(`${BACKEND_URL}/api/ai-doctor/chat`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      const detailMsg =
        typeof errData.detail === "string"
          ? errData.detail
          : "CarePath AI Doctor is temporarily unavailable. Your health records are still available.";

      return {
        data: null,
        error: new Error(detailMsg),
      };
    }

    const data: AIDoctorResponse = await response.json();
    return { data, error: null };
  } catch (err: unknown) {
    const message =
      err instanceof Error
        ? err.message
        : "Failed to connect to CarePath AI Doctor. Please verify the backend service is running.";
    return { data: null, error: new Error(message) };
  }
}

/**
 * Submits helpfulness feedback (👍 / 👎) for an AI Doctor response.
 */
export async function submitAIDoctorFeedback(
  supabase: SupabaseClient,
  payload: AIDoctorFeedbackPayload
): Promise<{ success: boolean; error: Error | null }> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      return { success: false, error: new Error("Authentication required.") };
    }

    const response = await fetch(`${BACKEND_URL}/api/ai-doctor/feedback`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      return { success: false, error: new Error("Failed to record feedback") };
    }

    return { success: true, error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error logging feedback";
    return { success: false, error: new Error(message) };
  }
}
