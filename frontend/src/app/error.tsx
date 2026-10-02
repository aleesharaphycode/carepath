"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertCircle, RefreshCw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log sanitized error message without exposing sensitive credentials or stack traces
    console.error("CarePath Encountered an Application Error:", error.message);
  }, [error]);

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 border border-amber-200 text-amber-700 shadow-xs mb-4">
        <AlertCircle className="h-7 w-7" />
      </div>

      <h2 className="text-base font-bold text-slate-900">
        Notice Encountered Loading Clinical View
      </h2>
      <p className="text-xs text-slate-600 mt-1.5 max-w-md leading-relaxed">
        We encountered a temporary issue while loading this health record. Your underlying medical data remains securely preserved and encrypted.
      </p>

      <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
        <Button
          onClick={() => reset()}
          size="sm"
          className="bg-teal-600 hover:bg-teal-700 text-white text-xs h-9 px-4 font-semibold shadow-xs"
        >
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          Try Again
        </Button>

        <Button
          asChild
          variant="outline"
          size="sm"
          className="text-xs h-9 px-4 border-slate-300 text-slate-700 hover:bg-slate-50"
        >
          <Link href="/dashboard">
            <Home className="mr-1.5 h-3.5 w-3.5" />
            Return to Dashboard
          </Link>
        </Button>
      </div>
    </div>
  );
}
