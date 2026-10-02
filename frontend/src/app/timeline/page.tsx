import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { getPatientProfile } from "@/lib/services/profile";
import { CompleteProfileCard } from "@/components/profile/complete-profile-card";
import { LogoutButton } from "@/components/auth/logout-button";
import { TimelineClient } from "@/components/timeline/timeline-client";

export const metadata = {
  title: "Unified Health Timeline | CarePath",
  description: "Chronological medical journey combining diagnoses, medications, lab investigations, and follow-ups with bidirectional source citations.",
};

export default async function TimelinePage() {
  // 1. Server-side Authentication Guard
  const { user, supabase } = await getAuthenticatedUser();

  if (!user) {
    redirect("/login?redirectedFrom=/timeline");
  }

  // 2. Retrieve Patient Profile linked to authenticated user
  const { profile, tableMissing: patientTableMissing } = await getPatientProfile(
    supabase,
    user.id
  );

  // If patient profile table is missing
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
                The <code className="bg-amber-100 px-1 py-0.5 rounded font-mono">public.patients</code> table
                has not yet been detected in Supabase. Please execute{" "}
                <code className="bg-amber-100 px-1 py-0.5 rounded font-mono">
                  database/migrations/01_patients.sql
                </code>{" "}
                in your Supabase SQL Editor.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // If patient profile has not been created yet
  if (!profile) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <Link
            href="/dashboard"
            className="inline-flex items-center text-xs font-medium text-slate-500 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
            Back to Dashboard
          </Link>
          <LogoutButton size="sm" variant="outline" />
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-teal-200 bg-teal-50 p-4 text-xs text-teal-900">
            <p className="font-semibold">Profile Required Before Viewing Timeline</p>
            <p className="text-teal-700 mt-0.5">
              To associate health records and view your timeline, please complete your profile onboarding.
            </p>
          </div>
          <CompleteProfileCard
            userId={user.id}
            defaultFullName={user.user_metadata?.full_name || ""}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
      {/* Top Breadcrumb & User Actions */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-4">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="inline-flex items-center text-xs font-medium text-slate-500 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
            Back to Dashboard
          </Link>
          <span className="text-slate-300">•</span>
          <Link
            href="/calendar"
            className="inline-flex items-center text-xs font-medium text-teal-600 hover:text-teal-700 transition-colors"
          >
            View AI Health Calendar &rarr;
          </Link>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500 hidden sm:inline-block">
            Signed in as <strong className="text-slate-800">{profile.full_name}</strong>
          </span>
          <LogoutButton size="sm" variant="outline" />
        </div>
      </div>

      {/* Main Client Timeline Stream */}
      <TimelineClient patientId={profile.id} />
    </div>
  );
}
