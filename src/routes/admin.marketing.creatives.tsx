import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownWideNarrow,
  ExternalLink,
  Film,
  ImageIcon,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";

import { marketingCreatives } from "@/lib/marketing.functions";
import {
  MARKETING_PRESETS,
  presetLabel,
  type CreativeRow,
  type MarketingPreset,
} from "@/lib/marketing-shared";
import { AdminHeading, Panel } from "@/components/admin/kit";
import { BrandLoader } from "@/components/admin/brand-loader";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/marketing/creatives")({
  component: MarketingCreativesPage,
});

const money = (n: number, currency: string) =>
  `${currency === "USD" ? "$" : `${currency} `}${n.toLocaleString("en-US", {
    maximumFractionDigits: 2,
  })}`;

const compact = (n: number) =>
  n.toLocaleString("en-US", { maximumFractionDigits: n < 100 ? 2 : 0 });

const pct = (n: number) => `${n.toFixed(n < 10 ? 2 : 1)}%`;

type SortKey = "spend" | "roas" | "hookRate" | "holdRate" | "ctr" | "impressions";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "spend", label: "Spend" },
  { key: "roas", label: "ROAS" },
  { key: "hookRate", label: "Hook" },
  { key: "holdRate", label: "Hold" },
  { key: "ctr", label: "CTR" },
  { key: "impressions", label: "Impressions" },
];

/** Benchmarks: hook ≥ 30% is strong, hold ≥ 20% keeps attention. */
function toneFor(value: number, good: number, ok: number) {
  if (value >= good) return "text-emerald-600";
  if (value >= ok) return "text-amber-600";
  return "text-rose-600";
}

function Meter({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          {label}
        </span>
        <span className={cn("text-xs font-bold tabular-nums", tone)}>{pct(value)}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            tone.replace("text-", "bg-"),
          )}
          style={{ width: `${Math.min(100, Math.max(2, value))}%` }}
        />
      </div>
    </div>
  );
}

function RetentionBars({ row }: { row: CreativeRow }) {
  const steps = [
    { label: "25%", value: row.retention.p25 },
    { label: "50%", value: row.retention.p50 },
    { label: "75%", value: row.retention.p75 },
    { label: "100%", value: row.retention.p100 },
  ];
  return (
    <div className="flex items-end gap-1.5">
      {steps.map((s) => (
        <div key={s.label} className="flex w-9 flex-col items-center gap-1">
          <div className="flex h-12 w-full items-end overflow-hidden rounded-md bg-muted">
            <div
              className="w-full rounded-md bg-primary/70 transition-all duration-500"
              style={{ height: `${Math.min(100, Math.max(3, s.value))}%` }}
            />
          </div>
          <span className="text-[9px] font-semibold text-muted-foreground">{s.label}</span>
        </div>
      ))}
    </div>
  );
}

function CreativeCard({
  row,
  currency,
  delay,
}: {
  row: CreativeRow;
  currency: string;
  delay: number;
}) {
  return (
    <div
      style={{ animationDelay: `${delay}ms` }}
      className="admin-rise group overflow-hidden rounded-2xl border border-border bg-card transition-colors hover:border-primary/30"
    >
      <div className="flex gap-4 p-4">
        <div className="relative size-20 shrink-0 overflow-hidden rounded-xl border border-border/70 bg-muted">
          {row.thumbnailUrl ? (
            <img
              src={row.thumbnailUrl}
              alt={row.name}
              loading="lazy"
              className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="flex size-full items-center justify-center text-muted-foreground">
              <ImageIcon className="size-5" strokeWidth={1.5} />
            </div>
          )}
          {row.isVideo ? (
            <span className="absolute bottom-1 left-1 inline-flex items-center gap-1 rounded-full bg-background/85 px-1.5 py-0.5 text-[9px] font-semibold text-foreground backdrop-blur">
              <Film className="size-2.5" /> Video
            </span>
          ) : null}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-foreground">{row.name}</p>
              <p className="truncate text-[11px] text-muted-foreground">
                {row.campaignName ?? "—"}
                {row.status ? ` · ${row.status.replace(/_/g, " ").toLowerCase()}` : ""}
              </p>
            </div>
            {row.permalink ? (
              <a
                href={row.permalink}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 rounded-lg border border-border p-1.5 text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                aria-label="Preview ad on Meta"
              >
                <ExternalLink className="size-3.5" />
              </a>
            ) : null}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-4">
            {[
              { l: "Spend", v: money(row.spend, currency) },
              { l: "ROAS", v: `${compact(row.roas)}×` },
              { l: "CTR", v: pct(row.ctr) },
              { l: "CPC", v: money(row.cpc, currency) },
            ].map((s) => (
              <div key={s.l}>
                <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  {s.l}
                </p>
                <p className="text-sm font-bold tabular-nums text-foreground">{s.v}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-4 border-t border-border/70 bg-muted/30 px-4 py-3">
        <Meter label="Hook rate" value={row.hookRate} tone={toneFor(row.hookRate, 30, 15)} />
        <Meter label="Hold rate" value={row.holdRate} tone={toneFor(row.holdRate, 20, 10)} />
        {row.isVideo ? <RetentionBars row={row} /> : null}
        <div className="text-right">
          <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            Avg watch
          </p>
          <p className="text-sm font-bold tabular-nums text-foreground">
            {row.isVideo ? `${compact(row.avgWatchSeconds)}s` : "—"}
          </p>
        </div>
      </div>
    </div>
  );
}

function MarketingCreativesPage() {
  const [preset, setPreset] = useState<MarketingPreset>("7d");
  const [sort, setSort] = useState<SortKey>("spend");
  const [videoOnly, setVideoOnly] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const query = useQuery({
    queryKey: ["admin", "marketing", "creatives", preset],
    queryFn: () => marketingCreatives({ data: { preset } }),
    staleTime: 60_000,
  });

  const data = query.data;
  const currency = data?.currency ?? "USD";

  const rows = useMemo(() => {
    const list = (data?.rows ?? []).filter((r) => (videoOnly ? r.isVideo : true));
    return [...list].sort((a, b) => b[sort] - a[sort]);
  }, [data?.rows, sort, videoOnly]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await marketingCreatives({ data: { preset, refresh: true } });
      await query.refetch();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="space-y-6">
      <AdminHeading
        title="Creative performance"
        description="Which hooks stop the scroll and which ones actually sell."
        action={
          <Button
            variant="outline"
            className="rounded-xl"
            onClick={() => void refresh()}
            disabled={refreshing || query.isFetching}
          >
            <RefreshCw
              className={cn("size-4", (refreshing || query.isFetching) && "animate-spin")}
            />
            Refresh
          </Button>
        }
      />

      <div className="admin-rise space-y-3 rounded-2xl border border-border bg-card p-3">
        <div className="flex flex-wrap items-center gap-2">
          {MARKETING_PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPreset(p)}
              className={cn(
                "rounded-xl px-3.5 py-2 text-sm font-semibold transition-all duration-200",
                preset === p
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {presetLabel[p]}
            </button>
          ))}
          {data ? (
            <span className="ml-auto pr-1 text-[11px] text-muted-foreground">
              {data.range.since} → {data.range.until}
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-border/70 pt-3">
          <button
            type="button"
            onClick={() => setVideoOnly((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors",
              videoOnly
                ? "bg-primary/10 text-primary"
                : "border border-border text-muted-foreground hover:text-foreground",
            )}
          >
            <Film className="size-3.5" /> Video only
          </button>

          <div className="ml-auto inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-2 py-1.5">
            <ArrowDownWideNarrow className="size-3.5 text-muted-foreground" />
            {SORTS.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setSort(s.key)}
                className={cn(
                  "rounded-lg px-2 py-1 text-[11px] font-semibold transition-colors",
                  sort === s.key
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {query.isLoading ? (
        <div className="flex justify-center py-16">
          <BrandLoader />
        </div>
      ) : null}

      {data && !data.connected ? (
        <Panel className="border-amber-500/40 bg-amber-500/5">
          <div className="flex items-start gap-3">
            <TriangleAlert className="mt-0.5 size-4.5 text-amber-600" />
            <div>
              <p className="text-sm font-semibold text-foreground">Meta data unavailable</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {data.message ??
                  "Connect the Meta Marketing API from Settings → API & Integrations."}
              </p>
            </div>
          </div>
        </Panel>
      ) : null}

      {data && data.connected ? (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            {rows.map((row, i) => (
              <CreativeCard key={row.adId} row={row} currency={currency} delay={i * 40} />
            ))}
          </div>
          {rows.length === 0 ? (
            <Panel>
              <p className="py-8 text-center text-sm text-muted-foreground">
                No creative delivery in this window.
              </p>
            </Panel>
          ) : (
            <p className="rounded-xl bg-muted/60 p-3 text-[11px] leading-relaxed text-muted-foreground">
              Hook rate = 3-second views ÷ impressions (aim for 30%+). Hold rate = ThruPlays ÷
              3-second views (aim for 20%+). A high hook with a low hold means the opening works but
              the message loses people — recut the middle instead of the thumbnail.
            </p>
          )}
        </>
      ) : null}
    </div>
  );
}
