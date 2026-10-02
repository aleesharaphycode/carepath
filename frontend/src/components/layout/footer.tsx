import Link from "next/link";
import { Activity, ShieldAlert, Lock, FileCheck } from "lucide-react";

export function Footer() {
  return (
    <footer className="mt-auto border-t border-slate-200 bg-slate-50 text-slate-600 text-sm">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          {/* Brand & Mission */}
          <div className="md:col-span-2 space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-teal-600 text-white">
                <Activity className="h-4 w-4" />
              </div>
              <span className="font-bold text-slate-900 tracking-tight text-base">CarePath</span>
            </div>
            <p className="text-slate-600 text-xs sm:text-sm leading-relaxed max-w-md">
              A patient-owned healthcare platform transforming fragmented medical records (prescriptions, lab tests, clinical notes) into a unified, chronological, and understandable health journey.
            </p>
            <div className="flex items-center gap-3 pt-2 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1">
                <Lock className="h-3.5 w-3.5 text-teal-600" /> Patient-Owned Vault
              </span>
              <span className="inline-flex items-center gap-1">
                <FileCheck className="h-3.5 w-3.5 text-teal-600" /> Source-Linked AI
              </span>
            </div>
          </div>

          {/* Quick Navigation */}
          <div>
            <h4 className="font-semibold text-slate-900 text-sm mb-3">Navigation</h4>
            <ul className="space-y-2 text-xs sm:text-sm">
              <li>
                <Link href="/" className="hover:text-teal-600 transition-colors">
                  Platform Overview
                </Link>
              </li>
              <li>
                <Link href="/dashboard" className="hover:text-teal-600 transition-colors">
                  Patient Dashboard
                </Link>
              </li>
              <li>
                <Link href="/login" className="hover:text-teal-600 transition-colors">
                  Sign In
                </Link>
              </li>
              <li>
                <Link href="/register" className="hover:text-teal-600 transition-colors">
                  Register Account
                </Link>
              </li>
            </ul>
          </div>

          {/* Architecture Guardrails */}
          <div>
            <h4 className="font-semibold text-slate-900 text-sm mb-3">Guardrails</h4>
            <ul className="space-y-2 text-xs text-slate-500">
              <li>• Deterministic Authorization & Audit Logs</li>
              <li>• PostgreSQL Row Level Security (RLS)</li>
              <li>• Source Document Traceability</li>
              <li>• Time-bound QR Doctor Sessions</li>
            </ul>
          </div>
        </div>

        {/* Clinical Safety & Disclaimer Notice */}
        <div className="pt-6 border-t border-slate-200/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-slate-500">
          <div className="flex items-start gap-2 max-w-2xl">
            <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <p>
              <strong>Clinical Notice:</strong> CarePath organizes patient medical records. AI interpretations are informational. Potential information mismatches must always be verified against the original source documents.
            </p>
          </div>
          <div className="text-slate-400 shrink-0">
            CarePath © {new Date().getFullYear()} • Intelligent Health Platform
          </div>
        </div>
      </div>
    </footer>
  );
}
