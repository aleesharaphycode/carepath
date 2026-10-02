"use client";

import { useEffect, useState } from "react";
import { Loader2, RefreshCw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import {
  fetchTimeline,
  fetchMismatches,
  getCachedTimeline,
  getCachedMismatches,
} from "@/lib/services/intelligence";
import { getPatientDocuments, getCachedDocuments } from "@/lib/services/documents";
import { TimelineEvent, MismatchItem, MedicalDocument } from "@/lib/types";
import { TimelineFeed } from "./timeline-feed";
import { SourceLinkingModal } from "./source-linking-modal";
import { DocumentViewerModal } from "@/components/documents/document-viewer-modal";

interface TimelineClientProps {
  patientId: string;
}

export function TimelineClient({ patientId }: TimelineClientProps) {
  const cachedTl = getCachedTimeline();
  const cachedMis = getCachedMismatches();
  const cachedDocs = getCachedDocuments(patientId);

  const [events, setEvents] = useState<TimelineEvent[]>(() => cachedTl?.events || []);
  const [categories, setCategories] = useState<Record<string, number>>(() => cachedTl?.categories || {});
  const [mismatches, setMismatches] = useState<MismatchItem[]>(() => cachedMis?.mismatches || []);
  const [documents, setDocuments] = useState<MedicalDocument[]>(() => cachedDocs || []);
  const [loading, setLoading] = useState(() => !cachedTl);
  const [error, setError] = useState<string | null>(null);

  // Modals state
  const [selectedEvent, setSelectedEvent] = useState<TimelineEvent | null>(null);
  const [viewerDocument, setViewerDocument] = useState<MedicalDocument | null>(null);
  const [targetPage, setTargetPage] = useState<number | null>(null);

  const loadData = async (forceRefresh = true) => {
    setLoading(true);
    setError(null);
    const supabase = createClient();

    try {
      const [tlRes, misRes, docRes] = await Promise.all([
        fetchTimeline(supabase, { forceRefresh }),
        fetchMismatches(supabase, { forceRefresh }),
        getPatientDocuments(supabase, patientId, { forceRefresh }),
      ]);

      if (tlRes.error) {
        setError(tlRes.error.message);
      } else if (tlRes.data) {
        setEvents(tlRes.data.events);
        setCategories(tlRes.data.categories);
      }

      if (misRes.data) {
        setMismatches(misRes.data.mismatches);
      }

      if (docRes.documents) {
        setDocuments(docRes.documents);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load health timeline.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    const supabase = createClient();

    Promise.all([
      fetchTimeline(supabase),
      fetchMismatches(supabase),
      getPatientDocuments(supabase, patientId),
    ])
      .then(([tlRes, misRes, docRes]) => {
        if (!isMounted) return;
        if (tlRes.error) {
          setError(tlRes.error.message);
        } else if (tlRes.data) {
          setEvents(tlRes.data.events);
          setCategories(tlRes.data.categories);
        }
        if (misRes.data) {
          setMismatches(misRes.data.mismatches);
        }
        if (docRes.documents) {
          setDocuments(docRes.documents);
        }
      })
      .catch((err: unknown) => {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : "Failed to load health timeline.");
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [patientId]);

  // Handler to open source document
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
              Clinical History
            </span>
            <span className="text-xs text-slate-500">•</span>
            <span className="text-xs text-slate-500 font-medium">Chronological Medical Vault</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 mt-1">
            Unified Health Timeline
          </h2>
          <p className="text-xs text-slate-600 mt-0.5">
            Structured chronological timeline reconstructed from prescriptions, lab reports, and clinical notes with bidirectional source citations.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => loadData(true)}
          disabled={loading}
          className="text-xs h-9 text-slate-700 self-start sm:self-auto border-slate-300 shadow-2xs"
        >
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin text-teal-600" : ""}`} />
          Refresh Timeline
        </Button>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-900 flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold">Unable to load health timeline</p>
            <p className="text-red-700">{error}</p>
            <p className="text-slate-500 text-[11px] mt-1">
              Ensure the FastAPI backend microservice is running and your session token is active.
            </p>
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && events.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-16 text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-teal-600 mx-auto" />
          <h3 className="text-sm font-semibold text-slate-800">
            Synthesizing Unified Health Journey...
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Aggregating extracted diagnoses, medications, lab tests, and procedures with verified source provenance.
          </p>
        </div>
      ) : (
        <TimelineFeed
          events={events}
          categories={categories}
          mismatches={mismatches}
          onSelectEvent={(ev) => setSelectedEvent(ev)}
          onOpenDocument={handleOpenDocument}
          loading={loading}
        />
      )}

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
