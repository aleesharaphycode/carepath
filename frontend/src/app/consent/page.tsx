import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { getPatientProfile } from "@/lib/services/profile";
import { CompleteProfileCard } from "@/components/profile/complete-profile-card";
import { LogoutButton } from "@/components/auth/logout-button";
import { ConsentManager } from "@/components/consent/consent-manager";

export const metadata = {
  title: "Consent & QR Sharing | CarePath",
  description: "Temporary cryptographic QR doctor access sessions and immutable healthcare access audit trail.",
};

export default async function ConsentPage() {
  const { user, supabase } = await getAuthenticatedUser();

  if (!user) {
    redirect("/login?redirectedFrom=/consent");
  }

  const { profile, tableMissing: patientTableMissing } = await getPatientProfile(
    supabase,
    user.id
  );

  if (patientTableMissing) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-6 shadow-xs">
          <div className="flex items-start gap-3.5">
            <AlertTriangle className="h-6 w-6 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-2 text-xs text-amber-900">
              <h2 className="font-semibold text-amber-950 text-sm">
                Database Migration Required: public.patients
              </h2>
              <p className="text-slate-700">
                Please execute <code className="bg-amber-100 px-1 py-0.5 rounded font-mono">database/migrations/01_patients.sql</code> in your Supabase SQL Editor.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <Link
            href="/dashboard"
            className="inline-flex items-center text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
            Back to Dashboard
          </Link>
          <LogoutButton />
        </div>
        <div className="max-w-xl mx-auto py-8">
          <CompleteProfileCard userId={user.id} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/50 pb-16">
      {/* Top Breadcrumb & Navigation Bar */}
      <div className="border-b border-slate-200/80 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8 flex items-center justify-between">
          <Link
            href="/dashboard"
            className="inline-flex items-center text-xs font-semibold text-slate-600 hover:text-teal-700 transition-colors"
          >
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
            Dashboard
          </Link>

          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500 hidden sm:inline">
              Patient: <strong className="text-slate-700">{profile.full_name}</strong>
            </span>
            <LogoutButton />
          </div>
        </div>
      </div>

      {/* Main Consent Workspace */}
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <ConsentManager patientId={profile.id} />
      </div>
    </div>
  );
}
