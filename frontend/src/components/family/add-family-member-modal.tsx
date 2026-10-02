"use client";

import { useState } from "react";
import { X, UserPlus, ShieldCheck, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { addFamilyMember } from "@/lib/services/family";
import { FamilyMemberProfile } from "@/lib/types";

interface AddFamilyMemberModalProps {
  groupId: string;
  groupName: string;
  onClose: () => void;
  onAdded: (member: FamilyMemberProfile) => void;
}

const RELATIONSHIPS = [
  "Spouse",
  "Child",
  "Parent",
  "Sibling",
  "Guardian",
  "Dependent",
  "Other",
];

export function AddFamilyMemberModal({
  groupId,
  groupName,
  onClose,
  onAdded,
}: AddFamilyMemberModalProps) {
  const [fullName, setFullName] = useState("");
  const [relationship, setRelationship] = useState("Child");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [gender, setGender] = useState("unspecified");
  const [phone, setPhone] = useState("");
  const [targetEmail, setTargetEmail] = useState("");
  const [canViewRecords, setCanViewRecords] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      setError("Please provide the family member's full name.");
      return;
    }

    setLoading(true);
    setError(null);

    const supabase = createClient();
    const res = await addFamilyMember(supabase, {
      family_group_id: groupId,
      full_name: fullName.trim(),
      relationship,
      date_of_birth: dateOfBirth || null,
      gender: gender !== "unspecified" ? gender : null,
      phone: phone.trim() || null,
      target_email: targetEmail.trim() || null,
      can_view_records: canViewRecords,
    });

    setLoading(false);

    if (res.error) {
      setError(res.error.message);
    } else if (res.data) {
      onAdded(res.data);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 space-y-5 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-200">
              <UserPlus className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Add Family Member</h3>
              <p className="text-xs text-slate-500">Add to &quot;{groupName}&quot; circle</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">Full Name</label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Maya Anand"
              className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">Relationship</label>
              <select
                value={relationship}
                onChange={(e) => setRelationship(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {RELATIONSHIPS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">Date of Birth</label>
              <input
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">Gender</label>
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="unspecified">Unspecified</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">Contact Phone (Optional)</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1..."
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {(() => {
            if (!dateOfBirth) return null;
            const dob = new Date(dateOfBirth);
            const today = new Date();
            let age = today.getFullYear() - dob.getFullYear();
            const m = today.getMonth() - dob.getMonth();
            if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
              age--;
            }
            if (age >= 16) {
              return (
                <div className="space-y-1.5 pt-1">
                  <label className="text-xs font-semibold text-slate-700">CarePath Email</label>
                  <input
                    type="email"
                    required
                    value={targetEmail}
                    onChange={(e) => setTargetEmail(e.target.value)}
                    placeholder="CarePath account email to send invitation"
                    className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <p className="text-[10px] text-slate-500">
                    Members age 16+ must have their own CarePath account and explicitly grant record access.
                  </p>
                </div>
              );
            }
            return null;
          })()}

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={canViewRecords}
                onChange={(e) => setCanViewRecords(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-xs font-semibold text-slate-800">
                Authorize viewing medical records
              </span>
            </label>
            <p className="text-[11px] text-slate-500 pl-6">
              When checked, this account will be authorized to view the member&apos;s isolated clinical timeline and documents.
            </p>
          </div>

          <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-2.5 text-[11px] text-indigo-900 flex items-start gap-2">
            <ShieldCheck className="h-4 w-4 text-indigo-600 shrink-0 mt-0.5" />
            <span>
              <strong>Record Isolation:</strong> Each member maintains a distinct patient record. Records are never merged into one single history.
            </span>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={loading} className="text-xs h-9">
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={loading}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-9 px-4 font-semibold shadow-xs"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Adding Member...
                </>
              ) : (
                "Add Family Member"
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
