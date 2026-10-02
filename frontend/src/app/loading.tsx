import { Activity } from "lucide-react";

export default function Loading() {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center">
      <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-teal-50 border border-teal-200/80 shadow-xs mb-4">
        <Activity className="h-8 w-8 text-teal-600 animate-pulse" />
        <span className="absolute -top-1 -right-1 flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3 w-3 bg-teal-500"></span>
        </span>
      </div>
      <h3 className="text-sm font-semibold text-slate-800">Loading CarePath Workspace</h3>
      <p className="text-xs text-slate-500 mt-1 max-w-xs">
        Retrieving secure patient records and synchronizing clinical history...
      </p>
    </div>
  );
}
