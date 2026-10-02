"use client";

import { useState } from "react";
import { X, ShieldCheck, Check, Loader2, Sparkles, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { createConsentSession } from "@/lib/services/consent";
import { ConsentSessionItem, FamilyMemberProfile } from "@/lib/types";

interface CreateConsentModalProps {
  onClose: () => void;
  onCreated: (session: ConsentSessionItem) => void;
  familyMembers?: FamilyMemberProfile[];
  initialPatientId?: string;
}

const SCOPE_OPTIONS = [
  { id: "timeline", label: "Unified Health Timeline", desc: "Chronological journey and milestone events", default: true },
  { id: "medications", label: "Prescriptions & Regimens", desc: "Drug names, dosages, durations, and instructions", default: true },
  { id: "investigations", label: "Lab Results & Investigations", desc: "Blood panels, biomarkers, and reference ranges", default: true },
  { id: "diagnoses", label: "Clinical Diagnoses", desc: "Documented medical conditions and status", default: true },
  { id: "procedures", label: "Surgeries & Procedures", desc: "Operative history and procedural notes", default: false },
  { id: "follow_ups", label: "Follow-ups & Calendar", desc: "Scheduled reviews and milestone intervals", default: false },
  { id: "documents", label: "Medical Documents List", desc: "Document metadata in vault", default: false },
  { id: "profile", label: "Basic Patient Demographics", desc: "Name, DOB, gender, and contact phone", default: true },
];

const DURATION_OPTIONS = [
  { minutes: 15, label: "15 Minutes", desc: "Quick consultation / demo" },
  { minutes: 60, label: "1 Hour", desc: "Standard clinic visit" },
  { minutes: 1440, label: "24 Hours", desc: "Inpatient / day encounter" },
];

export function CreateConsentModal({
  onClose,
  onCreated,
  familyMembers = [],
  initialPatientId,
}: CreateConsentModalProps) {
  const [recipientName, setRecipientName] = useState("Dr. Sarah Jenkins - General Hospital");
  const [selectedPatientId, setSelectedPatientId] = useState<string>(initialPatientId || "");
  const [selectedScopes, setSelectedScopes] = useState<string[]>(
    SCOPE_OPTIONS.filter((s) => s.default).map((s) => s.id)
  );
  const [durationMinutes, setDurationMinutes] = useState<number>(60);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleScope = (scopeId: string) => {
    setSelectedScopes((prev) =>
      prev.includes(scopeId) ? prev.filter((s) => s !== scopeId) : [...prev, scopeId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipientName.trim()) {
      setError("Please specify the recipient doctor or clinic name.");
      return;
    }
    if (selectedScopes.length === 0) {
      setError("Please select at least one data category to share.");
      return;
    }

    setLoading(true);
    setError(null);

    const supabase = createClient();
    const res = await createConsentSession(supabase, {
      patient_id: selectedPatientId || undefined,
      recipient_name: recipientName.trim(),
      scope: selectedScopes,
      duration_minutes: durationMinutes,
    });

    setLoading(false);

    if (res.error) {
      setError(res.error.message);
    } else if (res.data) {
      onCreated(res.data);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 space-y-5 animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-teal-700 bg-teal-50 px-2 py-0.5 rounded-md border border-teal-200">
              Least-Privilege Sharing
            </span>
            <h3 className="text-lg font-bold text-slate-900 mt-1">Share with Doctor</h3>
            <p className="text-xs text-slate-500">Create a time-bound QR code for an attending healthcare provider</p>
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
          {/* Recipient Doctor / Clinic */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">Recipient (Doctor Name)</label>
            <input
              type="text"
              required
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              placeholder="e.g. Dr. Sarah Jenkins, Apollo Clinic"
              className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          {/* Family Member Target (if family members exist) */}
          {familyMembers.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">Sharing Record For</label>
              <select
                value={selectedPatientId}
                onChange={(e) => setSelectedPatientId(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <option value="">Myself (Primary Account)</option>
                {familyMembers
                  .filter((m) => !m.is_current_user)
                  .map((m) => (
                    <option key={m.patient_id} value={m.patient_id}>
                      {m.full_name} ({m.relationship})
                    </option>
                  ))}
              </select>
            </div>
          )}

          {/* Scopes Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-700">Access (Permitted Information Scope)</label>
              <span className="text-[11px] text-slate-500">Only checked data will be visible</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {SCOPE_OPTIONS.map((opt) => {
                const checked = selectedScopes.includes(opt.id);
                return (
                  <div
                    key={opt.id}
                    onClick={() => toggleScope(opt.id)}
                    className={`cursor-pointer rounded-xl border p-2.5 transition-all flex items-start gap-2.5 ${
                      checked
                        ? "border-teal-500 bg-teal-50/50 ring-1 ring-teal-400"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <div
                      className={`h-4 w-4 rounded-md border flex items-center justify-center shrink-0 mt-0.5 ${
                        checked ? "bg-teal-600 border-teal-600 text-white" : "border-slate-300 bg-white"
                      }`}
                    >
                      {checked && <Check className="h-3 w-3 stroke-[3]" />}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-800 leading-tight">{opt.label}</div>
                      <div className="text-[10px] text-slate-500 leading-tight mt-0.5">{opt.desc}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Duration Options */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">Duration (Auto-Expires)</label>
            <div className="grid grid-cols-3 gap-2">
              {DURATION_OPTIONS.map((dur) => {
                const selected = durationMinutes === dur.minutes;
                return (
                  <div
                    key={dur.minutes}
                    onClick={() => setDurationMinutes(dur.minutes)}
                    className={`cursor-pointer rounded-xl border p-2.5 text-center transition-all ${
                      selected
                        ? "border-teal-600 bg-teal-50 text-teal-900 ring-1 ring-teal-500 font-bold"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 font-medium"
                    }`}
                  >
                    <div className="text-xs">{dur.label}</div>
                    <div className="text-[10px] text-slate-500 font-normal">{dur.desc}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Security Summary Alert */}
          <div className="rounded-xl border border-teal-200 bg-teal-50/60 p-3 text-[11px] text-teal-900 flex items-start gap-2">
            <ShieldCheck className="h-4 w-4 text-teal-600 shrink-0 mt-0.5" />
            <div>
              <strong>Server-Side Enforced:</strong> The doctor will only receive data within the selected scope. You can revoke access at any second from this dashboard.
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={loading} className="text-xs h-9">
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={loading}
              className="bg-teal-600 hover:bg-teal-700 text-white text-xs h-9 px-4 font-semibold shadow-xs"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Generating Session...
                </>
              ) : (
                <>
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                  Generate Secure QR
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
