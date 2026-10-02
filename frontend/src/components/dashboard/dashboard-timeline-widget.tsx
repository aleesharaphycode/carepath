"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Clock,
  Calendar,
  Activity,
  Pill,
  FlaskConical,
  Stethoscope,
  ArrowRight,
  ShieldAlert,
  FileText,
  FileCheck2,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import {
  fetchTimeline,
  fetchMismatches,
  getCachedTimeline,
  getCachedMismatches,
} from "@/lib/services/intelligence";
import { TimelineEvent, MismatchItem } from "@/lib/types";

export function DashboardTimelineWidget() {
  const cachedTl = getCachedTimeline();
  const cachedMis = getCachedMismatches();

  const [events, setEvents] = useState<TimelineEvent[]>(() => cachedTl?.events || []);
  const [mismatches, setMismatches] = useState<MismatchItem[]>(() => cachedMis?.mismatches || []);
  const [loading, setLoading] = useState(() => !cachedTl);

  useEffect(() => {
    let isMounted = true;
    const supabase = createClient();

    Promise.all([fetchTimeline(supabase), fetchMismatches(supabase)])
      .then(([tlRes, misRes]) => {
        if (!isMounted) return;
        if (tlRes.data) {
          setEvents(tlRes.data.events);
        }
        if (misRes.data) {
          setMismatches(misRes.data.mismatches);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const getEventIcon = (type: string) => {
    switch (type) {
      case "diagnosis":
        return <Activity className="h-3.5 w-3.5 text-purple-600" />;
      case "medication":
        return <Pill className="h-3.5 w-3.5 text-emerald-600" />;
      case "investigation":
        return <FlaskConical className="h-3.5 w-3.5 text-amber-600" />;
      case "procedure":
        return <Stethoscope className="h-3.5 w-3.5 text-indigo-600" />;
      case "follow_up":
      default:
        return <Clock className="h-3.5 w-3.5 text-sky-600" />;
    }
  };

  const recentEvents = events.slice(0, 4);

  return (
    <div className="space-y-4">
      {/* Potential Mismatches Alert Banner if any exist */}
      {mismatches.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50/90 p-4 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500 text-white shrink-0 shadow-xs">
              <ShieldAlert className="h-4 w-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-amber-950">
                {mismatches.length} Potential Information {mismatches.length === 1 ? "Mismatch" : "Mismatches"} Detected
              </h4>
              <p className="text-[11px] text-amber-800">
                Factual differences found between medical records. Review against original source documents.
              </p>
            </div>
          </div>
          <Link href="/timeline">
            <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white text-xs h-7 shrink-0">
              Inspect Mismatches
              <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          </Link>
        </div>
      )}

      {/* Live Timeline Events Widget Card */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
        {/* Card Header */}
        <div className="p-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Clock className="h-5 w-5 text-teal-600" />
                Recent Health Events
              </h3>
              <Badge variant="default" className="text-[10px] bg-teal-50 text-teal-700 border-teal-200">
                Live Timeline
              </Badge>
            </div>
            <p className="text-xs text-slate-500">
              Chronological medical events extracted and verified from patient documents
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link href="/calendar">
              <Button variant="outline" size="sm" className="text-xs border-slate-200 hover:border-teal-300">
                <Calendar className="mr-1.5 h-3.5 w-3.5 text-slate-500" />
                Calendar
              </Button>
            </Link>
            <Link href="/timeline">
              <Button size="sm" className="bg-teal-600 hover:bg-teal-700 text-white text-xs shadow-xs">
                View Full Timeline
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        </div>

        {/* Content Body */}
        {loading ? (
          <div className="p-8 text-center space-y-2">
            <Loader2 className="h-6 w-6 animate-spin text-teal-600 mx-auto" />
            <p className="text-xs text-slate-500">Loading chronological health events...</p>
          </div>
        ) : recentEvents.length === 0 ? (
          <div className="p-8 text-center space-y-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400 mx-auto">
              <Calendar className="h-5 w-5" />
            </div>
            <h4 className="text-xs font-semibold text-slate-800">No health events yet.</h4>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Upload documents in the Document Vault and analyze them to automatically build your live health timeline.
            </p>
            <Link href="/documents" className="inline-block pt-1">
              <Button size="sm" className="bg-teal-600 hover:bg-teal-700 text-white text-xs">
                Upload Document
              </Button>
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {recentEvents.map((ev) => (
              <div
                key={ev.id}
                className="p-4 sm:px-6 hover:bg-slate-50/70 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                {/* Event info */}
                <div className="flex items-start sm:items-center gap-3 min-w-0">
                  <div className="p-2 rounded-lg bg-slate-50 border border-slate-100 shrink-0 mt-0.5 sm:mt-0">
                    {getEventIcon(ev.event_type)}
                  </div>
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-slate-900 truncate">
                        {ev.title}
                      </span>
                      <Badge variant="outline" className="text-[10px] capitalize text-slate-600 border-slate-200">
                        {ev.event_type.replace("_", " ")}
                      </Badge>
                      {Boolean(ev.details?.abnormal_flag) && (
                        <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-800 border-amber-300 font-bold">
                          Abnormal
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span className="flex items-center gap-1 truncate max-w-xs">
                        <FileText className="h-3 w-3 text-slate-400 shrink-0" />
                        <span className="truncate">{ev.document_name}</span>
                      </span>
                      <span>&bull;</span>
                      {ev.source_page ? (
                        <span>Page {ev.source_page}</span>
                      ) : (
                        <span className="text-slate-400">Page unavailable</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Date & Action */}
                <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-1 sm:pt-0">
                  {ev.is_date_confirmed ? (
                    <Badge variant="default" className="text-[10px] bg-emerald-50 text-emerald-800 border-emerald-200">
                      <FileCheck2 className="h-2.5 w-2.5 mr-1 text-emerald-600" />
                      {ev.date_display}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] bg-slate-100 text-slate-700 border-slate-300">
                      <AlertCircle className="h-2.5 w-2.5 mr-1 text-slate-400" />
                      {ev.date_display}
                    </Badge>
                  )}
                  <Link href="/timeline">
                    <Button variant="ghost" size="sm" className="text-xs text-teal-700 hover:text-teal-800 hover:bg-teal-50 h-7 px-2">
                      Inspect
                    </Button>
                  </Link>
                </div>
              </div>
            ))}

            {/* Footer with View Full Timeline link */}
            <div className="p-3 bg-slate-50/50 text-center border-t border-slate-100">
              <Link
                href="/timeline"
                className="text-xs font-semibold text-teal-700 hover:text-teal-800 inline-flex items-center gap-1.5 transition-colors"
              >
                <span>View Full Chronological Timeline ({events.length} events)</span>
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
