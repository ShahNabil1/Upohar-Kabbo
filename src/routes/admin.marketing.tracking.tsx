import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Activity,
  CheckCircle2,
  CircleSlash,
  ExternalLink,
  Gauge,
  RefreshCw,
  RotateCw,
  XCircle,
} from "lucide-react";

import { listTrackingEvents, retryTrackingEventFn, type TrackingEventRow } from "@/lib/tracking.functions";
import { AdminHeading, Panel } from "@/components/admin/kit";
import { BrandLoader } from "@/components/admin/brand-loader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/marketing/tracking")({
  component: TrackingDebugPage,
});

type PlatformFilter = "all" | "meta" | "tiktok" | "ga4";
type StatusFilter = "all" | "sent" | "failed" | "skipped";

const platformLabel: Record<string, string> = {
  meta: "Meta CAPI",
  tiktok: "TikTok Events",
  ga4: "GA4 Measurement",
};

const statusStyle: Record<string, string> = {
  sent: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600",
  failed: "border-rose-500/30 bg-rose-500/10 text-rose-600",
  skipped: "border-border bg-muted text-muted-foreground",
};

const statusIcon: Record<string, typeof CheckCircle2> = {
  sent: CheckCircle2,
  failed: XCircle,
  skipped: CircleSlash,
};

function Stat({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "good" | "bad";
}) {
  return (
    <Panel className="p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 font-display text-2xl font-semibold tabular-nums",
          tone === "good" && "text-emerald-600",
          tone === "bad" && "text-rose-600",
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </Panel>
  );
}

function EventCard({
  row,
  onRetry,
  retrying,
}: {
  row: TrackingEventRow;
  onRetry: (id: string) => void;
  retrying: boolean;
}) {
  const [open, setOpen] = useState(false);
  const Icon = statusIcon[row.status] ?? CircleSlash;

  return (
    <div className="rounded-xl border border-border/70 bg-card/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-semibold",
                statusStyle[row.status] ?? statusStyle["skipped"],
              )}
            >
              <Icon className="size-3.5" />
              {row.status}
            </span>
            <span className="text-sm font-semibold">{platformLabel[row.platform] ?? row.platform}</span>
            <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium">{row.event_name}</span>
            {typeof row.emq === "number" ? (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Gauge className="size-3.5" /> EMQ {row.emq}/10
              </span>
            ) : null}
          </div>
          <p className="mt-1.5 truncate font-mono text-xs text-muted-foreground">{row.event_id}</p>
          {row.message ? (
            <p
              className={cn(
                "mt-1 text-xs",
                row.status === "failed" ? "text-rose-600" : "text-muted-foreground",
              )}
            >
              {row.message}
            </p>
          ) : null}
          {row.match_keys.length ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {row.match_keys.map((key) => (
                <span
                  key={key}
                  className="rounded-md border border-border/70 px-1.5 py-0.5 text-[11px] text-muted-foreground"
                >
                  {key}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <span className="text-xs text-muted-foreground">
            {new Date(row.created_at).toLocaleString("en-GB", { hour12: true })}
          </span>
          <div className="flex items-center gap-2">
            {row.order_id ? (
              <Button asChild size="sm" variant="ghost" className="h-8 px-2 text-xs">
                <Link to="/admin/orders/$id" params={{ id: row.order_id }}>
                  {row.order_number ?? "Order"} <ExternalLink className="ml-1 size-3.5" />
                </Link>
              </Button>
            ) : null}
            <Button size="sm" variant="outline" className="h-8 px-2 text-xs" onClick={() => setOpen((v) => !v)}>
              {open ? "Hide" : "Response"}
            </Button>
            {row.status !== "sent" ? (
              <Button
                size="sm"
                className="h-8 px-2 text-xs"
                disabled={retrying}
                onClick={() => onRetry(row.id)}
              >
                <RotateCw className={cn("mr-1 size-3.5", retrying && "animate-spin")} /> Retry
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      {open ? (
        <pre className="mt-3 max-h-72 overflow-auto rounded-lg bg-muted/60 p-3 text-[11px] leading-relaxed">
          {row.response || "{}"}
        </pre>
      ) : null}
    </div>
  );
}

function TrackingDebugPage() {
  const qc = useQueryClient();
  const [platform, setPlatform] = useState<PlatformFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");

  const q = useQuery({
    queryKey: ["tracking-events", platform, status, search],
    queryFn: () => listTrackingEvents({ data: { platform, status, search, limit: 100 } }),
    refetchInterval: 60_000,
  });

  const retry = useMutation({
    mutationFn: (id: string) => retryTrackingEventFn({ data: { id } }),
    onSuccess: (res) => {
      if (res.ok) toast.success(res.message);
      else toast.error(res.message);
      void qc.invalidateQueries({ queryKey: ["tracking-events"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Retry failed"),
  });

  const summary = q.data?.summary;
  const byPlatform = q.data?.byPlatform;

  return (
    <div className="space-y-6">
      <AdminHeading
        title="Tracking Debug"
        description="Server-side conversions sent to Meta CAPI, TikTok Events API and GA4 Measurement Protocol — what was sent, what came back, and how strong the identity match was."
        action={
          <Button variant="outline" size="sm" onClick={() => void q.refetch()} disabled={q.isFetching}>
            <RefreshCw className={cn("mr-2 size-4", q.isFetching && "animate-spin")} /> Refresh
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Sent · 7 days" value={String(summary?.sent ?? 0)} tone="good" />
        <Stat label="Failed · 7 days" value={String(summary?.failed ?? 0)} tone={summary?.failed ? "bad" : "default"} />
        <Stat label="Skipped" value={String(summary?.skipped ?? 0)} hint="Duplicate or missing credentials" />
        <Stat label="Avg. match quality" value={summary?.emq ? `${summary.emq}/10` : "—"} hint="Higher = better attribution" />
      </div>

      <Panel className="p-4">
        <div className="flex flex-wrap items-center gap-4">
          {(["meta", "tiktok", "ga4"] as const).map((p) => (
            <div key={p} className="flex items-center gap-2 text-sm">
              <Activity className="size-4 text-muted-foreground" />
              <span className="font-medium">{platformLabel[p]}</span>
              <span className="text-emerald-600 tabular-nums">{byPlatform?.[p]?.sent ?? 0} sent</span>
              <span className="text-muted-foreground">·</span>
              <span className={cn("tabular-nums", (byPlatform?.[p]?.failed ?? 0) > 0 && "text-rose-600")}>
                {byPlatform?.[p]?.failed ?? 0} failed
              </span>
            </div>
          ))}
        </div>
      </Panel>

      <Panel className="space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          {(["all", "meta", "tiktok", "ga4"] as const).map((p) => (
            <Button
              key={p}
              size="sm"
              variant={platform === p ? "default" : "outline"}
              className="h-8 text-xs"
              onClick={() => setPlatform(p)}
            >
              {p === "all" ? "All platforms" : platformLabel[p]}
            </Button>
          ))}
          <span className="mx-1 h-5 w-px bg-border" />
          {(["all", "sent", "failed", "skipped"] as const).map((s) => (
            <Button
              key={s}
              size="sm"
              variant={status === s ? "default" : "outline"}
              className="h-8 text-xs capitalize"
              onClick={() => setStatus(s)}
            >
              {s}
            </Button>
          ))}
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search event id / order number…"
            className="h-8 w-full max-w-xs text-xs sm:ml-auto"
          />
        </div>

        {q.isLoading ? (
          <BrandLoader message="Loading tracking events" />
        ) : q.isError ? (
          <p className="py-8 text-center text-sm text-rose-600">
            {q.error instanceof Error ? q.error.message : "Could not load events"}
          </p>
        ) : !q.data?.events.length ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            এখনো কোনো সার্ভার-সাইড ইভেন্ট যায়নি। অর্ডারের স্ট্যাটাস Pending করলে Meta Purchase, TikTok
            PlaceAnOrder ও GA4 purchase এখানে দেখা যাবে।
          </p>
        ) : (
          <div className="space-y-3">
            {q.data.events.map((row) => (
              <EventCard
                key={row.id}
                row={row}
                retrying={retry.isPending && retry.variables === row.id}
                onRetry={(id) => retry.mutate(id)}
              />
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
