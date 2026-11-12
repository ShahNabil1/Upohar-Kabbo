import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownWideNarrow,
  Layers,
  RefreshCw,
  Search,
  TriangleAlert,
} from "lucide-react";

import { marketingCampaigns } from "@/lib/marketing.functions";
import {
  CAMPAIGN_LEVELS,
  MARKETING_PRESETS,
  levelLabel,
  presetLabel,
  type CampaignLevel,
  type CampaignRow,
  type MarketingPreset,
} from "@/lib/marketing-shared";
import { AdminHeading, Panel } from "@/components/admin/kit";
import { BrandLoader } from "@/components/admin/brand-loader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/marketing/campaigns")({
  component: MarketingCampaignsPage,
});

const money = (n: number, currency: string) =>
  `${currency === "USD" ? "$" : `${currency} `}${n.toLocaleString("en-US", {
    maximumFractionDigits: 2,
  })}`;

const compact = (n: number) =>
  n.toLocaleString("en-US", { maximumFractionDigits: n < 100 ? 2 : 0 });

const pct = (n: number) => `${n.toFixed(n < 10 ? 2 : 1)}%`;

type SortKey = "spend" | "roas" | "purchases" | "ctr" | "cpc" | "impressions";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "spend", label: "Spend" },
  { key: "roas", label: "ROAS" },
  { key: "purchases", label: "Purchases" },
  { key: "ctr", label: "CTR" },
  { key: "cpc", label: "CPC" },
  { key: "impressions", label: "Impressions" },
];

function StatusPill({ row }: { row: CampaignRow }) {
  const status = row.effectiveStatus ?? row.status;
  if (!status) return <span className="text-[11px] text-muted-foreground">—</span>;
  const active = status === "ACTIVE";
  const paused = status.includes("PAUSED");
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em]",
        active
          ? "bg-emerald-500/10 text-emerald-600"
          : paused
            ? "bg-amber-500/10 text-amber-600"
            : "bg-muted text-muted-foreground",
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          active ? "bg-emerald-500" : paused ? "bg-amber-500" : "bg-muted-foreground/60",
        )}
      />
      {status.replace(/_/g, " ").toLowerCase()}
    </span>
  );
}

function MarketingCampaignsPage() {
  const [preset, setPreset] = useState<MarketingPreset>("7d");
  const [level, setLevel] = useState<CampaignLevel>("campaign");
  const [sort, setSort] = useState<SortKey>("spend");
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const query = useQuery({
    queryKey: ["admin", "marketing", "campaigns", preset, level],
    queryFn: () => marketingCampaigns({ data: { preset, level } }),
    staleTime: 60_000,
  });

  const data = query.data;
  const currency = data?.currency ?? "USD";

  const rows = useMemo(() => {
    const list = (data?.rows ?? []).filter((r) => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) || (r.parentName ?? "").toLowerCase().includes(q)
      );
    });
    return [...list].sort((a, b) => b[sort] - a[sort]);
  }, [data?.rows, search, sort]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await marketingCampaigns({ data: { preset, level, refresh: true } });
      await query.refetch();
    } finally {
      setRefreshing(false);
    }
  };

  const totals = data?.totals;

  return (
    <div className="space-y-6">
      <AdminHeading
        title="Campaign performance"
        description="Drill from campaigns into ad sets and individual ads."
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
          <div className="inline-flex rounded-xl bg-muted/60 p-1">
            {CAMPAIGN_LEVELS.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLevel(l)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all",
                  level === l
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Layers className="size-3.5" strokeWidth={1.75} />
                {levelLabel[l]}
              </button>
            ))}
          </div>

          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${levelLabel[level].toLowerCase()}…`}
              className="rounded-xl pl-9"
            />
          </div>

          <div className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-2 py-1.5">
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
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Spend", value: money(totals?.spend ?? 0, currency) },
              {
                label: "Meta purchases",
                value: (totals?.purchases ?? 0).toLocaleString("en-US"),
              },
              { label: "Reported ROAS", value: `${compact(totals?.roas ?? 0)}×` },
              { label: `${levelLabel[level]} with delivery`, value: String(rows.length) },
            ].map((s, i) => (
              <div
                key={s.label}
                style={{ animationDelay: `${i * 60}ms` }}
                className="admin-rise rounded-2xl border border-border bg-card p-4"
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  {s.label}
                </p>
                <p className="mt-1 text-xl font-bold tabular-nums text-foreground">{s.value}</p>
              </div>
            ))}
          </div>

          <Panel className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    <th className="px-4 py-3">{levelLabel[level].replace(/s$/, "")}</th>
                    <th className="px-3 py-3 text-right">Spend</th>
                    <th className="px-3 py-3 text-right">Purch.</th>
                    <th className="px-3 py-3 text-right">ROAS</th>
                    <th className="px-3 py-3 text-right">CPA</th>
                    <th className="px-3 py-3 text-right">CTR</th>
                    <th className="px-3 py-3 text-right">CPC</th>
                    <th className="px-3 py-3 text-right">CPM</th>
                    <th className="px-4 py-3 text-right">Freq.</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.id}
                      className="border-b border-border/60 transition-colors last:border-0 hover:bg-accent/40"
                    >
                      <td className="max-w-[280px] px-4 py-3">
                        <p className="truncate font-semibold text-foreground">{r.name}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <StatusPill row={r} />
                          {r.parentName ? (
                            <span className="truncate text-[11px] text-muted-foreground">
                              {r.parentName}
                            </span>
                          ) : null}
                          {r.dailyBudget ? (
                            <span className="text-[11px] text-muted-foreground">
                              {money(r.dailyBudget, currency)}/day
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums font-semibold">
                        {money(r.spend, currency)}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {r.purchases.toLocaleString("en-US")}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-3 text-right tabular-nums font-semibold",
                          r.roas >= 2
                            ? "text-emerald-600"
                            : r.roas > 0
                              ? "text-amber-600"
                              : "text-muted-foreground",
                        )}
                      >
                        {compact(r.roas)}×
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {r.costPerPurchase > 0 ? money(r.costPerPurchase, currency) : "—"}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">{pct(r.ctr)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {money(r.cpc, currency)}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {money(r.cpm, currency)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {compact(r.frequency)}
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-10 text-center text-sm text-muted-foreground">
                        No delivery in this window.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      ) : null}
    </div>
  );
}
