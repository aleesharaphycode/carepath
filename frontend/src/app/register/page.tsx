"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  UserPlus,
  Activity,
  ArrowLeft,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Mail,
  Lock,
  User,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import { createPatientProfile } from "@/lib/services/profile";

export default function RegisterPage() {
  const router = useRouter();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmationNeeded, setConfirmationNeeded] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);

    // 1. Validation
    const cleanName = fullName.trim();
    const cleanEmail = email.trim();

    if (!cleanName) {
      setErrorMessage("Please enter your full name.");
      return;
    }

    if (!cleanEmail || !/^\S+@\S+\.\S+$/.test(cleanEmail)) {
      setErrorMessage("Please enter a valid email address.");
      return;
    }

    if (!password || password.length < 6) {
      setErrorMessage("Password must be at least 6 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match. Please re-enter.");
      return;
    }

    setIsLoading(true);

    try {
      const supabase = createClient();

      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          data: {
            full_name: cleanName,
            account_type: "patient",
          },
        },
      });

      if (error) {
        // Human-friendly error message
        if (error.message.toLowerCase().includes("user already registered")) {
          setErrorMessage("An account with this email already exists. Please sign in instead.");
        } else {
          setErrorMessage(error.message);
        }
        return;
      }

      // Supabase obfuscation: if user already exists and email confirm is on, identities array is empty
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        setErrorMessage("An account with this email already exists. Please sign in instead.");
        return;
      }

      // Check if session was granted immediately (auto-confirm)
      if (data.session && data.user) {
        // Attempt to initialize patient profile record
        await createPatientProfile(supabase, {
          userId: data.user.id,
          fullName: cleanName,
        });

        router.push("/dashboard");
        router.refresh();
      } else if (data.user) {
        // Email confirmation is required by Supabase project settings
        setConfirmationNeeded(true);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "An unexpected error occurred.";
      setErrorMessage(message);
    } finally {
      setIsLoading(false);
    }
  };

  // State: Email confirmation required
  if (confirmationNeeded) {
    return (
      <div className="flex min-h-[calc(100vh-160px)] items-center justify-center px-4 py-12">
        <div className="w-full max-w-md space-y-6">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="space-y-2 text-center pb-4">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-teal-50 text-teal-700 border border-teal-100">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <CardTitle className="text-xl">Verify Your Email</CardTitle>
              <CardDescription className="text-xs">
                Registration initiated for your CarePath vault
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-center">
              <div className="rounded-lg border border-teal-200 bg-teal-50/60 p-4 text-xs text-teal-900 leading-relaxed text-left">
                <div className="flex items-start gap-2.5">
                  <Mail className="h-4 w-4 text-teal-700 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-slate-900">Verification Link Sent</p>
                    <p className="mt-1 text-slate-600">
                      We sent a confirmation email to <strong className="text-slate-900">{email}</strong>.
                      Please click the link in your inbox to verify your email, then return to sign in.
                    </p>
                  </div>
                </div>
              </div>
              <p className="text-xs text-slate-500">
                After confirming, your patient profile will be securely initialized upon your first sign in.
              </p>
            </CardContent>
            <CardFooter className="flex flex-col space-y-3 pt-2">
              <Link href="/login" className="w-full">
                <Button className="w-full bg-teal-600 hover:bg-teal-700 text-white" id="confirm-login-redirect">
                  Proceed to Sign In
                </Button>
              </Link>
              <button
                type="button"
                onClick={() => setConfirmationNeeded(false)}
                className="text-xs text-slate-500 hover:text-slate-900 transition-colors"
              >
                Entered the wrong email? Register again
              </button>
            </CardFooter>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-160px)] items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg space-y-6">
        {/* Back Link */}
        <Link
          href="/"
          className="inline-flex items-center text-xs font-medium text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
          Back to Overview
        </Link>

        {/* Register Card */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="space-y-2 text-center pb-4">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-teal-50 text-teal-700 border border-teal-100">
              <Activity className="h-5 w-5" />
            </div>
            <div className="flex items-center justify-center gap-2">
              <CardTitle className="text-xl">Create CarePath Account</CardTitle>
            </div>
            <CardDescription className="text-xs">
              Establish your private, patient-owned healthcare records vault
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Error Feedback Banner */}
            {errorMessage && (
              <div
                className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800 flex items-start gap-2.5"
                role="alert"
                id="register-error-banner"
              >
                <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                <div className="leading-snug">
                  <p className="font-semibold text-red-950">Registration Failed</p>
                  <p className="mt-0.5">{errorMessage}</p>
                </div>
              </div>
            )}

            {/* Registration Form */}
            <form onSubmit={handleSubmit} className="space-y-3.5" noValidate>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700 flex items-center gap-1.5" htmlFor="reg-fullname">
                  <User className="h-3.5 w-3.5 text-slate-400" />
                  Full Legal Name
                </label>
                <input
                  id="reg-fullname"
                  type="text"
                  required
                  disabled={isLoading}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Jane Doe"
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700 flex items-center gap-1.5" htmlFor="reg-email">
                  <Mail className="h-3.5 w-3.5 text-slate-400" />
                  Email Address
                </label>
                <input
                  id="reg-email"
                  type="email"
                  required
                  disabled={isLoading}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="patient@example.com"
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700 flex items-center justify-between" htmlFor="account-type">
                  <span>Account Type</span>
                  <Badge variant="secondary" className="text-[10px] py-0 px-1.5 font-normal text-teal-700 bg-teal-50 border border-teal-200">
                    Primary Account
                  </Badge>
                </label>
                <div className="relative">
                  <input
                    id="account-type"
                    type="text"
                    readOnly
                    value="Patient (Individual Medical Vault)"
                    className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 cursor-not-allowed select-none"
                  />
                </div>
                <p className="text-[11px] text-slate-400">
                  Clinicians access health records through patient-granted, time-bound QR sessions.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-700 flex items-center gap-1.5" htmlFor="reg-password">
                    <Lock className="h-3.5 w-3.5 text-slate-400" />
                    Password
                  </label>
                  <input
                    id="reg-password"
                    type="password"
                    required
                    disabled={isLoading}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min. 6 characters"
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-700 flex items-center gap-1.5" htmlFor="confirm-password">
                    <Lock className="h-3.5 w-3.5 text-slate-400" />
                    Confirm Password
                  </label>
                  <input
                    id="confirm-password"
                    type="password"
                    required
                    disabled={isLoading}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-type password"
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition"
                  />
                </div>
              </div>

              <div className="pt-2">
                <Button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-teal-600 hover:bg-teal-700 text-white shadow-sm transition disabled:opacity-70 disabled:cursor-not-allowed"
                  id="register-submit-button"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      Creating Patient Vault...
                    </>
                  ) : (
                    <>
                      <UserPlus className="mr-1.5 h-3.5 w-3.5" />
                      Create Account
                    </>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>

          <CardFooter className="flex flex-col space-y-3 pt-2 text-center text-xs text-slate-500 border-t border-slate-100">
            <div>
              Already have an account?{" "}
              <Link href="/login" className="font-medium text-teal-600 hover:underline">
                Sign in
              </Link>
            </div>
            <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
              <ShieldCheck className="h-3.5 w-3.5 text-teal-600" />
              <span>Patient privacy protected by Supabase Row Level Security</span>
            </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
