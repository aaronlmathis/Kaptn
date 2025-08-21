// components/opsview/SectionHealthFooter.tsx
import * as React from "react";
import { CheckCircle2, AlertTriangle, OctagonAlert, Info } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "ok" | "warn" | "crit" | "info";

const toneMap: Record<Tone, { bg: string; fg: string; icon: React.ElementType; bar: string }> = {
  ok:   { bg: "bg-emerald-900/30", fg: "text-emerald-300", icon: CheckCircle2,  bar: "bg-emerald-500" },
  warn: { bg: "bg-amber-900/30",   fg: "text-amber-300",   icon: AlertTriangle, bar: "bg-amber-500" },
  crit: { bg: "bg-red-900/30",     fg: "text-red-300",     icon: OctagonAlert,  bar: "bg-red-500" },
  info: { bg: "bg-slate-800/50",   fg: "text-slate-300",   icon: Info,          bar: "bg-slate-500" },
};

export interface RatioPill {
  label: string;           // e.g., "Requested/Alloc"
  value: string;           // e.g., "126%"
  tone?: Tone;             // optional pill tone
  title?: string;          // tooltip
}

export function SectionHealthFooter({
  tone = "info",
  summary,
  usedPct,              // 0..1; renders mini bar when provided
  ratioPills = [],      // quick facts chips
  children,             // optional extra JSX (links, small notes)
}: {
  tone?: Tone;
  summary: string;       // one-line narrative
  usedPct?: number;      // e.g., used/allocatable
  ratioPills?: RatioPill[];
  children?: React.ReactNode;
}) {
  const tm = toneMap[tone];
  const pct = Number.isFinite(usedPct!) ? Math.max(0, Math.min(1, usedPct!)) : undefined;
  const Icon = tm.icon;

  return (
    <div className="w-full">
      <div className={cn("flex items-start gap-2 rounded-md px-2 py-1.5", tm.bg)}>
        <Icon className={cn("h-4 w-4 mt-0.5 flex-shrink-0", tm.fg)} />
        <div className="flex-1 space-y-1">
          <div className="text-sm leading-5">
            <span className={cn("font-medium", tm.fg)}>{summary}</span>
          </div>

          {typeof pct === "number" && (
            <div className="mt-1">
              <div className="h-1.5 w-full rounded bg-slate-800/60 overflow-hidden">
                <div
                  className={cn("h-1.5 transition-all", tm.bar)}
                  style={{ width: `${(pct * 100).toFixed(0)}%` }}
                />
              </div>
              <div className="mt-1 text-[11px] text-slate-400">{(pct * 100).toFixed(0)}% of capacity</div>
            </div>
          )}

          {ratioPills.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {ratioPills.map((p, i) => {
                const pm = p.tone ? toneMap[p.tone] : toneMap.info;
                return (
                  <span
                    key={i}
                    title={p.title}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] border",
                      "border-white/10 bg-slate-800/40 text-slate-200",
                      p.tone && pm.bg, p.tone && pm.fg
                    )}
                  >
                    <span className="opacity-80">{p.label}:</span>
                    <span className="font-semibold">{p.value}</span>
                  </span>
                );
              })}
            </div>
          )}

          {children && <div className="text-xs text-slate-400 pt-1">{children}</div>}
        </div>
      </div>
    </div>
  );
}
