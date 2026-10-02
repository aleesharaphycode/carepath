import os
path = '../frontend/src/components/family/family-manager.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

target1 = '''  removeFamilyMember,
  acceptFamilyInvitation,
} from "@/lib/services/family";'''

replacement1 = '''  removeFamilyMember,
  acceptFamilyInvitation,
  getFamilyInvitations,
  declineFamilyInvitation,
} from "@/lib/services/family";'''

target2 = '''  FamilyGroupItem,
  FamilyMemberProfile,
} from "@/lib/types";'''

replacement2 = '''  FamilyGroupItem,
  FamilyMemberProfile,
  FamilyInvitationItem,
} from "@/lib/types";'''

target3 = '''  const [groups, setGroups] = useState<FamilyGroupItem[]>(() => cachedFam?.groups || []);
  const [loading, setLoading] = useState(() => !cachedFam);
  const [error, setError] = useState<string | null>(null);'''

replacement3 = '''  const [groups, setGroups] = useState<FamilyGroupItem[]>(() => cachedFam?.groups || []);
  const [invitations, setInvitations] = useState<FamilyInvitationItem[]>([]);
  const [loading, setLoading] = useState(() => !cachedFam);
  const [error, setError] = useState<string | null>(null);'''

target4 = '''    try {
      const res = await fetchFamilyDashboard(supabase, { forceRefresh });
      if (res.error) {
        setError(res.error.message);
      } else if (res.data) {
        setGroups(res.data.groups);
      }
    } catch (err: unknown) {'''

replacement4 = '''    try {
      const res = await fetchFamilyDashboard(supabase, { forceRefresh });
      if (res.error) {
        setError(res.error.message);
      } else if (res.data) {
        setGroups(res.data.groups);
      }
      const invRes = await getFamilyInvitations(supabase);
      if (invRes.data) setInvitations(invRes.data.invitations);
    } catch (err: unknown) {'''

target5 = '''    fetchFamilyDashboard(supabase)
      .then((res) => {
        if (!isMounted) return;
        if (res.error) {
          setError(res.error.message);
        } else if (res.data) {
          setGroups(res.data.groups);
        }
      })
      .catch((err: unknown) => {
        if (isMounted) setError(err instanceof Error ? err.message : "Failed to load family dashboard.");
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });'''

replacement5 = '''    Promise.all([fetchFamilyDashboard(supabase), getFamilyInvitations(supabase)])
      .then(([res, invRes]) => {
        if (!isMounted) return;
        if (res.error) {
          setError(res.error.message);
        } else if (res.data) {
          setGroups(res.data.groups);
        }
        if (invRes.data) {
          setInvitations(invRes.data.invitations);
        }
      })
      .catch((err: unknown) => {
        if (isMounted) setError(err instanceof Error ? err.message : "Failed to load family dashboard.");
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });'''

target6 = '''  const handleAcceptInvitation = async (member: FamilyMemberProfile) => {
    const supabase = createClient();
    const res = await acceptFamilyInvitation(supabase, member.id);
    if (!res.success) {
      alert(`Failed to accept invitation: ${res.error?.message || "Unknown error"}`);
    } else {
      setSuccessMessage("Invitation accepted successfully.");
      setTimeout(() => setSuccessMessage(null), 4500);
      loadData();
    }
  };'''

replacement6 = '''  const handleAcceptInvitation = async (id: string) => {
    const supabase = createClient();
    const res = await acceptFamilyInvitation(supabase, id);
    if (!res.success) {
      alert(`Failed to accept invitation: ${res.error?.message || "Unknown error"}`);
    } else {
      setSuccessMessage("Invitation accepted successfully.");
      setTimeout(() => setSuccessMessage(null), 4500);
      loadData();
    }
  };

  const handleDeclineInvitation = async (id: string) => {
    const supabase = createClient();
    const res = await declineFamilyInvitation(supabase, id);
    if (!res.success) {
      alert(`Failed to decline invitation: ${res.error?.message || "Unknown error"}`);
    } else {
      setSuccessMessage("Invitation declined.");
      setTimeout(() => setSuccessMessage(null), 4500);
      loadData();
    }
  };'''

target7 = '''onClick={() => handleAcceptInvitation(member)}'''
replacement7 = '''onClick={() => handleAcceptInvitation(member.id)}'''

target8 = '''      {/* Family Groups List */}'''

replacement8 = '''      {/* Pending Invitations */}
      {invitations.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-slate-900">Family Invitations</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {invitations.map((inv) => (
              <div
                key={inv.id}
                className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4 shadow-sm space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white border border-amber-200 font-bold text-xs text-amber-700 shadow-sm">
                      {inv.group_name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">{inv.group_name}</h4>
                      <p className="text-[11px] text-slate-600">Invited by: {inv.inviter_name} ({inv.relationship})</p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-2">
                  <Button
                    size="sm"
                    onClick={() => handleAcceptInvitation(inv.id)}
                    className="flex-1 bg-amber-600 hover:bg-amber-700 text-white text-xs h-8 font-semibold"
                  >
                    <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDeclineInvitation(inv.id)}
                    className="flex-1 text-xs h-8 text-slate-600 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200"
                  >
                    <X className="mr-1.5 h-3.5 w-3.5" />
                    Decline
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Family Groups List */}'''

for pair in [(target1, replacement1), (target2, replacement2), (target3, replacement3), (target4, replacement4), (target5, replacement5), (target6, replacement6), (target7, replacement7), (target8, replacement8)]:
    content = content.replace(pair[0], pair[1])

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print('Updated family-manager.tsx')
