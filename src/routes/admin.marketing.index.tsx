import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BadgeDollarSign,
  Eye,
  MousePointerClick,
  Package,
  RefreshCw,
  ShoppingBag,
  Target,
  TriangleAlert,
  Truck,
  Wallet,
} from "lucide-react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { marketingOverview } from "@/lib/marketing.functions";
import {
  MARKETING_PRESETS,
  presetLabel,
  type MarketingPreset,
} from "@/lib/marketing-shared";
import { AdminHeading, Panel } from "@/components/admin/kit";
import { BrandLoader } from "@/components/admin/brand-loader";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/marketing/")({
  component: MarketingOverviewPage,
});

const bdt = (n: number) =>
  `৳ ${Math.round(n).toLocaleString("en-US")}`;

const money = (n: number, currency: string) =>
  `${currency === "USD" ? "$" : `${currency} `}${n.toLocaleString("en-US", {
    maximumFractionDigits: 2,
  })}`;

const compact = (n: number) =>
  n.toLocaleString("en-US", { maximumFractionDigits: n < 100 ? 2 : 0 });

const pct = (n: number) => `${n.toFixed(n < 10 ? 2 : 1)}%`;

function delta(current: number, previous: number) {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
}

function Trend({ value }: { value: number | null }) {
  if (value === null || !Number.isFinite(value)) return null;
  const up = value >= 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
        up ? "bg-emerald-500/10 text-emerald-600" : "bg-rose-500/10 text-rose-600",
      )}
    >
      {up ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
      {Math.abs(value).toFixed(1)}%
    </span>
  );
}

function HeroCard({
  label,
  value,
  hint,
  trend,
  icon: Icon,
  accent,
  delay,
}: {
  label: string;
  value: string;
  hint: string;
  trend?: number | null;
  icon: typeof Target;
  accent?: boolean;
  delay: number;
}) {
  return (
    <div
      style={{ animationDelay: `${delay}ms` }}
      className={cn(
        "admin-rise relative overflow-hidden rounded-2xl border p-5 transition-colors duration-200",
        accent
          ? "border-primary/30 bg-primary/5 hover:border-primary/50"
          : "border-border bg-card hover:border-primary/25",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="inline-flex size-9 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <Icon className="size-4.5" strokeWidth={1.75} />
        </div>
        {trend !== undefined ? <Trend value={trend ?? null} /> : null}
      </div>
      <p className="mt-3 text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-foreground">
        {value}
      </p>
      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{hint}</p>
    </div>
  );
}

function MiniStat({
  label,
  value,
  sub,
  icon: Icon,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: typeof Target;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-background/60 p-3.5">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="size-3.5" strokeWidth={1.75} />
        <span className="text-[11px] font-semibold uppercase tracking-[0.06em]">{label}</span>
      </div>
      <p className="mt-1.5 text-lg font-bold tabular-nums text-foreground">{value}</p>
      {sub ? <p className="text-[11px] text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

function MarketingOverviewPage() {
  const [preset, setPreset] = useState<MarketingPreset>("7d");
  const [refreshing, setRefreshing] = useState(false);

  const query = useQuery({
    queryKey: ["admin", "marketing", "overview", preset],
    queryFn: () => marketingOverview({ data: { preset } }),
    staleTime: 60_000,
  });

  const data = query.data;

  const refresh = async () => {
    setRefreshing(true);
    try {
      await marketingOverview({ data: { preset, refresh: true } });
      await query.refetch();
    } finally {
      setRefreshing(false);
    }
  };

  const currency = data?.currency ?? "USD";

  return (
    <div className="space-y-6">
      <AdminHeading
        title="Marketing Overview"
        description="Meta ad performance measured against real store revenue."
        action={
          <Button
            variant="outline"
            className="rounded-xl"
            onClick={() => void refresh()}
            disabled={refreshing || query.isFetching}
          >
            <RefreshCw className={cn("size-4", (refreshing || query.isFetching) && "animate-spin")} />
            Refresh
          </Button>
        }
      />

      <div className="admin-rise flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-2">
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
          <span className="ml-auto pr-2 text-[11px] text-muted-foreground">
            {data.range.since} → {data.range.until}
            {data.accountName ? ` · ${data.accountName}` : ""}
          </span>
        ) : null}
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
                {data.message ?? "Connect the Meta Marketing API from Settings → API & Integrations."}
                {" "}Store metrics below are still live.
              </p>
            </div>
          </div>
        </Panel>
      ) : null}

      {data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <HeroCard
              delay={0}
              accent
              icon={Target}
              label="Blended ROAS"
              value={`${compact(data.blendedRoas)}×`}
              hint="All store revenue ÷ Meta ad spend"
              trend={delta(data.blendedRoas, data.blendedRoasPrevious)}
            />
            <HeroCard
              delay={60}
              icon={Truck}
              label="True ROAS (delivered)"
              value={`${compact(data.trueRoas)}×`}
              hint="Only delivered / partially delivered revenue"
              trend={delta(data.trueRoas, data.trueRoasPrevious)}
            />
            <HeroCard
              delay={120}
              icon={Wallet}
              label="Ad spend"
              value={money(data.meta.spend, currency)}
              hint={`${pct(data.spendShare)} of store revenue`}
              trend={delta(data.meta.spend, data.metaPrevious.spend)}
            />
            <HeroCard
              delay={180}
              icon={BadgeDollarSign}
              label="Store revenue"
              value={bdt(data.orders.revenue)}
              hint={`${bdt(data.orders.deliveredRevenue)} delivered`}
              trend={delta(data.orders.revenue, data.ordersPrevious.revenue)}
            />
          </div>

          <Panel>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold tracking-tight">Spend vs revenue</h2>
                <p className="text-xs text-muted-foreground">
                  Daily ad spend against real orders captured in the store.
                </p>
              </div>
            </div>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data.series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(v: string) => v.slice(5)}
                    tick={{ fontSize: 11 }}
                    stroke="hsl(var(--muted-foreground))"
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    stroke="hsl(var(--muted-foreground))"
                    tickLine={false}
                    axisLine={false}
                    width={54}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid hsl(var(--border))",
                      background: "hsl(var(--card))",
                      fontSize: 12,
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    name="Store revenue (৳)"
                    stroke="hsl(var(--primary))"
                    fill="url(#revFill)"
                    strokeWidth={2}
                  />
                  <Bar
                    dataKey="spend"
                    name={`Ad spend (${currency})`}
                    fill="hsl(var(--muted-foreground))"
                    radius={[6, 6, 0, 0]}
                    barSize={14}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel>
              <h2 className="text-sm font-bold tracking-tight">Meta delivery & engagement</h2>
              <p className="mb-4 text-xs text-muted-foreground">
                What the ads bought during this window.
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <MiniStat
                  icon={Eye}
                  label="Impressions"
                  value={data.meta.impressions.toLocaleString("en-US")}
                  sub={`Reach ${data.meta.reach.toLocaleString("en-US")}`}
                />
                <MiniStat
                  icon={MousePointerClick}
                  label="Clicks"
                  value={data.meta.clicks.toLocaleString("en-US")}
                  sub={`CTR ${pct(data.meta.ctr)}`}
                />
                <MiniStat
                  icon={Activity}
                  label="Frequency"
                  value={compact(data.meta.frequency)}
                  sub={`CPM ${money(data.meta.cpm, currency)}`}
                />
                <MiniStat
                  icon={Wallet}
                  label="CPC"
                  value={money(data.meta.cpc, currency)}
                  sub={`LPV ${data.meta.landingPageViews.toLocaleString("en-US")}`}
                />
                <MiniStat
                  icon={ShoppingBag}
                  label="Add to cart"
                  value={data.meta.addToCart.toLocaleString("en-US")}
                  sub={`Checkout ${data.meta.initiateCheckout.toLocaleString("en-US")}`}
                />
                <MiniStat
                  icon={Target}
                  label="Meta purchases"
                  value={data.meta.purchases.toLocaleString("en-US")}
                  sub={`Reported ROAS ${compact(data.meta.roas)}×`}
                />
              </div>
            </Panel>

            <Panel>
              <h2 className="text-sm font-bold tracking-tight">Store truth</h2>
              <p className="mb-4 text-xs text-muted-foreground">
                Real orders in the same window — the number Meta cannot see.
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <MiniStat
                  icon={Package}
                  label="Orders"
                  value={data.orders.orders.toLocaleString("en-US")}
                  sub={`${data.orders.pendingOrders} pending`}
                />
                <MiniStat
                  icon={Truck}
                  label="Delivered"
                  value={data.orders.deliveredOrders.toLocaleString("en-US")}
                  sub={`Rate ${pct(data.orders.deliveryRate)}`}
                />
                <MiniStat
                  icon={TriangleAlert}
                  label="Cancelled"
                  value={data.orders.cancelledOrders.toLocaleString("en-US")}
                  sub="Cancelled / returned"
                />
                <MiniStat
                  icon={BadgeDollarSign}
                  label="AOV"
                  value={bdt(data.orders.averageOrderValue)}
                  sub="Average order value"
                />
                <MiniStat
                  icon={Wallet}
                  label="Cost / order"
                  value={money(data.costPerOrder, currency)}
                  sub="Ad spend ÷ orders"
                />
                <MiniStat
                  icon={Target}
                  label="Cost / delivered"
                  value={money(data.costPerDeliveredOrder, currency)}
                  sub="True acquisition cost"
                />
              </div>
              <p className="mt-4 rounded-xl bg-muted/60 p-3 text-[11px] leading-relaxed text-muted-foreground">
                Meta reports {data.meta.purchases.toLocaleString("en-US")} purchases while the store
                recorded {data.orders.orders.toLocaleString("en-US")} orders. Gaps here are normal
                until server-side Conversions API tracking is enabled — blended and true ROAS above
                stay accurate regardless, because they use store data.
              </p>
            </Panel>
          </div>
        </>
      ) : null}
    </div>
  );
}
