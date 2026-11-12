import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BellRing, Download, RefreshCw } from "lucide-react";

import { stockAlerts } from "@/lib/stock-alert.functions";
import { money } from "@/lib/inventory.shared";
import {
  alertHints,
  alertLabels,
  type AlertKind,
  type AlertSeverity,
} from "@/lib/stock-alert.shared";
import { EmptyState, InfoTip, Panel, StatCard } from "@/components/admin/kit";
import { ModuleHero } from "@/components/admin/module-hero";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/admin/inventory/alerts")({
  component: StockAlertsPage,
  head: () => ({
    meta: [
      { title: "Stock Alerts · Upoharkabbo Admin" },
      { name: "description", content: "Inventory alerts: stock-outs, reorder points, dead stock and late purchase orders." },
      { property: "og:title", content: "Stock Alerts · Upoharkabbo Admin" },
      { property: "og:description", content: "Prioritised inventory action list for the Upoharkabbo warehouse team." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const sevTone: Record<AlertSeverity, string> = {
  critical: "border-destructive/40 bg-destructive/10 text-destructive",
  warning: "border-amber-500/40 bg-amber-500/10 text-amber-600",
  info: "border-border bg-muted/40 text-muted-foreground",
};

const sevLabel: Record<AlertSeverity, string> = {
  critical: "Critical",
  warning: "Warning",
  info: "Info",
};

function StockAlertsPage() {
  const [kind, setKind] = useState<AlertKind | "all">("all");
  const [severity, setSeverity] = useState<AlertSeverity | "all">("all");

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["admin", "inventory", "alerts"],
    queryFn: () => stockAlerts(),
    staleTime: 60_000,
  });

  const rows = useMemo(() => {
    const all = data?.alerts ?? [];
    return all.filter(
      (a) => (kind === "all" || a.kind === kind) && (severity === "all" || a.severity === severity),
    );
  }, [data, kind, severity]);

  const exportCsv = () => {
    const head = "Severity,Type,SKU,Item,Variant,On hand,Reorder point,Suggested qty,Value at risk,Detail\n";
    const body = rows
      .map((r) =>
        [
          r.severity,
          alertLabels[r.kind],
          r.sku,
          r.name,
          r.variantLabel ?? "",
          r.onHand ?? "",
          r.reorderPoint ?? "",
          r.suggestQty,
          Math.round(r.valueAtRisk),
          r.detail,
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(","),
      )
      .join("\n");
    const url = URL.createObjectURL(new Blob([head + body], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `stock-alerts-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <ModuleHero
        eyebrow="Inventory · Health"
        icon={BellRing}
        accent="amber"
        title="Stock alerts"
        description="Stock-outs, reorders, negative stock, unbuilt combos, dead stock and late POs — all in one place, sorted by priority."
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {(["all", "critical", "warning", "info"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSeverity(s)}
              className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 hover:scale-[1.03] ${
                severity === s
                  ? "ig-gradient-soft border-primary/40 text-foreground"
                  : "border-border bg-background/60 text-muted-foreground hover:border-primary/30"
              }`}
            >
              {s === "all" ? "All" : sevLabel[s]}
              {data && s !== "all" ? ` · ${data.counts[s]}` : ""}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={rows.length === 0}>
            <Download className="mr-1.5 h-3.5 w-3.5" />
            CSV
          </Button>
        </div>
      </div>

      {isLoading || !data ? (
        <p className="py-16 text-center text-xs text-muted-foreground">Scanning inventory…</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Critical"
              value={String(data.counts.critical)}
              tone={data.counts.critical > 0 ? "bad" : "good"}
              tip="Needs attention today — sales are blocked or figures are wrong."
            />
            <StatCard
              label="Warning"
              value={String(data.counts.warning)}
              tip="Will run out of stock within a few days if not addressed."
            />
            <StatCard label="Info" value={String(data.counts.info)} tip="Worth monitoring, not urgent." />
            <StatCard
              label="Capital at risk"
              value={money(data.capitalAtRisk)}
              tip="Estimated capital tied up in dead or problematic stock."
            />
          </div>

          <Panel className="space-y-3">
            <div>
              <h2 className="text-sm font-bold tracking-tight">Alert types</h2>
              <p className="text-[11px] text-muted-foreground">Filter by type.</p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setKind("all")}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                  kind === "all" ? "ig-gradient-soft border-primary/40" : "border-border bg-background/60"
                }`}
              >
                All types · {data.counts.total}
              </button>
              {data.byKind.map((k) => (
                <button
                  key={k.kind}
                  type="button"
                  onClick={() => setKind(k.kind)}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${
                    kind === k.kind
                      ? "ig-gradient-soft border-primary/40"
                      : "border-border bg-background/60 text-muted-foreground"
                  }`}
                >
                  {alertLabels[k.kind]} · {k.count}
                  <InfoTip text={alertHints[k.kind]} />
                </button>
              ))}
            </div>
          </Panel>

          <Panel className="space-y-3">
            <div>
              <h2 className="text-sm font-bold tracking-tight">Action list</h2>
              <p className="text-[11px] text-muted-foreground">Sorted by severity and value at risk.</p>
            </div>

            {rows.length === 0 ? (
              <EmptyState title="All clear" hint="No alerts for this filter." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-xs">
                  <thead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    <tr className="border-b border-border">
                      <th className="py-2 pr-3">Item</th>
                      <th className="py-2 pr-3">Type</th>
                      <th className="py-2 pr-3 text-right">On hand</th>
                      <th className="py-2 pr-3 text-right">Reorder pt</th>
                      <th className="py-2 pr-3 text-right">Suggest</th>
                      <th className="py-2 pr-3 text-right">At risk</th>
                      <th className="py-2 pr-3">Detail</th>
                      <th className="py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="border-b border-border/60 last:border-0">
                        <td className="py-2.5 pr-3">
                          <p className="font-semibold text-foreground">{r.name}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {r.sku}
                            {r.variantLabel ? ` · ${r.variantLabel}` : ""}
                          </p>
                        </td>
                        <td className="py-2.5 pr-3">
                          <span
                            className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold ${sevTone[r.severity]}`}
                          >
                            {alertLabels[r.kind]}
                          </span>
                        </td>
                        <td className="py-2.5 pr-3 text-right tabular-nums">{r.onHand ?? "—"}</td>
                        <td className="py-2.5 pr-3 text-right tabular-nums">{r.reorderPoint ?? "—"}</td>
                        <td className="py-2.5 pr-3 text-right tabular-nums">
                          {r.suggestQty > 0 ? r.suggestQty : "—"}
                        </td>
                        <td className="py-2.5 pr-3 text-right tabular-nums">
                          {r.valueAtRisk > 0 ? money(r.valueAtRisk) : "—"}
                        </td>
                        <td className="py-2.5 pr-3 text-muted-foreground">{r.detail}</td>
                        <td className="py-2.5 text-right">
                          <Link
                            to={r.link}
                            className="rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold hover:border-primary/40"
                          >
                            Open
                          </Link>
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
