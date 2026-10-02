"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserCheck, AlertCircle, Loader2, Calendar, Phone, User, Users } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { createPatientProfile } from "@/lib/services/profile";

interface CompleteProfileCardProps {
  userId: string;
  defaultFullName?: string;
  onCompleted?: () => void;
}

export function CompleteProfileCard({
  userId,
  defaultFullName = "",
  onCompleted,
}: CompleteProfileCardProps) {
  const router = useRouter();

  const [fullName, setFullName] = useState(defaultFullName);
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [gender, setGender] = useState("");
  const [phone, setPhone] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanName = fullName.trim();
    if (!cleanName) {
      setErrorMessage("Please enter your full name.");
      return;
    }

    if (!dateOfBirth) {
      setErrorMessage("Please select your date of birth.");
      return;
    }

    if (!gender) {
      setErrorMessage("Please select your gender.");
      return;
    }

    if (!phone.trim()) {
      setErrorMessage("Please enter your contact phone number.");
      return;
    }

    setIsLoading(true);

    try {
      const supabase = createClient();
      const { error, tableMissing } = await createPatientProfile(supabase, {
        userId,
        fullName: cleanName,
        dateOfBirth,
        gender,
        phone: phone.trim(),
      });

      if (error) {
        if (tableMissing) {
          setErrorMessage(
            "The 'patients' table has not yet been initialized in your Supabase database. Please execute 'database/migrations/01_patients.sql' in your Supabase SQL Editor."
          );
        } else {
          setErrorMessage(error.message);
        }
        return;
      }

      if (onCompleted) {
        onCompleted();
      }
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save profile.";
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="border-teal-200 bg-gradient-to-b from-teal-50/40 to-white shadow-sm">
      <CardHeader className="space-y-1.5 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-600 text-white">
            <UserCheck className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-lg text-slate-900">Complete Your Patient Profile</CardTitle>
            <CardDescription className="text-xs text-slate-600">
              Please enter your foundational personal details to activate your medical record vault.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {errorMessage && (
          <div
            className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800 flex items-start gap-2.5"
            role="alert"
          >
            <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
            <div className="leading-snug">
              <p className="font-semibold text-red-950">Profile Setup Notice</p>
              <p className="mt-0.5">{errorMessage}</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Full Name */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700 flex items-center gap-1.5" htmlFor="cp-fullname">
                <User className="h-3.5 w-3.5 text-slate-400" />
                Full Name
              </label>
              <input
                id="cp-fullname"
                type="text"
                required
                disabled={isLoading}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Jane Doe"
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500 transition"
              />
            </div>

            {/* Date of Birth */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700 flex items-center gap-1.5" htmlFor="cp-dob">
                <Calendar className="h-3.5 w-3.5 text-slate-400" />
                Date of Birth
              </label>
              <input
                id="cp-dob"
                type="date"
                required
                disabled={isLoading}
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500 transition"
              />
            </div>

            {/* Gender */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700 flex items-center gap-1.5" htmlFor="cp-gender">
                <Users className="h-3.5 w-3.5 text-slate-400" />
                Gender
              </label>
              <select
                id="cp-gender"
                required
                disabled={isLoading}
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500 transition"
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
              <label className="text-xs font-medium text-slate-700 flex items-center gap-1.5" htmlFor="cp-phone">
                <Phone className="h-3.5 w-3.5 text-slate-400" />
                Phone Number
              </label>
              <input
                id="cp-phone"
                type="tel"
                required
                disabled={isLoading}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 (555) 012-3456"
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500 transition"
              />
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <Button
              type="submit"
              disabled={isLoading}
              className="bg-teal-600 hover:bg-teal-700 text-white text-xs shadow-sm transition"
              id="save-profile-button"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Saving Profile...
                </>
              ) : (
                "Save & Activate Dashboard"
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
