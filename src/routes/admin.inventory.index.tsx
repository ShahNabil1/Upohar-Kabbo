import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Boxes, CalendarClock, Coins, PackagePlus, TrendingUp, Warehouse } from "lucide-react";

import {
  inventoryBatches,
  inventoryLevels,
  inventoryMovements,
} from "@/lib/inventory.functions";
import { money, movementLabels } from "@/lib/inventory.shared";
import { EmptyState, Panel, StatCard, TipTitle } from "@/components/admin/kit";
import { ModuleHero } from "@/components/admin/module-hero";
import { ImportCatalogStockButton } from "@/components/admin/inventory/import-catalog";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/admin/inventory/")({
  component: InventoryDashboard,
});

function daysUntil(date: string): number {
  return Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
}

function InventoryDashboard() {
  const { data: levels = [], isLoading } = useQuery({
    queryKey: ["admin", "inventory", "levels"],
    queryFn: () => inventoryLevels(),
    staleTime: 60_000,
  });
  const { data: batches = [] } = useQuery({
    queryKey: ["admin", "inventory", "batches"],
    queryFn: () => inventoryBatches(),
    staleTime: 60_000,
  });
  const { data: moves = [] } = useQuery({
    queryKey: ["admin", "inventory", "movements", 12],
    queryFn: () => inventoryMovements({ data: { limit: 12 } }),
    staleTime: 30_000,
  });

  const kpi = useMemo(() => {
    const products = levels.filter((l) => l.kind === "product");
    const costValue = levels.reduce((s, l) => s + l.qtyOnHand * l.wacCost, 0);
    const retailValue = products.reduce((s, l) => s + l.qtyOnHand * l.sellPrice, 0);
    const units = levels.reduce((s, l) => s + l.qtyOnHand, 0);
    const low = products.filter(
      (l) => l.reorderPoint > 0 && l.qtyOnHand <= l.reorderPoint,
    ).length;
    const out = products.filter((l) => l.qtyOnHand <= 0).length;
    return { costValue, retailValue, units, low, out, skus: products.length };
  }, [levels]);

  const expiring = useMemo(
    () =>
      batches
        .filter((b) => b.expiryDate && daysUntil(b.expiryDate) <= 60)
        .sort((a, b) => (a.expiryDate! < b.expiryDate! ? -1 : 1))
        .slice(0, 6),
    [batches],
  );

  const lowStock = useMemo(
    () =>
      levels
        .filter((l) => l.kind === "product" && l.reorderPoint > 0 && l.qtyOnHand <= l.reorderPoint)
        .sort((a, b) => a.qtyOnHand - b.qtyOnHand)
        .slice(0, 8),
    [levels],
  );

  return (
    <div className="space-y-5">
      <ModuleHero
        eyebrow="Inventory · Overview"
        icon={Warehouse}
        accent="indigo"
        title="Inventory"
        description="Stock, batch cost and movement — all in one place."
        action={
          <div className="flex flex-wrap gap-2">
            <ImportCatalogStockButton />
            <Button asChild variant="outline" className="rounded-xl">
              <Link to="/admin/inventory/live">Live inventory</Link>
            </Button>

            <Button asChild className="ig-gradient rounded-xl transition-transform duration-300 hover:scale-[1.02]">
              <Link to="/admin/inventory/receive" search={{ items: undefined }}>
                <PackagePlus className="size-4" />
                Add inventory
              </Link>
            </Button>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Stock value (cost)"
          value={money(kpi.costValue)}
          icon={<Coins className="size-3.5" />}
          tip="On-hand quantity × weighted average purchase cost for each item. This is your capital tied up in stock."
          sub={`${kpi.units.toLocaleString("en-US")} units on hand`}
        />
        <StatCard
          label="Stock value (retail)"
          value={money(kpi.retailValue)}
          icon={<TrendingUp className="size-3.5" />}
          tip="The amount you'd earn if all stock sold at today's selling price."
          sub={`Potential margin ${money(kpi.retailValue - kpi.costValue)}`}
          tone="good"
        />
        <StatCard
          label="Low stock SKUs"
          value={String(kpi.low)}
          icon={<AlertTriangle className="size-3.5" />}
          tip="SKUs whose on-hand quantity has dropped to their reorder point — time to order now."
          tone={kpi.low > 0 ? "warn" : "default"}
        />
        <StatCard
          label="Out of stock"
          value={String(kpi.out)}
          icon={<Boxes className="size-3.5" />}
          tip={`Out of ${kpi.skus} tracked SKUs, the number with stock at zero or below.`}
          tone={kpi.out > 0 ? "bad" : "good"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel className="space-y-3">
          <TipTitle
            title="Reorder now"
            icon={<AlertTriangle className="size-4 text-amber-500" />}
            tip="Items that have reached their reorder point. Suggested quantity = the reorder quantity you set."
          />
          {isLoading ? (
            <p className="py-8 text-center text-xs text-muted-foreground">Loading…</p>
          ) : lowStock.length === 0 ? (
            <EmptyState title="Everything is above its reorder point" hint="No new orders needed." />
          ) : (
            <ul className="divide-y divide-border/70">
              {lowStock.map((l) => (
                <li key={l.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{l.name}</p>
                    <p className="font-en truncate text-[11px] text-muted-foreground">
                      {l.sku}
                      {l.variantLabel ? ` · ${l.variantLabel}` : ""}
                    </p>
                  </div>
                  <span className="font-en shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold tabular-nums text-amber-900">
                    {l.qtyOnHand} / {l.reorderPoint}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel className="space-y-3">
          <TipTitle
            title="Expiring batches"
            icon={<CalendarClock className="size-4 text-primary" />}
            tip="Batches expiring within the next 60 days. Sell the earliest-expiring batch first (FEFO)."
          />
          {expiring.length === 0 ? (
            <EmptyState title="No batch expires within 60 days" hint="Nothing to worry about expiry-wise right now." />
          ) : (
            <ul className="divide-y divide-border/70">
              {expiring.map((b) => {
                const d = daysUntil(b.expiryDate!);
                return (
                  <li key={b.id} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{b.name}</p>
                      <p className="font-en truncate text-[11px] text-muted-foreground">
                        {b.sku ?? "—"} · {b.qtyRemaining} left · {money(b.unitCost)}/unit
                      </p>
                    </div>
                    <span
                      className={`font-en shrink-0 rounded-full px-2.5 py-1 text-xs font-bold tabular-nums ${
                        d <= 14 ? "bg-rose-100 text-rose-900" : "bg-amber-100 text-amber-900"
                      }`}
                    >
                      {d <= 0 ? "expired" : `${d}d`}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      <Panel className="space-y-3">
        <TipTitle
          title="Recent movements"
          tip="A permanent record of every stock change — purchase, sale, return, damage or correction. It can never be deleted."
        />
        {moves.length === 0 ? (
          <EmptyState title="No stock movement yet" hint="It will appear here once you receive your first inventory." />
        ) : (
          <ul className="divide-y divide-border/70">
            {moves.map((m) => (
              <li key={m.id} className="flex items-center gap-3 py-2.5">
                <span
                  className={`grid size-7 shrink-0 place-items-center rounded-full ${
                    m.quantity > 0 ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                  }`}
                >
                  {m.quantity > 0 ? (
                    <ArrowUpRight className="size-4" />
                  ) : (
                    <ArrowDownRight className="size-4" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{m.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {movementLabels[m.movementType]}
                    {m.reason ? ` · ${m.reason}` : ""}
                    {m.actorName ? ` · ${m.actorName}` : ""}
                  </p>
                </div>
                <span className="font-en shrink-0 text-sm font-bold tabular-nums">
                  {m.quantity > 0 ? "+" : ""}
                  {m.quantity}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
