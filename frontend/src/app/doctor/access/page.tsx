"use client";

import { useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

function DoctorAccessForwarder() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token") || "";

  useEffect(() => {
    if (token) {
      router.replace(`/share/${encodeURIComponent(token.trim())}`);
    } else {
      router.replace("/share");
    }
  }, [token, router]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 text-center space-y-3">
      <Loader2 className="h-6 w-6 animate-spin text-teal-600 mx-auto" />
      <p className="text-xs text-slate-500 font-medium">Redirecting to Secure Patient-Shared Records...</p>
    </div>
  );
}

export default function DoctorAccessPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-teal-600" />
        </div>
      }
    >
      <DoctorAccessForwarder />
    </Suspense>
  );
}
