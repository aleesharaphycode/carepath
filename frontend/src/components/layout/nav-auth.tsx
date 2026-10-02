"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { User, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LogoutButton } from "@/components/auth/logout-button";
import { createClient } from "@/lib/supabase/client";
import type { User as SupabaseUser } from "@supabase/supabase-js";

export function NavAuth() {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    // Check current auth status
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2">
        <div className="h-8 w-20 bg-slate-100 animate-pulse rounded-md" />
      </div>
    );
  }

  if (user) {
    const displayName =
      user.user_metadata?.full_name ||
      user.email?.split("@")[0] ||
      "Patient";

    return (
      <div className="flex items-center gap-2.5">
        <Link href="/profile">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-slate-700 hover:text-teal-700 hover:bg-teal-50 flex items-center gap-1.5"
            id="nav-profile-button"
          >
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-teal-100 text-teal-800 text-[10px] font-semibold">
              <User className="h-3 w-3" />
            </div>
            <span className="max-w-[120px] truncate font-medium">{displayName}</span>
          </Button>
        </Link>
        <LogoutButton size="sm" variant="outline" className="text-xs" />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2.5">
      <Link href="/login">
        <Button variant="ghost" size="sm" className="text-slate-700 hover:text-slate-900" id="nav-login-button">
          Sign In
        </Button>
      </Link>
      <Link href="/register">
        <Button size="sm" className="bg-teal-600 hover:bg-teal-700 text-white shadow-sm" id="nav-register-button">
          <ShieldCheck className="mr-1.5 h-4 w-4" />
          Get Started
        </Button>
      </Link>
    </div>
  );
}
