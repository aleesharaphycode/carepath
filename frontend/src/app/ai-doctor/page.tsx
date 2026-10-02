"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  Stethoscope,
  Send,
  Loader2,
  ShieldCheck,
  AlertTriangle,
  AlertCircle,
  Siren,
  Pill,
  Home,
  Heart,
  ChevronDown,
  ChevronUp,
  User,
  ThumbsUp,
  ThumbsDown,
  FileText,
  Sparkles,
  ArrowRight,
  Clock,
  Info,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { AIDoctorChatMessage } from "@/lib/types";
import { sendAIDoctorMessage, submitAIDoctorFeedback } from "@/lib/services/ai-doctor";
import { fetchFamilyDashboard } from "@/lib/services/family";

let messageCounter = 0;
function createMsgId(prefix: string): string {
  messageCounter += 1;
  return `${prefix}-${messageCounter}`;
}

function getDisplayTime(): string {
  const now = new Date();
  return now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const URGENCY_CONFIG = {
  green: {
    icon: ShieldCheck,
    badgeBg: "bg-emerald-50 text-emerald-800 border-emerald-300",
    pillBg: "bg-emerald-500",
    label: "Low Risk • Home Care Guidance",
  },
  yellow: {
    icon: AlertTriangle,
    badgeBg: "bg-amber-50 text-amber-900 border-amber-300",
    pillBg: "bg-amber-500",
    label: "Moderate • See Doctor Soon",
  },
  orange: {
    icon: AlertCircle,
    badgeBg: "bg-orange-50 text-orange-950 border-orange-300",
    pillBg: "bg-orange-500",
    label: "High Risk • Consult Doctor Promptly",
  },
  red: {
    icon: Siren,
    badgeBg: "bg-rose-50 text-rose-950 border-rose-300 ring-2 ring-rose-400/40 animate-pulse",
    pillBg: "bg-rose-600",
    label: "Emergency • Immediate Medical Attention Required",
  },
};

const SUGGESTED_QUESTIONS = [
  {
    title: "Current Medications",
    query: "What medicines am I currently taking?",
    icon: Pill,
  },
  {
    title: "Latest Lab Results",
    query: "Explain my latest lab results.",
    icon: FileText,
  },
  {
    title: "Health History",
    query: "Summarize my medical history.",
    icon: Clock,
  },
  {
    title: "Upcoming Follow-ups",
    query: "What follow-ups are coming up?",
    icon: Stethoscope,
  },
  {
    title: "Diagnoses on File",
    query: "What diagnoses are in my records?",
    icon: Info,
  },
  {
    title: "Medicine Interaction Check",
    query: "Can you explain whether my medicines have known interactions?",
    icon: ShieldCheck,
  },
];

export default function AIDoctorPage() {
  const supabase = createClient();

  // State
  const [messages, setMessages] = useState<AIDoctorChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedPatientId, setSelectedPatientId] = useState<string>("");
  const [patients, setPatients] = useState<
    Array<{ id: string; name: string; relation: string; canView: boolean; isSelf: boolean }>
  >([]);
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [toastNotification, setToastNotification] = useState<string | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 1. Load authenticated patient & authorized family members
  useEffect(() => {
    let isMounted = true;

    async function loadPatientContext() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.user) {
          return;
        }

        // Fetch user's own patient record
        const { data: selfPatient } = await supabase
          .from("patients")
          .select("id, full_name")
          .eq("user_id", session.user.id)
          .maybeSingle();

        const patientList: Array<{
          id: string;
          name: string;
          relation: string;
          canView: boolean;
          isSelf: boolean;
        }> = [];

        if (selfPatient) {
          patientList.push({
            id: selfPatient.id,
            name: selfPatient.full_name || "Myself (Primary Account)",
            relation: "Primary Account Holder",
            canView: true,
            isSelf: true,
          });
          if (isMounted) setSelectedPatientId(selfPatient.id);
        }

        // Fetch family members with view permissions
        const { data: familyData } = await fetchFamilyDashboard(supabase);
        if (familyData?.groups) {
          for (const grp of familyData.groups) {
            for (const m of grp.members) {
              if (m.patient_id !== selfPatient?.id && m.can_view_records) {
                // Avoid duplicates
                if (!patientList.some((p) => p.id === m.patient_id)) {
                  patientList.push({
                    id: m.patient_id,
                    name: `${m.full_name} (${m.relationship || "Family Member"})`,
                    relation: m.relationship || "Dependent",
                    canView: true,
                    isSelf: false,
                  });
                }
              }
            }
          }
        }

        if (isMounted) {
          setPatients(patientList);
          if (!selectedPatientId && patientList.length > 0) {
            setSelectedPatientId(patientList[0].id);
          }
        }
      } catch (err) {
        console.error("Error loading patient context for AI Doctor:", err);
      }
    }

    loadPatientContext();
    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2. Scroll to bottom on new message
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // 3. Clear toast helper
  const showToast = (msg: string) => {
    setToastNotification(msg);
    setTimeout(() => setToastNotification(null), 3500);
  };

  const toggleExpand = (msgId: string) => {
    setExpandedCards((prev) => ({
      ...prev,
      [msgId]: !prev[msgId],
    }));
  };

  // 4. Send Message Handler
  const handleSend = async (queryText?: string, quickActionType?: string) => {
    const textToSend = (queryText || input).trim();
    if (!textToSend || isLoading) return;

    setInput("");
    setErrorMessage(null);

    const userMsgId = createMsgId("user");
    const userMsg: AIDoctorChatMessage = {
      id: userMsgId,
      role: "user",
      text: textToSend,
      timestamp: getDisplayTime(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const historyForBackend = messages.slice(-4).map((m) => ({
        role: m.role,
        text: m.text,
      }));

      const { data, error } = await sendAIDoctorMessage(supabase, {
        message: textToSend,
        targetPatientId: selectedPatientId || null,
        chatHistory: historyForBackend,
        quickAction: quickActionType || null,
      });

      if (error || !data) {
        const errorFallbackText =
          error?.message ||
          "CarePath AI Doctor is temporarily unavailable. Your health records are still available.";

        const aiErrMsgId = createMsgId("ai-err");
        const aiErrMsg: AIDoctorChatMessage = {
          id: aiErrMsgId,
          role: "ai",
          text: errorFallbackText,
          timestamp: getDisplayTime(),
        };
        setMessages((prev) => [...prev, aiErrMsg]);
        setErrorMessage(errorFallbackText);
      } else {
        const aiMsgId = createMsgId("ai");
        const aiMsg: AIDoctorChatMessage = {
          id: aiMsgId,
          role: "ai",
          text: data.reply,
          data,
          timestamp: getDisplayTime(),
        };
        setMessages((prev) => [...prev, aiMsg]);
        // Default to expanded for immediate clinical visibility
        setExpandedCards((prev) => ({ ...prev, [aiMsgId]: true }));
      }
    } catch {
      const fallbackNotice =
        "CarePath AI Doctor is temporarily unavailable. Your health records are still available.";
      const catchMsgId = createMsgId("ai-err");
      setMessages((prev) => [
        ...prev,
        {
          id: catchMsgId,
          role: "ai",
          text: fallbackNotice,
          timestamp: getDisplayTime(),
        },
      ]);
      setErrorMessage(fallbackNotice);
    } finally {
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  };

  // 5. Feedback handler (👍 / 👎)
  const handleFeedback = async (msgId: string, rating: "up" | "down") => {
    setMessages((prev) =>
      prev.map((m) => (m.id === msgId ? { ...m, feedback: rating } : m))
    );

    const targetMsg = messages.find((m) => m.id === msgId);
    showToast(rating === "up" ? "Thanks! Glad that was helpful." : "Feedback noted — our clinical safety team reviews flagged responses.");

    try {
      await submitAIDoctorFeedback(supabase, {
        message_id: msgId,
        rating,
        user_message: messages.find((m, idx) => messages[idx + 1]?.id === msgId)?.text,
        ai_response: targetMsg?.text,
      });
    } catch (err) {
      console.warn("Feedback logging silent notice:", err);
    }
  };

  const selectedPatientName =
    patients.find((p) => p.id === selectedPatientId)?.name || "Current Patient";

  return (
    <div className="min-h-screen bg-slate-50/70 pb-12 flex flex-col">
      {/* Toast Notification */}
      {toastNotification && (
        <div className="fixed top-20 right-4 z-50 bg-slate-900 text-white text-xs px-4 py-2.5 rounded-lg shadow-lg border border-slate-700 animate-in fade-in slide-in-from-top-2">
          {toastNotification}
        </div>
      )}

      {/* Header & Sub-Bar */}
      <div className="sticky top-16 z-40 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          {/* Title & Stethoscope Badge */}
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-teal-600 text-white flex items-center justify-center shadow-sm shadow-teal-600/20">
              <Stethoscope className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold text-slate-900">Dr. CarePath</h1>
                <Badge
                  variant="default"
                  className="bg-teal-50 text-teal-800 border-teal-200 text-[10px] font-semibold flex items-center gap-1"
                >
                  <Sparkles className="h-2.5 w-2.5 text-teal-600" />
                  Health Assistant
                </Badge>
              </div>
              <p className="text-[11px] text-slate-500">
                Grounded in verified CarePath records • Deterministic Medical Safety Active
              </p>
            </div>
          </div>

          {/* Patient Selector Dropdown */}
          <div className="flex items-center gap-2">
            <label htmlFor="patient-select" className="text-xs font-medium text-slate-600 flex items-center gap-1">
              <User className="h-3.5 w-3.5 text-slate-400" />
              Patient:
            </label>
            <select
              id="patient-select"
              value={selectedPatientId}
              onChange={(e) => setSelectedPatientId(e.target.value)}
              className="text-xs font-medium bg-slate-100/90 text-slate-800 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 pt-4 flex flex-col">
        {/* Medical Safety Disclaimer Strip */}
        <div className="mb-4 bg-amber-50/80 border border-amber-200/90 rounded-xl px-3.5 py-2.5 flex items-start gap-2.5 text-amber-900 text-xs">
          <Info className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
          <div className="flex-1 leading-relaxed">
            <span className="font-semibold text-amber-950">Clinical Grounding Notice: </span>
            Answers are synthesized directly from {selectedPatientName}&apos;s verified CarePath records. Dr. CarePath does not prescribe medication, alter prescribed dosages, or replace emergency care. In an emergency, dial your local emergency services (911/112/108) immediately.
          </div>
        </div>

        {/* Temporary Error Notice Banner */}
        {errorMessage && (
          <div className="mb-4 bg-rose-50 border border-rose-200 rounded-xl p-3 text-rose-900 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-rose-700 hover:text-rose-900 font-bold ml-2 text-sm"
              aria-label="Dismiss error notice"
            >
              ✕
            </button>
          </div>
        )}

        {/* Chat Feed */}
        <div className="flex-1 space-y-4 pb-4">
          {messages.length === 0 && (
            <div className="text-center py-8 sm:py-12 px-4 space-y-6 max-w-2xl mx-auto">
              <div className="mx-auto h-16 w-16 rounded-2xl bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-700 shadow-sm">
                <Stethoscope className="h-8 w-8" />
              </div>
              <div className="space-y-1.5">
                <h2 className="text-xl font-bold text-slate-900">
                  How can Dr. CarePath assist you today?
                </h2>
                <p className="text-sm text-slate-500">
                  Ask questions about medications, recent lab reports, diagnoses, surgical notes, or upcoming follow-ups in {selectedPatientName}&apos;s records.
                </p>
              </div>

              {/* Starter Question Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-left pt-2">
                {SUGGESTED_QUESTIONS.map((item, idx) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={idx}
                      onClick={() => handleSend(item.query)}
                      className="group p-3 rounded-xl border border-slate-200 bg-white hover:border-teal-500/50 hover:bg-teal-50/40 transition-all text-left flex items-start gap-2.5 shadow-xs"
                    >
                      <div className="p-2 rounded-lg bg-teal-50 text-teal-700 group-hover:bg-teal-100 transition-colors">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1">
                        <p className="text-xs font-semibold text-slate-800 group-hover:text-teal-900">
                          {item.title}
                        </p>
                        <p className="text-[11px] text-slate-500 group-hover:text-slate-600 line-clamp-1">
                          &ldquo;{item.query}&rdquo;
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Render Messages */}
          {messages.map((msg) => (
            <div key={msg.id} className="space-y-2">
              {msg.role === "user" ? (
                /* User Message Bubble */
                <div className="flex justify-end">
                  <div className="bg-teal-700 text-white rounded-2xl rounded-br-xs px-4 py-2.5 max-w-[85%] sm:max-w-[75%] shadow-sm">
                    <p className="text-xs sm:text-sm font-normal leading-relaxed">{msg.text}</p>
                    <span className="block text-[10px] text-teal-100 text-right mt-1 opacity-80">
                      {msg.timestamp}
                    </span>
                  </div>
                </div>
              ) : msg.data ? (
                /* Rich Structured Doctor Response Card */
                <div className="space-y-2.5 max-w-[95%] sm:max-w-[88%]">
                  {/* Urgency & Clinical Triage Banner */}
                  {(() => {
                    const urgency = msg.data.urgency || "yellow";
                    const config = URGENCY_CONFIG[urgency] || URGENCY_CONFIG.yellow;
                    const UrgencyIcon = config.icon;
                    return (
                      <div className={`rounded-xl border p-3.5 ${config.badgeBg} shadow-xs`}>
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <div className="flex items-center gap-2">
                            <span className={`h-2 w-2 rounded-full ${config.pillBg}`} />
                            <span className="text-[11px] font-bold uppercase tracking-wider">
                              {msg.data.urgency_label || config.label}
                            </span>
                          </div>
                          <UrgencyIcon className="h-4 w-4 shrink-0" />
                        </div>

                        {/* Safety Alert (e.g. Red Flag or Allergy Contraindication) */}
                        {msg.data.safety_alert && (
                          <div className="mt-2 p-2.5 rounded-lg bg-rose-100/90 text-rose-950 font-medium text-xs border border-rose-300">
                            {msg.data.safety_alert}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Doctor's Conversational Explanation */}
                  <Card className="border-slate-200 shadow-xs bg-white">
                    <CardContent className="p-4 sm:p-5 space-y-3.5">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                        <div className="flex items-center gap-2">
                          <div className="h-6 w-6 rounded-lg bg-teal-100 text-teal-800 flex items-center justify-center font-bold text-xs">
                            <Stethoscope className="h-3.5 w-3.5" />
                          </div>
                          <span className="text-xs font-bold text-slate-800">Dr. CarePath</span>
                          <span className="text-[10px] text-slate-400">• Verified Record Analysis</span>
                        </div>
                        <span className="text-[10px] text-slate-400">{msg.timestamp}</span>
                      </div>

                      <p className="text-xs sm:text-sm text-slate-800 leading-relaxed font-normal whitespace-pre-line">
                        {msg.data.reply}
                      </p>

                      {/* Expand / Collapse Details Button */}
                      <div className="pt-1">
                        <button
                          type="button"
                          onClick={() => toggleExpand(msg.id)}
                          className="text-xs font-semibold text-teal-700 hover:text-teal-900 flex items-center gap-1.5 transition-colors"
                        >
                          {expandedCards[msg.id] ? (
                            <>
                              <ChevronUp className="h-3.5 w-3.5" /> Hide Clinical Details
                            </>
                          ) : (
                            <>
                              <ChevronDown className="h-3.5 w-3.5" /> Show Clinical Details & Action Steps
                            </>
                          )}
                        </button>
                      </div>

                      {/* Expandable Sections */}
                      {expandedCards[msg.id] && (
                        <div className="space-y-3 pt-2 text-xs border-t border-slate-100 animate-in fade-in duration-200">
                          {/* Recommended Actions / What to do */}
                          {msg.data.what_to_do && msg.data.what_to_do.length > 0 && (
                            <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 space-y-1.5">
                              <p className="font-semibold text-slate-900 text-xs flex items-center gap-1.5">
                                <span className="h-1.5 w-1.5 rounded-full bg-teal-600" />
                                Recommended Next Steps
                              </p>
                              <ol className="list-decimal list-inside space-y-1 text-slate-700">
                                {msg.data.what_to_do.map((step, sIdx) => (
                                  <li key={sIdx} className="leading-relaxed">
                                    {step}
                                  </li>
                                ))}
                              </ol>
                            </div>
                          )}

                          {/* Possible Causes */}
                          {msg.data.possible_causes && msg.data.possible_causes.length > 0 && (
                            <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 space-y-1.5">
                              <p className="font-semibold text-slate-900 text-xs">
                                Potential Factors / Considerations
                              </p>
                              <ul className="list-disc list-inside space-y-0.5 text-slate-600 text-xs">
                                {msg.data.possible_causes.map((cause, cIdx) => (
                                  <li key={cIdx}>{cause}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {/* Supportive Home Remedies */}
                          {msg.data.home_remedies && msg.data.home_remedies.length > 0 && (
                            <div className="bg-emerald-50/50 p-3 rounded-lg border border-emerald-100 space-y-1">
                              <p className="font-semibold text-emerald-950 text-xs flex items-center gap-1.5">
                                <Home className="h-3.5 w-3.5 text-emerald-700" /> Supportive Home Measures
                              </p>
                              <ul className="list-disc list-inside space-y-0.5 text-emerald-900 text-xs">
                                {msg.data.home_remedies.map((rem, rIdx) => (
                                  <li key={rIdx}>{rem}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {/* Approved OTC Medicines (if appropriate) */}
                          {msg.data.otc_medicines && msg.data.otc_medicines.length > 0 && (
                            <div className="bg-sky-50/60 p-3 rounded-lg border border-sky-100 space-y-1.5">
                              <p className="font-semibold text-sky-950 text-xs flex items-center gap-1.5">
                                <Pill className="h-3.5 w-3.5 text-sky-700" /> Permissible Over-the-Counter Options
                              </p>
                              <div className="space-y-1 text-sky-900 text-xs">
                                {msg.data.otc_medicines.map((m, mIdx) => (
                                  <div key={mIdx} className="bg-white/80 p-2 rounded border border-sky-200/50">
                                    <span className="font-semibold text-slate-900">{m.name}</span>
                                    {m.dosage && <span className="text-slate-600"> • {m.dosage}</span>}
                                    {m.when && <p className="text-[11px] text-slate-500 mt-0.5">{m.when}</p>}
                                    {m.warning && <p className="text-[11px] text-amber-700 mt-0.5">⚠️ {m.warning}</p>}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* When to Rush / Emergency warning signs */}
                          {msg.data.when_to_rush && msg.data.when_to_rush.length > 0 && (
                            <div className="bg-rose-50/70 p-3 rounded-lg border border-rose-200/80 space-y-1">
                              <p className="font-semibold text-rose-950 text-xs flex items-center gap-1.5">
                                <Siren className="h-3.5 w-3.5 text-rose-700" /> Seek Immediate Emergency Care If:
                              </p>
                              <ul className="list-disc list-inside space-y-0.5 text-rose-900 text-xs">
                                {msg.data.when_to_rush.map((r, rIdx) => (
                                  <li key={rIdx}>{r}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {/* Recommended Specialist */}
                          {msg.data.doctor_type && (
                            <div className="p-2.5 rounded-lg bg-teal-50 border border-teal-100 text-xs flex items-center gap-2 text-teal-900">
                              <Heart className="h-4 w-4 text-teal-700 shrink-0" />
                              <span>
                                Recommended Specialist Consultation: <strong>{msg.data.doctor_type}</strong>
                              </span>
                            </div>
                          )}

                          {/* Source Records & Provenance (Priority 7) */}
                          {msg.data.sources_used && msg.data.sources_used.length > 0 && (
                            <div className="pt-2 border-t border-slate-100">
                              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                                <FileText className="h-3 w-3" /> CarePath Records Referenced
                              </p>
                              <div className="flex flex-wrap gap-1.5">
                                {msg.data.sources_used.map((source, sIdx) => (
                                  <Link
                                    key={sIdx}
                                    href="/documents"
                                    className="inline-flex items-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] px-2.5 py-1 rounded-md transition-colors"
                                    title={source.relevance_note || "View Document in Records"}
                                  >
                                    <FileText className="h-3 w-3 text-teal-700" />
                                    <span className="font-medium truncate max-w-[180px]">{source.document_name}</span>
                                    {source.date && <span className="text-slate-400">({source.date})</span>}
                                    <ArrowRight className="h-2.5 w-2.5 text-slate-400 ml-0.5" />
                                  </Link>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Follow-up Question Chips */}
                      {msg.data.follow_up_questions && msg.data.follow_up_questions.length > 0 && (
                        <div className="pt-1 flex flex-wrap gap-1.5">
                          {msg.data.follow_up_questions.map((fq, fIdx) => (
                            <button
                              key={fIdx}
                              onClick={() => handleSend(fq)}
                              className="text-[11px] bg-slate-100 hover:bg-teal-50 hover:text-teal-800 text-slate-700 px-3 py-1 rounded-full border border-slate-200 transition-colors"
                            >
                              {fq}
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Helpful Feedback Toolbar (Priority 11) */}
                      <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs text-slate-400">
                        <span className="text-[11px]">Was this medical explanation helpful?</span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleFeedback(msg.id, "up")}
                            disabled={!!msg.feedback}
                            title="Helpful response"
                            className={`p-1.5 rounded-md transition-colors ${
                              msg.feedback === "up"
                                ? "bg-emerald-100 text-emerald-800"
                                : "hover:bg-slate-100 text-slate-500"
                            }`}
                          >
                            <ThumbsUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleFeedback(msg.id, "down")}
                            disabled={!!msg.feedback}
                            title="Not helpful"
                            className={`p-1.5 rounded-md transition-colors ${
                              msg.feedback === "down"
                                ? "bg-rose-100 text-rose-800"
                                : "hover:bg-slate-100 text-slate-500"
                            }`}
                          >
                            <ThumbsDown className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              ) : (
                /* Simple / Fallback AI Message Card */
                <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-xs p-4 max-w-[85%] text-xs sm:text-sm text-slate-800 shadow-xs space-y-2">
                  <div className="flex items-center gap-1.5 text-teal-700 font-bold text-xs">
                    <Stethoscope className="h-3.5 w-3.5" /> Dr. CarePath
                  </div>
                  <p className="leading-relaxed">{msg.text}</p>
                </div>
              )}
            </div>
          ))}

          {/* Loading Indicator */}
          {isLoading && (
            <div className="flex items-center gap-2.5 text-slate-500 px-3 py-2 bg-white border border-slate-200 rounded-xl inline-flex shadow-xs animate-pulse">
              <Loader2 className="h-4 w-4 animate-spin text-teal-600" />
              <span className="text-xs font-medium">
                Dr. CarePath is reviewing {selectedPatientName}&apos;s verified records...
              </span>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Input Bar */}
        <div className="sticky bottom-0 bg-white/95 backdrop-blur border-t border-slate-200 py-3 mt-auto">
          {/* Quick Prompts Drawer */}
          <div className="flex gap-1.5 overflow-x-auto pb-2 mb-1 scrollbar-none text-[11px]">
            <button
              onClick={() => handleSend("What medicines am I currently taking?", "medications")}
              className="whitespace-nowrap px-2.5 py-1 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
            >
              💊 My Medicines
            </button>
            <button
              onClick={() => handleSend("Explain my latest lab results.", "labs")}
              className="whitespace-nowrap px-2.5 py-1 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
            >
              🧪 Lab Results
            </button>
            <button
              onClick={() => handleSend("Summarize my medical history.", "history")}
              className="whitespace-nowrap px-2.5 py-1 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
            >
              📋 Health Summary
            </button>
            <button
              onClick={() => handleSend("What follow-ups are coming up?", "follow_ups")}
              className="whitespace-nowrap px-2.5 py-1 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
            >
              🗓️ Upcoming Reviews
            </button>
            <button
              onClick={() => handleSend("Can you explain whether my active medicines have known interactions?", "medicine_checker")}
              className="whitespace-nowrap px-2.5 py-1 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
            >
              🔍 Drug Interactions
            </button>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center gap-2"
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={`Ask Dr. CarePath about ${selectedPatientName}'s records, tests, or symptoms...`}
              disabled={isLoading}
              className="flex-1 bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:bg-white transition-all"
            />
            <Button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="bg-teal-600 hover:bg-teal-700 text-white rounded-xl px-4 py-2.5 flex items-center gap-1.5 transition-colors"
            >
              <Send className="h-4 w-4" />
              <span className="hidden sm:inline text-xs font-semibold">Send</span>
            </Button>
          </form>
        </div>
      </main>
    </div>
  );
}
