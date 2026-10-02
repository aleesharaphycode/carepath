"use client";

import { useEffect, useState } from "react";
import {
  X,
  FileText,
  Activity,
  Pill,
  FlaskConical,
  Stethoscope,
  AlertCircle,
  Calendar,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Quote,
  Sparkles,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import { fetchDocumentExtraction } from "@/lib/services/ai-client";
import { MedicalDocument, MedicalDocumentExtraction } from "@/lib/types";

interface ExtractionInsightsModalProps {
  document: MedicalDocument | null;
  onClose: () => void;
  onViewSource?: (doc: MedicalDocument) => void;
}

type TabType = "diagnoses" | "medications" | "investigations" | "procedures" | "plan";

export function ExtractionInsightsModal({
  document,
  onClose,
  onViewSource,
}: ExtractionInsightsModalProps) {
  if (!document) return null;
  return (
    <ExtractionInsightsContent
      key={document.id}
      document={document}
      onClose={onClose}
      onViewSource={onViewSource}
    />
  );
}

function ExtractionInsightsContent({
  document,
  onClose,
  onViewSource,
}: {
  document: MedicalDocument;
  onClose: () => void;
  onViewSource?: (doc: MedicalDocument) => void;
}) {
  const [activeTab, setActiveTab] = useState<TabType>("diagnoses");
  const [extraction, setExtraction] = useState<MedicalDocumentExtraction | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const supabase = createClient();

    fetchDocumentExtraction(supabase, document.id)
      .then((res) => {
        if (!isMounted) return;
        if (res.error) {
          setError(res.error.message);
        } else if (res.extraction) {
          setExtraction(res.extraction);
          // Set initial tab based on content availability
          if (res.extraction.diagnoses?.length) {
            setActiveTab("diagnoses");
          } else if (res.extraction.medications?.length) {
            setActiveTab("medications");
          } else if (res.extraction.investigations?.length) {
            setActiveTab("investigations");
          }
        } else {
          setError("No structured clinical extraction found for this document yet.");
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : "Failed to load extraction.");
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [document.id]);

  const diagnosesCount = extraction?.diagnoses?.length || 0;
  const medicationsCount = extraction?.medications?.length || 0;
  const investigationsCount = extraction?.investigations?.length || 0;
  const proceduresCount = (extraction?.procedures?.length || 0) + (extraction?.allergies?.length || 0);
  const followUpsCount = extraction?.follow_ups?.length || 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 sm:p-4 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative flex max-h-[92vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-200">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-gradient-to-r from-teal-50/80 via-white to-sky-50/80">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-600 text-white shadow-xs">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-bold text-slate-900 truncate">
                  AI Clinical Insights
                </h3>
                <Badge variant="default" className="text-[10px] bg-teal-100 text-teal-800 border-teal-200">
                  Source Verified
                </Badge>
                <span className="text-xs text-slate-400 font-mono hidden sm:inline">&bull;</span>
                <span className="text-xs text-slate-600 truncate max-w-xs font-medium">
                  {document.file_name}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Structured medical entities extracted with verifiable source provenance
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onViewSource && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onViewSource(document)}
                className="text-xs border-slate-300 text-slate-700 hover:text-teal-700 hidden sm:flex items-center gap-1.5"
              >
                <FileText className="h-3.5 w-3.5" />
                View Original
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

        {/* Loading State */}
        {loading && (
          <div className="p-16 text-center space-y-3">
            <Loader2 className="h-8 w-8 animate-spin text-teal-600 mx-auto" />
            <p className="text-sm font-medium text-slate-700">Loading structured clinical records...</p>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Connecting to CarePath AI Engine and retrieving verified clinical entities.
            </p>
          </div>
        )}

        {/* Error / Empty State */}
        {!loading && error && (
          <div className="p-10 text-center space-y-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600 mx-auto border border-amber-200">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-semibold text-slate-900">Extraction Notice</h4>
              <p className="text-xs text-slate-600 max-w-md mx-auto">{error}</p>
            </div>
            <div className="pt-2">
              <Button variant="outline" size="sm" onClick={onClose} className="text-xs">
                Close
              </Button>
            </div>
          </div>
        )}

        {/* Main Content Body */}
        {!loading && extraction && (
          <div className="flex flex-col flex-1 overflow-hidden">
            {/* Meta Summary Banner */}
            <div className="bg-slate-50/70 border-b border-slate-200 px-6 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <div>
                  <span className="text-slate-400 font-medium">Document Type: </span>
                  <span className="font-semibold text-slate-800 capitalize">
                    {extraction.document_type?.replace(/_/g, " ") || "Medical Document"}
                  </span>
                </div>
                {extraction.document_date && (
                  <div>
                    <span className="text-slate-400 font-medium">Record Date: </span>
                    <span className="font-semibold text-slate-800">{extraction.document_date}</span>
                  </div>
                )}
                {extraction.provider_name && (
                  <div>
                    <span className="text-slate-400 font-medium">Provider: </span>
                    <span className="font-semibold text-slate-800">{extraction.provider_name}</span>
                  </div>
                )}
                {extraction.patient_name_as_written && (
                  <div>
                    <span className="text-slate-400 font-medium">Patient on Record: </span>
                    <span className="font-semibold text-slate-800">{extraction.patient_name_as_written}</span>
                  </div>
                )}
              </div>

              {extraction.confidence_notes && (
                <div className="flex items-center gap-1.5 text-teal-800 bg-teal-50 px-2 py-0.5 rounded border border-teal-200 text-[11px]">
                  <ShieldCheck className="h-3.5 w-3.5 text-teal-600" />
                  <span>{extraction.confidence_notes}</span>
                </div>
              )}
            </div>

            {/* Navigation Tabs */}
            <div className="border-b border-slate-200 px-6 bg-white overflow-x-auto">
              <nav className="flex space-x-6 min-w-max" aria-label="Tabs">
                <button
                  onClick={() => setActiveTab("diagnoses")}
                  className={`py-3 text-xs font-semibold border-b-2 flex items-center gap-1.5 transition-colors ${
                    activeTab === "diagnoses"
                      ? "border-teal-600 text-teal-700"
                      : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
                  }`}
                >
                  <Activity className="h-3.5 w-3.5" />
                  Diagnoses & Conditions
                  {diagnosesCount > 0 && (
                    <span className="ml-1 rounded-full bg-slate-100 px-1.5 py-0.2 text-[10px] text-slate-600">
                      {diagnosesCount}
                    </span>
                  )}
                </button>

                <button
                  onClick={() => setActiveTab("medications")}
                  className={`py-3 text-xs font-semibold border-b-2 flex items-center gap-1.5 transition-colors ${
                    activeTab === "medications"
                      ? "border-teal-600 text-teal-700"
                      : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
                  }`}
                >
                  <Pill className="h-3.5 w-3.5" />
                  Medications & Dosing
                  {medicationsCount > 0 && (
                    <span className="ml-1 rounded-full bg-slate-100 px-1.5 py-0.2 text-[10px] text-slate-600">
                      {medicationsCount}
                    </span>
                  )}
                </button>

                <button
                  onClick={() => setActiveTab("investigations")}
                  className={`py-3 text-xs font-semibold border-b-2 flex items-center gap-1.5 transition-colors ${
                    activeTab === "investigations"
                      ? "border-teal-600 text-teal-700"
                      : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
                  }`}
                >
                  <FlaskConical className="h-3.5 w-3.5" />
                  Lab Tests & Biomarkers
                  {investigationsCount > 0 && (
                    <span className="ml-1 rounded-full bg-slate-100 px-1.5 py-0.2 text-[10px] text-slate-600">
                      {investigationsCount}
                    </span>
                  )}
                </button>

                <button
                  onClick={() => setActiveTab("procedures")}
                  className={`py-3 text-xs font-semibold border-b-2 flex items-center gap-1.5 transition-colors ${
                    activeTab === "procedures"
                      ? "border-teal-600 text-teal-700"
                      : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
                  }`}
                >
                  <Stethoscope className="h-3.5 w-3.5" />
                  Procedures & Allergies
                  {proceduresCount > 0 && (
                    <span className="ml-1 rounded-full bg-slate-100 px-1.5 py-0.2 text-[10px] text-slate-600">
                      {proceduresCount}
                    </span>
                  )}
                </button>

                <button
                  onClick={() => setActiveTab("plan")}
                  className={`py-3 text-xs font-semibold border-b-2 flex items-center gap-1.5 transition-colors ${
                    activeTab === "plan"
                      ? "border-teal-600 text-teal-700"
                      : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
                  }`}
                >
                  <Calendar className="h-3.5 w-3.5" />
                  Follow-ups & Notes
                  {followUpsCount > 0 && (
                    <span className="ml-1 rounded-full bg-slate-100 px-1.5 py-0.2 text-[10px] text-slate-600">
                      {followUpsCount}
                    </span>
                  )}
                </button>
              </nav>
            </div>

            {/* Tab Panels */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* TAB 1: Diagnoses */}
              {activeTab === "diagnoses" && (
                <div className="space-y-4">
                  {diagnosesCount === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-500 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                      No explicit diagnoses or clinical conditions documented in this record.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {extraction.diagnoses.map((diag, idx) => (
                        <div
                          key={idx}
                          className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs hover:border-teal-300 transition-colors space-y-2.5"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <h4 className="text-sm font-bold text-slate-900">{diag.name}</h4>
                            {diag.status && (
                              <Badge
                                variant={diag.status === "active" ? "default" : "secondary"}
                                className="text-[10px] capitalize font-medium"
                              >
                                {diag.status}
                              </Badge>
                            )}
                          </div>

                          {diag.date && (
                            <div className="text-xs text-slate-500 flex items-center gap-1.5">
                              <Calendar className="h-3.5 w-3.5 text-slate-400" />
                              <span>Diagnosed / Recorded: {diag.date}</span>
                            </div>
                          )}

                          {/* Source citation */}
                          {diag.source_reference?.source_text && (
                            <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-100 space-y-1">
                              <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-600">
                                <Quote className="h-3 w-3 text-teal-600" />
                                <span>Source Evidence:</span>
                              </div>
                              <p className="text-xs text-slate-700 italic font-serif">
                                &ldquo;{diag.source_reference.source_text}&rdquo;
                              </p>
                              {diag.source_reference.page && (
                                <p className="text-[10px] text-slate-400 text-right">
                                  Page {diag.source_reference.page}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: Medications */}
              {activeTab === "medications" && (
                <div className="space-y-4">
                  {medicationsCount === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-500 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                      No prescription medications or therapeutic regimens recorded in this document.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
                      {extraction.medications.map((med, idx) => (
                        <div key={idx} className="p-4 hover:bg-slate-50/70 transition-colors space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-50 text-teal-700 border border-teal-200">
                                <Pill className="h-4 w-4" />
                              </div>
                              <h4 className="text-sm font-bold text-slate-900">{med.name}</h4>
                            </div>
                            {med.dose && (
                              <span className="font-mono text-xs font-semibold text-teal-800 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                                {med.dose}
                              </span>
                            )}
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-slate-600 pt-1">
                            {med.route && (
                              <div>
                                <span className="text-slate-400 block text-[10px] uppercase font-semibold">Route</span>
                                <span className="font-medium capitalize">{med.route}</span>
                              </div>
                            )}
                            {med.frequency && (
                              <div>
                                <span className="text-slate-400 block text-[10px] uppercase font-semibold">Frequency</span>
                                <span className="font-medium">{med.frequency}</span>
                              </div>
                            )}
                            {med.duration && (
                              <div>
                                <span className="text-slate-400 block text-[10px] uppercase font-semibold">Duration</span>
                                <span className="font-medium">{med.duration}</span>
                              </div>
                            )}
                            {med.instructions && (
                              <div className="col-span-2 sm:col-span-1">
                                <span className="text-slate-400 block text-[10px] uppercase font-semibold">Instructions</span>
                                <span className="font-medium text-slate-800">{med.instructions}</span>
                              </div>
                            )}
                          </div>

                          {/* Source citation */}
                          {med.source_reference?.source_text && (
                            <div className="bg-slate-50 rounded-lg p-2 text-xs text-slate-600 border border-slate-100 flex items-start gap-2">
                              <Quote className="h-3.5 w-3.5 text-teal-600 shrink-0 mt-0.5" />
                              <span className="italic font-serif">&ldquo;{med.source_reference.source_text}&rdquo;</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: Investigations */}
              {activeTab === "investigations" && (
                <div className="space-y-4">
                  {investigationsCount === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-500 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                      No laboratory tests, diagnostic biomarkers, or pathology values in this document.
                    </div>
                  ) : (
                    <div className="rounded-xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[10px]">
                          <tr>
                            <th className="p-3 sm:px-4">Test Name</th>
                            <th className="p-3 sm:px-4">Result Value</th>
                            <th className="p-3 sm:px-4">Reference Range</th>
                            <th className="p-3 sm:px-4 text-center">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {extraction.investigations.map((inv, idx) => (
                            <tr key={idx} className="hover:bg-slate-50/60 transition-colors">
                              <td className="p-3 sm:px-4 font-semibold text-slate-900">
                                <div>{inv.name}</div>
                                {inv.date && <div className="text-[10px] text-slate-400 font-normal">{inv.date}</div>}
                              </td>
                              <td className="p-3 sm:px-4 font-mono font-bold text-slate-800">
                                {inv.result || "N/A"} {inv.unit || ""}
                              </td>
                              <td className="p-3 sm:px-4 text-slate-500 font-mono">
                                {inv.reference_range || "—"}
                              </td>
                              <td className="p-3 sm:px-4 text-center">
                                {inv.abnormal_flag ? (
                                  <Badge variant="warning" className="text-[10px] bg-red-50 text-red-700 border-red-200">
                                    Abnormal
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">
                                    Normal
                                  </Badge>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 4: Procedures & Allergies */}
              {activeTab === "procedures" && (
                <div className="space-y-6">
                  {/* Procedures Sub-section */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                      <Stethoscope className="h-4 w-4 text-teal-600" />
                      Procedures & Imaging Exams ({extraction.procedures?.length || 0})
                    </h4>
                    {!extraction.procedures?.length ? (
                      <p className="text-xs text-slate-400 italic">No procedures recorded in this document.</p>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {extraction.procedures.map((proc, idx) => (
                          <div key={idx} className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs space-y-1.5">
                            <h5 className="text-sm font-bold text-slate-900">{proc.name}</h5>
                            {proc.date && <p className="text-xs text-slate-500">Performed: {proc.date}</p>}
                            {proc.details && <p className="text-xs text-slate-700">{proc.details}</p>}
                            {proc.source_reference?.source_text && (
                              <p className="text-[11px] text-slate-500 italic bg-slate-50 p-2 rounded border border-slate-100">
                                &ldquo;{proc.source_reference.source_text}&rdquo;
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Allergies Sub-section */}
                  <div className="space-y-3 pt-3 border-t border-slate-200">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                      <AlertCircle className="h-4 w-4 text-rose-600" />
                      Allergies & Sensitivities ({extraction.allergies?.length || 0})
                    </h4>
                    {!extraction.allergies?.length ? (
                      <p className="text-xs text-slate-400 italic">No documented drug or environmental allergies.</p>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {extraction.allergies.map((allergy, idx) => (
                          <div key={idx} className="rounded-xl border border-rose-200 bg-rose-50/40 p-3.5 space-y-1">
                            <div className="flex items-center justify-between">
                              <h5 className="text-sm font-bold text-rose-950">{allergy.substance}</h5>
                              {allergy.severity && (
                                <Badge variant="outline" className="text-[10px] uppercase font-semibold text-rose-800 border-rose-300">
                                  {allergy.severity}
                                </Badge>
                              )}
                            </div>
                            {allergy.reaction && (
                              <p className="text-xs text-slate-700">Reaction: {allergy.reaction}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 5: Follow-ups & Notes */}
              {activeTab === "plan" && (
                <div className="space-y-6">
                  {/* Follow-ups */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                      <Calendar className="h-4 w-4 text-teal-600" />
                      Follow-up & Review Instructions
                    </h4>
                    {!extraction.follow_ups?.length ? (
                      <p className="text-xs text-slate-400 italic">No explicit follow-up appointment or review noted.</p>
                    ) : (
                      <div className="space-y-3">
                        {extraction.follow_ups.map((fu, idx) => (
                          <div key={idx} className="rounded-xl border border-teal-200 bg-teal-50/40 p-4 space-y-2">
                            <h5 className="text-sm font-bold text-slate-900">{fu.description}</h5>
                            <div className="flex flex-wrap items-center gap-3 text-xs">
                              {fu.confirmed_date ? (
                                <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-semibold flex items-center gap-1">
                                  <CheckCircle2 className="h-3 w-3" />
                                  Confirmed Date: {fu.confirmed_date}
                                </span>
                              ) : (
                                <span className="bg-amber-100 text-amber-900 px-2 py-0.5 rounded font-semibold flex items-center gap-1">
                                  <Info className="h-3 w-3" />
                                  Relative Timeframe: {fu.relative_time || "As needed"}
                                </span>
                              )}
                            </div>
                            {fu.source_reference?.source_text && (
                              <p className="text-[11px] text-slate-600 italic bg-white/80 p-2 rounded border border-teal-100">
                                &ldquo;{fu.source_reference.source_text}&rdquo;
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Clinical Narrative Notes */}
                  {extraction.clinical_notes && (
                    <div className="space-y-2 pt-3 border-t border-slate-200">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                        Clinical Summary & Observations
                      </h4>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700 leading-relaxed">
                        {extraction.clinical_notes}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer with Safety Disclaimer */}
            <div className="border-t border-slate-200 px-6 py-3.5 bg-slate-50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-teal-600 shrink-0" />
                <span className="text-[11px]">
                  <strong>Medical Disclaimer:</strong> CarePath extracts and organizes clinical records. It does not provide medical diagnosis. Always verify against original documents.
                </span>
              </div>
              <Button variant="outline" size="sm" onClick={onClose} className="text-xs shrink-0">
                Close Insights
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
