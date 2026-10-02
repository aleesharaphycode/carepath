"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  AlertCircle,
  Loader2,
  Calendar,
  Phone,
  User,
  Users,
  Lock,
  Mail,
  Fingerprint,
  Save,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import { updatePatientProfile, getProfileCompletionPercentage } from "@/lib/services/profile";
import type { PatientProfile } from "@/lib/types";

interface ProfileEditorProps {
  initialProfile: PatientProfile;
  userEmail: string;
}

export function ProfileEditor({ initialProfile, userEmail }: ProfileEditorProps) {
  const router = useRouter();

  const [fullName, setFullName] = useState(initialProfile.full_name || "");
  const [dateOfBirth, setDateOfBirth] = useState(initialProfile.date_of_birth || "");
  const [gender, setGender] = useState(initialProfile.gender || "");
  const [phone, setPhone] = useState(initialProfile.phone || "");

  const [isLoading, setIsLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const completionRate = getProfileCompletionPercentage({
    ...initialProfile,
    full_name: fullName,
    date_of_birth: dateOfBirth,
    gender,
    phone,
  });

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const cleanName = fullName.trim();
    if (!cleanName) {
      setErrorMessage("Full name is required.");
      return;
    }

    setIsLoading(true);

    try {
      const supabase = createClient();
      const { error } = await updatePatientProfile(supabase, initialProfile.user_id, {
        full_name: cleanName,
        date_of_birth: dateOfBirth || null,
        gender: gender || null,
        phone: phone.trim() || null,
      });

      if (error) {
        setErrorMessage(error.message);
        return;
      }

      setSuccessMessage("Your profile information has been successfully updated.");
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update profile.";
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Feedback Banners */}
      {successMessage && (
        <div
          className="rounded-lg border border-teal-200 bg-teal-50 p-4 text-xs text-teal-800 flex items-start gap-2.5"
          role="status"
          id="profile-success-banner"
        >
          <CheckCircle2 className="h-4 w-4 text-teal-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-teal-950">Changes Saved</p>
            <p className="mt-0.5">{successMessage}</p>
          </div>
        </div>
      )}

      {errorMessage && (
        <div
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-xs text-red-800 flex items-start gap-2.5"
          role="alert"
          id="profile-error-banner"
        >
          <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-red-950">Update Failed</p>
            <p className="mt-0.5">{errorMessage}</p>
          </div>
        </div>
      )}

      {/* Profile Edit Card */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="border-b border-slate-100 pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-lg text-slate-900">Patient Personal Details</CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Update your identification and contact details stored securely under your account.
              </CardDescription>
            </div>
            <Badge
              variant={completionRate === 100 ? "default" : "warning"}
              className={`text-xs w-fit ${
                completionRate === 100
                  ? "bg-teal-50 text-teal-700 border-teal-200"
                  : "bg-amber-50 text-amber-800 border-amber-200"
              }`}
            >
              {completionRate === 100 ? "Profile Complete (100%)" : `Profile ${completionRate}% Complete`}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Full Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700 flex items-center gap-1.5" htmlFor="edit-fullname">
                  <User className="h-3.5 w-3.5 text-slate-400" />
                  Full Name
                </label>
                <input
                  id="edit-fullname"
                  type="text"
                  required
                  disabled={isLoading}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Jane Doe"
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition"
                />
              </div>

              {/* Date of Birth */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700 flex items-center gap-1.5" htmlFor="edit-dob">
                  <Calendar className="h-3.5 w-3.5 text-slate-400" />
                  Date of Birth
                </label>
                <input
                  id="edit-dob"
                  type="date"
                  disabled={isLoading}
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition"
                />
              </div>

              {/* Gender */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700 flex items-center gap-1.5" htmlFor="edit-gender">
                  <Users className="h-3.5 w-3.5 text-slate-400" />
                  Gender
                </label>
                <select
                  id="edit-gender"
                  disabled={isLoading}
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition"
                >
                  <option value="">Select gender...</option>
                  <option value="Female">Female</option>
                  <option value="Male">Male</option>
                  <option value="Non-binary">Non-binary</option>
                  <option value="Other">Other</option>
                  <option value="Prefer not to say">Prefer not to say</option>
                </select>
              </div>

              {/* Phone */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700 flex items-center gap-1.5" htmlFor="edit-phone">
                  <Phone className="h-3.5 w-3.5 text-slate-400" />
                  Phone Number
                </label>
                <input
                  id="edit-phone"
                  type="tel"
                  disabled={isLoading}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1 (555) 012-3456"
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition"
                />
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <Button
                type="submit"
                disabled={isLoading}
                className="bg-teal-600 hover:bg-teal-700 text-white text-xs shadow-sm transition disabled:opacity-70"
                id="edit-profile-submit-button"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    Saving Changes...
                  </>
                ) : (
                  <>
                    <Save className="mr-1.5 h-3.5 w-3.5" />
                    Save Changes
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Immutable Account Identifiers (Read-Only) */}
      <Card className="border-slate-200 bg-slate-50/50 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-slate-500" />
            <CardTitle className="text-sm font-semibold text-slate-900">
              System Security & Identifiers (Read-Only)
            </CardTitle>
          </div>
          <CardDescription className="text-xs text-slate-500">
            Cryptographic keys and account bindings managed by CarePath authentication.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-md border border-slate-200 bg-white p-3 space-y-1">
              <div className="text-[11px] font-medium text-slate-500 flex items-center gap-1.5">
                <Fingerprint className="h-3.5 w-3.5 text-teal-600" />
                Patient Record ID (Primary Key)
              </div>
              <p className="font-mono text-xs text-slate-800 break-all select-all">
                {initialProfile.id}
              </p>
            </div>

            <div className="rounded-md border border-slate-200 bg-white p-3 space-y-1">
              <div className="text-[11px] font-medium text-slate-500 flex items-center gap-1.5">
                <Fingerprint className="h-3.5 w-3.5 text-slate-500" />
                Auth User ID (Foreign Key)
              </div>
              <p className="font-mono text-xs text-slate-800 break-all select-all">
                {initialProfile.user_id}
              </p>
            </div>

            <div className="rounded-md border border-slate-200 bg-white p-3 space-y-1">
              <div className="text-[11px] font-medium text-slate-500 flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5 text-slate-500" />
                Account Email
              </div>
              <p className="text-xs text-slate-800 font-medium">
                {userEmail}
              </p>
            </div>

            <div className="rounded-md border border-slate-200 bg-white p-3 space-y-1">
              <div className="text-[11px] font-medium text-slate-500 flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-slate-500" />
                Record Created At
              </div>
              <p className="text-xs text-slate-800">
                {new Date(initialProfile.created_at).toLocaleString()}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
