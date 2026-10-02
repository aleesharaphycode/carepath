"use client";

import { useState } from "react";
import {
  FileText,
  Image as ImageIcon,
  Eye,
  Trash2,
  FolderOpen,
  Calendar,
  HardDrive,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  Search,
  Filter,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MedicalDocument, DocumentProcessingStatus } from "@/lib/types";
import { formatFileSize, deleteMedicalDocument } from "@/lib/services/documents";
import { triggerDocumentAnalysis } from "@/lib/services/ai-client";
import { createClient } from "@/lib/supabase/client";

interface DocumentListProps {
  documents: MedicalDocument[];
  onViewDocument: (doc: MedicalDocument) => void;
  onViewInsights?: (doc: MedicalDocument) => void;
  onDocumentUpdated?: (doc: MedicalDocument) => void;
  onDocumentDeleted: (docId: string) => void;
  tableMissing?: boolean;
}

export function DocumentList({
  documents,
  onViewDocument,
  onViewInsights,
  onDocumentUpdated,
  onDocumentDeleted,
  tableMissing,
}: DocumentListProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [analyzeError, setAnalyzeError] = useState<{ docId: string; message: string } | null>(null);

  // Status badge renderer
  const renderStatusBadge = (status: DocumentProcessingStatus) => {
    switch (status) {
      case "pending":
        return (
          <Badge
            variant="warning"
            className="text-[11px] font-medium bg-amber-50 text-amber-800 border-amber-200 flex items-center gap-1"
          >
            <Clock className="h-3 w-3 text-amber-600" />
            Pending Analysis
          </Badge>
        );
      case "processing":
        return (
          <Badge
            variant="secondary"
            className="text-[11px] font-medium bg-sky-50 text-sky-800 border-sky-200 flex items-center gap-1"
          >
            <Loader2 className="h-3 w-3 animate-spin text-sky-600" />
            Processing
          </Badge>
        );
      case "completed":
        return (
          <Badge
            variant="default"
            className="text-[11px] font-medium bg-emerald-50 text-emerald-800 border-emerald-200 flex items-center gap-1"
          >
            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
            Completed
          </Badge>
        );
      case "failed":
        return (
          <Badge
            variant="outline"
            className="text-[11px] font-medium bg-red-50 text-red-800 border-red-200 flex items-center gap-1"
          >
            <XCircle className="h-3 w-3 text-red-600" />
            Failed
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="text-[11px] font-medium">
            {status}
          </Badge>
        );
    }
  };

  // Document category human-readable label
  const getCategoryLabel = (type?: string) => {
    switch (type) {
      case "prescription":
        return "Prescription";
      case "lab_report":
        return "Lab Report";
      case "discharge_summary":
        return "Discharge Summary";
      case "scan":
        return "Scan / Imaging";
      case "other":
        return "Other Record";
      case "general":
      default:
        return "General Record";
    }
  };

  const handleDelete = async (doc: MedicalDocument) => {
    const confirmed = window.confirm(
      `Are you sure you want to permanently delete "${doc.file_name}" from your vault?`
    );
    if (!confirmed) return;

    setDeletingId(doc.id);
    setDeleteError(null);

    try {
      const supabase = createClient();
      const { success, error } = await deleteMedicalDocument(supabase, doc.id, doc.storage_path);
      if (!success || error) {
        setDeleteError(error?.message || "Failed to delete document from vault.");
      } else {
        onDocumentDeleted(doc.id);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error deleting document.";
      setDeleteError(msg);
    } finally {
      setDeletingId(null);
    }
  };

  // AI Document Analysis Trigger
  const handleAnalyzeDocument = async (doc: MedicalDocument) => {
    setAnalyzingId(doc.id);
    setAnalyzeError(null);
    try {
      const supabase = createClient();
      const res = await triggerDocumentAnalysis(supabase, doc.id);
      if (res.error) {
        setAnalyzeError({ docId: doc.id, message: res.error.message });
        if (onDocumentUpdated) {
          onDocumentUpdated({ ...doc, processing_status: "failed" });
        }
      } else {
        const updatedDoc = { ...doc, processing_status: "completed" as DocumentProcessingStatus };
        if (onDocumentUpdated) {
          onDocumentUpdated(updatedDoc);
        }
        if (onViewInsights) {
          onViewInsights(updatedDoc);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error analyzing document.";
      setAnalyzeError({ docId: doc.id, message: msg });
    } finally {
      setAnalyzingId(null);
    }
  };

  // Filtered documents
  const filteredDocuments = documents.filter((doc) => {
    const matchesSearch = doc.file_name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = typeFilter === "all" || doc.document_type === typeFilter;
    return matchesSearch && matchesType;
  });

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      {/* Table Header / Filter Bar */}
      <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
        <div>
          <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <FolderOpen className="h-5 w-5 text-teal-600" />
            Medical Document Vault
            <span className="text-xs font-normal text-slate-500 font-mono">
              ({documents.length} {documents.length === 1 ? "record" : "records"})
            </span>
          </h3>
          <p className="text-xs text-slate-500">
            Source medical records linked directly to your authenticated patient profile.
          </p>
        </div>

        {/* Search & Filter */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search filename..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-8 pl-8 pr-3 rounded-md border border-slate-200 text-xs text-slate-800 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 bg-white"
            />
          </div>

          <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-md px-2 py-1">
            <Filter className="h-3 w-3 text-slate-400" />
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="text-xs text-slate-700 bg-transparent border-0 focus:outline-none focus:ring-0 cursor-pointer"
            >
              <option value="all">All Categories</option>
              <option value="general">General</option>
              <option value="prescription">Prescription</option>
              <option value="lab_report">Lab Report</option>
              <option value="discharge_summary">Discharge Summary</option>
              <option value="scan">Scan / Imaging</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>
      </div>

      {/* Delete error notification */}
      {deleteError && (
        <div className="p-3 bg-red-50 border-b border-red-200 text-xs text-red-700 flex items-center justify-between">
          <span>{deleteError}</span>
          <button onClick={() => setDeleteError(null)} className="text-red-500 text-xs font-semibold">
            Dismiss
          </button>
        </div>
      )}

      {/* AI Analysis error notification */}
      {analyzeError && (
        <div className="p-3 bg-amber-50 border-b border-amber-200 text-xs text-amber-900 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
            <span>
              <strong>AI Analysis Error:</strong> {analyzeError.message}
            </span>
          </div>
          <button
            onClick={() => setAnalyzeError(null)}
            className="text-amber-800 hover:text-amber-950 text-xs font-semibold shrink-0 ml-3"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Database Setup Notice if table not present */}
      {tableMissing && (
        <div className="p-6 text-center border-b border-amber-200 bg-amber-50">
          <AlertTriangle className="h-8 w-8 text-amber-600 mx-auto mb-2" />
          <h4 className="text-sm font-semibold text-amber-950">Database Migration Required</h4>
          <p className="text-xs text-slate-600 mt-1 max-w-md mx-auto">
            The <code className="bg-amber-100 font-mono px-1 py-0.5 rounded text-amber-900">public.documents</code> table
            is not yet initialized in Supabase. Run the SQL migration from{" "}
            <code className="bg-amber-100 font-mono px-1 py-0.5 rounded text-amber-900">
              database/migrations/02_documents.sql
            </code>.
          </p>
        </div>
      )}

      {/* Empty State */}
      {!tableMissing && documents.length === 0 && (
        <div className="p-12 text-center space-y-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400 mx-auto">
            <FolderOpen className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-semibold text-slate-800">No documents uploaded yet.</h4>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              No medical documents have been uploaded yet. Upload your first lab report, prescription,
              or discharge summary above to initiate your record.
            </p>
          </div>
        </div>
      )}

      {/* Empty Search State */}
      {!tableMissing && documents.length > 0 && filteredDocuments.length === 0 && (
        <div className="p-8 text-center text-xs text-slate-500">
          No documents matching your search filter &ldquo;{searchTerm}&rdquo;.
        </div>
      )}

      {/* Document Items List */}
      {filteredDocuments.length > 0 && (
        <div className="divide-y divide-slate-100">
          {filteredDocuments.map((doc) => {
            const isPdf =
              doc.file_type === "application/pdf" ||
              doc.file_name.toLowerCase().endsWith(".pdf");
            const formattedDate = new Date(doc.uploaded_at).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            });
            const isDeleting = deletingId === doc.id;

            return (
              <div
                key={doc.id}
                className="p-4 sm:px-6 hover:bg-slate-50/80 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                {/* File info */}
                <div className="flex items-start gap-3.5 min-w-0">
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg shadow-2xs ${
                      isPdf ? "bg-rose-50 text-rose-600 border border-rose-200" : "bg-sky-50 text-sky-600 border border-sky-200"
                    }`}
                  >
                    {isPdf ? <FileText className="h-5 w-5" /> : <ImageIcon className="h-5 w-5" />}
                  </div>

                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900 truncate">
                        {doc.file_name}
                      </span>
                      <Badge variant="outline" className="text-[10px] font-normal text-slate-600 border-slate-200">
                        {getCategoryLabel(doc.document_type)}
                      </Badge>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 font-mono">
                      <span className="flex items-center gap-1">
                        <HardDrive className="h-3 w-3 text-slate-400" />
                        {formatFileSize(doc.file_size)}
                      </span>
                      <span>&bull;</span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3 text-slate-400" />
                        {formattedDate}
                      </span>
                      <span>&bull;</span>
                      <span className="uppercase text-[10px] bg-slate-100 px-1 py-0.2 rounded text-slate-600">
                        {doc.file_type.split("/")[1] || "FILE"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Status & Actions */}
                <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                  <div className="mr-1">{renderStatusBadge(doc.processing_status)}</div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    {/* AI Clinical Insights button if completed */}
                    {doc.processing_status === "completed" && onViewInsights && (
                      <Button
                        size="sm"
                        onClick={() => onViewInsights(doc)}
                        className="text-xs bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 shadow-2xs font-semibold"
                        title="View structured clinical entities extracted from this document"
                      >
                        <Sparkles className="mr-1.5 h-3.5 w-3.5 text-teal-600" />
                        Insights
                      </Button>
                    )}

                    {/* Trigger AI Analysis if pending or failed */}
                    {(doc.processing_status === "pending" || doc.processing_status === "failed") && (
                      <Button
                        size="sm"
                        onClick={() => handleAnalyzeDocument(doc)}
                        disabled={analyzingId === doc.id}
                        className="text-xs bg-teal-600 hover:bg-teal-700 text-white shadow-2xs font-medium"
                        title="Trigger multimodal AI clinical extraction via FastAPI backend"
                      >
                        {analyzingId === doc.id ? (
                          <>
                            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                            Analyzing...
                          </>
                        ) : (
                          <>
                            <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                            Analyze
                          </>
                        )}
                      </Button>
                    )}

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onViewDocument(doc)}
                      className="text-xs border-slate-200 text-slate-700 hover:text-teal-700 hover:border-teal-200"
                      title="Safely view document using time-limited signed URL"
                    >
                      <Eye className="mr-1.5 h-3.5 w-3.5 text-slate-500" />
                      View
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(doc)}
                      disabled={isDeleting}
                      className="text-xs text-slate-400 hover:text-red-600 h-8 w-8 p-0"
                      title="Permanently remove document"
                    >
                      {isDeleting ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-red-600" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
