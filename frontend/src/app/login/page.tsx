"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Lock,
  Activity,
  ArrowLeft,
  ShieldCheck,
  AlertCircle,
  Loader2,
  Mail,
  KeyRound,
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
import { createClient } from "@/lib/supabase/client";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawRedirect = searchParams.get("redirectedFrom") || "/dashboard";
  const redirectedFrom =
    rawRedirect.startsWith("/") && !rawRedirect.startsWith("//")
      ? rawRedirect
      : "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanEmail = email.trim();

    if (!cleanEmail) {
      setErrorMessage("Please enter your email address.");
      return;
    }

    if (!password) {
      setErrorMessage("Please enter your password.");
      return;
    }

    setIsLoading(true);

    try {
      const supabase = createClient();

      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (error) {
        const msg = error.message.toLowerCase();
        if (msg.includes("invalid login credentials") || msg.includes("invalid claim")) {
          setErrorMessage("Invalid email or password. Please verify your credentials.");
        } else if (msg.includes("email not confirmed") || msg.includes("not confirmed")) {
          setErrorMessage(
            "Email confirmation required. Please check your inbox for the verification link before signing in."
          );
        } else {
          setErrorMessage("Authentication failed. Please check your credentials and try again.");
        }
        return;
      }

      if (data.session) {
        // Authenticated session established
        router.push(redirectedFrom);
        router.refresh();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Authentication service unavailable.";
      setErrorMessage(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader className="space-y-2 text-center pb-4">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-teal-50 text-teal-700 border border-teal-100">
          <Activity className="h-5 w-5" />
        </div>
        <div className="flex items-center justify-center gap-2">
          <CardTitle className="text-xl">Sign In to CarePath</CardTitle>
        </div>
        <CardDescription className="text-xs">
          Access your patient-owned medical records vault
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Error Feedback Banner */}
        {errorMessage && (
          <div
            className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800 flex items-start gap-2.5"
            role="alert"
            id="login-error-banner"
          >
            <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
            <div className="leading-snug">
              <p className="font-semibold text-red-950">Unable to Sign In</p>
              <p className="mt-0.5">{errorMessage}</p>
            </div>
          </div>
        )}

        {/* Informational Redirect Banner if user was intercepted */}
        {searchParams.has("redirectedFrom") && !errorMessage && (
          <div className="rounded-lg border border-teal-200 bg-teal-50/70 p-3 text-xs text-teal-900 flex items-start gap-2.5">
            <Lock className="h-4 w-4 text-teal-700 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-teal-950">Authentication Required</p>
              <p className="mt-0.5 text-teal-800">
                Please sign in to access your secure patient dashboard and medical records.
              </p>
            </div>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-3.5" noValidate>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-700 flex items-center gap-1.5" htmlFor="login-email">
              <Mail className="h-3.5 w-3.5 text-slate-400" />
              Email Address
            </label>
            <input
              id="login-email"
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
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-slate-700 flex items-center gap-1.5" htmlFor="login-password">
                <KeyRound className="h-3.5 w-3.5 text-slate-400" />
                Password
              </label>
            </div>
            <input
              id="login-password"
              type="password"
              required
              disabled={isLoading}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition"
            />
          </div>

          <div className="pt-2">
            <Button
              type="submit"
              disabled={isLoading}
              className="w-full bg-teal-600 hover:bg-teal-700 text-white shadow-sm transition disabled:opacity-70 disabled:cursor-not-allowed"
              id="login-submit-button"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Verifying Credentials...
                </>
              ) : (
                <>
                  <Lock className="mr-1.5 h-3.5 w-3.5" />
                  Sign In
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>

      <CardFooter className="flex flex-col space-y-3 pt-2 text-center text-xs text-slate-500 border-t border-slate-100">
        <div>
          Don&apos;t have an account?{" "}
          <Link href="/register" className="font-medium text-teal-600 hover:underline">
            Create an account
          </Link>
        </div>
        <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
          <ShieldCheck className="h-3.5 w-3.5 text-teal-600" />
          <span>Protected by Supabase SSR Cookie Authentication</span>
        </div>
      </CardFooter>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-[calc(100vh-160px)] items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        {/* Back Link */}
        <Link
          href="/"
          className="inline-flex items-center text-xs font-medium text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
          Back to Overview
        </Link>

        <Suspense
          fallback={
            <Card className="border-slate-200 shadow-sm p-6 text-center text-xs text-slate-400">
              <Loader2 className="h-5 w-5 animate-spin mx-auto text-teal-600" />
              <p className="mt-2">Loading authentication...</p>
            </Card>
          }
        >
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
