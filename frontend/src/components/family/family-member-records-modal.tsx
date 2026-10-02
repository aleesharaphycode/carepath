"use client";

import { useEffect, useState } from "react";
import { X, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import { fetchFamilyMemberRecords } from "@/lib/services/family";
import { FamilyMemberProfile, FamilyMemberClinicalRecords, ScopedClinicalItem } from "@/lib/types";

interface FamilyMemberRecordsModalProps {
  member: FamilyMemberProfile;
  onClose: () => void;
  onShareDoctorAccess?: (member: FamilyMemberProfile) => void;
}

export function FamilyMemberRecordsModal({
  member,
  onClose,
  onShareDoctorAccess,
}: FamilyMemberRecordsModalProps) {
  const [data, setData] = useState<FamilyMemberClinicalRecords | null>(null);
  const [activeTab, setActiveTab] = useState<"timeline" | "medications" | "investigations" | "diagnoses">("timeline");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const supabase = createClient();

    fetchFamilyMemberRecords(supabase, member.patient_id)
      .then((res) => {
        if (!isMounted) return;
        if (res.error) {
          setError(res.error.message);
        } else {
          setData(res.data);
        }
      })
      .catch((err: unknown) => {
        if (isMounted) setError(err instanceof Error ? err.message : "Failed to load member records.");
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [member.patient_id]);

  const timelineEvents = data?.timeline?.events || [];
  const medications = data?.medications || [];
  const investigations = data?.investigations || [];
  const diagnoses = data?.diagnoses || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="relative w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 space-y-5 animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between pb-3 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-700 border border-indigo-200 font-bold text-sm">
              {member.full_name
                .split(" ")
                .map((n) => n[0])
                .join("")
                .toUpperCase()
                .slice(0, 2)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">{member.full_name}</h3>
                <Badge variant="outline" className="text-[10px] bg-slate-50 text-slate-700 border-slate-200">
                  {member.relationship}
                </Badge>
              </div>
              <p className="text-xs text-slate-500">
                Independent Clinical History • Patient ID: {member.patient_id.slice(0, 8)}...
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onShareDoctorAccess && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  onClose();
                  onShareDoctorAccess(member);
                }}
                className="text-xs h-8 text-teal-700 border-teal-200 hover:bg-teal-50"
              >
                Share with Doctor
              </Button>
            )}
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Demographics bar */}
        <div className="grid grid-cols-3 gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-xs shrink-0">
          <div>
            <span className="text-[10px] text-slate-400 font-semibold block uppercase">DOB</span>
            <span className="text-slate-700 font-medium">{member.date_of_birth || "Unspecified"}</span>
          </div>
          <div>
            <span className="text-[10px] text-slate-400 font-semibold block uppercase">Gender</span>
            <span className="text-slate-700 font-medium capitalize">{member.gender || "Unspecified"}</span>
          </div>
          <div>
            <span className="text-[10px] text-slate-400 font-semibold block uppercase">Phone</span>
            <span className="text-slate-700 font-medium">{member.phone || "Unspecified"}</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-200 pb-2 shrink-0">
          <button
            onClick={() => setActiveTab("timeline")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === "timeline" ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            Timeline ({timelineEvents.length})
          </button>
          <button
            onClick={() => setActiveTab("medications")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === "medications" ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            Medications ({medications.length})
          </button>
          <button
            onClick={() => setActiveTab("investigations")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === "investigations" ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            Labs ({investigations.length})
          </button>
          <button
            onClick={() => setActiveTab("diagnoses")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === "diagnoses" ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            Diagnoses ({diagnoses.length})
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-3">
          {loading ? (
            <div className="p-12 text-center space-y-2">
              <Loader2 className="h-6 w-6 animate-spin text-indigo-600 mx-auto" />
              <p className="text-xs text-slate-500">Retrieving authorized medical records...</p>
            </div>
          ) : error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-900 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Access Restricted</p>
                <p className="text-red-700">{error}</p>
              </div>
            </div>
          ) : (
            <>
              {activeTab === "timeline" && (
                <div className="space-y-2.5">
                  {timelineEvents.length === 0 ? (
                    <p className="text-xs text-slate-500 text-center py-8">No timeline records documented for this member yet.</p>
                  ) : (
                    timelineEvents.map((ev) => (
                      <div key={ev.id} className="rounded-xl border border-slate-200 p-3 bg-white shadow-2xs space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-900">{ev.title}</span>
                          <Badge variant="outline" className="text-[10px] capitalize bg-slate-50">
                            {ev.event_type}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-slate-500">
                          <span>{ev.date_display}</span>
                          <span className="truncate max-w-[200px]">{ev.document_name}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {activeTab === "medications" && (
                <div className="space-y-2.5">
                  {medications.length === 0 ? (
                    <p className="text-xs text-slate-500 text-center py-8">No medications documented for this member.</p>
                  ) : (
                    medications.map((m: ScopedClinicalItem) => (
                      <div key={m.id} className="rounded-xl border border-slate-200 p-3 bg-white shadow-2xs space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-900">{m.name}</span>
                          <span className="text-xs font-semibold text-teal-700">{m.dose || "Dose unstated"}</span>
                        </div>
                        <p className="text-[11px] text-slate-600">
                          {m.frequency} {m.duration ? `• ${m.duration}` : ""} {m.instructions ? `• (${m.instructions})` : ""}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              )}

              {activeTab === "investigations" && (
                <div className="space-y-2.5">
                  {investigations.length === 0 ? (
                    <p className="text-xs text-slate-500 text-center py-8">No lab investigations documented for this member.</p>
                  ) : (
                    investigations.map((inv: ScopedClinicalItem) => (
                      <div key={inv.id} className="rounded-xl border border-slate-200 p-3 bg-white shadow-2xs space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-900">{inv.name}</span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-slate-900">
                              {inv.result} {inv.unit || ""}
                            </span>
                            {inv.abnormal_flag && (
                              <Badge className="bg-amber-50 text-amber-800 border-amber-300 text-[10px]">
                                Abnormal
                              </Badge>
                            )}
                          </div>
                        </div>
                        {inv.reference_range && (
                          <p className="text-[10px] text-slate-500">Ref Range: {inv.reference_range}</p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}

              {activeTab === "diagnoses" && (
                <div className="space-y-2.5">
                  {diagnoses.length === 0 ? (
                    <p className="text-xs text-slate-500 text-center py-8">No diagnoses documented for this member.</p>
                  ) : (
                    diagnoses.map((d: ScopedClinicalItem) => (
                      <div key={d.id} className="rounded-xl border border-slate-200 p-3 bg-white shadow-2xs space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-900">{d.name}</span>
                          <Badge variant="outline" className="text-[10px] capitalize bg-slate-50">
                            {d.status || "Documented"}
                          </Badge>
                        </div>
                        <p className="text-[11px] text-slate-500">{d.date || "Date unspecified"}</p>
                      </div>
                    ))
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
