"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Users,
  UserPlus,
  Shield,
  ShieldCheck,
  Lock,
  Eye,
  QrCode,
  Plus,
  RefreshCw,
  AlertTriangle,
  Trash2,
  CheckCircle2,
  X,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import {
  fetchFamilyDashboard,
  getCachedFamilyDashboard,
  createFamilyGroup,
  updateFamilyMember,
  removeFamilyMember,
} from "@/lib/services/family";
import {
  FamilyGroupItem,
  FamilyMemberProfile,
} from "@/lib/types";
import { AddFamilyMemberModal } from "./add-family-member-modal";
import { FamilyMemberRecordsModal } from "./family-member-records-modal";
import { CreateConsentModal } from "@/components/consent/create-consent-modal";
import { QrModal } from "@/components/consent/qr-modal";
import { ConsentSessionItem } from "@/lib/types";

interface FamilyManagerProps {
  currentPatientId: string;
}

export function FamilyManager({ currentPatientId }: FamilyManagerProps) {
  const cachedFam = getCachedFamilyDashboard();

  const [groups, setGroups] = useState<FamilyGroupItem[]>(() => cachedFam?.groups || []);
  const [loading, setLoading] = useState(() => !cachedFam);
  const [error, setError] = useState<string | null>(null);

  // Group creation modal state
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("Our Family Health Circle");
  const [creatingGroup, setCreatingGroup] = useState(false);

  // Add member modal state
  const [activeGroupForAdd, setActiveGroupForAdd] = useState<FamilyGroupItem | null>(null);

  // Delete member modal state
  const [memberToDelete, setMemberToDelete] = useState<FamilyMemberProfile | null>(null);
  const [deletingMember, setDeletingMember] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // View member records modal state
  const [selectedMemberForRecords, setSelectedMemberForRecords] = useState<FamilyMemberProfile | null>(null);

  // Consent share modal state for member
  const [sharingMember, setSharingMember] = useState<FamilyMemberProfile | null>(null);
  const [generatedSession, setGeneratedSession] = useState<ConsentSessionItem | null>(null);

  const loadData = useCallback(async (forceRefresh = true) => {
    setLoading(true);
    setError(null);
    const supabase = createClient();

    try {
      const res = await fetchFamilyDashboard(supabase, { forceRefresh });
      if (res.error) {
        setError(res.error.message);
      } else if (res.data) {
        setGroups(res.data.groups);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load family dashboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    const supabase = createClient();

    fetchFamilyDashboard(supabase)
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
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;

    setCreatingGroup(true);
    const supabase = createClient();
    const res = await createFamilyGroup(supabase, newGroupName.trim());
    setCreatingGroup(false);

    if (res.error) {
      alert(`Failed to create group: ${res.error.message}`);
    } else if (res.data) {
      setGroups((prev) => [res.data!, ...prev]);
      setShowCreateGroup(false);
      setNewGroupName("");
    }
  };

  const handleTogglePermission = async (member: FamilyMemberProfile, currentVal: boolean) => {
    const supabase = createClient();
    const newVal = !currentVal;

    // Optimistic update
    setGroups((prev) =>
      prev.map((g) => ({
        ...g,
        members: g.members.map((m) => (m.id === member.id ? { ...m, can_view_records: newVal } : m)),
      }))
    );

    const res = await updateFamilyMember(supabase, member.id, { can_view_records: newVal });
    if (!res.success) {
      alert(`Permission update failed: ${res.error?.message || "Unknown error"}`);
      loadData(); // Revert on failure
    }
  };

  const handleConfirmDeleteMember = async () => {
    if (!memberToDelete) return;
    setDeletingMember(true);
    setDeleteError(null);
    try {
      const supabase = createClient();
      const res = await removeFamilyMember(supabase, memberToDelete.id);
      if (!res.success) {
        setDeleteError(res.error?.message || "Unable to remove family member. Please try again.");
      } else {
        // Remove member from local state without refreshing full page
        setGroups((prev) =>
          prev.map((g) => ({
            ...g,
            members: g.members.filter((m) => m.id !== memberToDelete.id),
          }))
        );
        setMemberToDelete(null);
        setSuccessMessage("Family member removed successfully.");
        setTimeout(() => setSuccessMessage(null), 4500);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unable to remove family member. Please try again.";
      setDeleteError(msg);
    } finally {
      setDeletingMember(false);
    }
  };

  // Calculate total members across all circles
  const allMembers = groups.flatMap((g) => g.members);
  const totalMembersCount = allMembers.length;
  const authorizedToViewCount = allMembers.filter((m) => m.can_view_records).length;

  return (
    <div className="space-y-6">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200">
              Family Circles
            </span>
            <span className="text-xs text-slate-500">•</span>
            <span className="text-xs text-slate-500 font-medium">Independent Multi-Member Management</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 mt-1">
            Family Health Dashboard
          </h2>
          <p className="text-xs text-slate-600 mt-0.5">
            Manage dependents and family circles with strict record isolation. Records are never merged.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadData(true)}
            disabled={loading}
            className="text-xs h-9 text-slate-700 border-slate-300 shadow-2xs"
          >
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin text-indigo-600" : ""}`} />
            Refresh
          </Button>

          <Button
            size="sm"
            onClick={() => setShowCreateGroup(true)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-9 font-semibold shadow-xs"
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Create Family Circle
          </Button>
        </div>
      </div>

      {/* Success Notification */}
      {successMessage && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-900 flex items-center justify-between shadow-2xs animate-in fade-in duration-200">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span className="font-semibold">{successMessage}</span>
          </div>
          <button
            onClick={() => setSuccessMessage(null)}
            className="text-emerald-700 hover:text-emerald-900 transition-colors p-1"
            aria-label="Dismiss message"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Family Members</span>
            <Users className="h-4 w-4 text-indigo-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900">{totalMembersCount}</div>
          <p className="text-[11px] text-slate-500">Separately managed patient identities</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Authorized to View</span>
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900">{authorizedToViewCount}</div>
          <p className="text-[11px] text-slate-500">Members with clinical record viewing access</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Family Circles</span>
            <Shield className="h-4 w-4 text-teal-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900">{groups.length}</div>
          <p className="text-[11px] text-slate-500">Configured family groups</p>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-900 flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold">Family Dashboard Alert</p>
            <p className="text-red-700">{error}</p>
          </div>
        </div>
      )}

      {/* Family Groups List */}
      {groups.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 p-12 text-center space-y-3">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-700 border border-indigo-200">
            <Users className="h-6 w-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-800">No family members added yet.</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Create a family circle to add dependents or family members. Each individual retains their own medical documents, timeline, and privacy controls.
          </p>
          <Button
            size="sm"
            onClick={() => setShowCreateGroup(true)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-9 font-semibold"
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add Family Member
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <div
              key={group.id}
              className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-2xs space-y-4 p-5"
            >
              {/* Group Title Bar */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-200">
                    <Shield className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-slate-900">{group.name}</h3>
                      {group.is_owner && (
                        <Badge className="bg-indigo-50 text-indigo-800 border-indigo-200 text-[10px]">
                          Circle Owner
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs text-slate-500">
                      {group.members.length} {group.members.length === 1 ? "member" : "members"} • Independent Medical Histories
                    </span>
                  </div>
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setActiveGroupForAdd(group)}
                  className="text-xs h-8 text-indigo-700 border-indigo-200 hover:bg-indigo-50"
                >
                  <UserPlus className="mr-1.5 h-3.5 w-3.5" />
                  Add Member
                </Button>
              </div>

              {/* Members Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {group.members.map((member) => {
                  const isCurrent = member.is_current_user || member.patient_id === currentPatientId;
                  const canView = member.can_view_records || isCurrent;

                  return (
                    <div
                      key={member.id}
                      className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 shadow-2xs space-y-3 flex flex-col justify-between hover:bg-white hover:border-slate-300 transition-all"
                    >
                      <div className="space-y-2">
                        {/* Member identity */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white border border-slate-200 font-bold text-xs text-slate-700 shadow-2xs">
                              {member.full_name
                                .split(" ")
                                .map((n) => n[0])
                                .join("")
                                .slice(0, 2)
                                .toUpperCase()}
                            </div>
                            <div>
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-xs font-bold text-slate-900 leading-tight">
                                  {member.full_name}
                                </span>
                                {isCurrent ? (
                                  <Badge className="bg-teal-50 text-teal-800 border-teal-200 text-[9px] px-1 py-0">
                                    Primary Account
                                  </Badge>
                                ) : (
                                  <Badge className="bg-slate-100 text-slate-600 border-slate-200 text-[9px] px-1 py-0">
                                    Managed Dependent (No Direct Login)
                                  </Badge>
                                )}
                              </div>
                              <span className="text-[11px] text-slate-500 block">{member.relationship}</span>
                            </div>
                          </div>
                        </div>

                        {/* Demographics */}
                        <div className="grid grid-cols-2 gap-1 text-[11px] text-slate-500 pt-1">
                          <span>DOB: {member.date_of_birth || "Unstated"}</span>
                          <span className="capitalize">Gender: {member.gender || "Unstated"}</span>
                        </div>

                        {/* Permissions check toggle */}
                        {!isCurrent && (
                          <div className="rounded-lg bg-white p-2.5 border border-slate-200 text-xs space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-semibold text-slate-700">Records Access</span>
                              <input
                                type="checkbox"
                                checked={member.can_view_records}
                                onChange={() => handleTogglePermission(member, member.can_view_records)}
                                className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                              />
                            </div>
                            <p className="text-[10px] text-slate-500 leading-tight">
                              {member.can_view_records
                                ? "Authorized to view medical records"
                                : "Viewing restricted by authorization policy"}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-2 pt-2 border-t border-slate-200/80">
                        {canView ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSelectedMemberForRecords(member)}
                            className="flex-1 text-xs h-8 text-indigo-700 border-indigo-200 hover:bg-indigo-50"
                          >
                            <Eye className="mr-1.5 h-3.5 w-3.5" />
                            View Records
                          </Button>
                        ) : (
                          <div className="flex-1 flex items-center justify-center gap-1 text-[11px] text-slate-400 py-1 font-medium">
                            <Lock className="h-3 w-3" />
                            <span>Access Restricted</span>
                          </div>
                        )}

                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setSharingMember(member)}
                          title="Generate Doctor Access QR for this member"
                          className="text-xs h-8 text-teal-700 hover:bg-teal-50 px-2"
                        >
                          <QrCode className="h-3.5 w-3.5" />
                        </Button>

                        {!isCurrent && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setDeleteError(null);
                              setMemberToDelete(member);
                            }}
                            title="Remove family member"
                            aria-label="Remove family member"
                            className="text-xs h-8 text-slate-400 hover:text-rose-600 hover:bg-rose-50 px-2 transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Family Circle Modal */}
      {showCreateGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-slate-900">Create New Family Circle</h3>
            <p className="text-xs text-slate-500">
              Establish a new family group to manage dependents or family members.
            </p>

            <form onSubmit={handleCreateGroup} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Family Circle Name</label>
                <input
                  type="text"
                  required
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="e.g. Anand Family Health"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowCreateGroup(false)}
                  disabled={creatingGroup}
                  className="text-xs h-9"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={creatingGroup}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-9 font-semibold"
                >
                  {creatingGroup ? "Creating..." : "Create Circle"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Family Member Modal */}
      {activeGroupForAdd && (
        <AddFamilyMemberModal
          groupId={activeGroupForAdd.id}
          groupName={activeGroupForAdd.name}
          onClose={() => setActiveGroupForAdd(null)}
          onAdded={(newMember) => {
            setGroups((prev) =>
              prev.map((g) =>
                g.id === activeGroupForAdd.id ? { ...g, members: [...g.members, newMember] } : g
              )
            );
            setActiveGroupForAdd(null);
          }}
        />
      )}

      {/* Isolated Clinical Records Modal */}
      {selectedMemberForRecords && (
        <FamilyMemberRecordsModal
          member={selectedMemberForRecords}
          onClose={() => setSelectedMemberForRecords(null)}
          onShareDoctorAccess={(member) => {
            setSelectedMemberForRecords(null);
            setSharingMember(member);
          }}
        />
      )}

      {/* Doctor Sharing Consent Modal for Member */}
      {sharingMember && (
        <CreateConsentModal
          onClose={() => setSharingMember(null)}
          initialPatientId={sharingMember.patient_id}
          familyMembers={allMembers}
          onCreated={(session) => {
            setSharingMember(null);
            setGeneratedSession(session);
          }}
        />
      )}

      {/* Generated QR Modal */}
      {generatedSession && (
        <QrModal
          session={generatedSession}
          onClose={() => setGeneratedSession(null)}
        />
      )}

      {/* Confirmation Dialog for Removing Family Member */}
      {memberToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600 border border-rose-200">
                <Trash2 className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-slate-900">Remove Family Member?</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Are you sure you want to remove <strong className="text-slate-900">{memberToDelete.full_name}</strong> from your CarePath family group?
                </p>
                <p className="text-xs text-slate-500">
                  Their separate health profile will no longer appear in this family dashboard.
                </p>
              </div>
            </div>

            {deleteError && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">
                {deleteError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={deletingMember}
                onClick={() => {
                  setMemberToDelete(null);
                  setDeleteError(null);
                }}
                className="text-xs text-slate-700"
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={deletingMember}
                onClick={handleConfirmDeleteMember}
                className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-xs"
              >
                {deletingMember ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    Removing...
                  </>
                ) : (
                  "Remove Member"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
