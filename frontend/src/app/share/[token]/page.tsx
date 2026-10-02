"use client";

import { useEffect, useState, use } from "react";
import {
  ShieldCheck,
  AlertTriangle,
  Clock,
  FileText,
  Lock,
  Pill,
  Activity,
  FlaskConical,
  Stethoscope,
  ExternalLink,
  Eye,
  Loader2,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { checkDoctorAccessStatus, verifyDoctorAccessPin } from "@/lib/services/consent";
import { DoctorAccessResponse } from "@/lib/types";

interface PageProps {
  params: Promise<{ token: string }>;
}

export default function ShareTokenPage({ params }: PageProps) {
  const resolvedParams = use(params);
  const token = resolvedParams.token;

  const [status, setStatus] = useState<any>(null);
  const [data, setData] = useState<DoctorAccessResponse | null>(null);
  const [loading, setLoading] = useState(Boolean(token));
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(token ? null : "No access token provided.");
  const [pin, setPin] = useState("");
  const [activeTab, setActiveTab] = useState<string>("documents");
  const [viewingDoc, setViewingDoc] = useState<{
    file_name: string;
    document_type?: string;
    signed_url?: string | null;
  } | null>(null);

  // Time remaining countdown in seconds
  const [secondsRemaining, setSecondsRemaining] = useState<number>(0);

  useEffect(() => {
    if (!token) return;

    let isMounted = true;
    checkDoctorAccessStatus(token)
      .then((res) => {
        if (!isMounted) return;
        setLoading(false);
        if (res.error) {
          setError(res.error.message);
        } else if (res.data) {
          setStatus(res.data);
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        setLoading(false);
        setError(err instanceof Error ? err.message : "Error verifying access token.");
      });

    return () => {
      isMounted = false;
    };
  }, [token]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin || pin.length < 6) return;

    setVerifying(true);
    setError(null);
    const res = await verifyDoctorAccessPin(token, pin);
    setVerifying(false);

    if (res.error) {
      setError(res.error.message);
    } else if (res.data) {
      setData(res.data);
      setSecondsRemaining(res.data.time_remaining_seconds || 0);

      const scope = res.data.scope || [];
      if (scope.includes("documents") && (res.data.documents?.length || 0) > 0) {
        setActiveTab("documents");
      } else if (scope.includes("timeline") && (res.data.timeline?.length || 0) > 0) {
        setActiveTab("timeline");
      } else if (scope.includes("medications") && (res.data.medications?.length || 0) > 0) {
        setActiveTab("medications");
      } else if (scope.includes("investigations") && (res.data.investigations?.length || 0) > 0) {
        setActiveTab("investigations");
      } else if (scope.includes("diagnoses") && (res.data.diagnoses?.length || 0) > 0) {
        setActiveTab("diagnoses");
      } else if (scope.includes("procedures") && (res.data.procedures?.length || 0) > 0) {
        setActiveTab("procedures");
      } else if (scope.length > 0) {
        setActiveTab(scope[0]);
      }
    }
  };

  // Polling for patient approval
  useEffect(() => {
    if (!token || !status || status.is_approved) return;

    let isMounted = true;
    const interval = setInterval(() => {
      checkDoctorAccessStatus(token)
        .then((res) => {
          if (isMounted && res.data) {
            setStatus(res.data);
          }
        })
        .catch(() => {});
    }, 3000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [token, status?.is_approved]);

  // Live countdown timer
  useEffect(() => {
    if (secondsRemaining <= 0) return;
    const interval = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [secondsRemaining]);

  const formatCountdown = (secs: number) => {
    if (secs <= 0) return "Expired";
    const hours = Math.floor(secs / 3600);
    const minutes = Math.floor((secs % 3600) / 60);
    const seconds = secs % 60;
    if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    }
    return `${minutes}m ${seconds}s`;
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* Top Clinical Header - Focused Minimal Share Header */}
      <header className="border-b border-slate-200 bg-white sticky top-0 z-30 px-4 py-3 shadow-2xs">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-600 text-white font-bold shadow-xs">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-900 tracking-tight">CAREPATH</span>
                <span className="text-slate-300">•</span>
                <span className="text-xs font-semibold text-teal-800 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                  Secure Patient-Shared Records
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                Temporary patient-authorized clinical viewing session. No doctor login required.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-600">
            <Lock className="h-3.5 w-3.5 text-teal-600" />
            <span className="font-mono text-[11px]">Cryptographic Token Verified</span>
          </div>
        </div>
      </header>

      {/* Main Body */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {loading && (
          <div className="rounded-2xl border border-slate-200 bg-white p-16 text-center space-y-3 shadow-2xs">
            <Loader2 className="h-8 w-8 animate-spin text-teal-600 mx-auto" />
            <h3 className="text-sm font-bold text-slate-900">Validating Cryptographic Capability Token...</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Verifying patient consent session, cryptographic signature, scope boundaries, and active expiration.
            </p>
          </div>
        )}

        {error && !loading && (
          <div className="rounded-2xl border border-red-200 bg-white p-6 sm:p-8 text-center space-y-4 shadow-xs">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600 border border-red-200 mx-auto">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div className="space-y-2">
              <h3 className="text-base font-bold text-red-950">
                {error.toLowerCase().includes("expired")
                  ? "Access Session Expired"
                  : error.toLowerCase().includes("revoked")
                  ? "Access Session Revoked"
                  : error.toLowerCase().includes("locked")
                  ? "Access Locked"
                  : "Access Denied"}
              </h3>
              <p className="text-xs sm:text-sm text-red-700 max-w-md mx-auto font-medium">
                {error.toLowerCase().includes("expired")
                  ? "This CarePath sharing session has expired. Please ask the patient to generate a new QR code."
                  : error}
              </p>
            </div>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              {error.toLowerCase().includes("expired")
                ? "For patient privacy and least-privilege security, all temporary clinical access sessions auto-expire once their duration limit elapses."
                : "This QR code session may have been revoked, expired, or locked due to too many failed attempts. Please ask the patient to generate a new QR code."}
            </p>
          </div>
        )}

        {!data && status && status.requires_pin && !status.is_approved && !error && !loading && (
          <div className="max-w-md mx-auto mt-8">
            <div className="rounded-2xl border border-slate-200 bg-white shadow-lg overflow-hidden p-8 text-center space-y-4">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-600 border border-amber-200">
                <Clock className="h-7 w-7 animate-pulse" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">Waiting for patient approval</h2>
                <p className="text-sm text-slate-500 mt-2 max-w-[280px] mx-auto">
                  Please ask the patient to approve this access request on their device.
                </p>
              </div>
              <div className="flex items-center justify-center pt-4">
                <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
              </div>
            </div>
          </div>
        )}

        {!data && status && status.requires_pin && status.is_approved && !error && !loading && (
          <div className="max-w-md mx-auto mt-8">
            <div className="rounded-2xl border border-slate-200 bg-white shadow-lg overflow-hidden">
              <div className="bg-teal-50 border-b border-teal-100 p-6 text-center space-y-2">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-teal-100 text-teal-700">
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <h2 className="text-lg font-bold text-teal-950">Patient Access Verification</h2>
                <p className="text-xs text-teal-700 max-w-[280px] mx-auto">
                  The patient has approved access. Enter the 6-digit verification code shown on the patient's screen.
                </p>
              </div>
              <form onSubmit={handleVerify} className="p-6 space-y-5">
                <div className="space-y-3">
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                    placeholder="• • • • • •"
                    className="w-full text-center text-3xl font-mono tracking-[0.5em] py-4 rounded-xl border border-slate-300 bg-slate-50 focus:border-teal-500 focus:ring-2 focus:ring-teal-200 outline-hidden transition-all"
                    disabled={verifying}
                  />
                </div>
                <Button 
                  type="submit" 
                  disabled={pin.length < 6 || verifying}
                  className="w-full bg-teal-600 hover:bg-teal-700 text-white h-11 text-sm font-semibold shadow-sm"
                >
                  {verifying ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Verifying Access...</>
                  ) : (
                    "Verify Access"
                  )}
                </Button>
              </form>
            </div>
          </div>
        )}

        {data && !loading && (
          <div className="space-y-5">
            {/* Live Expiration Notice if countdown reached zero while open */}
            {secondsRemaining <= 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 flex items-start gap-2.5 shadow-2xs">
                <Clock className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <p className="font-semibold text-amber-950">
                    This CarePath sharing session has expired. Please ask the patient to generate a new QR code.
                  </p>
                  <p className="text-amber-700 text-[11px]">
                    The temporary duration granted by the patient has elapsed.
                  </p>
                </div>
              </div>
            )}

            {/* Session Verification Card */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 shadow-2xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Attending Recipient</span>
                  <h2 className="text-base sm:text-lg font-bold text-slate-900">{data.recipient_name}</h2>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-600">
                    <span>Patient:</span>
                    <strong className="text-slate-900 font-semibold">{data.patient_name}</strong>
                  </div>
                </div>

                <div className="flex flex-col sm:items-end gap-1">
                  <div className="flex items-center gap-2">
                    {data.is_active && secondsRemaining > 0 ? (
                      <Badge className="bg-emerald-50 text-emerald-800 border-emerald-300 font-semibold text-xs py-1">
                        Active Access Session
                      </Badge>
                    ) : (
                      <Badge className="bg-red-50 text-red-800 border-red-300 font-semibold text-xs py-1">
                        Session Expired
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 font-mono">
                    <Clock className="h-3.5 w-3.5 text-slate-400" />
                    <span>Expires: {new Date(data.expires_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    <span className="text-slate-300">•</span>
                    <span className="font-semibold text-teal-700">{formatCountdown(secondsRemaining)}</span>
                  </div>
                </div>
              </div>

              {/* Scope pill tags */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs">
                <span className="text-[11px] font-semibold text-slate-500 mr-1">Authorized Scopes:</span>
                {data.scope.map((s) => (
                  <Badge key={s} variant="outline" className="text-[10px] uppercase font-semibold bg-teal-50/70 text-teal-800 border-teal-200">
                    {s.replace("_", " ")}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Scope Navigation Tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-slate-200 text-xs">
              {data.scope.includes("documents") && (
                <button
                  onClick={() => setActiveTab("documents")}
                  className={`px-3 py-2 rounded-t-lg font-semibold transition-colors flex items-center gap-1.5 ${
                    activeTab === "documents"
                      ? "bg-white text-teal-700 border-t-2 border-teal-600 shadow-2xs"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <FileText className="h-4 w-4" />
                  <span>Permitted Documents ({data.documents?.length || 0})</span>
                </button>
              )}

              {data.scope.includes("timeline") && (
                <button
                  onClick={() => setActiveTab("timeline")}
                  className={`px-3 py-2 rounded-t-lg font-semibold transition-colors flex items-center gap-1.5 ${
                    activeTab === "timeline"
                      ? "bg-white text-teal-700 border-t-2 border-teal-600 shadow-2xs"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <Clock className="h-4 w-4" />
                  <span>Health Timeline ({data.timeline?.length || 0})</span>
                </button>
              )}

              {data.scope.includes("medications") && (
                <button
                  onClick={() => setActiveTab("medications")}
                  className={`px-3 py-2 rounded-t-lg font-semibold transition-colors flex items-center gap-1.5 ${
                    activeTab === "medications"
                      ? "bg-white text-teal-700 border-t-2 border-teal-600 shadow-2xs"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <Pill className="h-4 w-4" />
                  <span>Medications ({data.medications?.length || 0})</span>
                </button>
              )}

              {data.scope.includes("investigations") && (
                <button
                  onClick={() => setActiveTab("investigations")}
                  className={`px-3 py-2 rounded-t-lg font-semibold transition-colors flex items-center gap-1.5 ${
                    activeTab === "investigations"
                      ? "bg-white text-teal-700 border-t-2 border-teal-600 shadow-2xs"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <FlaskConical className="h-4 w-4" />
                  <span>Lab Investigations ({data.investigations?.length || 0})</span>
                </button>
              )}

              {data.scope.includes("diagnoses") && (
                <button
                  onClick={() => setActiveTab("diagnoses")}
                  className={`px-3 py-2 rounded-t-lg font-semibold transition-colors flex items-center gap-1.5 ${
                    activeTab === "diagnoses"
                      ? "bg-white text-teal-700 border-t-2 border-teal-600 shadow-2xs"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <Activity className="h-4 w-4" />
                  <span>Diagnoses ({data.diagnoses?.length || 0})</span>
                </button>
              )}

              {data.scope.includes("procedures") && (
                <button
                  onClick={() => setActiveTab("procedures")}
                  className={`px-3 py-2 rounded-t-lg font-semibold transition-colors flex items-center gap-1.5 ${
                    activeTab === "procedures"
                      ? "bg-white text-teal-700 border-t-2 border-teal-600 shadow-2xs"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <Stethoscope className="h-4 w-4" />
                  <span>Procedures ({data.procedures?.length || 0})</span>
                </button>
              )}
            </div>

            {/* TAB: Documents */}
            {activeTab === "documents" && (
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Patient-Shared Medical Documents</h3>
                    <p className="text-xs text-slate-500">Only records explicitly permitted by the patient are accessible.</p>
                  </div>
                  <Badge variant="outline" className="text-xs font-mono">
                    {data.documents?.length || 0} Permitted
                  </Badge>
                </div>

                {!data.documents || data.documents.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-500">
                    No documents were included in this consent session scope.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {data.documents.map((doc, idx) => (
                      <div key={idx} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-50 text-teal-700 border border-teal-200 shrink-0">
                            <FileText className="h-4 w-4" />
                          </div>
                          <div>
                            <h4 className="text-xs font-semibold text-slate-900">{doc.file_name}</h4>
                            <div className="flex flex-wrap items-center gap-2 mt-0.5 text-[11px] text-slate-500 font-mono">
                              <span className="capitalize">{doc.document_type || "Clinical Record"}</span>
                              {doc.uploaded_at && (
                                <>
                                  <span>•</span>
                                  <span>{new Date(doc.uploaded_at).toLocaleDateString()}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {doc.signed_url ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setViewingDoc(doc)}
                              className="text-xs h-8 text-teal-700 border-teal-200 hover:bg-teal-50"
                            >
                              <Eye className="mr-1.5 h-3.5 w-3.5" />
                              View Document
                            </Button>
                          ) : (
                            <span className="text-[11px] text-slate-400 italic">Direct view restricted</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB: Timeline */}
            {activeTab === "timeline" && (
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Authorized Chronological Health Events</h3>
                    <p className="text-xs text-slate-500">Timeline events extracted from consented clinical records.</p>
                  </div>
                  <Badge variant="outline" className="text-xs font-mono">
                    {data.timeline?.length || 0} Events
                  </Badge>
                </div>

                {!data.timeline || data.timeline.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-500">
                    No timeline events available in current scope.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {data.timeline.map((item, idx) => (
                      <div key={idx} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 text-xs space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-slate-900 capitalize">{item.title || item.event_type}</span>
                          <span className="text-[11px] font-mono text-slate-500">{item.date_display || item.date || "Documented"}</span>
                        </div>
                        {item.source_text && <p className="text-slate-600 italic">&ldquo;{item.source_text}&rdquo;</p>}
                        {item.document_name && (
                          <div className="text-[10px] text-teal-700 font-mono pt-1">
                            Source Document: {item.document_name}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB: Medications */}
            {activeTab === "medications" && (
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Prescribed Medications</h3>
                    <p className="text-xs text-slate-500">Current and historical medications documented in patient records.</p>
                  </div>
                  <Badge variant="outline" className="text-xs font-mono">
                    {data.medications?.length || 0} Items
                  </Badge>
                </div>

                {!data.medications || data.medications.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-500">
                    No medications documented in this scope.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {data.medications.map((med, idx) => (
                      <div key={idx} className="p-3 rounded-xl border border-slate-200 bg-emerald-50/40 text-xs space-y-1">
                        <div className="flex items-center gap-1.5 font-bold text-emerald-950">
                          <Pill className="h-3.5 w-3.5 text-emerald-600" />
                          <span>{med.medication_name || med.name}</span>
                        </div>
                        {med.dosage && <p className="text-slate-600">Dosage: {med.dosage}</p>}
                        {med.frequency && <p className="text-slate-600">Frequency: {med.frequency}</p>}
                        {med.instructions && <p className="text-slate-500 text-[11px]">Instructions: {med.instructions}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB: Lab Investigations */}
            {activeTab === "investigations" && (
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Laboratory Investigations</h3>
                    <p className="text-xs text-slate-500">Clinical lab tests, biomarkers, and diagnostic reports.</p>
                  </div>
                  <Badge variant="outline" className="text-xs font-mono">
                    {data.investigations?.length || 0} Tests
                  </Badge>
                </div>

                {!data.investigations || data.investigations.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-500">
                    No lab investigations in this scope.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {data.investigations.map((inv, idx) => (
                      <div key={idx} className="p-3 rounded-xl border border-slate-200 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                        <div>
                          <span className="font-semibold text-slate-900">{inv.test_name}</span>
                          {inv.reference_range && (
                            <span className="text-[11px] text-slate-500 ml-2 font-mono">Ref: {inv.reference_range}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-800 font-mono">{inv.result_value} {inv.unit || ""}</span>
                          {inv.abnormal_flag && (
                            <Badge className="bg-amber-100 text-amber-900 border-amber-300 text-[10px]">
                              Abnormal
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB: Diagnoses */}
            {activeTab === "diagnoses" && (
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Clinical Diagnoses</h3>
                    <p className="text-xs text-slate-500">Documented medical conditions and assessments.</p>
                  </div>
                  <Badge variant="outline" className="text-xs font-mono">
                    {data.diagnoses?.length || 0} Diagnoses
                  </Badge>
                </div>

                {!data.diagnoses || data.diagnoses.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-500">
                    No diagnoses in this scope.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {data.diagnoses.map((diag, idx) => (
                      <div key={idx} className="p-3 rounded-xl border border-slate-200 bg-purple-50/40 text-xs flex items-center justify-between">
                        <span className="font-semibold text-purple-950">{diag.condition_name}</span>
                        {diag.diagnosis_date && (
                          <span className="text-[11px] text-slate-500 font-mono">{diag.diagnosis_date}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB: Procedures */}
            {activeTab === "procedures" && (
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Documented Procedures</h3>
                    <p className="text-xs text-slate-500">Surgical and clinical interventions.</p>
                  </div>
                  <Badge variant="outline" className="text-xs font-mono">
                    {data.procedures?.length || 0} Procedures
                  </Badge>
                </div>

                {!data.procedures || data.procedures.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-500">
                    No procedures in this scope.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {data.procedures.map((proc, idx) => (
                      <div key={idx} className="p-3 rounded-xl border border-slate-200 bg-indigo-50/40 text-xs flex items-center justify-between">
                        <span className="font-semibold text-indigo-950">{proc.procedure_name}</span>
                        {proc.procedure_date && (
                          <span className="text-[11px] text-slate-500 font-mono">{proc.procedure_date}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Document Viewer Modal for Shared Documents */}
      {viewingDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="relative flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-slate-50/70">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-600 text-white">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 truncate max-w-sm sm:max-w-md">
                    {viewingDoc.file_name}
                  </h3>
                  <span className="text-[10px] text-slate-500 font-mono">Authorized Shared Clinical Document</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {viewingDoc.signed_url && (
                  <a
                    href={viewingDoc.signed_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hidden sm:inline-flex"
                  >
                    <Button variant="outline" size="sm" className="text-xs">
                      <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                      Open Full Screen
                    </Button>
                  </a>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setViewingDoc(null)}
                  className="h-8 w-8 p-0 text-slate-400 hover:text-slate-700"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 bg-slate-100 min-h-[350px] max-h-[550px] flex items-center justify-center">
              {viewingDoc.signed_url ? (
                viewingDoc.file_name.toLowerCase().endsWith(".pdf") ? (
                  <iframe
                    src={viewingDoc.signed_url}
                    title={viewingDoc.file_name}
                    className="w-full h-[500px] rounded-lg border-0 bg-white"
                  />
                ) : viewingDoc.file_name.toLowerCase().endsWith(".txt") ? (
                  <iframe
                    src={viewingDoc.signed_url}
                    title={viewingDoc.file_name}
                    className="w-full h-[500px] rounded-lg border border-slate-200 bg-white font-mono"
                  />
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={viewingDoc.signed_url}
                    alt={viewingDoc.file_name}
                    className="max-h-[500px] max-w-full rounded-lg object-contain shadow-xs"
                  />
                )
              ) : (
                <p className="text-xs text-slate-500">Document URL unavailable.</p>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-slate-200 px-6 py-3 bg-slate-50 text-xs text-slate-500">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-teal-600" />
                Time-limited signed view via temporary patient capability token.
              </span>
              <Button variant="outline" size="sm" onClick={() => setViewingDoc(null)} className="text-xs">
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
