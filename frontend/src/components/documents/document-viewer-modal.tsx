"use client";

import { useEffect, useState } from "react";
import {
  X,
  FileText,
  Image as ImageIcon,
  Download,
  ExternalLink,
  ShieldCheck,
  AlertTriangle,
  Loader2,
  Calendar,
  HardDrive,
  Tag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import { getDocumentSignedUrl, formatFileSize } from "@/lib/services/documents";
import { MedicalDocument } from "@/lib/types";

interface DocumentViewerModalProps {
  document: MedicalDocument | null;
  initialPage?: number | null;
  onClose: () => void;
}

export function DocumentViewerModal({ document, initialPage, onClose }: DocumentViewerModalProps) {
  if (!document) return null;
  return <DocumentViewerContent key={document.id} document={document} initialPage={initialPage} onClose={onClose} />;
}

function DocumentViewerContent({
  document,
  initialPage,
  onClose,
}: {
  document: MedicalDocument;
  initialPage?: number | null;
  onClose: () => void;
}) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const supabase = createClient();

    // Generate a temporary 5-minute signed URL
    getDocumentSignedUrl(supabase, document.storage_path, 300)
      .then((res) => {
        if (!isMounted) return;
        if (res.error || !res.signedUrl) {
          setError(res.error?.message || "Failed to generate authorized access token.");
          setSignedUrl(null);
        } else {
          setSignedUrl(res.signedUrl);
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : "Error fetching secure URL.");
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [document.storage_path]);

  const isPdf =
    document.file_type === "application/pdf" ||
    document.file_name.toLowerCase().endsWith(".pdf");

  const isTxt =
    document.file_type === "text/plain" ||
    document.file_name.toLowerCase().endsWith(".txt");

  const formattedDate = new Date(document.uploaded_at).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <div className="relative flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-200">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-600 text-white shadow-xs">
              {isPdf || isTxt ? <FileText className="h-5 w-5" /> : <ImageIcon className="h-5 w-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-slate-900 truncate max-w-sm sm:max-w-md">
                  {document.file_name}
                </h3>
                <Badge variant="outline" className="text-[10px] capitalize">
                  {document.document_type || "general"}
                </Badge>
              </div>
              <p className="text-xs text-slate-500 font-mono">
                Storage: private / {document.id.slice(0, 8)}...
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {signedUrl && (
              <a
                href={signedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden sm:inline-flex"
              >
                <Button variant="outline" size="sm" className="text-xs border-slate-300">
                  <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                  Open in New Tab
                </Button>
              </a>
            )}
            {signedUrl && (
              <a href={signedUrl} download={document.file_name}>
                <Button size="sm" className="bg-teal-600 hover:bg-teal-700 text-white text-xs">
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  Download
                </Button>
              </a>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-8 w-8 p-0 text-slate-400 hover:text-slate-700"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Modal Body / Viewer */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {loading && (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500 space-y-3">
              <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
              <p className="text-sm font-medium">Authorizing access via temporary signed URL...</p>
              <p className="text-xs text-slate-400">Verifying authenticated patient session and RLS policies</p>
            </div>
          )}

          {error && !loading && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center space-y-3">
              <AlertTriangle className="h-8 w-8 text-red-600 mx-auto" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-red-900">Authorization / Access Error</p>
                <p className="text-xs text-red-700 max-w-md mx-auto">{error}</p>
              </div>
              <p className="text-xs text-slate-500">
                Ensure this document belongs to your authenticated profile and private bucket permissions are active.
              </p>
            </div>
          )}

          {signedUrl && !loading && (
            <div className="rounded-xl border border-slate-200 bg-slate-100 p-2 overflow-hidden flex items-center justify-center min-h-[350px] max-h-[500px]">
              {isPdf ? (
                <iframe
                  src={initialPage ? `${signedUrl}#page=${initialPage}` : signedUrl}
                  title={document.file_name}
                  className="w-full h-[480px] rounded-lg border-0 bg-white"
                />
              ) : isTxt ? (
                <iframe
                  src={signedUrl}
                  title={document.file_name}
                  className="w-full h-[480px] rounded-lg border border-slate-200 bg-white font-mono p-2"
                />
              ) : (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={signedUrl}
                  alt={document.file_name}
                  className="max-h-[480px] max-w-full rounded-lg object-contain shadow-xs"
                />
              )}
            </div>
          )}

          {/* Metadata Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
              <div className="flex items-center gap-1.5 text-slate-500 mb-1">
                <HardDrive className="h-3.5 w-3.5" />
                <span>File Size</span>
              </div>
              <p className="font-semibold text-slate-800">{formatFileSize(document.file_size)}</p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
              <div className="flex items-center gap-1.5 text-slate-500 mb-1">
                <Tag className="h-3.5 w-3.5" />
                <span>Format</span>
              </div>
              <p className="font-semibold text-slate-800 uppercase">{document.file_type.split("/")[1] || "File"}</p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
              <div className="flex items-center gap-1.5 text-slate-500 mb-1">
                <Calendar className="h-3.5 w-3.5" />
                <span>Uploaded</span>
              </div>
              <p className="font-semibold text-slate-800">{formattedDate}</p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
              <div className="flex items-center gap-1.5 text-slate-500 mb-1">
                <ShieldCheck className="h-3.5 w-3.5" />
                <span>Status</span>
              </div>
              <Badge variant="warning" className="text-[10px] capitalize bg-amber-100 text-amber-900 border-amber-300">
                {document.processing_status}
              </Badge>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-200 px-6 py-3 bg-slate-50 text-xs text-slate-500">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4 text-teal-600" />
            <span>Time-limited signed URL (expires in 5 minutes). Storage bucket remains private.</span>
          </div>
          <Button variant="outline" size="sm" onClick={onClose} className="text-xs">
            Close Viewer
          </Button>
        </div>
      </div>
    </div>
  );
}
