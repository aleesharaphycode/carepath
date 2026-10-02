"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

interface LogoutButtonProps {
  className?: string;
  variant?: "default" | "outline" | "ghost" | "secondary";
  size?: "default" | "sm" | "lg";
  showIcon?: boolean;
}

export function LogoutButton({
  className = "",
  variant = "outline",
  size = "sm",
  showIcon = true,
}: LogoutButtonProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const handleLogout = async () => {
    setIsLoading(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push("/login");
      router.refresh();
    } catch (error) {
      console.error("Logout failed:", error);
      // Even if signOut errors, redirect to login
      router.push("/login");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleLogout}
      disabled={isLoading}
      className={`text-slate-700 hover:text-red-700 hover:border-red-200 transition-colors ${className}`}
      id="logout-button"
    >
      {isLoading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5 text-slate-400" />
      ) : showIcon ? (
        <LogOut className="h-3.5 w-3.5 mr-1.5 text-slate-500" />
      ) : null}
      <span>{isLoading ? "Signing Out..." : "Sign Out"}</span>
    </Button>
  );
}
