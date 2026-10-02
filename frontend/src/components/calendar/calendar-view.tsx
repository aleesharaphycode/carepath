"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  Calendar as CalendarIcon,
  Clock,
  FileCheck2,
  FileText,
  Info,
  Stethoscope,
  FlaskConical,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CalendarEvent } from "@/lib/types";

interface CalendarViewProps {
  events: CalendarEvent[];
  confirmedCount: number;
  projectedCount: number;
  onSelectEvent: (event: CalendarEvent) => void;
  onOpenDocument?: (documentId: string, pageNumber?: number | null) => void;
}

export function CalendarView({
  events,
  confirmedCount,
  projectedCount,
  onSelectEvent,
}: CalendarViewProps) {
  const [filterType, setFilterType] = useState<"all" | "confirmed" | "projected">("all");

  // Filter events by classification
  const filteredEvents = useMemo(() => {
    return events.filter((ev) => {
      if (filterType === "confirmed") return !ev.is_projected;
      if (filterType === "projected") return ev.is_projected;
      return true;
    });
  }, [events, filterType]);

  // Group events by Month/Year for clean agenda timeline
  const groupedEvents = useMemo(() => {
    const groups: Record<string, CalendarEvent[]> = {};
    const unscheduled: CalendarEvent[] = [];

    filteredEvents.forEach((ev) => {
      if (!ev.date) {
        unscheduled.push(ev);
        return;
      }

      try {
        const d = new Date(ev.date + "T00:00:00");
        const monthYear = d.toLocaleString("en-US", { month: "long", year: "numeric" });
        if (!groups[monthYear]) {
          groups[monthYear] = [];
        }
        groups[monthYear].push(ev);
      } catch {
        unscheduled.push(ev);
      }
    });

    return { groups, unscheduled };
  }, [filteredEvents]);

  const getEventIcon = (type: string) => {
    switch (type) {
      case "procedure":
        return <Stethoscope className="h-4 w-4 text-indigo-600" />;
      case "investigation":
        return <FlaskConical className="h-4 w-4 text-amber-600" />;
      case "follow_up":
      case "appointment":
      default:
        return <Clock className="h-4 w-4 text-sky-600" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Intelligence & Metric Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Total Events */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Health Milestones</span>
            <CalendarIcon className="h-4 w-4 text-teal-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900">{events.length}</div>
          <p className="text-[11px] text-slate-500">Scheduled and projected care events</p>
        </div>

        {/* Confirmed Dates Card */}
        <div
          onClick={() => setFilterType(filterType === "confirmed" ? "all" : "confirmed")}
          className={`cursor-pointer rounded-2xl border p-4 shadow-2xs transition-all space-y-1 ${
            filterType === "confirmed"
              ? "border-emerald-500 bg-emerald-50/50 ring-1 ring-emerald-400"
              : "border-slate-200 bg-white hover:border-emerald-300"
          }`}
        >
          <div className="flex items-center justify-between text-emerald-700">
            <span className="text-xs font-semibold uppercase tracking-wider">Confirmed Dates</span>
            <FileCheck2 className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-emerald-950">{confirmedCount}</div>
          <p className="text-[11px] text-emerald-800">Directly recorded on clinical documents</p>
        </div>

        {/* Projected Dates Card */}
        <div
          onClick={() => setFilterType(filterType === "projected" ? "all" : "projected")}
          className={`cursor-pointer rounded-2xl border p-4 shadow-2xs transition-all space-y-1 ${
            filterType === "projected"
              ? "border-amber-500 bg-amber-50/50 ring-1 ring-amber-400"
              : "border-slate-200 bg-white hover:border-amber-300"
          }`}
        >
          <div className="flex items-center justify-between text-amber-700">
            <span className="text-xs font-semibold uppercase tracking-wider">Projected Dates</span>
            <Clock className="h-4 w-4 text-amber-600" />
          </div>
          <div className="text-2xl font-bold text-amber-950">{projectedCount}</div>
          <p className="text-[11px] text-amber-800">Deterministic relative timeframe projections</p>
        </div>
      </div>

      {/* Distinction & Guardrail Information Banner */}
      <div className="rounded-2xl border border-teal-200/80 bg-teal-50/40 p-4 sm:p-5 text-xs text-slate-700 space-y-2">
        <div className="flex items-center gap-2 text-teal-950 font-bold">
          <Info className="h-4 w-4 text-teal-700 shrink-0" />
          <span>CarePath Clinical Calendar Date Integrity</span>
        </div>
        <p className="text-slate-600 leading-relaxed">
          CarePath maintains strict medical safety: <strong>Confirmed Dates</strong> are official calendar appointments documented by a healthcare provider. <strong>Projected Dates</strong> are calculated deterministically from written follow-up instructions (e.g. <em>&quot;Review in 3 months&quot;</em>) and are never asserted as confirmed appointments without provider verification.
        </p>

        {/* Visual Legend */}
        <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px]">
          <div className="flex items-center gap-1.5 font-semibold text-emerald-800">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-600" />
            <span>Confirmed Clinical Date (Solid)</span>
          </div>
          <div className="flex items-center gap-1.5 font-semibold text-amber-900">
            <span className="h-2.5 w-2.5 rounded-full border border-amber-600 bg-amber-200" />
            <span>AI-derived / Projected Date (Dashed)</span>
          </div>
        </div>
      </div>

      {/* Filter Tabs & Agenda Stream */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 shadow-xs space-y-6">
        {/* Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-1.5 text-xs">
            <button
              onClick={() => setFilterType("all")}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
                filterType === "all" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              All Events ({events.length})
            </button>
            <button
              onClick={() => setFilterType("confirmed")}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
                filterType === "confirmed"
                  ? "bg-emerald-700 text-white"
                  : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
              }`}
            >
              Confirmed ({confirmedCount})
            </button>
            <button
              onClick={() => setFilterType("projected")}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
                filterType === "projected"
                  ? "bg-amber-600 text-white"
                  : "bg-amber-50 text-amber-900 hover:bg-amber-100"
              }`}
            >
              Projected ({projectedCount})
            </button>
          </div>

          <div className="text-xs text-slate-500 font-medium">
            Showing {filteredEvents.length} calendar {filteredEvents.length === 1 ? "milestone" : "milestones"}
          </div>
        </div>

        {/* Agenda Events Grouped by Month */}
        {filteredEvents.length === 0 ? (
          <div className="py-12 text-center space-y-2">
            <CalendarIcon className="h-8 w-8 text-slate-300 mx-auto" />
            <h4 className="text-sm font-semibold text-slate-800">
              {events.length === 0 ? "No upcoming care events." : "No appointments found in this view"}
            </h4>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Upload discharge summaries or doctor notes with follow-up instructions to generate your healthcare calendar.
            </p>
            {events.length === 0 && (
              <div className="pt-2">
                <Link href="/documents">
                  <span className="inline-flex items-center justify-center rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 shadow-2xs">
                    Upload Document
                  </span>
                </Link>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-8">
            {Object.entries(groupedEvents.groups).map(([monthYear, monthEvents]) => (
              <div key={monthYear} className="space-y-3">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-900 tracking-tight">{monthYear}</h3>
                  <div className="flex-1 h-px bg-slate-200" />
                  <Badge variant="outline" className="text-[10px] text-slate-500 bg-slate-50">
                    {monthEvents.length} {monthEvents.length === 1 ? "event" : "events"}
                  </Badge>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {monthEvents.map((ev) => (
                    <div
                      key={ev.id}
                      onClick={() => onSelectEvent(ev)}
                      className={`cursor-pointer rounded-xl p-4 transition-all shadow-2xs hover:shadow-md space-y-2.5 ${
                        ev.is_projected
                          ? "border border-amber-300 bg-amber-50/30 hover:border-amber-400 border-dashed"
                          : "border border-slate-200 bg-white hover:border-teal-400"
                      }`}
                    >
                      {/* Event Header */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className="p-1 rounded-md bg-slate-100">{getEventIcon(ev.event_type)}</div>
                          <span className="text-xs font-semibold capitalize text-slate-600">
                            {ev.event_type.replace("_", " ")}
                          </span>
                        </div>

                        {ev.is_projected ? (
                          <Badge
                            variant="outline"
                            className="bg-amber-100 text-amber-900 border-amber-300 text-[10px] font-semibold flex items-center gap-1"
                          >
                            <Clock className="h-2.5 w-2.5 text-amber-700" />
                            AI-derived / projected date
                          </Badge>
                        ) : (
                          <Badge
                            variant="default"
                            className="bg-emerald-50 text-emerald-800 border-emerald-200 text-[10px] font-semibold flex items-center gap-1"
                          >
                            <FileCheck2 className="h-2.5 w-2.5 text-emerald-600" />
                            Confirmed Date
                          </Badge>
                        )}
                      </div>

                      {/* Title & Date */}
                      <div>
                        <h4 className="text-sm font-bold text-slate-900 truncate">{ev.title}</h4>
                        <div className="flex items-center gap-2 mt-1 text-xs">
                          <CalendarIcon className="h-3.5 w-3.5 text-slate-400" />
                          <span
                            className={`font-semibold ${
                              ev.is_projected ? "text-amber-900" : "text-slate-800"
                            }`}
                          >
                            {ev.date_display}
                          </span>
                        </div>
                      </div>

                      {/* Relative Timeframe details if projected */}
                      {ev.is_projected && ev.relative_time_text && (
                        <div className="rounded-lg bg-white/80 border border-amber-200 p-2 text-[11px] text-amber-900 space-y-0.5">
                          <span className="font-semibold block">{ev.relative_time_text}</span>
                          {ev.projection_basis && (
                            <span className="text-[10px] text-amber-700 block">{ev.projection_basis}</span>
                          )}
                        </div>
                      )}

                      {/* Source Citation Pill */}
                      <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[11px] text-slate-500">
                        <div className="flex items-center gap-1.5 truncate max-w-[200px]">
                          <FileText className="h-3 w-3 text-teal-600 shrink-0" />
                          <span className="truncate">{ev.document_name}</span>
                        </div>
                        <span className="text-teal-600 font-medium hover:underline text-[11px]">
                          View Source &rarr;
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* Unscheduled Relative Follow-ups */}
            {groupedEvents.unscheduled.length > 0 && (
              <div className="space-y-3 pt-4 border-t border-slate-200">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-700 tracking-tight">
                    Unscheduled Review Intervals
                  </h3>
                  <div className="flex-1 h-px bg-slate-200" />
                  <Badge variant="outline" className="text-[10px] text-slate-500 bg-slate-50">
                    {groupedEvents.unscheduled.length} items
                  </Badge>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {groupedEvents.unscheduled.map((ev) => (
                    <div
                      key={ev.id}
                      onClick={() => onSelectEvent(ev)}
                      className="cursor-pointer rounded-xl border border-slate-300 bg-slate-50/70 p-4 shadow-2xs hover:bg-white transition-all space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <Badge variant="outline" className="text-[10px] bg-white text-slate-600">
                          Relative Interval
                        </Badge>
                        <span className="text-[11px] text-amber-800 font-medium">
                          No exact date recorded
                        </span>
                      </div>
                      <h4 className="text-sm font-bold text-slate-800">{ev.title}</h4>
                      <p className="text-xs text-slate-600">{ev.relative_time_text}</p>
                      <div className="flex items-center justify-between pt-2 border-t border-slate-200 text-[11px] text-slate-500">
                        <span className="truncate max-w-[200px]">{ev.document_name}</span>
                        <span className="text-teal-600 font-medium">Inspect Citation &rarr;</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
