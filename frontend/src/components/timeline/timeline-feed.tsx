"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  Activity,
  Pill,
  FlaskConical,
  Stethoscope,
  Clock,
  Search,
  Calendar,
  X,
  FileText,
  AlertCircle,
  FileCheck2,
  ChevronRight,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TimelineEvent, MismatchItem, TimelineEventType } from "@/lib/types";
import { MismatchCard } from "./mismatch-card";

interface TimelineFeedProps {
  events: TimelineEvent[];
  categories: Record<string, number>;
  mismatches: MismatchItem[];
  onSelectEvent: (event: TimelineEvent) => void;
  onOpenDocument: (documentId: string, pageNumber?: number | null) => void;
  loading?: boolean;
}

export function TimelineFeed({
  events,
  categories,
  mismatches,
  onSelectEvent,
  onOpenDocument,
}: TimelineFeedProps) {
  const [activeTab, setActiveTab] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [showMismatchesTab, setShowMismatchesTab] = useState(false);

  // Filter events based on active filters
  const filteredEvents = useMemo(() => {
    return events.filter((ev) => {
      // Category filter
      if (activeTab !== "all") {
        const typeMap: Record<string, TimelineEventType> = {
          diagnoses: "diagnosis",
          medications: "medication",
          investigations: "investigation",
          procedures: "procedure",
          follow_ups: "follow_up",
        };
        if (ev.event_type !== typeMap[activeTab]) {
          return false;
        }
      }

      // Date range filter (only applies to events that have a date)
      if (startDate) {
        if (!ev.date || ev.date < startDate) return false;
      }
      if (endDate) {
        if (!ev.date || ev.date > endDate) return false;
      }

      // Text search
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesTitle = ev.title.toLowerCase().includes(query);
        const matchesDoc = ev.document_name.toLowerCase().includes(query);
        const matchesQuote = ev.source_text.toLowerCase().includes(query);
        const matchesDetails = JSON.stringify(ev.details).toLowerCase().includes(query);
        if (!matchesTitle && !matchesDoc && !matchesQuote && !matchesDetails) {
          return false;
        }
      }

      return true;
    });
  }, [events, activeTab, startDate, endDate, searchQuery]);

  const clearFilters = () => {
    setActiveTab("all");
    setSearchQuery("");
    setStartDate("");
    setEndDate("");
    setShowMismatchesTab(false);
  };

  const hasActiveFilters =
    activeTab !== "all" || searchQuery !== "" || startDate !== "" || endDate !== "" || showMismatchesTab;

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
        return "bg-sky-50 text-sky-800 border-sky-200";
      default:
        return "bg-slate-50 text-slate-800 border-slate-200";
    }
  };

  return (
    <div className="space-y-6">
      {/* Potential Information Mismatches Alert Banner */}
      {mismatches.length > 0 && !showMismatchesTab && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50/80 p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500 text-white shadow-xs shrink-0">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-amber-950">
                  {mismatches.length} Potential Information {mismatches.length === 1 ? "Mismatch" : "Mismatches"} Detected
                </h4>
                <Badge variant="outline" className="bg-amber-100 text-amber-900 border-amber-300 text-[10px]">
                  Review Recommended
                </Badge>
              </div>
              <p className="text-xs text-amber-800 mt-0.5">
                Differing values identified across clinical records. Verify against original source documents.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => setShowMismatchesTab(true)}
            className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold shrink-0"
          >
            Review Mismatches
            <ChevronRight className="ml-1 h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* Filter and Control Bar */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs space-y-4">
        {/* Category Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
          <button
            onClick={() => {
              setActiveTab("all");
              setShowMismatchesTab(false);
            }}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-colors flex items-center gap-1.5 ${
              activeTab === "all" && !showMismatchesTab
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            All Events
            <span className="text-[10px] opacity-80">({events.length})</span>
          </button>

          <button
            onClick={() => {
              setActiveTab("diagnoses");
              setShowMismatchesTab(false);
            }}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-colors flex items-center gap-1.5 ${
              activeTab === "diagnoses" && !showMismatchesTab
                ? "bg-purple-700 text-white"
                : "bg-purple-50 text-purple-800 hover:bg-purple-100"
            }`}
          >
            <Activity className="h-3 w-3" />
            Diagnoses
            <span className="text-[10px] opacity-80">({categories.diagnoses || 0})</span>
          </button>

          <button
            onClick={() => {
              setActiveTab("medications");
              setShowMismatchesTab(false);
            }}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-colors flex items-center gap-1.5 ${
              activeTab === "medications" && !showMismatchesTab
                ? "bg-emerald-700 text-white"
                : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
            }`}
          >
            <Pill className="h-3 w-3" />
            Medications
            <span className="text-[10px] opacity-80">({categories.medications || 0})</span>
          </button>

          <button
            onClick={() => {
              setActiveTab("investigations");
              setShowMismatchesTab(false);
            }}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-colors flex items-center gap-1.5 ${
              activeTab === "investigations" && !showMismatchesTab
                ? "bg-amber-700 text-white"
                : "bg-amber-50 text-amber-800 hover:bg-amber-100"
            }`}
          >
            <FlaskConical className="h-3 w-3" />
            Investigations
            <span className="text-[10px] opacity-80">({categories.investigations || 0})</span>
          </button>

          <button
            onClick={() => {
              setActiveTab("procedures");
              setShowMismatchesTab(false);
            }}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-colors flex items-center gap-1.5 ${
              activeTab === "procedures" && !showMismatchesTab
                ? "bg-indigo-700 text-white"
                : "bg-indigo-50 text-indigo-800 hover:bg-indigo-100"
            }`}
          >
            <Stethoscope className="h-3 w-3" />
            Procedures
            <span className="text-[10px] opacity-80">({categories.procedures || 0})</span>
          </button>

          <button
            onClick={() => {
              setActiveTab("follow_ups");
              setShowMismatchesTab(false);
            }}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-colors flex items-center gap-1.5 ${
              activeTab === "follow_ups" && !showMismatchesTab
                ? "bg-sky-700 text-white"
                : "bg-sky-50 text-sky-800 hover:bg-sky-100"
            }`}
          >
            <Clock className="h-3 w-3" />
            Follow-ups
            <span className="text-[10px] opacity-80">({categories.follow_ups || 0})</span>
          </button>

          {mismatches.length > 0 && (
            <button
              onClick={() => setShowMismatchesTab(true)}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-colors flex items-center gap-1.5 ${
                showMismatchesTab
                  ? "bg-amber-600 text-white"
                  : "bg-amber-100 text-amber-900 hover:bg-amber-200"
              }`}
            >
              <ShieldAlert className="h-3 w-3" />
              Mismatches
              <span className="text-[10px] font-bold">({mismatches.length})</span>
            </button>
          )}
        </div>

        {/* Search & Date Range Filters */}
        {!showMismatchesTab && (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-2 border-t border-slate-100 text-xs">
            {/* Search Input */}
            <div className="md:col-span-5 relative">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search medications, diagnoses, lab tests, quotes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-xs bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-teal-600"
              />
            </div>

            {/* Date Range: From */}
            <div className="md:col-span-3 flex items-center gap-1.5">
              <span className="text-slate-500 font-medium whitespace-nowrap text-[11px]">From:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full py-1.5 px-2.5 rounded-lg border border-slate-200 text-xs bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-teal-600"
              />
            </div>

            {/* Date Range: To */}
            <div className="md:col-span-3 flex items-center gap-1.5">
              <span className="text-slate-500 font-medium whitespace-nowrap text-[11px]">To:</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full py-1.5 px-2.5 rounded-lg border border-slate-200 text-xs bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-teal-600"
              />
            </div>

            {/* Clear Filters Button */}
            <div className="md:col-span-1 flex items-center justify-end">
              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  className="h-8 text-xs text-slate-500 hover:text-slate-800"
                >
                  <X className="h-3 w-3 mr-1" />
                  Clear
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Mismatches Tab View */}
      {showMismatchesTab && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Potential Cross-Document Information Mismatches
              </h3>
              <p className="text-xs text-slate-500">
                Factual discrepancies detected across records. Verify with original documents.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowMismatchesTab(false)}
              className="text-xs"
            >
              Back to Timeline
            </Button>
          </div>

          <div className="space-y-3.5">
            {mismatches.map((m) => (
              <MismatchCard
                key={m.id}
                mismatch={m}
                onOpenDocument={onOpenDocument}
              />
            ))}
          </div>
        </div>
      )}

      {/* Chronological Timeline Stream */}
      {!showMismatchesTab && (
        <div>
          {filteredEvents.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center space-y-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 mx-auto text-slate-400">
                <Calendar className="h-6 w-6" />
              </div>
              <h3 className="text-sm font-semibold text-slate-800">
                {hasActiveFilters ? "No events match your selected filters" : "No health events yet."}
              </h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                {hasActiveFilters
                  ? "Try clearing filters or adjusting your date range."
                  : "Upload medical documents in the Document Vault and run AI analysis to build your chronological health journey."}
              </p>
              {hasActiveFilters ? (
                <Button variant="outline" size="sm" onClick={clearFilters} className="text-xs mt-2">
                  Clear All Filters
                </Button>
              ) : (
                <div className="pt-2">
                  <Link href="/documents">
                    <Button size="sm" className="bg-teal-600 hover:bg-teal-700 text-white text-xs">
                      Upload Document
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          ) : (
            <div className="relative pl-6 sm:pl-8 space-y-6 before:absolute before:left-2.5 sm:before:left-3.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-slate-200">
              {filteredEvents.map((event) => {
                return (
                  <div key={event.id} className="relative group">
                    {/* Node Dot */}
                    <div className="absolute -left-6 sm:-left-8 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-white border-2 border-slate-300 shadow-2xs group-hover:border-teal-600 transition-colors">
                      <div className="h-2 w-2 rounded-full bg-slate-400 group-hover:bg-teal-600 transition-colors" />
                    </div>

                    {/* Timeline Event Card */}
                    <div
                      onClick={() => onSelectEvent(event)}
                      className="cursor-pointer rounded-2xl border border-slate-200/90 bg-white p-4 sm:p-5 shadow-2xs hover:shadow-md hover:border-teal-300 transition-all space-y-3"
                    >
                      {/* Top Bar: Event Type & Date */}
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 rounded-lg bg-slate-50 border border-slate-100">
                            {getEventIcon(event.event_type)}
                          </div>
                          <Badge
                            variant="outline"
                            className={`text-[10px] font-semibold uppercase tracking-wider capitalize ${getBadgeStyle(
                              event.event_type
                            )}`}
                          >
                            {event.event_type.replace("_", " ")}
                          </Badge>
                          {event.details?.abnormal_flag && (
                            <Badge
                              variant="outline"
                              className="text-[10px] font-bold bg-amber-50 text-amber-800 border-amber-300"
                            >
                              Abnormal Result
                            </Badge>
                          )}
                        </div>

                        {/* Date Status Badge */}
                        <div className="flex items-center gap-1.5">
                          {event.is_date_confirmed ? (
                            <Badge
                              variant="default"
                              className="bg-emerald-50 text-emerald-800 border-emerald-200 text-[10px] font-medium"
                            >
                              <FileCheck2 className="h-2.5 w-2.5 mr-1 text-emerald-600" />
                              {event.date_display}
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="bg-slate-100 text-slate-700 border-slate-300 text-[10px] font-medium"
                            >
                              <AlertCircle className="h-2.5 w-2.5 mr-1 text-slate-400" />
                              {event.date_display}
                            </Badge>
                          )}
                        </div>
                      </div>

                      {/* Title & Key Clinical Attributes */}
                      <div>
                        <h4 className="text-sm sm:text-base font-bold text-slate-900 group-hover:text-teal-700 transition-colors">
                          {event.title}
                        </h4>

                        {/* Medication Details */}
                        {event.event_type === "medication" && event.details && (
                          <div className="mt-1 text-xs text-slate-600 flex flex-wrap items-center gap-x-3 gap-y-1">
                            {event.details.dose && <span><strong>Dose:</strong> {event.details.dose}</span>}
                            {event.details.frequency && <span><strong>Frequency:</strong> {event.details.frequency}</span>}
                            {event.details.duration && <span><strong>Duration:</strong> {event.details.duration}</span>}
                            {event.details.instructions && <span className="italic text-slate-500">({event.details.instructions})</span>}
                          </div>
                        )}

                        {/* Investigation Details */}
                        {event.event_type === "investigation" && event.details && (
                          <div className="mt-1 text-xs text-slate-600 flex flex-wrap items-center gap-x-3 gap-y-1">
                            {event.details.result && (
                              <span>
                                <strong>Result:</strong> {event.details.result} {event.details.unit || ""}
                              </span>
                            )}
                            {event.details.reference_range && (
                              <span className="text-slate-500">
                                <strong>Ref Range:</strong> {event.details.reference_range}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Procedure / Diagnosis Details */}
                        {(event.event_type === "procedure" || event.event_type === "diagnosis") &&
                          event.details && (
                            <p className="mt-1 text-xs text-slate-600">
                              {event.details.details || event.details.status || ""}
                            </p>
                          )}
                      </div>

                      {/* Source Provenance Link Pill */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-[11px] text-slate-500">
                        <div className="flex items-center gap-2 truncate max-w-md">
                          <FileText className="h-3 w-3 text-teal-600 shrink-0" />
                          <span className="font-semibold text-slate-700 truncate">
                            {event.document_name}
                          </span>
                          <span className="text-slate-300">•</span>
                          {event.source_page ? (
                            <span className="text-teal-700 font-medium">Page {event.source_page}</span>
                          ) : (
                            <span className="text-slate-400">Source page unavailable</span>
                          )}
                        </div>

                        <span className="text-teal-600 group-hover:underline font-medium flex items-center gap-1">
                          View Provenance Citation
                          <ChevronRight className="h-3 w-3" />
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
