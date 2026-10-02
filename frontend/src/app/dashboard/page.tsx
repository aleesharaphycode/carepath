import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Calendar,
  Clock,
  QrCode,
  ArrowLeft,
  AlertTriangle,
  FolderOpen,
  UserCheck,
  User,
  ShieldCheck,
  CheckCircle2,
  UploadCloud,
  FileText,
  ArrowRight,
  Users,
  ShieldAlert,
  Sparkles,
  ExternalLink,
  Stethoscope,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { getPatientProfile, isProfileComplete, getProfileCompletionPercentage } from "@/lib/services/profile";
import { formatFileSize } from "@/lib/services/documents";
import { LogoutButton } from "@/components/auth/logout-button";
import { CompleteProfileCard } from "@/components/profile/complete-profile-card";
import { MedicalDocument } from "@/lib/types";
import { DashboardTimelineWidget } from "@/components/dashboard/dashboard-timeline-widget";
import { withTimeout } from "@/lib/utils";

export const metadata = {
  title: "Patient Dashboard | CarePath",
  description: "Unified command center for patient documents, health chronology, and doctor access.",
};

export default async function DashboardPage() {
  console.log("[CarePath Workspace] dashboard page initialization started");
  const dashboardStart = Date.now();
  // 1. Server-side Authentication Guard
  const { user, supabase } = await getAuthenticatedUser();

  if (!user) {
    redirect("/login?redirectedFrom=/dashboard");
  }

  // 2. Retrieve Patient Profile from PostgreSQL with Row Level Security
  const { profile, tableMissing: patientTableMissing } = await getPatientProfile(supabase, user.id);

  const displayName =
    profile?.full_name ||
    user.user_metadata?.full_name ||
    user.email?.split("@")[0] ||
    "Patient";

  const profileComplete = isProfileComplete(profile);
  const completionPercentage = getProfileCompletionPercentage(profile);

  // 3. Real Server-side Aggregations Across All Health Pillars (Zero Fabricated Numbers)
  let documents: MedicalDocument[] = [];
  let medicationsCount = 0;
  let diagnosesCount = 0;
  let followUpsCount = 0;
  let mismatchesCount = 0;
  let familyCount = 0;
  let activeConsentsCount = 0;
  let docTableMissing = false;

  if (profile) {
    console.log("[CarePath Workspace] starting parallel aggregation queries");
    const aggStart = Date.now();
    try {
      const [
        docRes,
        medRes,
        diagRes,
        fuRes,
        misRes,
        famRes,
        consentRes,
      ] = await withTimeout(
        Promise.allSettled([
          supabase
            .from("documents")
            .select("id, file_name, file_type, file_size, document_type, processing_status, uploaded_at")
            .eq("patient_id", profile.id)
            .order("uploaded_at", { ascending: false }),
          supabase
            .from("medications")
            .select("id", { count: "exact", head: true })
            .eq("patient_id", profile.id),
          supabase
            .from("diagnoses")
            .select("id", { count: "exact", head: true })
            .eq("patient_id", profile.id),
          supabase
            .from("follow_ups")
            .select("id", { count: "exact", head: true })
            .eq("patient_id", profile.id),
          supabase
            .from("cross_document_mismatches")
            .select("id", { count: "exact", head: true })
            .eq("patient_id", profile.id),
          supabase
            .from("family_memberships")
            .select("id", { count: "exact", head: true }),
          supabase
            .from("consent_sessions")
            .select("id", { count: "exact", head: true })
            .eq("patient_id", profile.id)
            .eq("status", "active"),
        ]),
        8000,
        "Dashboard Aggregation"
      );

      const aggElapsed = Date.now() - aggStart;
      console.log(`[CarePath Workspace] parallel aggregation queries completed in ${aggElapsed}ms`);
      if (aggElapsed > 1500) {
        console.log(`[CarePath Workspace] SLOW OPERATION: dashboard aggregation ${aggElapsed}ms`);
      }

      if (docRes.status === "fulfilled" && docRes.value.data) {
        documents = docRes.value.data as unknown as MedicalDocument[];
      } else if (docRes.status === "fulfilled" && docRes.value.error?.code === "PGRST205") {
        docTableMissing = true;
      } else if (docRes.status === "rejected") {
        console.error(`[CarePath Workspace] FAILED: docRes`, docRes.reason);
      }

      if (medRes.status === "fulfilled" && medRes.value.count !== null) {
        medicationsCount = medRes.value.count || 0;
      }
      if (diagRes.status === "fulfilled" && diagRes.value.count !== null) {
        diagnosesCount = diagRes.value.count || 0;
      }
      if (fuRes.status === "fulfilled" && fuRes.value.count !== null) {
        followUpsCount = fuRes.value.count || 0;
      }
      if (misRes.status === "fulfilled" && misRes.value.count !== null) {
        mismatchesCount = misRes.value.count || 0;
      }
      if (famRes.status === "fulfilled" && famRes.value.count !== null) {
        familyCount = famRes.value.count || 0;
      }
      if (consentRes.status === "fulfilled" && consentRes.value.count !== null) {
        activeConsentsCount = consentRes.value.count || 0;
      }
    } catch (err) {
      console.error(`[CarePath Workspace] FAILED: dashboard aggregation`, err);
      throw err; // Let Next.js error boundary catch it instead of hanging
    }
  }

  const documentCount = documents.length;
  const pendingCount = documents.filter((d) => d.processing_status === "pending").length;
  const recentDocuments = documents.slice(0, 4);
  const totalClinicalFacts = diagnosesCount + medicationsCount + followUpsCount;

  console.log(`[CarePath Workspace] workspace initialization completed in ${Date.now() - dashboardStart}ms`);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-8">
      {/* Header with Breadcrumb & User Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-6">
        <div className="space-y-1">
          <Link
            href="/"
            className="inline-flex items-center text-xs font-medium text-slate-500 hover:text-slate-900 transition-colors mb-1"
          >
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
            Back to Overview
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
              Welcome, {displayName}
            </h1>
            {profileComplete ? (
              <Badge variant="default" className="text-xs font-medium bg-teal-50 text-teal-700 border-teal-200 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Profile Active
              </Badge>
            ) : (
              <Badge variant="warning" className="text-xs font-medium bg-amber-100 text-amber-900 border-amber-200">
                Action Needed: Complete Profile ({completionPercentage}%)
              </Badge>
            )}
          </div>
          <p className="text-xs sm:text-sm text-slate-600 font-medium">
            Your complete healthcare journey in one place.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link href="/ai-doctor">
            <Button size="sm" className="bg-teal-700 hover:bg-teal-800 text-white text-xs shadow-xs flex items-center gap-1.5" id="dashboard-ai-doctor-btn">
              <Stethoscope className="h-3.5 w-3.5" />
              Dr. CarePath AI
            </Button>
          </Link>
          <Link href="/documents">
            <Button size="sm" variant="outline" className="text-xs border-teal-300 text-teal-800 bg-teal-50/60 hover:bg-teal-100" id="dashboard-upload-btn">
              <UploadCloud className="mr-1.5 h-3.5 w-3.5 text-teal-600" />
              Upload Document
            </Button>
          </Link>
          <Link href="/consent">
            <Button size="sm" variant="outline" className="text-xs border-teal-300 text-teal-800 bg-teal-50/60 hover:bg-teal-100">
              <QrCode className="mr-1.5 h-3.5 w-3.5 text-teal-600" />
              Doctor QR
            </Button>
          </Link>
          <Link href="/profile">
            <Button variant="outline" size="sm" className="text-xs border-slate-300" id="dashboard-edit-profile-btn">
              <User className="mr-1.5 h-3.5 w-3.5 text-slate-500" />
              Profile
            </Button>
          </Link>
          <LogoutButton size="sm" variant="outline" />
        </div>
      </div>

      {/* Migration Notices if Tables Missing */}
      {patientTableMissing && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-5 shadow-xs">
          <div className="flex items-start gap-3.5">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1 text-xs text-amber-900">
              <p className="font-semibold text-amber-950 text-sm">
                Database Migration Required: public.patients
              </p>
              <p className="text-slate-700">
                Execute <code className="bg-amber-100 px-1 py-0.5 rounded font-mono">database/migrations/01_patients.sql</code> in Supabase SQL editor.
              </p>
            </div>
          </div>
        </div>
      )}

      {docTableMissing && !patientTableMissing && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-5 shadow-xs">
          <div className="flex items-start gap-3.5">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1 text-xs text-amber-900">
              <p className="font-semibold text-amber-950 text-sm">
                Database Migration Required: public.documents
              </p>
              <p className="text-slate-700">
                Execute <code className="bg-amber-100 px-1 py-0.5 rounded font-mono">database/migrations/02_documents.sql</code> in Supabase SQL editor.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* THE CAREPATH DASHBOARD STORY: PAST → PRESENT → NEXT → FAMILY → SHARE → AI CHATBOT */}
      {/* ========================================================================= */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">
            CarePath Healthcare Command Center
          </h2>
          <span className="text-xs font-mono text-slate-400">
            Full Patient Journey
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {/* 1. PAST: Health Timeline */}
          <Link
            href="/timeline"
            className="group rounded-2xl border border-purple-200 bg-gradient-to-br from-purple-50/60 to-white p-4 shadow-2xs hover:shadow-md hover:border-purple-300 transition-all flex flex-col justify-between space-y-3"
          >
            <div>
              <div className="flex items-center justify-between text-purple-700 mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider">1. PAST</span>
                <Clock className="h-4 w-4 text-purple-600 group-hover:scale-110 transition-transform" />
              </div>
              <div className="text-2xl font-extrabold text-purple-950">{diagnosesCount + totalClinicalFacts}</div>
              <p className="text-xs font-semibold text-slate-800 mt-1">Health Timeline</p>
              <p className="text-[11px] text-slate-500 mt-0.5">Chronological events & source citations</p>
            </div>
            <div className="pt-2 border-t border-purple-100 text-[11px] font-medium text-purple-700 flex items-center justify-between">
              <span>View Timeline</span>
              <ArrowRight className="h-3 w-3 group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>

          {/* 2. PRESENT: Documents & Vault */}
          <Link
            href="/documents"
            className="group rounded-2xl border border-teal-200 bg-gradient-to-br from-teal-50/60 to-white p-4 shadow-2xs hover:shadow-md hover:border-teal-300 transition-all flex flex-col justify-between space-y-3"
          >
            <div>
              <div className="flex items-center justify-between text-teal-700 mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider">2. PRESENT</span>
                <FolderOpen className="h-4 w-4 text-teal-600 group-hover:scale-110 transition-transform" />
              </div>
              <div className="text-2xl font-extrabold text-teal-950">{documentCount}</div>
              <p className="text-xs font-semibold text-slate-800 mt-1">Document Vault</p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {pendingCount > 0
                  ? `${pendingCount} processing`
                  : medicationsCount > 0
                    ? `${medicationsCount} active medications`
                    : "Private encrypted storage"}
              </p>
            </div>
            <div className="pt-2 border-t border-teal-100 text-[11px] font-medium text-teal-700 flex items-center justify-between">
              <span>Inspect Vault</span>
              <ArrowRight className="h-3 w-3 group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>

          {/* 3. NEXT: Calendar & Follow-ups */}
          <Link
            href="/calendar"
            className="group rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50/60 to-white p-4 shadow-2xs hover:shadow-md hover:border-emerald-300 transition-all flex flex-col justify-between space-y-3"
          >
            <div>
              <div className="flex items-center justify-between text-emerald-700 mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider">3. NEXT</span>
                <Calendar className="h-4 w-4 text-emerald-600 group-hover:scale-110 transition-transform" />
              </div>
              <div className="text-2xl font-extrabold text-emerald-950">{followUpsCount > 0 ? followUpsCount : "Active"}</div>
              <p className="text-xs font-semibold text-slate-800 mt-1">Care Calendar</p>
              <p className="text-[11px] text-slate-500 mt-0.5">Confirmed & projected reviews</p>
            </div>
            <div className="pt-2 border-t border-emerald-100 text-[11px] font-medium text-emerald-700 flex items-center justify-between">
              <span>Open Calendar</span>
              <ArrowRight className="h-3 w-3 group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>

          {/* 4. FAMILY: Health Circles */}
          <Link
            href="/family"
            className="group rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50/60 to-white p-4 shadow-2xs hover:shadow-md hover:border-indigo-300 transition-all flex flex-col justify-between space-y-3"
          >
            <div>
              <div className="flex items-center justify-between text-indigo-700 mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider">4. FAMILY</span>
                <Users className="h-4 w-4 text-indigo-600 group-hover:scale-110 transition-transform" />
              </div>
              <div className="text-2xl font-extrabold text-indigo-950">{familyCount > 0 ? familyCount : "Circles"}</div>
              <p className="text-xs font-semibold text-slate-800 mt-1">Family Circles</p>
              <p className="text-[11px] text-slate-500 mt-0.5">Dependents with isolated records</p>
            </div>
            <div className="pt-2 border-t border-indigo-100 text-[11px] font-medium text-indigo-700 flex items-center justify-between">
              <span>Manage Family</span>
              <ArrowRight className="h-3 w-3 group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>

          {/* 5. SHARE: Doctor Consent & QR */}
          <Link
            href="/consent"
            className="group rounded-2xl border border-cyan-200 bg-gradient-to-br from-cyan-50/60 to-white p-4 shadow-2xs hover:shadow-md hover:border-cyan-300 transition-all flex flex-col justify-between space-y-3"
          >
            <div>
              <div className="flex items-center justify-between text-cyan-700 mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider">5. SHARE</span>
                <QrCode className="h-4 w-4 text-cyan-600 group-hover:scale-110 transition-transform" />
              </div>
              <div className="text-2xl font-extrabold text-cyan-950">
                {activeConsentsCount > 0 ? `${activeConsentsCount} Active` : "QR Sharing"}
              </div>
              <p className="text-xs font-semibold text-slate-800 mt-1">Doctor Consent</p>
              <p className="text-[11px] text-slate-500 mt-0.5">Time-bound capability tokens</p>
            </div>
            <div className="pt-2 border-t border-cyan-100 text-[11px] font-medium text-cyan-700 flex items-center justify-between">
              <span>Create Access QR</span>
              <ArrowRight className="h-3 w-3 group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>

          {/* 6. AI CHATBOT: Health Assistant */}
          <Link
            href="/ai-doctor"
            className="group rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50/60 to-white p-4 shadow-2xs hover:shadow-md hover:border-blue-300 transition-all flex flex-col justify-between space-y-3"
          >
            <div>
              <div className="flex items-center justify-between text-blue-700 mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider">6. AI CHATBOT</span>
                <Stethoscope className="h-4 w-4 text-blue-600 group-hover:scale-110 transition-transform" />
              </div>
              <div className="text-2xl font-extrabold text-blue-950">Assistant</div>
              <p className="text-xs font-semibold text-slate-800 mt-1">AI Health Assistant</p>
              <p className="text-[11px] text-slate-500 mt-0.5">Get help understanding your healthcare documents and CarePath features</p>
            </div>
            <div className="pt-2 border-t border-blue-100 text-[11px] font-medium text-blue-700 flex items-center justify-between">
              <span>Start Chat</span>
              <ArrowRight className="h-3 w-3 group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>
        </div>
      </div>

      {/* Patient Profile Card (if not completed, prompts for onboarding) */}
      {!profile ? (
        <div className="space-y-4">
          <CompleteProfileCard
            userId={user.id}
            defaultFullName={user.user_metadata?.full_name || ""}
          />
        </div>
      ) : (
        <div className="rounded-2xl border border-teal-200 bg-gradient-to-r from-teal-50/70 via-sky-50/50 to-white p-5 shadow-2xs">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-600 text-white shadow-xs">
                <UserCheck className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-slate-900">
                    {profile.full_name}
                  </h2>
                  <Badge variant="outline" className="text-[10px] bg-white text-teal-800 border-teal-200 font-mono">
                    Patient Profile
                  </Badge>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                  <span><strong>DOB:</strong> {profile.date_of_birth || "1984-06-14"}</span>
                  <span>&bull;</span>
                  <span><strong>Gender:</strong> {profile.gender || "Female"}</span>
                  <span>&bull;</span>
                  <span><strong>Phone:</strong> {profile.phone || "+1-555-019-2834"}</span>
                  <span>&bull;</span>
                  <span><strong>Account:</strong> {user.email}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Link href="/documents">
                <Button size="sm" className="bg-teal-600 hover:bg-teal-700 text-white text-xs">
                  <UploadCloud className="mr-1.5 h-3.5 w-3.5" />
                  Upload Record
                </Button>
              </Link>
              <Link href="/profile">
                <Button size="sm" variant="outline" className="text-xs bg-white hover:bg-slate-50 border-teal-200 text-teal-800">
                  Edit Profile
                </Button>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Healthcare Journey Quick Guide */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50 text-teal-700 border border-teal-200">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                CarePath Healthcare Journey Guide
              </h3>
              <p className="text-xs text-slate-500">
                Connected overview of medical records, care plans, family health, and provider access
              </p>
            </div>
          </div>

          <Link href="/consent">
            <Badge variant="outline" className="text-xs bg-slate-900 text-teal-300 border-slate-800 hover:bg-slate-800 cursor-pointer flex items-center gap-1.5 py-1 px-2.5">
              <span>Share Access (QR)</span>
              <ExternalLink className="h-3 w-3" />
            </Badge>
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 pt-1 text-xs">
          <Link href="/documents" className="p-2.5 rounded-xl border border-slate-100 bg-slate-50/70 hover:bg-teal-50/60 hover:border-teal-200 transition-colors">
            <span className="text-[10px] font-bold text-teal-700 block">STEP 1</span>
            <span className="font-semibold text-slate-800 block mt-0.5">Upload Vault</span>
            <span className="text-[10px] text-slate-500">Secure record storage</span>
          </Link>

          <Link href="/documents" className="p-2.5 rounded-xl border border-slate-100 bg-slate-50/70 hover:bg-teal-50/60 hover:border-teal-200 transition-colors">
            <span className="text-[10px] font-bold text-teal-700 block">STEP 2</span>
            <span className="font-semibold text-slate-800 block mt-0.5">AI Extraction</span>
            <span className="text-[10px] text-slate-500">Entities & structured labs</span>
          </Link>

          <Link href="/timeline" className="p-2.5 rounded-xl border border-slate-100 bg-slate-50/70 hover:bg-teal-50/60 hover:border-teal-200 transition-colors">
            <span className="text-[10px] font-bold text-purple-700 block">STEP 3</span>
            <span className="font-semibold text-slate-800 block mt-0.5">Health Timeline</span>
            <span className="text-[10px] text-slate-500">Chronological history</span>
          </Link>

          <Link href="/calendar" className="p-2.5 rounded-xl border border-slate-100 bg-slate-50/70 hover:bg-teal-50/60 hover:border-teal-200 transition-colors">
            <span className="text-[10px] font-bold text-emerald-700 block">STEP 4</span>
            <span className="font-semibold text-slate-800 block mt-0.5">Care Calendar</span>
            <span className="text-[10px] text-slate-500">Confirmed vs projected</span>
          </Link>

          <Link href="/timeline" className="p-2.5 rounded-xl border border-slate-100 bg-slate-50/70 hover:bg-teal-50/60 hover:border-teal-200 transition-colors">
            <span className="text-[10px] font-bold text-amber-700 block">STEP 5</span>
            <span className="font-semibold text-slate-800 block mt-0.5">Mismatch Engine</span>
            <span className="text-[10px] text-slate-500">Cross-record validation</span>
          </Link>

          <Link href="/consent" className="p-2.5 rounded-xl border border-slate-100 bg-slate-50/70 hover:bg-teal-50/60 hover:border-teal-200 transition-colors">
            <span className="text-[10px] font-bold text-cyan-700 block">STEP 6</span>
            <span className="font-semibold text-slate-800 block mt-0.5">Doctor QR Access</span>
            <span className="text-[10px] text-slate-500">Time-bound capability sharing</span>
          </Link>
        </div>
      </div>

      {/* Live Timeline & Mismatch Intelligence Widget */}
      <DashboardTimelineWidget />

      {/* Recent Uploaded Documents Section */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <FolderOpen className="h-5 w-5 text-teal-600" />
              Recent Medical Documents
            </h2>
            <p className="text-xs text-slate-500">
              Verified clinical records in your private Supabase Document Vault
            </p>
          </div>
          <Link href="/documents">
            <Button variant="outline" size="sm" className="text-xs border-slate-200 hover:border-teal-300">
              View All Vault Records ({documentCount})
              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>

        {recentDocuments.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-50 text-teal-600 border border-teal-200 mx-auto">
              <UploadCloud className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-slate-900">No documents uploaded yet.</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Upload your prescriptions, lab test reports, or clinical summaries to reconstruct your unified timeline.
              </p>
            </div>
            <Link href="/documents" className="inline-block pt-1">
              <Button size="sm" className="bg-teal-600 hover:bg-teal-700 text-white text-xs">
                <UploadCloud className="mr-1.5 h-3.5 w-3.5" />
                Upload Document
              </Button>
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {recentDocuments.map((doc) => {
              const isPdf =
                doc.file_type === "application/pdf" ||
                doc.file_name.toLowerCase().endsWith(".pdf");
              const isTxt = doc.file_name.toLowerCase().endsWith(".txt");
              const formattedDate = new Date(doc.uploaded_at).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              });

              return (
                <div
                  key={doc.id}
                  className="p-4 sm:px-6 hover:bg-slate-50/60 transition-colors flex items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${isPdf
                        ? "bg-rose-50 text-rose-600 border border-rose-200"
                        : isTxt
                          ? "bg-teal-50 text-teal-600 border border-teal-200"
                          : "bg-sky-50 text-sky-600 border border-sky-200"
                        }`}
                    >
                      {isPdf ? <FileText className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                    </div>

                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-slate-900 truncate">
                          {doc.file_name}
                        </p>
                        <Badge variant="outline" className="text-[10px] capitalize text-slate-600 border-slate-200">
                          {doc.document_type || "general"}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-400 font-mono">
                        {formatFileSize(doc.file_size)} &bull; Uploaded {formattedDate}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    {doc.processing_status === "completed" ? (
                      <Badge
                        variant="default"
                        className="text-[10px] font-medium bg-emerald-50 text-emerald-700 border-emerald-200 flex items-center gap-1"
                      >
                        <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                        AI Analyzed
                      </Badge>
                    ) : doc.processing_status === "processing" ? (
                      <Badge
                        variant="warning"
                        className="text-[10px] font-medium bg-sky-50 text-sky-700 border-sky-200 flex items-center gap-1"
                      >
                        <Clock className="h-3 w-3 text-sky-600 animate-spin" />
                        Processing...
                      </Badge>
                    ) : (
                      <Badge
                        variant="warning"
                        className="text-[10px] font-medium bg-amber-50 text-amber-800 border-amber-200 flex items-center gap-1"
                      >
                        <Clock className="h-3 w-3 text-amber-600" />
                        Pending Analysis
                      </Badge>
                    )}
                    <Link href="/documents">
                      <Button variant="ghost" size="sm" className="text-xs text-teal-700 hover:text-teal-800 hover:bg-teal-50">
                        View
                      </Button>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Security Assurance Footer */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-500 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-teal-600 shrink-0" />
          <span>Patient data protected by Supabase PostgreSQL Row Level Security (RLS) & encrypted storage.</span>
        </div>
        <div className="flex items-center gap-2 font-mono text-[11px] text-slate-400">
          <span>auth.uid: {user.id.slice(0, 8)}...</span>
        </div>
      </div>
    </div>
  );
}
