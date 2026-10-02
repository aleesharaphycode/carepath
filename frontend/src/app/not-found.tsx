import Link from "next/link";
import { FileQuestion, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 border border-slate-200 text-slate-600 shadow-xs mb-4">
        <FileQuestion className="h-7 w-7" />
      </div>

      <h2 className="text-base font-bold text-slate-900">
        Clinical Resource Not Found
      </h2>
      <p className="text-xs text-slate-600 mt-1.5 max-w-md leading-relaxed">
        The requested medical page, clinical document, or patient resource could not be found or has been moved.
      </p>

      <div className="mt-6">
        <Button
          asChild
          size="sm"
          className="bg-teal-600 hover:bg-teal-700 text-white text-xs h-9 px-4 font-semibold shadow-xs"
        >
          <Link href="/dashboard">
            <Home className="mr-1.5 h-3.5 w-3.5" />
            Return to Dashboard
          </Link>
        </Button>
      </div>
    </div>
  );
}
