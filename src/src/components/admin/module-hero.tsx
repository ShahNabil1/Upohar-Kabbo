import type { LucideIcon } from "lucide-react";
import { ArrowLeft } from "lucide-react";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type HeroAccent =
  | "indigo"
  | "emerald"
  | "amber"
  | "rose"
  | "sky"
  | "violet"
  | "teal"
  | "slate";

const accents: Record<HeroAccent, { wash: string; ring: string; chip: string; bar: string }> = {
  indigo: {
    wash: "from-indigo-500/12 via-indigo-500/4 to-transparent",
    ring: "border-indigo-500/25",
    chip: "bg-indigo-500/12 text-indigo-700 ring-indigo-500/20",
    bar: "bg-indigo-500",
  },
  emerald: {
    wash: "from-emerald-500/12 via-emerald-500/4 to-transparent",
    ring: "border-emerald-500/25",
    chip: "bg-emerald-500/12 text-emerald-700 ring-emerald-500/20",
    bar: "bg-emerald-500",
  },
  amber: {
    wash: "from-amber-500/14 via-amber-500/4 to-transparent",
    ring: "border-amber-500/25",
    chip: "bg-amber-500/14 text-amber-700 ring-amber-500/20",
    bar: "bg-amber-500",
  },
  rose: {
    wash: "from-rose-500/12 via-rose-500/4 to-transparent",
    ring: "border-rose-500/25",
    chip: "bg-rose-500/12 text-rose-700 ring-rose-500/20",
    bar: "bg-rose-500",
  },
  sky: {
    wash: "from-sky-500/12 via-sky-500/4 to-transparent",
    ring: "border-sky-500/25",
    chip: "bg-sky-500/12 text-sky-700 ring-sky-500/20",
    bar: "bg-sky-500",
  },
  violet: {
    wash: "from-violet-500/12 via-violet-500/4 to-transparent",
    ring: "border-violet-500/25",
    chip: "bg-violet-500/12 text-violet-700 ring-violet-500/20",
    bar: "bg-violet-500",
  },
  teal: {
    wash: "from-teal-500/12 via-teal-500/4 to-transparent",
    ring: "border-teal-500/25",
    chip: "bg-teal-500/12 text-teal-700 ring-teal-500/20",
    bar: "bg-teal-500",
  },
  slate: {
    wash: "from-slate-500/12 via-slate-500/4 to-transparent",
    ring: "border-slate-500/25",
    chip: "bg-slate-500/12 text-slate-700 ring-slate-500/20",
    bar: "bg-slate-500",
  },
};

/**
 * Module header used across the Inventory workspace. Each page gets its own
 * accent + icon so the pages read as distinct surfaces, not one repeated table.
 */
export function ModuleHero({
  eyebrow,
  title,
  description,
  icon: Icon,
  accent = "indigo",
  action,
  meta,
  backTo,
  backLabel = "Back",
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  icon?: LucideIcon;
  accent?: HeroAccent;
  action?: ReactNode;
  meta?: ReactNode;
  backTo?: string;
  backLabel?: string;
  className?: string;
}) {
  const a = accents[accent];
  return (
    <div
      className={cn(
        "admin-rise relative overflow-hidden rounded-2xl border bg-card p-5 sm:p-6",
        a.ring,
        className,
      )}
    >
      <div className={cn("pointer-events-none absolute inset-0 bg-gradient-to-br", a.wash)} />
      <div className={cn("absolute inset-x-0 top-0 h-1", a.bar)} />
      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3.5">
          {Icon ? (
            <span
              className={cn(
                "mt-0.5 inline-flex size-11 shrink-0 items-center justify-center rounded-xl ring-1",
                a.chip,
              )}
            >
              <Icon className="size-5" />
            </span>
          ) : null}
          <div className="min-w-0">
            {backTo ? (
              <Link
                to={backTo}
                className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-border bg-background/70 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
              >
                <ArrowLeft className="size-3" />
                {backLabel}
              </Link>
            ) : null}
            {eyebrow ? (
              <p className="font-en text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                {eyebrow}
              </p>
            ) : null}
            <h1 className="mt-0.5 text-xl font-bold tracking-tight sm:text-[1.6rem]">{title}</h1>
            {description ? (
              <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                {description}
              </p>
            ) : null}
            {meta ? <div className="mt-3 flex flex-wrap items-center gap-2">{meta}</div> : null}
          </div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </div>
  );
}
