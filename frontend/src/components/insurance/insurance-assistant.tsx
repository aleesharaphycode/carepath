"use client";

import { useEffect, useState } from "react";
import {
  ShieldCheck,
  FileCheck2,
  AlertTriangle,
  Plus,
  RefreshCw,
  Eye,
  Calendar,
  Building2,
  DollarSign,
  Hash,
  Sparkles,
  Trash2,
  Info,
  Loader2,
  Check,
  X,
  HelpCircle,
  FileSearch,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import {
  fetchInsuranceClaims,
  createInsuranceClaim,
  recheckInsuranceClaim,
  deleteInsuranceClaim,
} from "@/lib/services/insurance";
import { DocumentViewerModal } from "@/components/documents/document-viewer-modal";
import {
  InsuranceClaim,
  PatientProfile,
  MedicalDocument,
  CreateClaimRequest,
} from "@/lib/types";

interface InsuranceAssistantProps {
  profile: PatientProfile;
}

export function InsuranceAssistant({ profile }: InsuranceAssistantProps) {
  const [claims, setClaims] = useState<InsuranceClaim[]>([]);
  const [activeClaimId, setActiveClaimId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Claim creation form modal state
  const [isNewClaimModalOpen, setIsNewClaimModalOpen] = useState(false);
  const [creatingClaim, setCreatingClaim] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [newClaimForm, setNewClaimForm] = useState<CreateClaimRequest>({
    insurance_provider: "",
    claim_type: "hospitalization_reimbursement",
    hospital_name: "",
    admission_date: "",
    discharge_date: "",
    claim_amount: undefined,
    policy_number: "",
  });

  // Action states
  const [rechecking, setRechecking] = useState(false);
  const [deletingClaimId, setDeletingClaimId] = useState<string | null>(null);

  // Document viewer modal state
  const [selectedDoc, setSelectedDoc] = useState<MedicalDocument | null>(null);
  const [viewDocLoading, setViewDocLoading] = useState(false);
  const [viewDocError, setViewDocError] = useState<string | null>(null);

  // Expanded explanations for checklist items (Why this matched?)
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});

  const supabase = createClient();

  // Load claims on mount
  useEffect(() => {
    let isMounted = true;
    fetchInsuranceClaims(supabase)
      .then((res) => {
        if (!isMounted) return;
        if (res.error) {
          setError(res.error.message);
        } else {
          setClaims(res.data);
          if (res.data.length > 0) {
            setActiveClaimId((current) => current || res.data[0].id);
          }
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [supabase]);

  const activeClaim = claims.find((c) => c.id === activeClaimId) || claims[0] || null;

  // Handle new claim submission
  const handleCreateClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClaimForm.insurance_provider.trim()) {
      setFormError("Please enter your insurance provider name.");
      return;
    }
    if (!newClaimForm.hospital_name.trim()) {
      setFormError("Please enter the hospital or clinic name.");
      return;
    }
    if (!newClaimForm.admission_date || !newClaimForm.discharge_date) {
      setFormError("Please provide both admission and discharge dates.");
      return;
    }
    if (newClaimForm.admission_date > newClaimForm.discharge_date) {
      setFormError("Discharge date cannot be earlier than admission date.");
      return;
    }

    setCreatingClaim(true);
    setFormError(null);

    const res = await createInsuranceClaim(supabase, {
      ...newClaimForm,
      claim_amount: newClaimForm.claim_amount ? Number(newClaimForm.claim_amount) : undefined,
    });

    setCreatingClaim(false);

    if (res.error || !res.data) {
      setFormError(res.error?.message || "Failed to create claim checklist.");
      return;
    }

    // Success
    setClaims((prev) => [res.data!, ...prev]);
    setActiveClaimId(res.data.id);
    setIsNewClaimModalOpen(false);
    setNewClaimForm({
      insurance_provider: "",
      claim_type: "hospitalization_reimbursement",
      hospital_name: "",
      admission_date: "",
      discharge_date: "",
      claim_amount: undefined,
      policy_number: "",
    });
  };

  // Re-check vault for the active claim
  const handleRecheckClaim = async (claimId: string) => {
    setRechecking(true);
    setError(null);
    const res = await recheckInsuranceClaim(supabase, claimId);
    setRechecking(false);

    if (res.error || !res.data) {
      setError(res.error?.message || "Failed to re-check vault.");
      return;
    }

    setClaims((prev) => prev.map((c) => (c.id === claimId ? res.data! : c)));
  };

  // Delete claim
  const handleDeleteClaim = async (claimId: string) => {
    if (!confirm("Are you sure you want to remove this claim preparation checklist?")) return;
    setDeletingClaimId(claimId);
    const res = await deleteInsuranceClaim(supabase, claimId);
    setDeletingClaimId(null);

    if (res.error) {
      setError(res.error.message);
      return;
    }

    const updated = claims.filter((c) => c.id !== claimId);
    setClaims(updated);
    if (activeClaimId === claimId) {
      setActiveClaimId(updated.length > 0 ? updated[0].id : null);
    }
  };

  // Open Document in the existing CarePath DocumentViewerModal
  const handleViewDocument = async (documentId: string) => {
    setViewDocLoading(true);
    setViewDocError(null);

    try {
      const { data, error: fetchErr } = await supabase
        .from("documents")
        .select("*")
        .eq("id", documentId)
        .single();

      if (fetchErr || !data) {
        setViewDocError("Could not load document preview. You can still access it from Document Vault.");
        return;
      }

      setSelectedDoc(data as MedicalDocument);
    } catch {
      setViewDocError("Document preview unavailable.");
    } finally {
      setViewDocLoading(false);
    }
  };

  const toggleExpand = (itemId: string) => {
    setExpandedItems((prev) => ({ ...prev, [itemId]: !prev[itemId] }));
  };

  // Helper for status formatting
  const renderStatusBadge = (status: string) => {
    switch (status) {
      case "found":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 border border-emerald-200">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            Found
          </span>
        );
      case "needs_verification":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 border border-amber-200">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            Needs verification
          </span>
        );
      case "missing":
      default:
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 border border-rose-200">
            <span className="h-2 w-2 rounded-full bg-rose-500" />
            Missing
          </span>
        );
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-500 space-y-3">
        <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
        <p className="text-sm font-medium">Checking your Document Vault for insurance records...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Top Banner & Header */}
      <div className="rounded-2xl border border-teal-200/80 bg-gradient-to-br from-teal-500/10 via-emerald-500/5 to-cyan-500/10 p-6 sm:p-8 backdrop-blur-xs relative overflow-hidden shadow-xs">
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-5">
          <div className="space-y-1.5 max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-teal-100/80 border border-teal-200 px-3 py-1 text-xs font-semibold text-teal-800">
              <ShieldCheck className="h-3.5 w-3.5 text-teal-700" />
              Claim Episode Attribution Engine &bull; {profile.full_name}
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
              AI Insurance Claim Assistant
            </h1>
            <p className="text-sm text-slate-600 leading-relaxed">
              CarePath doesn&apos;t just check for document types. It evaluates whether uploaded records specifically
              belong to <strong>this hospital</strong> and <strong>hospitalization episode</strong>.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              onClick={() => setIsNewClaimModalOpen(true)}
              className="bg-teal-600 hover:bg-teal-700 text-white font-medium shadow-xs gap-2 text-xs sm:text-sm h-10 px-4"
            >
              <Plus className="h-4 w-4" />
              Start New Claim
            </Button>
          </div>
        </div>

        {/* Decorative corner accent */}
        <div className="absolute -top-12 -right-12 h-40 w-40 rounded-full bg-teal-200/30 blur-2xl pointer-events-none" />
      </div>

      {/* Error alert if any */}
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800 flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <strong className="font-semibold text-rose-900">Notice: </strong>
            {error}
          </div>
          <button
            onClick={() => setError(null)}
            className="text-rose-500 hover:text-rose-800 font-bold"
          >
            &times;
          </button>
        </div>
      )}

      {/* Document preview error notice */}
      {viewDocError && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-800 flex items-start gap-2.5">
          <Info className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <span className="flex-1">{viewDocError}</span>
          <button
            onClick={() => setViewDocError(null)}
            className="text-amber-600 hover:text-amber-900 font-semibold"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Content Area */}
      {claims.length === 0 ? (
        // Empty State
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center shadow-xs">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-teal-50 text-teal-600 mb-4">
            <FileCheck2 className="h-7 w-7" />
          </div>
          <h3 className="text-base font-semibold text-slate-900">No active insurance claims</h3>
          <p className="mt-1.5 text-xs text-slate-500 max-w-md mx-auto">
            You haven&apos;t started an insurance claim preparation yet. Click below to verify your Document Vault against hospital reimbursement requirements.
          </p>
          <div className="mt-6">
            <Button
              onClick={() => setIsNewClaimModalOpen(true)}
              className="bg-teal-600 hover:bg-teal-700 text-white text-xs px-4 py-2 gap-2"
            >
              <Plus className="h-3.5 w-3.5" />
              Prepare Hospitalization Claim
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Claims switcher & Claim details */}
          <div className="lg:col-span-4 space-y-6">
            {/* Multiple claims switcher card */}
            {claims.length > 1 && (
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Your Claim Records ({claims.length})
                </h4>
                <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                  {claims.map((c) => {
                    const isSelected = c.id === activeClaim?.id;
                    return (
                      <button
                        key={c.id}
                        onClick={() => setActiveClaimId(c.id)}
                        className={`w-full text-left p-3 rounded-lg border transition-all text-xs flex items-center justify-between ${
                          isSelected
                            ? "border-teal-500 bg-teal-50/60 font-semibold text-teal-950 shadow-2xs"
                            : "border-slate-200 bg-slate-50/50 hover:bg-slate-100 text-slate-700"
                        }`}
                      >
                        <div className="truncate mr-2">
                          <p className="truncate font-medium">{c.insurance_provider}</p>
                          <p className="text-[11px] text-slate-500 truncate">{c.hospital_name}</p>
                        </div>
                        <Badge
                          variant="outline"
                          className={
                            c.readiness_percentage >= 75
                              ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                              : c.readiness_percentage >= 40
                              ? "bg-amber-50 text-amber-700 border-amber-300"
                              : "bg-rose-50 text-rose-700 border-rose-300"
                          }
                        >
                          {c.readiness_percentage}%
                        </Badge>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Active Claim Info Summary Card */}
            {activeClaim && (
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-teal-600">
                      Claim Profile
                    </span>
                    <h3 className="text-base font-bold text-slate-900 leading-tight">
                      {activeClaim.insurance_provider}
                    </h3>
                  </div>
                  <button
                    onClick={() => handleDeleteClaim(activeClaim.id)}
                    disabled={deletingClaimId === activeClaim.id}
                    title="Remove claim"
                    className="p-1.5 text-slate-400 hover:text-rose-600 transition-colors rounded-md"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="space-y-2.5 text-xs text-slate-600">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    <span className="text-slate-500">Hospital:</span>
                    <strong className="text-slate-800 truncate">{activeClaim.hospital_name}</strong>
                  </div>

                  <div className="flex items-center gap-2">
                    <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    <span className="text-slate-500">Claim Stay:</span>
                    <span className="font-mono text-slate-800">
                      {activeClaim.admission_date} &rarr; {activeClaim.discharge_date}
                    </span>
                  </div>

                  {activeClaim.policy_number && (
                    <div className="flex items-center gap-2">
                      <Hash className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      <span className="text-slate-500">Policy #:</span>
                      <span className="font-mono text-slate-800 font-medium">{activeClaim.policy_number}</span>
                    </div>
                  )}

                  {activeClaim.claim_amount && (
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      <span className="text-slate-500">Claim Amount:</span>
                      <strong className="text-slate-900">
                        ₹{activeClaim.claim_amount.toLocaleString("en-IN")}
                      </strong>
                    </div>
                  )}
                </div>

                {/* Insurer Verification & Network Details (STEP 10 & STEP 16) */}
                <div className="rounded-lg bg-slate-50 p-3 border border-slate-200/80 space-y-2 text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">Network status:</span>
                    <Badge variant="outline" className="text-[10px] bg-slate-100 text-slate-700 border-slate-300">
                      {activeClaim.network_status || "Not verified"}
                    </Badge>
                  </div>
                  <p className="text-[10px] text-slate-400 leading-tight">
                    CarePath does not guess insurer coverage. Confirm network eligibility with your insurance provider.
                  </p>
                </div>

                {/* Re-check action */}
                <div className="pt-2 border-t border-slate-100">
                  <Button
                    onClick={() => handleRecheckClaim(activeClaim.id)}
                    disabled={rechecking}
                    variant="outline"
                    className="w-full text-xs h-9 gap-2 border-teal-200 text-teal-700 hover:bg-teal-50"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${rechecking ? "animate-spin" : ""}`} />
                    {rechecking ? "Scanning Vault..." : "Re-check Document Vault"}
                  </Button>
                </div>
              </div>
            )}

            {/* Architecture Principles Notice */}
            <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-4 text-[11px] text-slate-600 space-y-2">
              <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                <Sparkles className="h-3.5 w-3.5 text-teal-600" />
                Episode Attribution Engine
              </div>
              <p className="leading-relaxed">
                Documents are verified against patient ownership, hospital normalization, and clinical admission dates. Gemini is called strictly as an ambiguity fallback and cannot override hospital or date mismatches.
              </p>
            </div>
          </div>

          {/* Right Column: Claim Readiness Stats & Interactive Checklist */}
          {activeClaim && (
            <div className="lg:col-span-8 space-y-6">
              {/* CLAIM READINESS DASHBOARD */}
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                      <FileCheck2 className="h-5 w-5 text-teal-600" />
                      Insurance Claim Readiness
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Episode: <strong className="text-slate-800">{activeClaim.hospital_name}</strong> · {activeClaim.admission_date} &rarr; {activeClaim.discharge_date}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-black text-slate-900">
                      {activeClaim.readiness_percentage}%
                    </span>
                    <span className="text-xs text-slate-500 font-medium">Ready</span>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden flex shadow-inner">
                  <div
                    style={{
                      width: `${(activeClaim.found_count / (activeClaim.total_items || 1)) * 100}%`,
                    }}
                    className="bg-emerald-500 transition-all duration-500"
                    title={`${activeClaim.found_count} Found`}
                  />
                  <div
                    style={{
                      width: `${(activeClaim.needs_verification_count / (activeClaim.total_items || 1)) * 100}%`,
                    }}
                    className="bg-amber-400 transition-all duration-500"
                    title={`${activeClaim.needs_verification_count} Needs Verification`}
                  />
                  <div
                    style={{
                      width: `${(activeClaim.missing_count / (activeClaim.total_items || 1)) * 100}%`,
                    }}
                    className="bg-rose-400 transition-all duration-500"
                    title={`${activeClaim.missing_count} Missing`}
                  />
                </div>

                {/* Status Counter Pills */}
                <div className="grid grid-cols-3 gap-3 pt-1">
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-center">
                    <p className="text-xl font-bold text-emerald-700">{activeClaim.found_count}</p>
                    <p className="text-[11px] font-semibold text-emerald-800">🟢 Found</p>
                  </div>

                  <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-center">
                    <p className="text-xl font-bold text-amber-700">{activeClaim.needs_verification_count}</p>
                    <p className="text-[11px] font-semibold text-amber-800">🟡 Needs Verification</p>
                  </div>

                  <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-3 text-center">
                    <p className="text-xl font-bold text-rose-700">{activeClaim.missing_count}</p>
                    <p className="text-[11px] font-semibold text-rose-800">🔴 Missing</p>
                  </div>
                </div>

                {/* Checklist source indication */}
                <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-100">
                  <span>Checklist source: <strong className="text-slate-700 font-medium">{activeClaim.checklist_source || "General claim-preparation checklist"}</strong></span>
                  <span className="text-teal-700 font-medium">Verify against policy</span>
                </div>
              </div>

              {/* DOCUMENT CHECKLIST WITH COMPACT EVIDENCE INSPECTION */}
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
                <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                    Document Checklist ({activeClaim.items.length} Requirements)
                  </h3>
                  <span className="text-xs text-slate-400">
                    Hospitalization / Reimbursement
                  </span>
                </div>

                <div className="space-y-3">
                  {activeClaim.items.map((item, index) => {
                    const isExpanded = !!expandedItems[item.id];
                    const ev = item.evidence;

                    return (
                      <div
                        key={item.id}
                        className={`rounded-xl border transition-all p-4 ${
                          item.status === "found"
                            ? "border-emerald-200/90 bg-emerald-50/20 hover:border-emerald-300"
                            : item.status === "needs_verification"
                            ? "border-amber-200/90 bg-amber-50/20 hover:border-amber-300"
                            : "border-slate-200 bg-slate-50/40 hover:border-slate-300"
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex items-start gap-3">
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600 shrink-0 mt-0.5">
                              {index + 1}
                            </span>
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="text-sm font-semibold text-slate-900">
                                  {item.requirement}
                                </h4>
                                {renderStatusBadge(item.status)}
                              </div>

                              {/* Source line & hospital attribution evidence (STEP 16) */}
                              {item.status === "found" && item.matched_document_name && (
                                <p className="mt-1 text-xs text-emerald-800 font-medium flex items-center gap-1.5">
                                  <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                                  <span>{ev?.hospital_name_in_doc || activeClaim.hospital_name}</span>
                                  <span>&bull;</span>
                                  <span>{ev?.document_date || "Episode window"}</span>
                                  <span className="text-slate-400">({item.matched_document_name})</span>
                                </p>
                              )}

                              {item.status === "needs_verification" && (
                                <p className="mt-1 text-xs text-amber-800 font-medium flex items-center gap-1.5">
                                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                                  <span>
                                    {ev?.discrepancies?.[0] || item.explanation || "Hospital or date metadata requires verification"}
                                  </span>
                                </p>
                              )}

                              {item.status === "missing" && (
                                <p className="mt-1 text-xs text-slate-500">
                                  No eligible document found for this claim episode.
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Action Buttons: View evidence & View document */}
                          <div className="flex items-center gap-2 self-end sm:self-center">
                            {item.matched_document_id && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleViewDocument(item.matched_document_id!)}
                                disabled={viewDocLoading}
                                className="text-xs h-8 px-3 border-teal-200 text-teal-700 hover:bg-teal-50 gap-1.5"
                              >
                                <Eye className="h-3.5 w-3.5" />
                                View Document
                              </Button>
                            )}

                            {/* View evidence button (STEP 9 & STEP 16) */}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => toggleExpand(item.id)}
                              className="text-xs h-8 px-2.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 gap-1"
                            >
                              <FileSearch className="h-3.5 w-3.5 text-teal-600" />
                              <span>{isExpanded ? "Hide evidence" : "View evidence"}</span>
                              {isExpanded ? (
                                <ChevronUp className="h-3.5 w-3.5" />
                              ) : (
                                <ChevronDown className="h-3.5 w-3.5" />
                              )}
                            </Button>
                          </div>
                        </div>

                        {/* EXPLAINABLE EVIDENCE BREAKDOWN (STEP 9) */}
                        {isExpanded && (
                          <div className="mt-3.5 pt-3 border-t border-slate-200/70 text-xs space-y-3 animate-in fade-in-50">
                            <div className="rounded-xl bg-white p-3.5 border border-slate-200 shadow-2xs space-y-2.5">
                              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                                <span className="font-bold text-slate-900 uppercase tracking-wide text-[11px] flex items-center gap-1.5">
                                  <Sparkles className="h-3.5 w-3.5 text-teal-600" />
                                  Why This Document {item.status === "found" ? "Matched" : item.status === "needs_verification" ? "Requires Verification" : "Was Not Found"}
                                </span>
                                <span className="text-[11px] font-mono text-slate-500">
                                  Decision: <strong className={item.status === "found" ? "text-emerald-700" : item.status === "needs_verification" ? "text-amber-700" : "text-rose-700"}>{item.status.toUpperCase()}</strong>
                                </span>
                              </div>

                              {/* Multi-Factor Evidence Matrix */}
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                                {/* 1. Patient */}
                                <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100">
                                  <span className="text-slate-500">Patient Isolation:</span>
                                  <span className="font-medium text-emerald-700 flex items-center gap-1">
                                    <Check className="h-3 w-3" /> Same patient
                                  </span>
                                </div>

                                {/* 2. Hospital */}
                                <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100">
                                  <span className="text-slate-500">Hospital:</span>
                                  {ev?.hospital_match === "matched" ? (
                                    <span className="font-medium text-emerald-700 flex items-center gap-1 truncate max-w-[180px]">
                                      <Check className="h-3 w-3 shrink-0" /> {ev.hospital_name_in_doc || activeClaim.hospital_name}
                                    </span>
                                  ) : ev?.hospital_match === "mismatch" ? (
                                    <span className="font-medium text-rose-700 flex items-center gap-1 truncate max-w-[180px]">
                                      <X className="h-3 w-3 shrink-0" /> {ev.hospital_name_in_doc} (Mismatch)
                                    </span>
                                  ) : ev?.hospital_match === "not_applicable" ? (
                                    <span className="font-medium text-slate-600">N/A (Personal doc)</span>
                                  ) : (
                                    <span className="font-medium text-amber-700 flex items-center gap-1">
                                      <HelpCircle className="h-3 w-3" /> Provider unverified
                                    </span>
                                  )}
                                </div>

                                {/* 3. Claim Period / Date */}
                                <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100">
                                  <span className="text-slate-500">Claim Period:</span>
                                  {ev?.date_match === "in_range" ? (
                                    <span className="font-medium text-emerald-700 flex items-center gap-1">
                                      <Check className="h-3 w-3" /> {ev.document_date} (In stay)
                                    </span>
                                  ) : ev?.date_match === "adjacent" ? (
                                    <span className="font-medium text-emerald-700 flex items-center gap-1">
                                      <Check className="h-3 w-3" /> {ev.document_date} (Adjacent window)
                                    </span>
                                  ) : ev?.date_match === "mismatch" ? (
                                    <span className="font-medium text-rose-700 flex items-center gap-1">
                                      <X className="h-3 w-3" /> {ev.document_date} (Outside episode)
                                    </span>
                                  ) : ev?.date_match === "not_applicable" ? (
                                    <span className="font-medium text-slate-600">N/A (Personal doc)</span>
                                  ) : (
                                    <span className="font-medium text-amber-700 flex items-center gap-1">
                                      <HelpCircle className="h-3 w-3" /> Date unrecorded
                                    </span>
                                  )}
                                </div>

                                {/* 4. Document Type */}
                                <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100">
                                  <span className="text-slate-500">Document Type:</span>
                                  {ev?.type_match === "matched" ? (
                                    <span className="font-medium text-emerald-700 flex items-center gap-1 truncate max-w-[180px]">
                                      <Check className="h-3 w-3 shrink-0" /> {ev.document_type}
                                    </span>
                                  ) : ev?.type_match === "compatible" ? (
                                    <span className="font-medium text-emerald-700 flex items-center gap-1 truncate max-w-[180px]">
                                      <Check className="h-3 w-3 shrink-0" /> Compatible ({ev.document_type})
                                    </span>
                                  ) : (
                                    <span className="font-medium text-slate-700 truncate max-w-[180px]">
                                      {ev?.document_type || "None"}
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Source Provenance */}
                              {item.matched_document_name && (
                                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-600">
                                  <span>Source record: <strong className="font-mono text-slate-800">{item.matched_document_name}</strong></span>
                                  {item.confidence_score !== null && (
                                    <span className="text-slate-400">Match score: {Math.round((item.confidence_score || 0) * 100)}%</span>
                                  )}
                                </div>
                              )}

                              {/* Detailed reasons & discrepancies */}
                              {item.explanation && (
                                <div className="p-2 rounded bg-slate-50 text-[11px] text-slate-700">
                                  <strong className="text-slate-900">Analysis summary: </strong>
                                  {item.explanation}
                                </div>
                              )}
                            </div>

                            {/* Multiple candidates list if any */}
                            {item.other_matches && item.other_matches.length > 0 && (
                              <div className="space-y-1">
                                <p className="text-[11px] font-semibold text-slate-500 uppercase">
                                  Other candidate records in vault:
                                </p>
                                {item.other_matches.map((om) => (
                                  <div
                                    key={om.document_id}
                                    className="flex items-center justify-between text-[11px] bg-slate-50 p-2 rounded border border-slate-200"
                                  >
                                    <span className="truncate max-w-sm text-slate-700">
                                      {om.file_name} ({om.document_type || "general"})
                                    </span>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => handleViewDocument(om.document_id)}
                                      className="h-6 text-[10px] text-teal-600 px-2"
                                    >
                                      Preview
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* MANDATORY DISCLAIMER NOTE (STEP 10 & STEP 16) */}
              <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-xs text-amber-900 flex items-start gap-3 shadow-2xs">
                <Info className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h5 className="font-semibold text-amber-950">Important Notice</h5>
                  <p className="leading-relaxed text-amber-800">
                    CarePath checks your uploaded records to help prepare your claim. Requirements vary by insurer and policy. Verify the final requirements with your insurance provider.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* CREATE NEW CLAIM MODAL */}
      {isNewClaimModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl border border-slate-200 space-y-5 animate-in fade-in-50 zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-teal-600" />
                <h3 className="text-base font-bold text-slate-900">Prepare Insurance Claim</h3>
              </div>
              <button
                onClick={() => setIsNewClaimModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 text-lg font-bold"
              >
                &times;
              </button>
            </div>

            {formError && (
              <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700">
                {formError}
              </div>
            )}

            <form onSubmit={handleCreateClaim} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Insurance Provider <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Star Health, HDFC ERGO, Care Health, ICICI Lombard"
                  value={newClaimForm.insurance_provider}
                  onChange={(e) =>
                    setNewClaimForm({ ...newClaimForm, insurance_provider: e.target.value })
                  }
                  className="w-full rounded-lg border border-slate-300 p-2.5 text-xs text-slate-900 focus:border-teal-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Claim Type</label>
                <input
                  type="text"
                  disabled
                  value="Hospitalization / Reimbursement"
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-500 cursor-not-allowed"
                />
                <span className="text-[11px] text-slate-400 mt-0.5 block">
                  MVP supports in-patient hospitalization reimbursement claims.
                </span>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Hospital / Healthcare Provider <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Amala Institute of Medical Sciences"
                  value={newClaimForm.hospital_name}
                  onChange={(e) =>
                    setNewClaimForm({ ...newClaimForm, hospital_name: e.target.value })
                  }
                  className="w-full rounded-lg border border-slate-300 p-2.5 text-xs text-slate-900 focus:border-teal-500 focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Admission Date <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={newClaimForm.admission_date}
                    onChange={(e) =>
                      setNewClaimForm({ ...newClaimForm, admission_date: e.target.value })
                    }
                    className="w-full rounded-lg border border-slate-300 p-2.5 text-xs text-slate-900 focus:border-teal-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Discharge Date <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={newClaimForm.discharge_date}
                    onChange={(e) =>
                      setNewClaimForm({ ...newClaimForm, discharge_date: e.target.value })
                    }
                    className="w-full rounded-lg border border-slate-300 p-2.5 text-xs text-slate-900 focus:border-teal-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Policy / Member Number <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. POL-1029384"
                    value={newClaimForm.policy_number || ""}
                    onChange={(e) =>
                      setNewClaimForm({ ...newClaimForm, policy_number: e.target.value })
                    }
                    className="w-full rounded-lg border border-slate-300 p-2.5 text-xs text-slate-900 focus:border-teal-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Claim Amount (₹) <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="e.g. 75000"
                    value={newClaimForm.claim_amount || ""}
                    onChange={(e) =>
                      setNewClaimForm({
                        ...newClaimForm,
                        claim_amount: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                    className="w-full rounded-lg border border-slate-300 p-2.5 text-xs text-slate-900 focus:border-teal-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsNewClaimModalOpen(false)}
                  className="text-xs h-9 px-4"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={creatingClaim}
                  className="bg-teal-600 hover:bg-teal-700 text-white text-xs h-9 px-4 gap-2"
                >
                  {creatingClaim ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Evaluating Claim Episode...
                    </>
                  ) : (
                    "Evaluate Readiness"
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* REUSE EXISTING CAREPATH DOCUMENT VIEWER MODAL (STEP 15) */}
      {selectedDoc && (
        <DocumentViewerModal
          document={selectedDoc}
          onClose={() => setSelectedDoc(null)}
        />
      )}
    </div>
  );
}
