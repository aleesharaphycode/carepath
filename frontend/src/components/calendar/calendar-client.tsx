"use client";

import { useEffect, useState } from "react";
import { Loader2, RefreshCw, AlertTriangle, Plus, Sparkles, FileText, CheckCircle2, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { fetchCalendar, getCachedCalendar } from "@/lib/services/intelligence";
import { getPatientDocuments, getCachedDocuments } from "@/lib/services/documents";
import { fetchEventCandidates } from "@/lib/services/health-events";
import { CalendarEvent, MedicalDocument, HealthEventCandidate } from "@/lib/types";
import { CalendarView } from "./calendar-view";
import { ManualEventModal } from "./manual-event-modal";
import { SourceLinkingModal } from "@/components/timeline/source-linking-modal";
import { DocumentViewerModal } from "@/components/documents/document-viewer-modal";

interface CalendarClientProps {
  patientId: string;
}

export function CalendarClient({ patientId }: CalendarClientProps) {
  const cachedCal = getCachedCalendar();
  const cachedDocs = getCachedDocuments(patientId);

  const [events, setEvents] = useState<CalendarEvent[]>(() => cachedCal?.events || []);
  const [confirmedCount, setConfirmedCount] = useState(() => cachedCal?.confirmed_count || 0);
  const [projectedCount, setProjectedCount] = useState(() => cachedCal?.projected_count || 0);
  const [documents, setDocuments] = useState<MedicalDocument[]>(() => cachedDocs || []);
  const [candidates, setCandidates] = useState<HealthEventCandidate[]>([]);
  const [loading, setLoading] = useState(() => !cachedCal);
  const [error, setError] = useState<string | null>(null);

  // Modals state
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState<HealthEventCandidate | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [viewerDocument, setViewerDocument] = useState<MedicalDocument | null>(null);
  const [targetPage, setTargetPage] = useState<number | null>(null);

  const loadData = async (forceRefresh = true) => {
    setLoading(true);
    setError(null);
    const supabase = createClient();

    try {
      const [calRes, docRes, candRes] = await Promise.all([
        fetchCalendar(supabase, { forceRefresh }),
        getPatientDocuments(supabase, patientId, { forceRefresh }),
        fetchEventCandidates(supabase, patientId),
      ]);

      if (calRes.error) {
        setError(calRes.error.message);
      } else if (calRes.data) {
        setEvents(calRes.data.events);
        setConfirmedCount(calRes.data.confirmed_count);
        setProjectedCount(calRes.data.projected_count);
      }

      if (docRes.documents) {
        setDocuments(docRes.documents);
      }

      if (candRes.data) {
        setCandidates(candRes.data);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load healthcare calendar.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    const supabase = createClient();

    Promise.all([
      fetchCalendar(supabase),
      getPatientDocuments(supabase, patientId),
      fetchEventCandidates(supabase, patientId),
    ])
      .then(([calRes, docRes, candRes]) => {
        if (!isMounted) return;
        if (calRes.error) {
          setError(calRes.error.message);
        } else if (calRes.data) {
          setEvents(calRes.data.events);
          setConfirmedCount(calRes.data.confirmed_count);
          setProjectedCount(calRes.data.projected_count);
        }
        if (docRes.documents) {
          setDocuments(docRes.documents);
        }
        if (candRes.data) {
          setCandidates(candRes.data);
        }
      })
      .catch((err: unknown) => {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : "Failed to load healthcare calendar.");
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [patientId]);

  const handleOpenDocument = (documentId: string, pageNumber?: number | null) => {
    const doc = documents.find((d) => d.id === documentId);
    if (doc) {
      setTargetPage(pageNumber ?? null);
      setViewerDocument(doc);
    } else {
      const supabase = createClient();
      supabase
        .from("documents")
        .select("*")
        .eq("id", documentId)
        .maybeSingle()
        .then((res: { data: unknown }) => {
          if (res.data) {
            setTargetPage(pageNumber ?? null);
            setViewerDocument(res.data as MedicalDocument);
          } else {
            alert("Source document could not be retrieved from vault.");
          }
        });
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-teal-700 bg-teal-50 px-2 py-0.5 rounded-md border border-teal-200">
              Care Milestones
            </span>
            <span className="text-xs text-slate-500">•</span>
            <span className="text-xs text-slate-500 font-medium">Healthcare Milestone Calendar</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 mt-1">
            AI Health Calendar
          </h2>
          <p className="text-xs text-slate-600 mt-0.5">
            Clear visual distinction between confirmed appointment dates and deterministically projected review intervals.
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadData(true)}
            disabled={loading}
            className="text-xs h-9 text-slate-700 border-slate-300 shadow-2xs"
          >
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin text-teal-600" : ""}`} />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setSelectedCandidate(null);
              setIsManualModalOpen(true);
            }}
            className="bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold h-9 shadow-xs"
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add Health Event
          </Button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-900 flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold">Unable to load healthcare calendar</p>
            <p className="text-red-700">{error}</p>
          </div>
        </div>
      )}

      {/* Discovered Document Events Banner (Candidate Confirmation) */}
      {candidates.length > 0 && (
        <div className="rounded-2xl border border-teal-200 bg-gradient-to-r from-teal-50/70 via-emerald-50/50 to-white p-4 sm:p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-600 text-white shadow-2xs">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Discovered Document Events ({candidates.length})
                </h3>
                <p className="text-[11px] text-slate-600">
                  CarePath extracted clinical encounters from your vault. Review clinical dates to confirm them into your calendar.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
            {candidates.map((cand) => (
              <div
                key={cand.document_id}
                className="rounded-xl border border-teal-100 bg-white p-3.5 shadow-2xs hover:shadow-sm transition-all space-y-2.5 flex flex-col justify-between"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-teal-700 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                      {cand.suggested_event_type}
                    </span>
                    {cand.confidence_is_date_confirmed ? (
                      <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full flex items-center gap-1">
                        <CheckCircle2 className="h-2.5 w-2.5 text-emerald-600" />
                        {cand.detected_date}
                      </span>
                    ) : (
                      <span className="text-[10px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">
                        Date Unverified
                      </span>
                    )}
                  </div>
                  <h4 className="text-xs font-bold text-slate-900 line-clamp-1">{cand.suggested_title}</h4>
                  <div className="flex items-center gap-1 text-[11px] text-slate-500 truncate">
                    <FileText className="h-3 w-3 text-slate-400 shrink-0" />
                    <span className="truncate">{cand.document_name}</span>
                  </div>
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setSelectedCandidate(cand);
                    setIsManualModalOpen(true);
                  }}
                  className="w-full text-xs h-7 text-teal-700 hover:text-teal-800 hover:bg-teal-50 border-teal-200 mt-1"
                >
                  Confirm Event
                  <ChevronRight className="ml-1 h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && events.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-16 text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-teal-600 mx-auto" />
          <h3 className="text-sm font-semibold text-slate-800">
            Synthesizing Healthcare Calendar...
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Resolving confirmed clinic visits and calculating deterministic review intervals.
          </p>
        </div>
      ) : (
        <CalendarView
          events={events}
          confirmedCount={confirmedCount}
          projectedCount={projectedCount}
          onSelectEvent={(ev) => setSelectedEvent(ev)}
          onOpenDocument={handleOpenDocument}
        />
      )}

      {/* Manual / Candidate Event Modal */}
      <ManualEventModal
        isOpen={isManualModalOpen}
        patientId={patientId}
        initialCandidate={selectedCandidate}
        onClose={() => {
          setIsManualModalOpen(false);
          setSelectedCandidate(null);
        }}
        onCreated={() => {
          setIsManualModalOpen(false);
          setSelectedCandidate(null);
          loadData();
        }}
      />

      {/* Source Linking Modal */}
      {selectedEvent && (
        <SourceLinkingModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          onOpenDocument={(docId, page) => {
            setSelectedEvent(null);
            handleOpenDocument(docId, page);
          }}
        />
      )}

      {/* Document Viewer Modal */}
      {viewerDocument && (
        <DocumentViewerModal
          document={viewerDocument}
          initialPage={targetPage}
          onClose={() => {
            setViewerDocument(null);
            setTargetPage(null);
          }}
        />
      )}
    </div>
  );
}
