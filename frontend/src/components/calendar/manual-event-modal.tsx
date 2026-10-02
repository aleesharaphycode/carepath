"use client";

import { useState } from "react";
import {
  X,
  Loader2,
  Stethoscope,
  Building2,
  MapPin,
  FileText,
  AlertCircle,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { createHealthEvent } from "@/lib/services/health-events";
import { HealthEventType, HealthEventStatus, HealthEventItem, HealthEventCandidate } from "@/lib/types";

interface ManualEventModalProps {
  isOpen: boolean;
  initialDate?: string;
  initialCandidate?: HealthEventCandidate | null;
  patientId: string;
  onClose: () => void;
  onCreated: (newEvent: HealthEventItem) => void;
}

const EVENT_TYPE_OPTIONS: { value: HealthEventType; label: string; iconColor: string }[] = [
  { value: "visit", label: "Doctor Visit", iconColor: "text-emerald-600 bg-emerald-50 border-emerald-200" },
  { value: "test", label: "Test / Scan", iconColor: "text-sky-600 bg-sky-50 border-sky-200" },
  { value: "medication", label: "Medication", iconColor: "text-amber-600 bg-amber-50 border-amber-200" },
  { value: "procedure", label: "Procedure", iconColor: "text-purple-600 bg-purple-200" },
  { value: "follow_up", label: "Follow-up", iconColor: "text-yellow-600 bg-yellow-50 border-yellow-200" },
];

function getInitialFormValues(initialCandidate?: HealthEventCandidate | null, initialDate?: string) {
  const today = new Date().toISOString().slice(0, 10);
  if (initialCandidate) {
    return {
      eventDate: initialCandidate.detected_date || "",
      eventType: initialCandidate.suggested_event_type || "visit",
      title: initialCandidate.suggested_title || "",
      doctorName: initialCandidate.doctor_name || "",
      clinicName: initialCandidate.clinic_name || "",
      location: initialCandidate.location || "",
      description: initialCandidate.description || "",
      status: (initialCandidate.status || "completed") as HealthEventStatus,
    };
  }
  const chosenDate = initialDate || today;
  return {
    eventDate: chosenDate,
    eventType: "visit" as HealthEventType,
    title: "",
    doctorName: "",
    clinicName: "",
    location: "",
    description: "",
    status: (chosenDate > today ? "planned" : "completed") as HealthEventStatus,
  };
}

export function ManualEventModal(props: ManualEventModalProps) {
  if (!props.isOpen) return null;

  const resetKey = props.initialCandidate
    ? `${props.initialCandidate.document_id}_${props.initialCandidate.suggested_title}_${props.initialCandidate.detected_date || ""}_${props.initialCandidate.suggested_event_type}`
    : (props.initialDate || "manual_modal");

  return <ManualEventModalDialog key={resetKey} {...props} />;
}

function ManualEventModalDialog({
  initialDate,
  initialCandidate,
  patientId,
  onClose,
  onCreated,
}: Omit<ManualEventModalProps, "isOpen">) {
  const initialValues = getInitialFormValues(initialCandidate, initialDate);

  const [eventDate, setEventDate] = useState<string>(initialValues.eventDate);
  const [eventType, setEventType] = useState<HealthEventType>(initialValues.eventType);
  const [title, setTitle] = useState<string>(initialValues.title);
  const [doctorName, setDoctorName] = useState<string>(initialValues.doctorName);
  const [clinicName, setClinicName] = useState<string>(initialValues.clinicName);
  const [location, setLocation] = useState<string>(initialValues.location);
  const [description, setDescription] = useState<string>(initialValues.description);
  const [status, setStatus] = useState<HealthEventStatus>(initialValues.status);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDateChange = (newDate: string) => {
    setEventDate(newDate);
    const today = new Date().toISOString().slice(0, 10);
    if (newDate > today) {
      setStatus("planned");
    } else {
      setStatus("completed");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventDate) {
      setError("Please select a healthcare date.");
      return;
    }
    if (!title.trim()) {
      setError("Please enter a title for the event.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const supabase = createClient();
      const res = await createHealthEvent(supabase, {
        event_date: eventDate,
        event_type: eventType,
        title: title.trim(),
        doctor_name: doctorName.trim() || undefined,
        clinic_name: clinicName.trim() || undefined,
        location: location.trim() || undefined,
        description: description.trim() || undefined,
        status,
        patient_id: patientId,
        document_id: initialCandidate?.document_id || undefined,
      });

      if (res.error) {
        setError(res.error.message);
      } else if (res.data) {
        onCreated(res.data);
        onClose();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create health event.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 space-y-5 my-8">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-50 text-teal-700 border border-teal-200">
              {initialCandidate ? <FileText className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {initialCandidate ? "Confirm Discovered Health Event" : "Add Healthcare Event"}
              </h3>
              <p className="text-xs text-slate-500">
                {initialCandidate
                  ? "Verify clinical details extracted by AI before saving to your calendar."
                  : "Record a doctor appointment, procedure, test, or review."}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            aria-label="Close dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Candidate Provenance Callout */}
        {initialCandidate && (
          <div className="rounded-xl border border-teal-200 bg-teal-50/60 p-3 space-y-1 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-teal-950 flex items-center gap-1.5 truncate max-w-[260px]">
                <FileText className="h-3.5 w-3.5 text-teal-700 shrink-0" />
                {initialCandidate.document_name}
              </span>
              {initialCandidate.confidence_is_date_confirmed ? (
                <span className="text-[10px] font-semibold text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-full">
                  Confirmed Date
                </span>
              ) : (
                <span className="text-[10px] font-semibold text-amber-800 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-full">
                  Date Unconfirmed
                </span>
              )}
            </div>
            {!initialCandidate.confidence_is_date_confirmed && (
              <p className="text-[11px] text-amber-900 leading-snug">
                CarePath does not silently use document upload dates. Please check and set the actual clinical date.
              </p>
            )}
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-900 flex items-start gap-2.5">
            <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
            <p className="leading-tight">{error}</p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* Healthcare Date */}
          <div className="space-y-1.5">
            <label className="block font-semibold text-slate-800">
              Healthcare Date <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                type="date"
                required
                value={eventDate}
                onChange={(e) => handleDateChange(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
              />
            </div>
            <p className="text-[11px] text-slate-500">Actual date when this healthcare event occurred or is scheduled.</p>
          </div>

          {/* Event Type */}
          <div className="space-y-1.5">
            <label className="block font-semibold text-slate-800">
              Event Type <span className="text-rose-500">*</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {EVENT_TYPE_OPTIONS.map((opt) => (
                <button
                  type="button"
                  key={opt.value}
                  onClick={() => setEventType(opt.value)}
                  className={`flex items-center gap-2 p-2 rounded-lg border text-xs font-medium transition-all ${
                    eventType === opt.value
                      ? `${opt.iconColor} ring-1 ring-teal-500 font-semibold shadow-xs`
                      : "border-slate-200 bg-slate-50/50 text-slate-700 hover:bg-slate-100/70"
                  }`}
                >
                  <span className="h-2 w-2 rounded-full bg-current" />
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <label className="block font-semibold text-slate-800">
              Event Title <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Cardiology Consultation, Blood Test, Routine Review"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
            />
          </div>

          {/* Status (Completed vs Planned) */}
          <div className="space-y-1.5">
            <label className="block font-semibold text-slate-800">Event Status</label>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="status"
                  value="completed"
                  checked={status === "completed"}
                  onChange={() => setStatus("completed")}
                  className="text-teal-600 focus:ring-teal-500"
                />
                <span className="text-slate-700">Completed (Historical event)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="status"
                  value="planned"
                  checked={status === "planned"}
                  onChange={() => setStatus("planned")}
                  className="text-teal-600 focus:ring-teal-500"
                />
                <span className="text-slate-700">Planned (Upcoming appointment)</span>
              </label>
            </div>
          </div>

          {/* Doctor & Clinic Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block font-semibold text-slate-800">
                Doctor / Specialist <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <div className="relative">
                <Stethoscope className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Dr. Sarah Jenkins"
                  value={doctorName}
                  onChange={(e) => setDoctorName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 pl-8 pr-3 py-2 text-xs text-slate-900 focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block font-semibold text-slate-800">
                Clinic / Hospital <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <div className="relative">
                <Building2 className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="City Care Hospital"
                  value={clinicName}
                  onChange={(e) => setClinicName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 pl-8 pr-3 py-2 text-xs text-slate-900 focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                />
              </div>
            </div>
          </div>

          {/* Location */}
          <div className="space-y-1.5">
            <label className="block font-semibold text-slate-800">
              Location / Facility Branch <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <div className="relative">
              <MapPin className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Downtown Outpatient Pavilion, 3rd Floor"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full rounded-lg border border-slate-300 pl-8 pr-3 py-2 text-xs text-slate-900 focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
              />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="block font-semibold text-slate-800">
              Description / Clinical Notes <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <textarea
              rows={3}
              placeholder="Key notes, prescribed instructions, or follow-up reason..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border border-slate-300 p-2.5 text-xs text-slate-900 focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
            />
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={saving}
              onClick={onClose}
              className="text-xs text-slate-700"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={saving}
              className="bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold shadow-xs"
            >
              {saving ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Saving Event...
                </>
              ) : (
                "Save Event to Calendar"
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
