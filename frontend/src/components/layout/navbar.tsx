"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  LayoutDashboard,
  Clock,
  Calendar,
  FolderOpen,
  Users,
  QrCode,
  Menu,
  X,
  Sparkles,
  CreditCard,
  Stethoscope,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { NavAuth } from "@/components/layout/nav-auth";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/ai-doctor", label: "AI Doctor", icon: Stethoscope },
  { href: "/timeline", label: "Health Timeline", icon: Clock },
  { href: "/calendar", label: "Care Calendar", icon: Calendar },
  { href: "/documents", label: "Documents", icon: FolderOpen },

  { href: "/family", label: "Family", icon: Users },
  { href: "/consent", label: "Share Access", icon: QrCode },
  { href: "/subscription", label: "Plans", icon: CreditCard },
];

export function Navbar() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isActive = (path: string) => {
    if (path === "/" && pathname === "/") return true;
    if (path !== "/" && pathname.startsWith(path)) return true;
    return false;
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-200/80 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand Logo */}
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2.5 transition-opacity hover:opacity-90">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-600 text-white shadow-sm shadow-teal-600/20">
              <Activity className="h-5 w-5" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold tracking-tight text-slate-900">CarePath</span>
                <Badge
                  variant="default"
                  className="text-[10px] font-semibold py-0 px-1.5 bg-teal-50 text-teal-700 border border-teal-200 flex items-center gap-1"
                >
                  <Sparkles className="h-2.5 w-2.5" />
                  Health Platform
                </Badge>
              </div>
              <span className="text-[11px] text-slate-500 -mt-0.5 hidden sm:block">
                Unified Healthcare Journey
              </span>
            </div>
          </Link>

          {/* Desktop Navigation Links */}
          <nav className="hidden lg:flex items-center gap-1 text-xs font-medium text-slate-600">
            {NAV_ITEMS.map((item) => {
              const active = isActive(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors ${
                    active
                      ? "bg-teal-50 text-teal-800 font-semibold border border-teal-200/70"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/70"
                  }`}
                >
                  <Icon className={`h-3.5 w-3.5 ${active ? "text-teal-700" : "text-slate-400"}`} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Right Section: Auth & Mobile Menu Button */}
        <div className="flex items-center gap-3">
          <NavAuth />

          {/* Mobile Hamburger Button */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            aria-label="Toggle Navigation Menu"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer / Dropdown Navigation */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-t border-slate-200 bg-white px-4 py-3 shadow-lg space-y-1 animate-in slide-in-from-top-2 duration-150">
          <div className="grid grid-cols-2 gap-1.5 pb-2">
            {NAV_ITEMS.map((item) => {
              const active = isActive(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors ${
                    active
                      ? "bg-teal-50 text-teal-800 font-semibold border border-teal-200"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <Icon className={`h-4 w-4 ${active ? "text-teal-700" : "text-slate-400"}`} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </header>
  );
}
