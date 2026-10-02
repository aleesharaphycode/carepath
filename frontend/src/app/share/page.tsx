"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { ShieldCheck, QrCode, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

function ShareQueryRedirect() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token") || "";
  const [inputToken, setInputToken] = useState("");

  useEffect(() => {
    if (token) {
      router.replace(`/share/${encodeURIComponent(token.trim())}`);
    }
  }, [token, router]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputToken.trim()) {
      router.push(`/share/${encodeURIComponent(inputToken.trim())}`);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-50 text-teal-700 border border-teal-200 mx-auto">
          <QrCode className="h-6 w-6" />
        </div>

        <div className="space-y-1">
          <h1 className="text-xl font-bold text-slate-900">CAREPATH</h1>
          <p className="text-xs font-semibold uppercase tracking-wider text-teal-700">
            Secure Patient-Shared Records
          </p>
          <p className="text-xs text-slate-500 pt-2 leading-relaxed">
            Enter the capability token from the patient&apos;s QR code or clinic share link to securely view authorized clinical records.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="text"
            placeholder="Paste access token..."
            value={inputToken}
            onChange={(e) => setInputToken(e.target.value)}
            className="w-full px-3.5 py-2.5 text-xs font-mono rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-teal-500 focus:border-transparent text-slate-900"
          />
          <Button
            type="submit"
            className="w-full bg-teal-600 hover:bg-teal-700 text-white text-xs h-10 font-semibold"
          >
            Access Shared Records
            <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Button>
        </form>

        <div className="pt-2 border-t border-slate-100 flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
          <ShieldCheck className="h-3.5 w-3.5 text-teal-600" />
          <span>Patient-scoped temporary capability authorization</span>
        </div>
      </div>
    </div>
  );
}

export default function ShareIndexPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-teal-600" />
        </div>
      }
    >
      <ShareQueryRedirect />
    </Suspense>
  );
}
