import Link from "next/link";
import {
  FileText,
  Calendar,
  Shield,
  Search,
  ArrowRight,
  Sparkles,
  Lock,
  QrCode,
  Users,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function HomePage() {
  return (
    <div className="flex flex-col gap-16 py-12 md:py-16">
      {/* Hero Section */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto space-y-6">
          <div className="inline-flex items-center gap-2">
            <Badge variant="default" className="px-3.5 py-1 text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-2xs">
              <Sparkles className="mr-1.5 h-3.5 w-3.5 text-emerald-600" />
              CarePath v1.0 — Unified Patient Health Platform
            </Badge>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-slate-900 leading-tight">
            Unified Intelligent <span className="text-teal-600">Healthcare Journey</span>
          </h1>

          <p className="text-base sm:text-lg text-slate-600 leading-relaxed max-w-2xl mx-auto">
            CarePath converts fragmented medical documents—prescriptions, laboratory reports, clinical notes, and discharge summaries—into a structured, chronological, and verifiable healthcare journey with bidirectional source citations.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Link href="/dashboard">
              <Button size="lg" className="bg-teal-600 hover:bg-teal-700 text-white shadow-xs">
                Open Patient Dashboard
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Link href="/consent">
              <Button variant="outline" size="lg" className="border-slate-300 text-slate-800 hover:bg-slate-50">
                <QrCode className="mr-2 h-4 w-4 text-teal-600" />
                Doctor QR Sharing
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Core Architectural Pillars (6 Pillars matching the Complete System) */}
      <section id="architecture" className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-10 space-y-2">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            End-to-End Clinical Intelligence Architecture
          </h2>
          <p className="text-sm text-slate-500">
            Engineered around patient data ownership, deterministic security, and explainable clinical AI.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Pillar 1: Document Vault */}
          <Link href="/documents" className="group">
            <Card className="h-full hover:border-teal-300 hover:shadow-md transition-all">
              <CardHeader className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-700 border border-teal-200">
                    <FileText className="h-5 w-5" />
                  </div>
                  <span className="text-[10px] font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded border border-teal-100">
                    VAULT
                  </span>
                </div>
                <CardTitle className="text-base text-slate-900 group-hover:text-teal-700 transition-colors">
                  Encrypted Document Vault
                </CardTitle>
                <CardDescription className="text-xs text-slate-500 leading-relaxed">
                  Ingest outpatient prescriptions, lab panels, and discharge PDFs into an encrypted Supabase storage vault protected by Row Level Security.
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>

          {/* Pillar 2: Health Timeline */}
          <Link href="/timeline" className="group">
            <Card className="h-full hover:border-purple-300 hover:shadow-md transition-all">
              <CardHeader className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50 text-purple-700 border border-purple-200">
                    <Clock className="h-5 w-5" />
                  </div>
                  <span className="text-[10px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-100">
                    TIMELINE
                  </span>
                </div>
                <CardTitle className="text-base text-slate-900 group-hover:text-purple-700 transition-colors">
                  Unified Health Chronology
                </CardTitle>
                <CardDescription className="text-xs text-slate-500 leading-relaxed">
                  Reconstructs chronological care events across diagnoses, medications, labs, and procedures with bidirectional page-level source citations.
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>

          {/* Pillar 3: AI Care Calendar */}
          <Link href="/calendar" className="group">
            <Card className="h-full hover:border-emerald-300 hover:shadow-md transition-all">
              <CardHeader className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <Calendar className="h-5 w-5" />
                  </div>
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                    CALENDAR
                  </span>
                </div>
                <CardTitle className="text-base text-slate-900 group-hover:text-emerald-700 transition-colors">
                  AI Health Calendar
                </CardTitle>
                <CardDescription className="text-xs text-slate-500 leading-relaxed">
                  Rigorous visual distinction between confirmed clinical appointment dates and deterministic projected follow-up intervals.
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>

          {/* Pillar 4: Information Mismatch Engine */}
          <Link href="/timeline" className="group">
            <Card className="h-full hover:border-amber-300 hover:shadow-md transition-all">
              <CardHeader className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-700 border border-amber-200">
                    <AlertTriangle className="h-5 w-5" />
                  </div>
                  <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-100">
                    VERIFY
                  </span>
                </div>
                <CardTitle className="text-base text-slate-900 group-hover:text-amber-700 transition-colors">
                  Information Mismatch Engine
                </CardTitle>
                <CardDescription className="text-xs text-slate-500 leading-relaxed">
                  Cross-document discrepancy detection with cautious clinical disclaimer: <em>&ldquo;Potential Information Mismatch — Verify against original source.&rdquo;</em>
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>

          {/* Pillar 5: Family Health Circles */}
          <Link href="/family" className="group">
            <Card className="h-full hover:border-indigo-300 hover:shadow-md transition-all">
              <CardHeader className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-200">
                    <Users className="h-5 w-5" />
                  </div>
                  <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                    FAMILY
                  </span>
                </div>
                <CardTitle className="text-base text-slate-900 group-hover:text-indigo-700 transition-colors">
                  Family Health Circles
                </CardTitle>
                <CardDescription className="text-xs text-slate-500 leading-relaxed">
                  Independent dependent profiles for children and elderly parents. Records remain strictly isolated with explicit granular viewing permissions.
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>

          {/* Pillar 6: Temporary Doctor QR Access */}
          <Link href="/consent" className="group">
            <Card className="h-full hover:border-cyan-300 hover:shadow-md transition-all">
              <CardHeader className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700 border border-cyan-200">
                    <QrCode className="h-5 w-5" />
                  </div>
                  <span className="text-[10px] font-bold text-cyan-700 bg-cyan-50 px-2 py-0.5 rounded border border-cyan-100">
                    SHARING
                  </span>
                </div>
                <CardTitle className="text-base text-slate-900 group-hover:text-cyan-700 transition-colors">
                  Temporary QR Doctor Sharing
                </CardTitle>
                <CardDescription className="text-xs text-slate-500 leading-relaxed">
                  Time-bound cryptographic capability tokens for clinic visits. Server enforces scope filtering, expiration, and instant revocation with audit logging.
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>
        </div>
      </section>

      {/* Safety & System Guardrails */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xs">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-slate-100">
            <div>
              <div className="inline-flex items-center gap-2 mb-1">
                <Shield className="h-4 w-4 text-teal-600" />
                <span className="text-xs font-semibold uppercase tracking-wider text-teal-700">Strict Engineering Standards</span>
              </div>
              <h3 className="text-xl font-bold text-slate-900">Deterministic Safety & Trust Boundaries</h3>
            </div>
            <Badge variant="outline" className="self-start md:self-auto border-emerald-200 text-emerald-800 bg-emerald-50 text-xs">
              Sanitized Synthetic PHI
            </Badge>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6 text-sm text-slate-600">
            <div className="space-y-2">
              <div className="flex items-center gap-2 font-semibold text-slate-900">
                <Lock className="h-4 w-4 text-teal-600" />
                Deterministic Auth & RLS
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                PostgreSQL Row-Level Security binds every medical entity to the patient account. Private documents are served via 5-minute signed HMAC URLs.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 font-semibold text-slate-900">
                <Search className="h-4 w-4 text-teal-600" />
                Verifiable Source Citations
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                Every extracted diagnosis, medication dosage, and lab biomarker links directly back to the original document page number and excerpt.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 font-semibold text-slate-900">
                <Shield className="h-4 w-4 text-teal-600" />
                Medical Safety Transparency
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                Clear disclaimers emphasize non-diagnostic assistance. Mismatches are framed neutrally as potential discrepancies requiring clinician review.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
