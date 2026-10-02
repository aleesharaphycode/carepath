"use client";

import { useState, useRef, ChangeEvent, DragEvent } from "react";
import {
  UploadCloud,
  FileText,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  FileCheck,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import {
  validateMedicalFile,
  uploadMedicalDocument,
  formatFileSize,
  ALLOWED_EXTENSIONS,
} from "@/lib/services/documents";
import { MedicalDocument, DocumentType } from "@/lib/types";

interface DocumentUploadZoneProps {
  patientId: string;
  onUploadSuccess: (newDocument: MedicalDocument) => void;
}

const DOCUMENT_TYPE_OPTIONS: { value: DocumentType; label: string; desc: string }[] = [
  { value: "general", label: "General Medical Document", desc: "General health records or notes" },
  { value: "prescription", label: "Prescription", desc: "Doctor prescriptions and medication plans" },
  { value: "lab_report", label: "Lab / Diagnostic Report", desc: "Blood tests, pathology, and lab diagnostics" },
  { value: "discharge_summary", label: "Discharge Summary", desc: "Hospital admission & discharge records" },
  { value: "scan", label: "Medical Imaging / Scan", desc: "X-ray, MRI, CT scan reports, or ultrasounds" },
  { value: "other", label: "Other Record", desc: "Immunizations, vaccination certificates, etc." },
];

export function DocumentUploadZone({ patientId, onUploadSuccess }: DocumentUploadZoneProps) {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedType, setSelectedType] = useState<DocumentType>("general");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgressText, setUploadProgressText] = useState<string>("");
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [migrationWarning, setMigrationWarning] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSelectedFile = (file: File | undefined) => {
    setStatusMessage(null);
    setMigrationWarning(null);

    if (!file) {
      setSelectedFile(null);
      setValidationError(null);
      return;
    }

    const validation = validateMedicalFile(file);
    if (!validation.valid) {
      setSelectedFile(null);
      setValidationError(validation.error || "Invalid file format or size.");
      return;
    }

    setValidationError(null);
    setSelectedFile(file);
  };

  const handleDrag = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleSelectedFile(e.dataTransfer.files[0]);
    }
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleSelectedFile(e.target.files[0]);
    }
  };

  const clearSelectedFile = () => {
    setSelectedFile(null);
    setValidationError(null);
    setStatusMessage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    setUploadProgressText("Validating and encrypting payload...");
    setStatusMessage(null);
    setMigrationWarning(null);

    try {
      const supabase = createClient();
      setUploadProgressText("Uploading to private medical storage...");

      const { document, error, bucketMissing, tableMissing } = await uploadMedicalDocument(
        supabase,
        {
          file: selectedFile,
          patientId,
          documentType: selectedType,
        }
      );

      if (error) {
        if (bucketMissing || tableMissing) {
          setMigrationWarning(
            "Database table 'documents' or private storage bucket 'medical-documents' is not initialized yet. Run migration database/migrations/02_documents.sql."
          );
        }
        setStatusMessage({
          type: "error",
          text: error.message || "Upload failed. Please check storage bucket permissions.",
        });
        setIsUploading(false);
        return;
      }

      if (document) {
        setStatusMessage({
          type: "success",
          text: `"${selectedFile.name}" securely stored in vault with status: pending.`,
        });
        onUploadSuccess(document);
        clearSelectedFile();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unexpected error during upload.";
      setStatusMessage({ type: "error", text: msg });
    } finally {
      setIsUploading(false);
      setUploadProgressText("");
    }
  };

  const isPdf = selectedFile?.type === "application/pdf" || selectedFile?.name.endsWith(".pdf");

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <UploadCloud className="h-5 w-5 text-teal-600" />
            Upload Medical Document
          </h2>
          <p className="text-xs text-slate-500">
            Files are stored privately in encrypted Supabase Storage and guarded by Row Level Security.
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-500 font-mono">
          <span>Max 25 MB</span>
          <span>&bull;</span>
          <span>PDF, JPG, PNG</span>
        </div>
      </div>

      {/* Migration Warning Notice if needed */}
      {migrationWarning && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-xs text-amber-900 flex items-start gap-2.5">
          <ShieldAlert className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-amber-950">Database / Storage Notice</p>
            <p>{migrationWarning}</p>
          </div>
        </div>
      )}

      {/* Drag & Drop Area */}
      {!selectedFile && (
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-all duration-200 ${
            dragActive
              ? "border-teal-500 bg-teal-50/50 scale-[1.005]"
              : "border-slate-300 bg-slate-50/50 hover:border-teal-400 hover:bg-slate-50"
          }`}
          id="document-dropzone"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={ALLOWED_EXTENSIONS.join(",")}
            onChange={handleInputChange}
            className="hidden"
            id="medical-document-input"
          />

          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-teal-100 text-teal-700 mb-3 shadow-sm">
            <UploadCloud className="h-6 w-6" />
          </div>

          <p className="text-sm font-medium text-slate-800">
            Click to browse or drag and drop your medical document
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Supported formats: PDF, PNG, JPG, JPEG, WEBP (Up to 25 MB)
          </p>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <span className="inline-flex items-center text-[11px] font-medium text-slate-600 bg-white border border-slate-200 px-2 py-0.5 rounded">
              Lab Reports
            </span>
            <span className="inline-flex items-center text-[11px] font-medium text-slate-600 bg-white border border-slate-200 px-2 py-0.5 rounded">
              Prescriptions
            </span>
            <span className="inline-flex items-center text-[11px] font-medium text-slate-600 bg-white border border-slate-200 px-2 py-0.5 rounded">
              Discharge Summaries
            </span>
            <span className="inline-flex items-center text-[11px] font-medium text-slate-600 bg-white border border-slate-200 px-2 py-0.5 rounded">
              Scans & Imaging
            </span>
          </div>
        </div>
      )}

      {/* Validation Error Banner */}
      {validationError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3.5 text-xs text-red-700 flex items-start gap-2.5">
          <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-semibold">Invalid File: </span>
            {validationError}
          </div>
          <button
            onClick={() => setValidationError(null)}
            className="text-red-500 hover:text-red-800 text-xs"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Selected File Card & Document Classification */}
      {selectedFile && (
        <div className="rounded-xl border border-teal-200 bg-teal-50/30 p-5 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-teal-600 text-white shadow-sm">
                {isPdf ? <FileText className="h-5 w-5" /> : <ImageIcon className="h-5 w-5" />}
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-slate-900 truncate max-w-xs sm:max-w-md">
                    {selectedFile.name}
                  </p>
                  <Badge variant="default" className="text-[10px] bg-teal-100 text-teal-800 border-teal-300">
                    {isPdf ? "PDF Document" : "Medical Image"}
                  </Badge>
                </div>
                <p className="text-xs text-slate-500 font-mono">
                  Size: {formatFileSize(selectedFile.size)} &bull; MIME: {selectedFile.type || "unknown"}
                </p>
              </div>
            </div>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearSelectedFile}
              disabled={isUploading}
              className="text-slate-400 hover:text-slate-700 h-8 w-8 p-0"
              title="Remove selected file"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Document Type Selector */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-teal-100">
            <div>
              <label htmlFor="document-type-select" className="block text-xs font-semibold text-slate-700 mb-1">
                Document Category
              </label>
              <select
                id="document-type-select"
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value as DocumentType)}
                disabled={isUploading}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              >
                {DOCUMENT_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col justify-end">
              <span className="text-[11px] text-slate-500 mb-1">
                {DOCUMENT_TYPE_OPTIONS.find((opt) => opt.value === selectedType)?.desc}
              </span>
              <span className="text-[11px] text-slate-400">
                Initial Processing Status: <strong className="text-amber-700">pending</strong>
              </span>
            </div>
          </div>

          {/* Upload Action */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-teal-100">
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <FileCheck className="h-4 w-4 text-teal-600" />
              <span>Ready for private vault storage</span>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={clearSelectedFile}
                disabled={isUploading}
                className="text-xs flex-1 sm:flex-none border-slate-300"
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleUpload}
                disabled={isUploading}
                className="bg-teal-600 hover:bg-teal-700 text-white text-xs flex-1 sm:flex-none shadow-sm"
                id="btn-upload-document"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <UploadCloud className="mr-1.5 h-3.5 w-3.5" />
                    Upload to Vault
                  </>
                )}
              </Button>
            </div>
          </div>

          {isUploading && (
            <div className="space-y-1.5 pt-1">
              <div className="flex justify-between text-[11px] text-teal-800">
                <span>{uploadProgressText}</span>
                <span className="animate-pulse">Writing record...</span>
              </div>
              <div className="h-1.5 w-full bg-teal-100 rounded-full overflow-hidden">
                <div className="h-full bg-teal-600 rounded-full animate-pulse w-3/4" />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Status Alert Banner */}
      {statusMessage && (
        <div
          className={`rounded-lg border p-3.5 text-xs flex items-start gap-2.5 ${
            statusMessage.type === "success"
              ? "border-teal-200 bg-teal-50 text-teal-900"
              : "border-red-200 bg-red-50 text-red-900"
          }`}
        >
          {statusMessage.type === "success" ? (
            <CheckCircle2 className="h-4 w-4 text-teal-600 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
          )}
          <span className="flex-1">{statusMessage.text}</span>
          <button
            onClick={() => setStatusMessage(null)}
            className="text-slate-400 hover:text-slate-600 text-xs"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
