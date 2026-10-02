import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowLeft,
  ShieldCheck,
  FolderOpen,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { getPatientProfile } from "@/lib/services/profile";
import { getPatientDocuments } from "@/lib/services/documents";
import { DocumentVault } from "@/components/documents/document-vault";
import { CompleteProfileCard } from "@/components/profile/complete-profile-card";
import { LogoutButton } from "@/components/auth/logout-button";

export const metadata = {
  title: "Medical Document Vault | CarePath",
  description: "Secure, private storage for patient medical documents protected by PostgreSQL Row Level Security.",
};

export default async function DocumentsPage() {
  // 1. Deterministic Server-side Authentication Guard
  const { user, supabase } = await getAuthenticatedUser();

  if (!user) {
    redirect("/login?redirectedFrom=/documents");
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
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-6 shadow-sm">
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

  // If patient profile has not been created yet, prompt user
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
            <p className="font-semibold">Profile Required Before Uploading Documents</p>
            <p className="text-teal-700 mt-0.5">
              To associate medical documents with your personal medical record, please initialize your patient profile below.
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

  // 3. Retrieve uploaded documents for this patient profile
  const { documents, tableMissing: docTableMissing } = await getPatientDocuments(
    supabase,
    profile.id
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-8">
      {/* Header with Breadcrumb & Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-6">
        <div className="space-y-1">
          <Link
            href="/dashboard"
            className="inline-flex items-center text-xs font-medium text-slate-500 hover:text-slate-900 transition-colors mb-1"
          >
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
            Back to Dashboard
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
              <FolderOpen className="h-6 w-6 text-teal-600" />
              Document Vault
            </h1>
            <span className="text-xs font-mono text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded">
              Patient: {profile.full_name}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500">
            Patient-owned private storage for prescriptions, lab results, discharge summaries, and medical imaging.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/dashboard">
            <Button variant="outline" size="sm" className="text-xs border-slate-300">
              Overview Dashboard
            </Button>
          </Link>
          <LogoutButton size="sm" variant="outline" />
        </div>
      </div>

      {/* Migration Notice if public.documents is missing */}
      {docTableMissing && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-5 shadow-sm">
          <div className="flex items-start gap-3.5">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-2 text-xs text-amber-900">
              <p className="font-semibold text-amber-950 text-sm">
                Database Migration Required: Initialize `public.documents` & Storage Bucket
              </p>
              <p className="text-slate-700 leading-relaxed">
                The <code className="bg-amber-100 px-1 py-0.5 rounded font-mono text-amber-950">public.documents</code> table
                or private storage bucket has not been executed yet in Supabase:
              </p>
              <ol className="list-decimal pl-4 space-y-1 text-slate-700">
                <li>Open Supabase Dashboard &rarr; <strong>SQL Editor</strong>.</li>
                <li>Execute migration: <code className="bg-amber-100 px-1 py-0.5 rounded font-mono text-amber-950">database/migrations/02_documents.sql</code>.</li>
                <li>Refresh this page.</li>
              </ol>
            </div>
          </div>
        </div>
      )}

      {/* Main Document Vault Interactive Subsystem */}
      <DocumentVault
        patientId={profile.id}
        initialDocuments={documents}
        tableMissing={docTableMissing}
      />

      {/* Security Assurance Footer */}
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-500 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-teal-600 shrink-0" />
          <span>
            Storage bucket & database rows are private and guarded by Supabase PostgreSQL Row Level Security (RLS).
          </span>
        </div>
        <div className="flex items-center gap-2 font-mono text-[11px] text-slate-400">
          <span>patient_id: {profile.id.slice(0, 8)}...</span>
        </div>
      </div>
    </div>
  );
}
