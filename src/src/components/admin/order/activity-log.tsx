import { useState } from "react";
import {
  Eye,
  History,
  Lock,
  MessageSquare,
  Pencil,
  ShoppingBag,
  StickyNote,
  Truck,
  ShieldAlert,
} from "lucide-react";

import { Panel } from "@/components/admin/kit";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ActivityEntry = {
  id: string;
  kind: string;
  message: string | null;
  meta?: unknown;
  created_at: string;
};

const KINDS: Record<
  string,
  { icon: typeof Eye; ring: string; text: string; label: string }
> = {
  view: { icon: Eye, ring: "bg-slate-100 text-slate-600", text: "text-slate-700", label: "Viewed" },
  edit: { icon: Pencil, ring: "bg-sky-100 text-sky-700", text: "text-sky-900", label: "Edited" },
  status: {
    icon: ShoppingBag,
    ring: "bg-violet-100 text-violet-700",
    text: "text-violet-900",
    label: "Status",
  },
  sms: {
    icon: MessageSquare,
    ring: "bg-emerald-100 text-emerald-700",
    text: "text-emerald-900",
    label: "SMS",
  },
  note: {
    icon: StickyNote,
    ring: "bg-amber-100 text-amber-700",
    text: "text-amber-900",
    label: "Note",
  },
  security: {
    icon: Lock,
    ring: "bg-rose-100 text-rose-700",
    text: "text-rose-900",
    label: "Security",
  },
  takeover: {
    icon: ShieldAlert,
    ring: "bg-rose-100 text-rose-700",
    text: "text-rose-900",
    label: "Takeover",
  },
  courier: { icon: Truck, ring: "bg-indigo-100 text-indigo-700", text: "text-indigo-900", label: "Courier" },
};

function fullTime(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    timeZone: "Asia/Dhaka",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

function relative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function actorOf(meta: unknown): string | null {
  if (meta && typeof meta === "object" && "actor" in meta) {
    const a = (meta as { actor?: unknown }).actor;
    if (typeof a === "string" && a.trim()) return a;
  }
  return null;
}

/** "X took over this order from Y" — names come from meta when present. */
function takeoverText(a: ActivityEntry): string {
  const m = (a.meta ?? {}) as { actor?: string; from?: string };
  if (m.actor && m.from) return `${m.actor} took over this order from ${m.from}`;
  return a.message ?? "Order taken over";
}


export function ActivityLog({ entries }: { entries: ActivityEntry[] }) {
  const [limit, setLimit] = useState(5);
  const sorted = [...entries].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const visible = sorted.slice(0, limit);


  return (
    <Panel>
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <History className="size-4 text-primary" />
          Activity log
        </h2>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground">
          {sorted.length} events
        </span>
      </div>

      {sorted.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No activity recorded yet.</p>
      ) : (
        <>
          <ol className="mt-4 space-y-0">
            {visible.map((a, idx) => {
              const meta = KINDS[a.kind] ?? KINDS["edit"]!;
              const Icon = meta.icon;
              const actor = actorOf(a.meta);
              const last = idx === visible.length - 1;
              return (
                <li
                  key={a.id}
                  className={cn(
                    "relative flex gap-3 pb-4 last:pb-0",
                    a.kind === "takeover" &&
                      "rounded-lg border border-rose-300 bg-rose-50 p-3 pb-3 last:pb-3",
                  )}
                >
                  {!last && a.kind !== "takeover" ? (
                    <span className="absolute left-[13px] top-7 h-[calc(100%-1.25rem)] w-px bg-border" />
                  ) : null}
                  <span
                    className={cn(
                      "z-[1] mt-0.5 grid size-7 shrink-0 place-items-center rounded-full",
                      meta.ring,
                    )}
                  >
                    <Icon className="size-3.5" />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span
                        className={cn(
                          "rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em]",
                          meta.text,
                        )}
                      >
                        {meta.label}
                      </span>
                      {actor ? (
                        <span className="text-[11px] font-bold text-foreground">{actor}</span>
                      ) : null}
                      <span className="text-[11px] text-muted-foreground">
                        {fullTime(a.created_at)} · {relative(a.created_at)}
                      </span>
                    </div>
                    {a.kind === "takeover" ? (
                      <p className="mt-1 break-words text-sm font-bold leading-relaxed text-rose-700">
                        {takeoverText(a)}
                      </p>
                    ) : (
                      <p className="mt-1 break-words text-sm leading-relaxed text-foreground">
                        {a.message ?? a.kind}
                      </p>
                    )}

                  </div>
                </li>
              );
            })}
          </ol>

          {sorted.length > visible.length ? (
            <Button
              size="sm"
              variant="outline"
              className="mt-3 w-full"
              onClick={() => setLimit((v) => v + 10)}
            >
              View more ({sorted.length - visible.length} left)
            </Button>
          ) : null}

        </>
      )}
    </Panel>
  );
}
