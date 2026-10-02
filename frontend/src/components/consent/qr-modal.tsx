"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { X, Copy, Check, QrCode as QrIcon, Clock, ShieldCheck, ExternalLink, AlertCircle, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConsentSessionItem } from "@/lib/types";
import { formatShareUrl } from "@/lib/services/consent";

interface QrModalProps {
  session: ConsentSessionItem;
  onClose: () => void;
  onRevoke?: (sessionId: string) => void;
}

export function QrModal({ session, onClose, onRevoke }: QrModalProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(true);
  const [isRevoking, setIsRevoking] = useState(false);

  // Compute public share URL with priority for NEXT_PUBLIC_APP_URL
  const shareUrl = formatShareUrl(session.access_token, session.qr_access_url);

  useEffect(() => {
    let isMounted = true;
    QRCode.toDataURL(shareUrl, {
      width: 280,
      margin: 2,
      color: {
        dark: "#0f766e", // Teal-700
        light: "#ffffff",
      },
    })
      .then((url) => {
        if (isMounted) {
          setQrDataUrl(url);
          setGenerating(false);
        }
      })
      .catch((err) => {
        console.error("QR generation error:", err);
        if (isMounted) setGenerating(false);
      });

    return () => {
      isMounted = false;
    };
  }, [shareUrl]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
    }
  };

  const handleRevokeClick = () => {
    if (!onRevoke) return;
    if (confirm("Are you sure you want to revoke this doctor access session immediately? Any further attempts to use this QR code or link will be denied.")) {
      setIsRevoking(true);
      onRevoke(session.id);
    }
  };

  const isExpired = session.status === "expired";
  const isRevoked = session.status === "revoked";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 space-y-5 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-50 text-teal-700 border border-teal-200">
              <QrIcon className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Doctor Access QR</h3>
              <p className="text-xs text-slate-500">Scan or share with healthcare provider</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Status Alert if not active */}
        {isRevoked && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800 flex items-center gap-2 font-medium">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
            <span>This access session has been revoked. The QR code is no longer valid.</span>
          </div>
        )}

        {isExpired && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 flex items-center gap-2 font-medium">
            <Clock className="h-4 w-4 shrink-0 text-amber-600" />
            <span>This session has expired. Please create a new access token.</span>
          </div>
        )}

        {/* QR Code Presentation */}
        <div className="flex flex-col items-center justify-center p-4 bg-slate-50 rounded-xl border border-slate-200/80">
          {generating ? (
            <div className="h-56 w-56 flex items-center justify-center text-xs text-slate-400">
              Generating secure QR...
            </div>
          ) : qrDataUrl ? (
            <div className="bg-white p-3 rounded-xl shadow-xs border border-slate-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrDataUrl}
                alt="Doctor Access QR Code"
                className={`h-56 w-56 rounded-lg ${isRevoked || isExpired ? "opacity-30 grayscale" : ""}`}
              />
            </div>
          ) : (
            <div className="h-56 w-56 flex items-center justify-center text-xs text-red-500">
              Failed to generate QR code.
            </div>
          )}

          <div className="mt-3 text-center space-y-1">
            <span className="text-xs font-bold text-slate-800 block">
              Recipient: {session.recipient_name}
            </span>
            <div className="flex items-center justify-center gap-2 text-[11px] text-slate-500">
              <Clock className="h-3 w-3 text-teal-600" />
              <span>Valid for {session.duration_minutes} min (Expires: {new Date(session.expires_at).toLocaleTimeString()})</span>
            </div>
          </div>
        </div>

        {/* Scope Badges */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-700 block">Authorized Data Scope</label>
          <div className="flex flex-wrap gap-1.5">
            {session.scope.map((s) => (
              <Badge key={s} variant="outline" className="text-[10px] capitalize bg-teal-50 text-teal-800 border-teal-200">
                {s.replace("_", " ")}
              </Badge>
            ))}
          </div>
        </div>

        {/* Copy Link & Direct Doctor Portal Access */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-700 block">Doctor Share Link</label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={shareUrl}
              className="flex-1 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-mono text-slate-700 select-all"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={copyLink}
              className="shrink-0 text-xs h-9 border-slate-300"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-600 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
              {copied ? "Copied" : "Copy Link"}
            </Button>
          </div>

          <div className="flex items-center justify-between text-[11px] pt-1 text-slate-500">
            <a
              href={shareUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-teal-600 hover:underline font-medium"
            >
              <ExternalLink className="h-3 w-3" />
              Open Doctor View
            </a>
          </div>
        </div>

        {/* Safety Warning Message */}
        <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-xs text-amber-900 flex items-start gap-2.5">
          <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            Share only with your intended healthcare provider. Access expires automatically and can be revoked at any time.
          </p>
        </div>

        {/* Revoke Access Button */}
        {session.status === "active" && onRevoke && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isRevoking}
            onClick={handleRevokeClick}
            className="w-full text-xs h-9 border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800 font-semibold"
          >
            <Ban className="mr-1.5 h-3.5 w-3.5 text-red-600" />
            {isRevoking ? "Revoking Access..." : "Revoke Access"}
          </Button>
        )}

        {/* Security Watermark */}
        <div className="rounded-xl bg-slate-100 p-2.5 text-[11px] text-slate-600 flex items-start gap-2 border border-slate-200">
          <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
          <span>
            <strong>Zero Health Data in QR:</strong> This QR contains only a cryptographically opaque access token. No medical facts, diagnoses, or credentials are encoded.
          </span>
        </div>
      </div>
    </div>
  );
}
