import { SupabaseClient } from "@supabase/supabase-js";
import { PatientProfile, PatientProfileUpdate } from "@/lib/types";

/**
 * Checks whether a patient profile is fully completed with all basic core profile fields.
 */
export function isProfileComplete(profile: PatientProfile | null): boolean {
  if (!profile) return false;
  return Boolean(
    profile.full_name?.trim() &&
    profile.date_of_birth &&
    profile.gender?.trim() &&
    profile.phone?.trim()
  );
}

/**
 * Calculates profile completion percentage.
 */
export function getProfileCompletionPercentage(profile: PatientProfile | null): number {
  if (!profile) return 0;
  let score = 0;
  if (profile.full_name?.trim()) score += 25;
  if (profile.date_of_birth) score += 25;
  if (profile.gender?.trim()) score += 25;
  if (profile.phone?.trim()) score += 25;
  return score;
}

/**
 * Fetches the patient profile belonging to the specified user_id.
 * Protected by Supabase Row Level Security (auth.uid() = user_id).
 */
export async function getPatientProfile(
  supabase: SupabaseClient,
  userId: string
): Promise<{ profile: PatientProfile | null; error: Error | null; tableMissing?: boolean }> {
  try {
    const { data, error } = await supabase
      .from("patients")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      // Check if table has not been created yet in Supabase
      if (error.code === "PGRST205" || error.message.includes("does not exist") || error.message.includes("schema cache")) {
        return { profile: null, error: new Error(error.message), tableMissing: true };
      }
      return { profile: null, error: new Error(error.message) };
    }

    return { profile: data as PatientProfile | null, error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load patient profile";
    return { profile: null, error: new Error(message) };
  }
}

/**
 * Creates or initialises a patient profile for the user.
 */
export async function createPatientProfile(
  supabase: SupabaseClient,
  params: {
    userId: string;
    fullName: string;
    dateOfBirth?: string | null;
    gender?: string | null;
    phone?: string | null;
  }
): Promise<{ profile: PatientProfile | null; error: Error | null; tableMissing?: boolean }> {
  try {
    const insertPayload = {
      user_id: params.userId,
      full_name: params.fullName.trim(),
      date_of_birth: params.dateOfBirth || null,
      gender: params.gender || null,
      phone: params.phone?.trim() || null,
    };

    const { data, error } = await supabase
      .from("patients")
      .upsert(insertPayload, { onConflict: "user_id" })
      .select()
      .single();

    if (error) {
      if (error.code === "PGRST205" || error.message.includes("schema cache") || error.message.includes("does not exist")) {
        return { profile: null, error: new Error(error.message), tableMissing: true };
      }
      return { profile: null, error: new Error(error.message) };
    }

    return { profile: data as PatientProfile, error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create patient profile";
    return { profile: null, error: new Error(message) };
  }
}

/**
 * Updates editable fields of the patient profile.
 * Explicitly guards against modifying primary key, user_id, or created_at.
 */
export async function updatePatientProfile(
  supabase: SupabaseClient,
  userId: string,
  params: PatientProfileUpdate
): Promise<{ profile: PatientProfile | null; error: Error | null; tableMissing?: boolean }> {
  try {
    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (params.full_name !== undefined) {
      updatePayload.full_name = params.full_name.trim();
    }
    if (params.date_of_birth !== undefined) {
      updatePayload.date_of_birth = params.date_of_birth || null;
    }
    if (params.gender !== undefined) {
      updatePayload.gender = params.gender || null;
    }
    if (params.phone !== undefined) {
      updatePayload.phone = params.phone?.trim() || null;
    }

    const { data, error } = await supabase
      .from("patients")
      .update(updatePayload)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) {
      if (error.code === "PGRST205" || error.message.includes("schema cache") || error.message.includes("does not exist")) {
        return { profile: null, error: new Error(error.message), tableMissing: true };
      }
      return { profile: null, error: new Error(error.message) };
    }

    return { profile: data as PatientProfile, error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update patient profile";
    return { profile: null, error: new Error(message) };
  }
}
