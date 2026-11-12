import type { Db } from "./admin.server";
import { LEVEL_SELECT, computeComboAvailability, mapLevel } from "./inventory.server";
import type { AlertSeverity, StockAlert, StockAlertReport } from "./stock-alert.shared";

const DEAD_DAYS = 60;

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86_400_000);
}

const sevRank: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 };

/**
 * Reads the ledger-derived levels, combo recipes and open purchase orders and
 * turns them into one prioritised action list for the inventory team.
 */
export async function buildStockAlerts(db: Db): Promise<StockAlertReport> {
  const [levelRes, productRes, poRes, combos] = await Promise.all([
    db.from("inventory_levels").select(LEVEL_SELECT).limit(3000),
    db.from("products").select("id,is_active,kind"),
    db
      .from("purchase_orders")
      .select("id,po_number,status,expected_at,total")
      .in("status", ["ordered", "partial"])
      .limit(200),
    computeComboAvailability(db),
  ]);

  const levels = ((levelRes.data ?? []) as unknown as Array<Record<string, unknown>>).map(mapLevel);
  const products = new Map<string, { active: boolean; kind: string }>();
  for (const p of (productRes.data ?? []) as Array<Record<string, any>>) {
    products.set(String(p["id"]), {
      active: Boolean(p["is_active"]),
      kind: String(p["kind"] ?? "simple"),
    });
  }

  const alerts: StockAlert[] = [];
  const push = (a: StockAlert) => alerts.push(a);

  for (const l of levels) {
    const meta = l.productId ? products.get(l.productId) : null;
    const isSellable = l.kind === "packaging" ? true : Boolean(meta?.active);
    const unitCost = l.wacCost || 0;
    const base = {
      name: l.name,
      variantLabel: l.variantLabel,
      sku: l.sku,
      onHand: l.qtyOnHand,
      reorderPoint: l.reorderPoint || null,
      link: l.kind === "packaging" ? "/admin/inventory/suppliers" : "/admin/inventory/live",
    };

    if (l.qtyOnHand < 0) {
      push({
        ...base,
        id: `${l.id}:negative`,
        kind: "negative_stock",
        severity: "critical",
        detail: `On hand shows ${l.qtyOnHand} — a ledger audit is needed.`,
        suggestQty: 0,
        valueAtRisk: Math.abs(l.qtyOnHand) * unitCost,
      });
      continue;
    }

    if (isSellable && l.qtyOnHand === 0) {
      push({
        ...base,
        id: `${l.id}:oos`,
        kind: "out_of_stock",
        severity: "critical",
        detail: "Stock is zero — sales are being lost.",
        suggestQty: l.reorderQty || l.reorderPoint || 0,
        valueAtRisk: 0,
      });
    } else if (l.reorderPoint > 0 && l.qtyOnHand <= l.reorderPoint) {
      push({
        ...base,
        id: `${l.id}:low`,
        kind: "low_stock",
        severity: "warning",
        detail: `On hand ${l.qtyOnHand}, reorder point ${l.reorderPoint}.`,
        suggestQty: Math.max(l.reorderQty || 0, l.reorderPoint - l.qtyOnHand),
        valueAtRisk: 0,
      });
    }

    if (isSellable && l.reorderPoint === 0 && l.qtyOnHand > 0) {
      push({
        ...base,
        id: `${l.id}:norule`,
        kind: "no_reorder_rule",
        severity: "info",
        detail: "No reorder point set.",
        suggestQty: 0,
        valueAtRisk: 0,
      });
    }

    const idle = daysSince(l.lastMovementAt);
    if (l.qtyOnHand > 0 && (idle == null || idle >= DEAD_DAYS)) {
      push({
        ...base,
        id: `${l.id}:dead`,
        kind: "dead_stock",
        severity: "info",
        detail:
          idle == null
            ? "No movement recorded."
            : `No movement for ${idle} days.`,
        suggestQty: 0,
        valueAtRisk: l.qtyOnHand * unitCost,
      });
    }
  }

  for (const c of combos) {
    if (!c.isActive || c.buildable > 0) continue;
    const blocker = c.items.find((i) => i.bottleneck) ?? c.items[0];
    push({
      id: `${c.id}:combo`,
      kind: "combo_blocked",
      severity: "critical",
      name: c.name,
      variantLabel: null,
      sku: c.sku ?? "—",
      detail: blocker
        ? `${blocker.name} is out of stock (on hand ${blocker.onHand}, needs ${blocker.perBox}/box).`
        : "No item has been added to this combo.",
      onHand: 0,
      reorderPoint: null,
      suggestQty: 0,
      valueAtRisk: 0,
      link: "/admin/inventory/combos",
    });
  }

  const today = new Date().toISOString().slice(0, 10);
  for (const po of (poRes.data ?? []) as Array<Record<string, any>>) {
    const expected = po["expected_at"] ? String(po["expected_at"]).slice(0, 10) : null;
    if (!expected || expected >= today) continue;
    push({
      id: `${po["id"]}:po`,
      kind: "po_overdue",
      severity: "warning",
      name: `PO ${po["po_number"] ?? ""}`.trim(),
      variantLabel: null,
      sku: String(po["po_number"] ?? "—"),
      detail: `Expected ${expected} — not fully received yet.`,
      onHand: null,
      reorderPoint: null,
      suggestQty: 0,
      valueAtRisk: Number(po["total"] ?? 0),
      link: "/admin/inventory/purchase-orders",
    });
  }

  alerts.sort(
    (a, b) =>
      sevRank[a.severity] - sevRank[b.severity] ||
      b.valueAtRisk - a.valueAtRisk ||
      a.name.localeCompare(b.name),
  );

  const byKindMap = new Map<StockAlert["kind"], number>();
  for (const a of alerts) byKindMap.set(a.kind, (byKindMap.get(a.kind) ?? 0) + 1);

  return {
    generatedAt: new Date().toISOString(),
    counts: {
      critical: alerts.filter((a) => a.severity === "critical").length,
      warning: alerts.filter((a) => a.severity === "warning").length,
      info: alerts.filter((a) => a.severity === "info").length,
      total: alerts.length,
    },
    byKind: [...byKindMap.entries()].map(([kind, count]) => ({ kind, count })),
    capitalAtRisk: alerts.reduce((s, a) => s + a.valueAtRisk, 0),
    alerts: alerts.slice(0, 400),
  };
}
