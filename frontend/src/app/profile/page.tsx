import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, UserCircle2, AlertTriangle, ShieldCheck } from "lucide-react";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { getPatientProfile } from "@/lib/services/profile";
import { ProfileEditor } from "@/components/profile/profile-editor";
import { CompleteProfileCard } from "@/components/profile/complete-profile-card";
import { LogoutButton } from "@/components/auth/logout-button";

export const metadata = {
  title: "Patient Profile | CarePath",
  description: "Manage your personal healthcare profile and contact information.",
};

export default async function ProfilePage() {
  const { user, supabase } = await getAuthenticatedUser();

  if (!user) {
    redirect("/login?redirectedFrom=/profile");
  }

  const { profile, tableMissing } = await getPatientProfile(supabase, user.id);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8 space-y-8">
      {/* Header & Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-6">
        <div className="space-y-1">
          <Link
            href="/dashboard"
            className="inline-flex items-center text-xs font-medium text-slate-500 hover:text-slate-900 transition-colors mb-1"
          >
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
            Back to Dashboard
          </Link>
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-100 text-teal-800">
              <UserCircle2 className="h-5 w-5" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Patient Profile
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-500">
            View and manage your core identity details and contact preferences.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/dashboard"
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 shadow-sm transition"
          >
            Dashboard
          </Link>
          <LogoutButton size="sm" variant="outline" />
        </div>
      </div>

      {/* Database Setup Notice if SQL migration has not yet been executed in Supabase */}
      {tableMissing && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-5 shadow-sm">
          <div className="flex items-start gap-3.5">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-2 text-xs text-amber-900">
              <p className="font-semibold text-amber-950 text-sm">
                Database Migration Required
              </p>
              <p className="text-slate-700 leading-relaxed">
                The <code className="bg-amber-100 px-1 py-0.5 rounded font-mono text-amber-950">public.patients</code> table
                has not yet been created in your Supabase project. To initialize the database schema:
              </p>
              <ol className="list-decimal pl-4 space-y-1 text-slate-700">
                <li>Open your Supabase Project Dashboard &rarr; <strong>SQL Editor</strong>.</li>
                <li>Copy and run the SQL migration script from: <code className="bg-amber-100 px-1 py-0.5 rounded font-mono text-amber-950">database/migrations/01_patients.sql</code>.</li>
                <li>Refresh this page.</li>
              </ol>
            </div>
          </div>
        </div>
      )}

      {/* Profile Content */}
      {profile ? (
        <ProfileEditor
          initialProfile={profile}
          userEmail={user.email || "No email associated"}
        />
      ) : (
        <div className="space-y-4">
          <CompleteProfileCard
            userId={user.id}
            defaultFullName={user.user_metadata?.full_name || ""}
          />
        </div>
      )}

      {/* Security Assurance Footer */}
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-500 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-teal-600 shrink-0" />
          <span>CarePath Row Level Security guarantees profile data isolation for your user identity.</span>
        </div>
        <span className="font-mono text-[11px] text-slate-400">auth.uid = {user.id.slice(0, 8)}...</span>
      </div>
    </div>
  );
}
