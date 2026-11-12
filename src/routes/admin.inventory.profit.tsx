import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Coins, Download, PiggyBank, Receipt, TrendingDown, TrendingUp } from "lucide-react";

import { profitReport } from "@/lib/profit.functions";
import { getAdminAccess } from "@/lib/staff.functions";
import { hasFlag } from "@/lib/rbac-shared";
import { money } from "@/lib/inventory.shared";
import { EmptyState, Panel, StatCard, StatusPill } from "@/components/admin/kit";
import { ModuleHero } from "@/components/admin/module-hero";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/admin/inventory/profit")({
  component: ProfitAndLoss,
  head: () => ({
    meta: [
      { title: "Profit & Loss · Inventory" },
      { name: "description", content: "Order-level profitability with COGS, packaging and courier cost." },
      { name: "robots", content: "noindex" },
    ],
  }),
});

const ranges = [7, 30, 90, 180] as const;
type Tab = "orders" | "products";

const pctText = (n: number) => `${n.toFixed(1)}%`;

function ProfitAndLoss() {
  const [days, setDays] = useState<number>(30);
  const [tab, setTab] = useState<Tab>("orders");

  const { data: access } = useQuery({ queryKey: ["admin-access"], queryFn: () => getAdminAccess() });
  const canExport = hasFlag(access, "flag:data.export");

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "profit", days],
    queryFn: () => profitReport({ data: { days } }),
    staleTime: 60_000,
  });

  const worst = useMemo(
    () => (data ? [...data.orders].sort((a, b) => a.netProfit - b.netProfit).slice(0, 5) : []),
    [data],
  );

  const exportCsv = () => {
    if (!data) return;
    const head =
      "Order,Date,Status,Revenue,COGS,Packaging,Courier fee,Returned value,Net profit,Margin %\n";
    const body = data.orders
      .map((r) =>
        [
          r.orderNumber,
          r.createdAt.slice(0, 10),
          r.status,
          r.revenue,
          r.cogs,
          r.packagingCost,
          r.courierFee,
          r.returnedValue,
          r.netProfit,
          r.margin,
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(","),
      )
      .join("\n");
    const url = URL.createObjectURL(new Blob([head + body], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `profit-${days}d-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const peak = useMemo(
    () => (data ? Math.max(1, ...data.daily.map((d) => Math.abs(d.revenue))) : 1),
    [data],
  );

  return (
    <div className="space-y-5">
      <ModuleHero
        eyebrow="Inventory · Finance"
        icon={PiggyBank}
        accent="emerald"
        title="Profit & Loss"
        description="True profit per order — sales minus product cost, packaging and courier charges."
        action={
          canExport ? (
            <Button size="sm" variant="outline" className="rounded-xl" onClick={exportCsv}>
              <Download className="mr-1.5 size-3.5" /> Export CSV
            </Button>
          ) : null
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        {ranges.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDays(d)}
            className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 hover:scale-[1.03] ${
              days === d
                ? "ig-gradient-soft border-primary/40 text-foreground"
                : "border-border bg-background/60 text-muted-foreground hover:border-primary/30"
            }`}
          >
            Last {d} days
          </button>
        ))}
      </div>

      {isLoading || !data ? (
        <p className="py-16 text-center text-xs text-muted-foreground">Calculating profit…</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Net revenue"
              value={money(data.totals.revenue)}
              icon={<Coins className="size-3.5" />}
              tip="Amount collected by the courier for delivered orders (falls back to order total if unavailable)."
              sub={`${data.totals.deliveredOrders} delivered · AOV ${money(data.totals.avgOrderValue)}`}
            />
            <StatCard
              label="Cost of goods"
              value={money(data.totals.cogs)}
              icon={<Receipt className="size-3.5" />}
              tip="Cost of goods at the purchase cost recorded in the ledger — excluding returned items."
              sub={`Gross profit ${money(data.totals.grossProfit)}`}
            />
            <StatCard
              label="Delivery + packaging"
              value={money(data.totals.courierFee + data.totals.packagingCost)}
              icon={<TrendingDown className="size-3.5" />}
              tone="warn"
              tip="Total cost of courier charges and packaging material used."
              sub={`Courier ${money(data.totals.courierFee)} · Pack ${money(data.totals.packagingCost)}`}
            />
            <StatCard
              label="Net profit"
              value={money(data.totals.netProfit)}
              icon={<PiggyBank className="size-3.5" />}
              tone={data.totals.netProfit >= 0 ? "good" : "bad"}
              tip="Profit left after deducting all costs. Ad spend is not included here."
              sub={`Margin ${pctText(data.totals.margin)} · ${money(data.totals.avgProfit)}/order`}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard
              label="RTO / lost cost"
              value={money(data.totals.rtoLoss)}
              tone={data.totals.rtoLoss > 0 ? "bad" : "default"}
              tip="Courier, packaging and product cost lost on returned and lost orders."
              sub={`${data.totals.lostOrders} orders`}
            />
            <StatCard
              label="Discount given"
              value={money(data.totals.discount)}
              tip="Total amount given via coupons and manual discounts in this period."
            />
            <StatCard
              label="Delivery charged"
              value={money(data.totals.deliveryCharge)}
              tip="Delivery charge collected from customers — against courier cost."
            />
          </div>

          <Panel className="space-y-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <TrendingUp className="size-4 text-primary" /> Daily revenue vs profit
            </h3>
            {data.daily.length === 0 ? (
              <EmptyState title="No delivered orders in this period" />
            ) : (
              <div className="flex h-40 items-end gap-1 overflow-x-auto">
                {data.daily.map((d) => (
                  <div key={d.date} className="group flex min-w-[14px] flex-1 flex-col items-center gap-1">
                    <div className="flex h-32 w-full items-end justify-center gap-[2px]">
                      <div
                        className="w-1/2 rounded-t bg-primary/25 transition-all duration-300 group-hover:bg-primary/40"
                        style={{ height: `${(Math.abs(d.revenue) / peak) * 100}%` }}
                        title={`Revenue ${money(d.revenue)}`}
                      />
                      <div
                        className={`w-1/2 rounded-t transition-all duration-300 ${
                          d.profit >= 0 ? "bg-emerald-500/70" : "bg-rose-500/70"
                        }`}
                        style={{ height: `${(Math.abs(d.profit) / peak) * 100}%` }}
                        title={`Profit ${money(d.profit)}`}
                      />
                    </div>
                    <span className="font-en text-[9px] text-muted-foreground">{d.date.slice(5)}</span>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          {worst.length > 0 ? (
            <Panel className="space-y-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <TrendingDown className="size-4 text-rose-600" /> Biggest loss makers
              </h3>
              <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {worst.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border/70 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <Link
                        to="/admin/orders/$id"
                        params={{ id: r.id }}
                        className="font-en truncate text-sm font-semibold hover:text-primary"
                      >
                        {r.orderNumber}
                      </Link>
                      <p className="truncate text-[11px] text-muted-foreground">{r.customerName}</p>
                    </div>
                    <span
                      className={`font-en text-sm font-bold tabular-nums ${
                        r.netProfit >= 0 ? "text-emerald-600" : "text-rose-600"
                      }`}
                    >
                      {money(r.netProfit)}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}

          <Panel className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              {(["orders", "products"] as Tab[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold capitalize transition-all duration-200 hover:scale-[1.03] ${
                    tab === t
                      ? "ig-gradient-soft border-primary/40 text-foreground"
                      : "border-border bg-background/60 text-muted-foreground hover:border-primary/30"
                  }`}
                >
                  {t === "orders" ? "Order P&L" : "Product profitability"}
                </button>
              ))}
            </div>

            {tab === "orders" ? (
              data.orders.length === 0 ? (
                <EmptyState title="No orders in this period" hint="Try extending the date range." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] text-sm">
                    <thead>
                      <tr className="border-b border-border text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                        <th className="px-2 py-2 text-left font-semibold">Order</th>
                        <th className="px-2 py-2 text-left font-semibold">Status</th>
                        <th className="px-2 py-2 text-right font-semibold">Revenue</th>
                        <th className="px-2 py-2 text-right font-semibold">COGS</th>
                        <th className="px-2 py-2 text-right font-semibold">Pack</th>
                        <th className="px-2 py-2 text-right font-semibold">Courier</th>
                        <th className="px-2 py-2 text-right font-semibold">Net profit</th>
                        <th className="px-2 py-2 text-right font-semibold">Margin</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.orders.slice(0, 300).map((r) => (
                        <tr key={r.id} className="border-b border-border/60 hover:bg-accent/50">
                          <td className="px-2 py-2.5">
                            <Link
                              to="/admin/orders/$id"
                              params={{ id: r.id }}
                              className="font-en font-semibold hover:text-primary"
                            >
                              {r.orderNumber}
                            </Link>
                            <p className="font-en text-[11px] text-muted-foreground">
                              {r.createdAt.slice(0, 10)} · {r.customerName}
                            </p>
                          </td>
                          <td className="px-2 py-2.5">
                            <StatusPill status={r.status} />
                          </td>
                          <td className="font-en px-2 py-2.5 text-right tabular-nums">{money(r.revenue)}</td>
                          <td className="font-en px-2 py-2.5 text-right tabular-nums">{money(r.cogs)}</td>
                          <td className="font-en px-2 py-2.5 text-right tabular-nums">
                            {money(r.packagingCost)}
                          </td>
                          <td className="font-en px-2 py-2.5 text-right tabular-nums">{money(r.courierFee)}</td>
                          <td
                            className={`font-en px-2 py-2.5 text-right font-bold tabular-nums ${
                              r.netProfit >= 0 ? "text-emerald-600" : "text-rose-600"
                            }`}
                          >
                            {money(r.netProfit)}
                          </td>
                          <td className="font-en px-2 py-2.5 text-right tabular-nums text-muted-foreground">
                            {pctText(r.margin)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : data.products.length === 0 ? (
              <EmptyState title="No product sales in this period" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                      <th className="px-2 py-2 text-left font-semibold">Product</th>
                      <th className="px-2 py-2 text-right font-semibold">Units</th>
                      <th className="px-2 py-2 text-right font-semibold">Revenue</th>
                      <th className="px-2 py-2 text-right font-semibold">COGS</th>
                      <th className="px-2 py-2 text-right font-semibold">Profit</th>
                      <th className="px-2 py-2 text-right font-semibold">Margin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.products.map((p) => (
                      <tr key={p.key} className="border-b border-border/60 hover:bg-accent/50">
                        <td className="max-w-[300px] px-2 py-2.5">
                          <p className="truncate font-medium">{p.name}</p>
                          <p className="font-en truncate text-[11px] text-muted-foreground">
                            {p.variantLabel ? `${p.variantLabel} · ` : ""}
                            {p.sku}
                          </p>
                        </td>
                        <td className="font-en px-2 py-2.5 text-right tabular-nums">{p.units}</td>
                        <td className="font-en px-2 py-2.5 text-right tabular-nums">{money(p.revenue)}</td>
                        <td className="font-en px-2 py-2.5 text-right tabular-nums">{money(p.cogs)}</td>
                        <td
                          className={`font-en px-2 py-2.5 text-right font-bold tabular-nums ${
                            p.profit >= 0 ? "text-emerald-600" : "text-rose-600"
                          }`}
                        >
                          {money(p.profit)}
                        </td>
                        <td className="font-en px-2 py-2.5 text-right tabular-nums text-muted-foreground">
                          {pctText(p.margin)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}
