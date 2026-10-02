"use client";

import {
  X,
  FileText,
  FileCheck2,
  Calendar,
  ExternalLink,
  ShieldCheck,
  Quote,
  Pill,
  Activity,
  FlaskConical,
  Stethoscope,
  Clock,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TimelineEvent, CalendarEvent } from "@/lib/types";

interface SourceLinkingModalProps {
  event: TimelineEvent | CalendarEvent | null;
  onClose: () => void;
  onOpenDocument: (documentId: string, pageNumber?: number | null) => void;
}

export function SourceLinkingModal({
  event,
  onClose,
  onOpenDocument,
}: SourceLinkingModalProps) {
  if (!event) return null;

  const getEventIcon = (type: string) => {
    switch (type) {
      case "diagnosis":
        return <Activity className="h-4 w-4 text-purple-600" />;
      case "medication":
        return <Pill className="h-4 w-4 text-emerald-600" />;
      case "investigation":
        return <FlaskConical className="h-4 w-4 text-amber-600" />;
      case "procedure":
        return <Stethoscope className="h-4 w-4 text-indigo-600" />;
      case "follow_up":
      case "appointment":
        return <Clock className="h-4 w-4 text-sky-600" />;
      default:
        return <FileText className="h-4 w-4 text-teal-600" />;
    }
  };

  const getBadgeStyle = (type: string) => {
    switch (type) {
      case "diagnosis":
        return "bg-purple-50 text-purple-800 border-purple-200";
      case "medication":
        return "bg-emerald-50 text-emerald-800 border-emerald-200";
      case "investigation":
        return "bg-amber-50 text-amber-800 border-amber-200";
      case "procedure":
        return "bg-indigo-50 text-indigo-800 border-indigo-200";
      case "follow_up":
      case "appointment":
        return "bg-sky-50 text-sky-800 border-sky-200";
      default:
        return "bg-slate-50 text-slate-800 border-slate-200";
    }
  };

  const isTimelineEvent = (item: TimelineEvent | CalendarEvent): item is TimelineEvent => {
    return "is_date_confirmed" in item;
  };

  const isConfirmed = isTimelineEvent(event)
    ? event.is_date_confirmed
    : !(event as CalendarEvent).is_projected;

  const isProjected = "is_projected" in event && (event as CalendarEvent).is_projected;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-200 animate-in fade-in-50 zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-50 border border-teal-200">
              {getEventIcon(event.event_type)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Source Provenance Citation
                </span>
                <Badge
                  variant="outline"
                  className={`text-[10px] font-medium capitalize ${getBadgeStyle(
                    event.event_type
                  )}`}
                >
                  {event.event_type.replace("_", " ")}
                </Badge>
              </div>
              <h3 className="text-base font-bold text-slate-900 truncate max-w-md">
                {event.title}
              </h3>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 p-0 text-slate-400 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Date & Classification Status */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl border border-slate-200 bg-slate-50">
            <div className="flex items-center gap-2 text-xs">
              <Calendar className="h-4 w-4 text-slate-500" />
              <span className="text-slate-600 font-medium">Record Date:</span>
              <span className="font-semibold text-slate-900">{event.date_display}</span>
            </div>

            <div className="flex items-center gap-2">
              {isConfirmed ? (
                <Badge
                  variant="default"
                  className="bg-emerald-50 text-emerald-800 border-emerald-200 text-[11px] font-medium"
                >
                  <FileCheck2 className="h-3 w-3 mr-1 text-emerald-600" />
                  Confirmed Clinical Date
                </Badge>
              ) : isProjected ? (
                <Badge
                  variant="outline"
                  className="bg-amber-50 text-amber-900 border-amber-300 border-dashed text-[11px] font-medium"
                >
                  <Clock className="h-3 w-3 mr-1 text-amber-600" />
                  AI-derived / Projected Date
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="bg-slate-100 text-slate-700 border-slate-300 text-[11px] font-medium"
                >
                  <AlertCircle className="h-3 w-3 mr-1 text-slate-500" />
                  Date not specified
                </Badge>
              )}
            </div>
          </div>

          {/* Source Document Citation Card */}
          <div className="rounded-xl border border-teal-200/80 bg-teal-50/40 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-teal-700" />
                <span className="text-xs font-semibold text-teal-900">Source Document</span>
              </div>
              {event.source_page ? (
                <Badge
                  variant="outline"
                  className="bg-white text-teal-800 border-teal-300 text-[11px] font-semibold"
                >
                  Page {event.source_page}
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="bg-white text-slate-600 border-slate-300 text-[11px]"
                >
                  Source page unavailable
                </Badge>
              )}
            </div>

            <div className="flex items-center justify-between text-xs text-slate-700 bg-white p-2.5 rounded-lg border border-teal-100">
              <span className="font-semibold text-slate-900 truncate max-w-sm">
                {event.document_name || "Patient-Recorded Health Event"}
              </span>
              <span className="font-mono text-[10px] text-slate-500">
                {event.document_id ? `ID: ${event.document_id.slice(0, 8)}...` : "Manual Entry"}
              </span>
            </div>

            {/* Verbatim Source Quote */}
            {event.source_text && (
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                  <Quote className="h-3.5 w-3.5 text-teal-600" />
                  <span>{event.document_id ? "Verbatim Extraction Provenance" : "Event Notes & Clinical Details"}</span>
                </div>
                <div className="rounded-lg bg-white border border-slate-200 p-3.5 text-xs text-slate-800 italic leading-relaxed shadow-xs">
                  &ldquo;{event.source_text}&rdquo;
                </div>
              </div>
            )}

            {/* Confidence / Attribution Note */}
            {event.confidence_note && (
              <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-teal-600 shrink-0" />
                <span>Citation Integrity: {event.confidence_note}</span>
              </p>
            )}
          </div>

          {/* Additional Event Details (if available) */}
          {isTimelineEvent(event) && event.details && Object.keys(event.details).length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2 text-xs">
              <span className="font-semibold text-slate-700">Extracted Clinical Attributes</span>
              <div className="grid grid-cols-2 gap-2 pt-1">
                {Object.entries(event.details).map(([key, value]) => {
                  if (value === null || value === undefined || value === "") return null;
                  return (
                    <div
                      key={key}
                      className="rounded-lg bg-slate-50 border border-slate-100 p-2.5 space-y-0.5"
                    >
                      <span className="text-[10px] uppercase font-bold text-slate-400">
                        {key.replace(/_/g, " ")}
                      </span>
                      <p className="font-medium text-slate-800 break-words">
                        {typeof value === "boolean" ? (value ? "Yes" : "No") : String(value)}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-slate-200 px-6 py-4 bg-slate-50">
          <p className="text-xs text-slate-500 hidden sm:block">
            {event.document_id
              ? "Ground truth verified against patient-owned vault."
              : "Patient-recorded healthcare event in CarePath calendar."}
          </p>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            <Button variant="outline" size="sm" onClick={onClose} className="text-xs">
              Close
            </Button>
            {event.document_id && (
              <Button
                size="sm"
                onClick={() => onOpenDocument(event.document_id!, event.source_page)}
                className="bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium shadow-xs"
              >
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                Open Original Document
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
