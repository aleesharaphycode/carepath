"use client";

import { useState } from "react";
import {
  FolderOpen,
  Clock,
  Sparkles,
} from "lucide-react";
import { MedicalDocument } from "@/lib/types";
import { DocumentUploadZone } from "@/components/documents/document-upload-zone";
import { DocumentList } from "@/components/documents/document-list";
import { DocumentViewerModal } from "@/components/documents/document-viewer-modal";
import { ExtractionInsightsModal } from "@/components/documents/extraction-insights-modal";

interface DocumentVaultProps {
  patientId: string;
  initialDocuments: MedicalDocument[];
  tableMissing?: boolean;
}

export function DocumentVault({
  patientId,
  initialDocuments,
  tableMissing,
}: DocumentVaultProps) {
  const [documents, setDocuments] = useState<MedicalDocument[]>(initialDocuments);
  const [activeViewingDoc, setActiveViewingDoc] = useState<MedicalDocument | null>(null);
  const [activeInsightsDoc, setActiveInsightsDoc] = useState<MedicalDocument | null>(null);

  const handleUploadSuccess = (newDoc: MedicalDocument) => {
    setDocuments((prev) => [newDoc, ...prev]);
  };

  const handleDocumentUpdated = (updatedDoc: MedicalDocument) => {
    setDocuments((prev) =>
      prev.map((d) => (d.id === updatedDoc.id ? updatedDoc : d))
    );
  };

  const handleDocumentDeleted = (docId: string) => {
    setDocuments((prev) => prev.filter((d) => d.id !== docId));
  };

  const pendingCount = documents.filter((d) => d.processing_status === "pending").length;
  const completedCount = documents.filter((d) => d.processing_status === "completed").length;

  return (
    <div className="space-y-8">
      {/* Metric Cards Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700 border border-teal-200">
              <FolderOpen className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-slate-500 font-medium">Total Vault Documents</p>
              <h3 className="text-xl font-bold text-slate-900">{documents.length}</h3>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700 border border-teal-200">
              <Sparkles className="h-5 w-5 text-teal-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500 font-medium">AI Insights Ready</p>
              <h3 className="text-xl font-bold text-slate-900">
                {completedCount} <span className="text-xs font-normal text-slate-500">/ {documents.length}</span>
              </h3>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700 border border-amber-200">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-slate-500 font-medium">Pending AI Ingestion</p>
              <h3 className="text-xl font-bold text-slate-900">{pendingCount}</h3>
            </div>
          </div>
        </div>
      </div>

      {/* Upload Zone */}
      <DocumentUploadZone
        patientId={patientId}
        onUploadSuccess={handleUploadSuccess}
      />

      {/* Document List */}
      <DocumentList
        documents={documents}
        onViewDocument={(doc) => setActiveViewingDoc(doc)}
        onViewInsights={(doc) => setActiveInsightsDoc(doc)}
        onDocumentUpdated={handleDocumentUpdated}
        onDocumentDeleted={handleDocumentDeleted}
        tableMissing={tableMissing}
      />

      {/* Document Viewer Modal */}
      <DocumentViewerModal
        document={activeViewingDoc}
        onClose={() => setActiveViewingDoc(null)}
      />

      {/* AI Clinical Insights Modal */}
      <ExtractionInsightsModal
        document={activeInsightsDoc}
        onClose={() => setActiveInsightsDoc(null)}
        onViewSource={(doc) => {
          setActiveInsightsDoc(null);
          setActiveViewingDoc(doc);
        }}
      />
    </div>
  );
}
