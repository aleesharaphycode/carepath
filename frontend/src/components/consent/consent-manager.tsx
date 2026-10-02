"use client";

import { useEffect, useState, useCallback } from "react";
import {
  QrCode,
  ShieldCheck,
  Clock,
  AlertTriangle,
  RefreshCw,
  Plus,
  History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import {
  fetchConsentSessions,
  getCachedConsentSessions,
  revokeConsentSession,
  fetchAccessAuditLogs,
} from "@/lib/services/consent";
import { fetchFamilyDashboard, getCachedFamilyDashboard } from "@/lib/services/family";
import {
  ConsentSessionItem,
  AuditLogItem,
  FamilyMemberProfile,
} from "@/lib/types";
import { QrModal } from "./qr-modal";
import { CreateConsentModal } from "./create-consent-modal";

interface ConsentManagerProps {
  patientId: string;
  familyMembers?: FamilyMemberProfile[];
}

export function ConsentManager({ patientId, familyMembers = [] }: ConsentManagerProps) {
  const cachedSessions = getCachedConsentSessions();
  const cachedFam = getCachedFamilyDashboard();

  const [sessions, setSessions] = useState<ConsentSessionItem[]>(() => cachedSessions?.sessions || []);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [familyList, setFamilyList] = useState<FamilyMemberProfile[]>(
    () => (familyMembers.length > 0 ? familyMembers : cachedFam?.groups?.flatMap((g) => g.members) || [])
  );
  const [activeTab, setActiveTab] = useState<"sessions" | "audit">("sessions");
  const [loading, setLoading] = useState(() => !cachedSessions);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Modals state
  const [viewingSession, setViewingSession] = useState<ConsentSessionItem | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const loadData = useCallback(async (forceRefresh = true) => {
    setLoading(true);
    setError(null);
    const supabase = createClient();

    try {
      const [sessionsRes, logsRes, familyRes] = await Promise.all([
        fetchConsentSessions(supabase, { forceRefresh }),
        fetchAccessAuditLogs(supabase),
        familyMembers.length === 0 ? fetchFamilyDashboard(supabase, { forceRefresh }) : Promise.resolve(null),
      ]);

      if (sessionsRes.error) {
        setError(sessionsRes.error.message);
      } else if (sessionsRes.data) {
        setSessions(sessionsRes.data.sessions);
      }

      if (logsRes.data) {
        setAuditLogs(logsRes.data.logs);
      }

      if (familyRes?.data?.groups) {
        setFamilyList(familyRes.data.groups.flatMap((g) => g.members));
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load consent data.");
    } finally {
      setLoading(false);
    }
  }, [familyMembers]);

  useEffect(() => {
    let isMounted = true;
    const supabase = createClient();

    Promise.all([
      fetchConsentSessions(supabase),
      fetchAccessAuditLogs(supabase),
    ])
      .then(([sessionsRes, logsRes]) => {
        if (!isMounted) return;
        if (sessionsRes.error) {
          setError(sessionsRes.error.message);
        } else if (sessionsRes.data) {
          setSessions(sessionsRes.data.sessions);
        }
        if (logsRes.data) {
          setAuditLogs(logsRes.data.logs);
        }
      })
      .catch((err: unknown) => {
        if (isMounted) setError(err instanceof Error ? err.message : "Failed to load consent data.");
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleRevoke = async (sessionId: string) => {
    if (!confirm("Are you sure you want to revoke this doctor access session immediately? Any further attempts to use this QR code or link will be denied.")) {
      return;
    }

    setRevokingId(sessionId);
    const supabase = createClient();
    const res = await revokeConsentSession(supabase, sessionId);
    setRevokingId(null);

    if (res.error) {
      alert(`Revocation failed: ${res.error.message}`);
    } else {
      // Update local state immediately
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, status: "revoked", revoked_at: new Date().toISOString() } : s))
      );
      if (viewingSession?.id === sessionId) {
        setViewingSession((prev) => (prev ? { ...prev, status: "revoked" } : null));
      }
      // Refresh audit logs
      fetchAccessAuditLogs(supabase).then((logRes) => {
        if (logRes.data) setAuditLogs(logRes.data.logs);
      });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-emerald-50 text-emerald-800 border-emerald-300 font-semibold text-[10px]">Active Session</Badge>;
      case "revoked":
        return <Badge className="bg-red-50 text-red-800 border-red-300 font-semibold text-[10px]">Revoked by Patient</Badge>;
      case "expired":
      default:
        return <Badge className="bg-slate-100 text-slate-700 border-slate-300 font-medium text-[10px]">Expired</Badge>;
    }
  };

  const activeSessionsCount = sessions.filter((s) => s.status === "active").length;

  return (
    <div className="space-y-6">
      {/* Top Header & Metrics */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-teal-700 bg-teal-50 px-2 py-0.5 rounded-md border border-teal-200">
              Patient Controlled
            </span>
            <span className="text-xs text-slate-500">•</span>
            <span className="text-xs text-slate-500 font-medium">Temporary Doctor Access & Consent</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 mt-1">
            Consent & QR Access Management
          </h2>
          <p className="text-xs text-slate-600 mt-0.5">
            Share temporary, least-privilege clinical access with healthcare providers via cryptographic QR codes.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadData(true)}
            disabled={loading}
            className="text-xs h-9 text-slate-700 border-slate-300 shadow-2xs"
          >
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin text-teal-600" : ""}`} />
            Refresh
          </Button>

          <Button
            size="sm"
            onClick={() => setShowCreateModal(true)}
            className="bg-teal-600 hover:bg-teal-700 text-white text-xs h-9 font-semibold shadow-xs"
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Share Health Information
          </Button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Active Sessions</span>
            <QrCode className="h-4 w-4 text-teal-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900">{activeSessionsCount}</div>
          <p className="text-[11px] text-slate-500">Currently active doctor access sessions</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Sessions</span>
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900">{sessions.length}</div>
          <p className="text-[11px] text-slate-500">Historical time-bound access grants</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Audit Log Entries</span>
            <History className="h-4 w-4 text-sky-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900">{auditLogs.length}</div>
          <p className="text-[11px] text-slate-500">Immutable record access verification logs</p>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-900 flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold">Consent System Alert</p>
            <p className="text-red-700">{error}</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab("sessions")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            activeTab === "sessions"
              ? "bg-teal-600 text-white shadow-2xs"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          <QrCode className="h-3.5 w-3.5" />
          <span>Consent Sessions ({sessions.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("audit")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            activeTab === "audit"
              ? "bg-teal-600 text-white shadow-2xs"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          <History className="h-3.5 w-3.5" />
          <span>Access Audit Trail ({auditLogs.length})</span>
        </button>
      </div>

      {/* Tab 1: Consent Sessions List */}
      {activeTab === "sessions" && (
        <div className="space-y-3">
          {sessions.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 p-12 text-center space-y-3">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-50 text-teal-700 border border-teal-200">
                <QrCode className="h-6 w-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-800">No active access sessions.</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Generate a temporary QR code with customized permissions to grant an attending doctor secure access to your clinical timeline and records.
              </p>
              <Button
                size="sm"
                onClick={() => setShowCreateModal(true)}
                className="bg-teal-600 hover:bg-teal-700 text-white text-xs h-9 font-semibold"
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Create Share Access
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {sessions.map((s) => {
                const isRevoking = revokingId === s.id;
                const isExpired = s.status === "expired";
                const isRevoked = s.status === "revoked";

                return (
                  <div
                    key={s.id}
                    className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4 hover:border-slate-300 transition-all flex flex-col justify-between"
                  >
                    <div className="space-y-3">
                      {/* Top status & recipient */}
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-bold text-slate-900">{s.recipient_name}</span>
                          </div>
                          <span className="text-[11px] text-slate-500">Patient: {s.patient_name}</span>
                        </div>
                        {getStatusBadge(s.status)}
                      </div>

                      {/* Scope badges */}
                      <div className="space-y-1">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block">
                          Granted Scope
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {s.scope.map((item) => (
                            <Badge
                              key={item}
                              variant="outline"
                              className="text-[10px] capitalize bg-slate-50 text-slate-700 border-slate-200"
                            >
                              {item.replace("_", " ")}
                            </Badge>
                          ))}
                        </div>
                      </div>

                      {/* Expiration timing */}
                      <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-100">
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3 text-slate-400" />
                          <span>Duration: {s.duration_minutes}m</span>
                        </div>
                        <span>
                          {isRevoked
                            ? `Revoked at: ${new Date(s.revoked_at || s.created_at).toLocaleTimeString()}`
                            : isExpired
                            ? `Expired: ${new Date(s.expires_at).toLocaleTimeString()}`
                            : `Expires: ${new Date(s.expires_at).toLocaleTimeString()}`}
                        </span>
                      </div>
                    </div>

                    {/* Bottom Actions */}
                    <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setViewingSession(s)}
                        className="text-xs h-8 text-teal-700 border-teal-200 hover:bg-teal-50"
                      >
                        <QrCode className="mr-1.5 h-3.5 w-3.5" />
                        View QR Code
                      </Button>

                      {s.status === "active" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={isRevoking}
                          onClick={() => handleRevoke(s.id)}
                          className="text-xs h-8 text-red-600 hover:bg-red-50 hover:text-red-700"
                        >
                          {isRevoking ? "Revoking..." : "Revoke Access"}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Access Audit Trail */}
      {activeTab === "audit" && (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-800">Immutable Access Audit Trail</h3>
              <p className="text-xs text-slate-500">Every authorization, doctor view, and revocation is cryptographically recorded</p>
            </div>
            <Badge variant="outline" className="text-[10px] bg-white text-slate-600">
              {auditLogs.length} events logged
            </Badge>
          </div>

          {auditLogs.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No audit events recorded yet.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100/60 text-slate-600 font-semibold text-[11px]">
                    <th className="py-2.5 px-4">Timestamp</th>
                    <th className="py-2.5 px-4">Actor</th>
                    <th className="py-2.5 px-4">Action</th>
                    <th className="py-2.5 px-4">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {auditLogs.map((log) => {
                    const isDoctor = log.actor === "doctor";
                    const isDenied = log.action === "access_denied";

                    return (
                      <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 whitespace-nowrap text-slate-500 font-mono text-[11px]">
                          {new Date(log.timestamp).toLocaleString()}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap font-medium">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                              isDoctor ? "bg-indigo-50 text-indigo-700 border border-indigo-200" : "bg-teal-50 text-teal-700 border border-teal-200"
                            }`}
                          >
                            {log.actor.toUpperCase()}
                          </span>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span
                            className={`font-semibold ${
                              isDenied
                                ? "text-red-600"
                                : log.action === "consent_revoked"
                                ? "text-amber-700"
                                : "text-slate-800"
                            }`}
                          >
                            {log.action.replace("_", " ").toUpperCase()}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-600 min-w-xs">{log.details}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* QR Code Presentation Modal */}
      {viewingSession && (
        <QrModal
          session={viewingSession}
          onClose={() => setViewingSession(null)}
          onRevoke={(id) => handleRevoke(id)}
        />
      )}

      {/* Create New Session Modal */}
      {showCreateModal && (
        <CreateConsentModal
          onClose={() => setShowCreateModal(false)}
          familyMembers={familyList}
          initialPatientId={patientId}
          onCreated={(newSession) => {
            setShowCreateModal(false);
            setSessions((prev) => [newSession, ...prev]);
            setViewingSession(newSession);
            // Refresh audit logs
            const supabase = createClient();
            fetchAccessAuditLogs(supabase).then((lRes) => {
              if (lRes.data) setAuditLogs(lRes.data.logs);
            });
          }}
        />
      )}
    </div>
  );
}
