"use client";

import {
  FileText,
  ExternalLink,
  HelpCircle,
  Quote,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MismatchItem } from "@/lib/types";

interface MismatchCardProps {
  mismatch: MismatchItem;
  onOpenDocument: (documentId: string, pageNumber?: number | null) => void;
}

export function MismatchCard({ mismatch, onOpenDocument }: MismatchCardProps) {
  const getCategoryColor = (category: string) => {
    switch (category) {
      case "medication":
        return "bg-emerald-50 text-emerald-800 border-emerald-200";
      case "anatomical_site":
        return "bg-amber-50 text-amber-900 border-amber-300";
      case "investigation":
        return "bg-sky-50 text-sky-800 border-sky-200";
      case "procedure":
        return "bg-indigo-50 text-indigo-800 border-indigo-200";
      default:
        return "bg-slate-50 text-slate-800 border-slate-200";
    }
  };

  return (
    <div className="rounded-2xl border border-amber-200 bg-white shadow-xs overflow-hidden transition-all hover:border-amber-300">
      {/* Top Banner */}
      <div className="bg-amber-50/90 border-b border-amber-200 px-5 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500 text-white shrink-0 shadow-xs">
            <ShieldAlert className="h-4 w-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-amber-950">
              Potential Information Mismatch
            </h4>
            <p className="text-[11px] text-amber-800 font-medium">
              Verify against original source documents
            </p>
          </div>
        </div>

        <Badge
          variant="outline"
          className={`text-[10px] font-semibold uppercase tracking-wider capitalize ${getCategoryColor(
            mismatch.category
          )}`}
        >
          {mismatch.category.replace("_", " ")}
        </Badge>
      </div>

      {/* Body Content */}
      <div className="p-5 space-y-4">
        <div>
          <h5 className="text-sm font-bold text-slate-900">{mismatch.title}</h5>
          <p className="text-xs text-slate-600 mt-1 leading-relaxed">
            {mismatch.explanation}
          </p>
        </div>

        {/* Side-by-side Source Comparison */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {/* Source A Card */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">
                Source Record A
              </span>
              {mismatch.source_a.source_page ? (
                <Badge variant="outline" className="text-[10px] bg-white">
                  Page {mismatch.source_a.source_page}
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] bg-white text-slate-400">
                  Source page unavailable
                </Badge>
              )}
            </div>

            <div className="space-y-1">
              <div className="text-xs font-semibold text-slate-800 flex items-center gap-1.5 truncate">
                <FileText className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <span className="truncate">{mismatch.source_a.document_name}</span>
              </div>
              <div className="p-2 rounded-lg bg-white border border-slate-200">
                <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                  Recorded Value
                </span>
                <span className="text-xs font-bold text-slate-900">
                  {mismatch.source_a.value}
                </span>
              </div>
            </div>

            {/* Quote */}
            {mismatch.source_a.source_text && (
              <div className="text-[11px] text-slate-600 italic bg-white p-2 rounded-lg border border-slate-100 flex items-start gap-1.5">
                <Quote className="h-3 w-3 text-slate-400 shrink-0 mt-0.5" />
                <span>&ldquo;{mismatch.source_a.source_text}&rdquo;</span>
              </div>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                onOpenDocument(
                  mismatch.source_a.document_id,
                  mismatch.source_a.source_page
                )
              }
              className="w-full text-xs h-7 border-slate-300 text-slate-700 bg-white hover:bg-slate-50"
            >
              <ExternalLink className="mr-1.5 h-3 w-3" />
              Inspect Source A
            </Button>
          </div>

          {/* Source B Card */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">
                Source Record B
              </span>
              {mismatch.source_b.source_page ? (
                <Badge variant="outline" className="text-[10px] bg-white">
                  Page {mismatch.source_b.source_page}
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] bg-white text-slate-400">
                  Source page unavailable
                </Badge>
              )}
            </div>

            <div className="space-y-1">
              <div className="text-xs font-semibold text-slate-800 flex items-center gap-1.5 truncate">
                <FileText className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <span className="truncate">{mismatch.source_b.document_name}</span>
              </div>
              <div className="p-2 rounded-lg bg-white border border-slate-200">
                <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                  Recorded Value
                </span>
                <span className="text-xs font-bold text-slate-900">
                  {mismatch.source_b.value}
                </span>
              </div>
            </div>

            {/* Quote */}
            {mismatch.source_b.source_text && (
              <div className="text-[11px] text-slate-600 italic bg-white p-2 rounded-lg border border-slate-100 flex items-start gap-1.5">
                <Quote className="h-3 w-3 text-slate-400 shrink-0 mt-0.5" />
                <span>&ldquo;{mismatch.source_b.source_text}&rdquo;</span>
              </div>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                onOpenDocument(
                  mismatch.source_b.document_id,
                  mismatch.source_b.source_page
                )
              }
              className="w-full text-xs h-7 border-slate-300 text-slate-700 bg-white hover:bg-slate-50"
            >
              <ExternalLink className="mr-1.5 h-3 w-3" />
              Inspect Source B
            </Button>
          </div>
        </div>

        {/* Verification Message Footer */}
        <div className="rounded-lg bg-slate-50 border border-slate-200 p-2.5 flex items-center justify-between text-xs text-slate-600">
          <div className="flex items-center gap-1.5">
            <HelpCircle className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <span className="font-medium">{mismatch.verification_message}</span>
          </div>
          <span className="text-[10px] text-slate-400 font-mono">
            Field: {mismatch.field_name}
          </span>
        </div>
      </div>
    </div>
  );
}
