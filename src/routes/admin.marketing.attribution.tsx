import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Boxes, Megaphone, Network, RefreshCw, TriangleAlert } from "lucide-react";

import { marketingAttribution } from "@/lib/marketing.functions";
import {
  MARKETING_PRESETS,
  presetLabel,
  type AttributionCampaignRow,
  type AttributionProductRow,
  type MarketingPreset,
} from "@/lib/marketing-shared";
import { AdminHeading, Panel } from "@/components/admin/kit";
import { BrandLoader } from "@/components/admin/brand-loader";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/marketing/attribution")({
  component: MarketingAttributionPage,
});

const money = (n: number, currency: string) =>
  `${currency === "USD" ? "$" : currency === "BDT" ? "৳" : `${currency} `}${n.toLocaleString(
    "en-US",
    { maximumFractionDigits: 0 },
  )}`;

const ratio = (n: number) => (n > 0 ? `${n.toFixed(2)}x` : "—");

const roasTone = (n: number) =>
  n <= 0 ? "text-muted-foreground" : n >= 2.5 ? "text-emerald-600" : n >= 1 ? "text-amber-600" : "text-rose-600";

type Tab = "products" | "campaigns" | "channels";

const TABS: { key: Tab; label: string; icon: typeof Boxes }[] = [
  { key: "products", label: "Products", icon: Boxes },
  { key: "campaigns", label: "Campaigns", icon: Megaphone },
  { key: "channels", label: "Channels", icon: Network },
];

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Panel className="space-y-1">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-xl font-extrabold tabular-nums">{value}</p>
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </Panel>
  );
}

function ProductTable({ rows, currency }: { rows: AttributionProductRow[]; currency: string }) {
  if (!rows.length) {
    return <p className="p-6 text-sm text-muted-foreground">No orders in this window.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[880px] text-sm">
        <thead>
          <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-2 text-left font-semibold">Product</th>
            <th className="px-3 py-2 text-right font-semibold">Units</th>
            <th className="px-3 py-2 text-right font-semibold">Orders</th>
            <th className="px-3 py-2 text-right font-semibold">Revenue</th>
            <th className="px-3 py-2 text-right font-semibold">Delivered</th>
            <th className="px-3 py-2 text-right font-semibold">Ad spend</th>
            <th className="px-3 py-2 text-right font-semibold">ROAS</th>
            <th className="px-3 py-2 text-right font-semibold">True ROAS</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={`${p.productId ?? p.name}`} className="border-b border-border/60 last:border-0">
              <td className="px-3 py-2.5">
                <p className="font-semibold text-foreground">{p.name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {p.topChannel.replace(/_/g, " ")}
                  {p.topCampaign ? ` · ${p.topCampaign}` : ""}
                </p>
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">{p.units}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{p.orders}</td>
              <td className="px-3 py-2.5 text-right font-semibold tabular-nums">
                {money(p.revenue, currency)}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                {money(p.deliveredRevenue, currency)}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">{money(p.spend, currency)}</td>
              <td className={cn("px-3 py-2.5 text-right font-bold tabular-nums", roasTone(p.roas))}>
                {ratio(p.roas)}
              </td>
              <td className={cn("px-3 py-2.5 text-right font-bold tabular-nums", roasTone(p.trueRoas))}>
                {ratio(p.trueRoas)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CampaignCards({ rows, currency }: { rows: AttributionCampaignRow[]; currency: string }) {
  if (!rows.length) {
    return <p className="p-6 text-sm text-muted-foreground">No attributed orders yet.</p>;
  }
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {rows.map((c) => (
        <Panel key={c.key} className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{c.campaignName}</p>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {c.channel.replace(/_/g, " ")}
                {c.campaignId ? ` · ${c.campaignId}` : ""}
              </p>
            </div>
            <span
              className={cn(
                "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase",
                c.matched
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
                  : "border-border bg-muted text-muted-foreground",
              )}
            >
              {c.matched ? "Spend matched" : "No spend match"}
            </span>
          </div>

          <div className="grid grid-cols-4 gap-2 text-center">
            {[
              ["Orders", String(c.orders)],
              ["Revenue", money(c.revenue, currency)],
              ["Spend", money(c.spend, currency)],
              ["ROAS", ratio(c.roas)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg bg-muted/50 px-2 py-1.5">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
                <p className={cn("text-xs font-bold tabular-nums", label === "ROAS" && roasTone(c.roas))}>
                  {value}
                </p>
              </div>
            ))}
          </div>

          {c.topProducts.length ? (
            <ul className="space-y-1">
              {c.topProducts.map((p) => (
                <li key={p.name} className="flex items-center justify-between gap-3 text-xs">
                  <span className="truncate text-muted-foreground">
                    {p.name} <span className="text-foreground/70">×{p.units}</span>
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums">{money(p.revenue, currency)}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </Panel>
      ))}
    </div>
  );
}

function MarketingAttributionPage() {
  const [preset, setPreset] = useState<MarketingPreset>("30d");
  const [tab, setTab] = useState<Tab>("products");

  const query = useQuery({
    queryKey: ["marketing-attribution", preset],
    queryFn: () => marketingAttribution({ data: { preset } }),
    staleTime: 60_000,
  });

  const data = query.data;
  const currency = data?.currency ?? "BDT";

  const trackedPct = useMemo(() => {
    if (!data || data.totals.orders === 0) return 0;
    return (data.totals.trackedOrders / data.totals.orders) * 100;
  }, [data]);

  return (
    <div className="space-y-4">
      <AdminHeading
        title="Product Attribution"
        description="Which campaigns actually sell which products — real orders matched to Meta spend."
      />

      <div className="flex flex-wrap items-center gap-2">
        {MARKETING_PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPreset(p)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
              preset === p
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {presetLabel[p]}
          </button>
        ))}
        <Button
          size="sm"
          variant="outline"
          className="ml-auto"
          onClick={() => {
            void marketingAttribution({ data: { preset, refresh: true } }).then(() => query.refetch());
          }}
          disabled={query.isFetching}
        >
          <RefreshCw className={cn("size-3.5", query.isFetching && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {query.isLoading ? (
        <BrandLoader />
      ) : !data ? (
        <Panel>
          <p className="text-sm text-muted-foreground">Could not load the attribution report.</p>
        </Panel>
      ) : (
        <>
          {data.message ? (
            <Panel className="flex items-start gap-2 border-amber-500/30 bg-amber-500/5">
              <TriangleAlert className="mt-0.5 size-4 text-amber-600" />
              <p className="text-xs text-amber-700 dark:text-amber-500">{data.message}</p>
            </Panel>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat
              label="Revenue"
              value={money(data.totals.revenue, currency)}
              hint={`${data.totals.orders} orders · delivered ${money(data.totals.deliveredRevenue, currency)}`}
            />
            <Stat
              label="Ad spend"
              value={money(data.totals.spend, currency)}
              hint={`${money(data.totals.matchedSpend, currency)} matched to orders`}
            />
            <Stat label="Blended ROAS" value={ratio(data.totals.roas)} hint={`True ROAS ${ratio(data.totals.trueRoas)}`} />
            <Stat
              label="Tracked orders"
              value={`${trackedPct.toFixed(0)}%`}
              hint={`${data.totals.trackedOrders} tracked · ${data.totals.untrackedOrders} without parameters`}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                  tab === t.key
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                <t.icon className="size-3.5" />
                {t.label}
              </button>
            ))}
          </div>

          {tab === "products" ? (
            <Panel className="p-0">
              <ProductTable rows={data.products} currency={currency} />
            </Panel>
          ) : tab === "campaigns" ? (
            <CampaignCards rows={data.campaigns} currency={currency} />
          ) : (
            <Panel className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-2 text-left font-semibold">Channel</th>
                      <th className="px-3 py-2 text-right font-semibold">Orders</th>
                      <th className="px-3 py-2 text-right font-semibold">Revenue</th>
                      <th className="px-3 py-2 text-right font-semibold">Delivered</th>
                      <th className="px-3 py-2 text-right font-semibold">Spend</th>
                      <th className="px-3 py-2 text-right font-semibold">ROAS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.channels.map((c) => (
                      <tr key={c.channel} className="border-b border-border/60 last:border-0">
                        <td className="px-3 py-2.5 font-semibold capitalize">{c.channel.replace(/_/g, " ")}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{c.orders}</td>
                        <td className="px-3 py-2.5 text-right font-semibold tabular-nums">
                          {money(c.revenue, currency)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                          {money(c.deliveredRevenue, currency)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{money(c.spend, currency)}</td>
                        <td className={cn("px-3 py-2.5 text-right font-bold tabular-nums", roasTone(c.roas))}>
                          {ratio(c.roas)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}
        </>
      )}
    </div>
  );
}
