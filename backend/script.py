import os
path = '../frontend/src/lib/services/family.ts'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

target1 = '''  UpdateFamilyMemberRequest,
  FamilyMemberClinicalRecords,
} from "@/lib/types";'''

replacement1 = '''  UpdateFamilyMemberRequest,
  FamilyMemberClinicalRecords,
  FamilyInvitationsResponse,
} from "@/lib/types";'''

target2 = '''export async function acceptFamilyInvitation(
  supabase: SupabaseClient,
  membershipId: string
): Promise<{ success: boolean; error: Error | null }> {'''

replacement2 = '''export async function getFamilyInvitations(
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
): Promise<{ success: boolean; error: Error | null }> {'''

content = content.replace(target1, replacement1)
content = content.replace(target2, replacement2)
with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print('Updated family.ts')
