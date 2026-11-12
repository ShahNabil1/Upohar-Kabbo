import type { Db } from "./admin.server";
import { unwrap } from "./admin.server";
import { LEVEL_SELECT, mapLevel } from "./inventory.server";
import type { InventoryReport, MovementType } from "./inventory.shared";

type Row = Record<string, any>;

const keyOf = (r: { productId?: string | null; variantId?: string | null; packagingId?: string | null }) =>
  r.packagingId ? `pk:${r.packagingId}` : `pr:${r.productId ?? ""}:${r.variantId ?? ""}`;

const ledgerKey = (r: Row) =>
  r["packaging_id"]
    ? `pk:${r["packaging_id"]}`
    : `pr:${r["product_id"] ?? ""}:${r["variant_id"] ?? ""}`;

/**
 * Period report built from the immutable ledger + current levels.
 * Outflow value uses the ledger's stored unit cost (WAC at the time of
 * the movement), so COGS never drifts when today's WAC changes.
 */
export async function buildInventoryReport(db: Db, days: number): Promise<InventoryReport> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const levelRows = unwrap(
    await db.from("inventory_levels").select(LEVEL_SELECT).limit(3000),
  ) as unknown as Row[];
  const levels = levelRows.map(mapLevel);

  const ledger = unwrap(
    await db
      .from("stock_ledger")
      .select("product_id,variant_id,packaging_id,movement_type,quantity,unit_cost,created_at")
      .gte("created_at", since)
      .limit(20000),
  ) as unknown as Row[];

  const byKey = new Map(levels.map((l) => [keyOf(l), l]));

  const flow = {
    purchaseQty: 0,
    purchaseValue: 0,
    soldQty: 0,
    cogs: 0,
    returnQty: 0,
    returnValue: 0,
    writeOffQty: 0,
    writeOffValue: 0,
    packagingQty: 0,
    packagingValue: 0,
    adjustNetQty: 0,
  };

  const moved = new Map<string, { qty: number; value: number }>();

  for (const r of ledger) {
    const type = r["movement_type"] as MovementType;
    const qty = Number(r["quantity"] ?? 0);
    const cost = Number(r["unit_cost"] ?? 0);
    const abs = Math.abs(qty);
    const value = abs * cost;

    switch (type) {
      case "purchase_in":
        flow.purchaseQty += abs;
        flow.purchaseValue += value;
        break;
      case "sale_out":
      case "exchange_out": {
        flow.soldQty += abs;
        flow.cogs += value;
        const k = ledgerKey(r);
        const cur = moved.get(k) ?? { qty: 0, value: 0 };
        moved.set(k, { qty: cur.qty + abs, value: cur.value + value });
        break;
      }
      case "return_in":
      case "exchange_in":
        flow.returnQty += abs;
        flow.returnValue += value;
        break;
      case "damage_out":
      case "loss_out":
      case "expiry_out":
        flow.writeOffQty += abs;
        flow.writeOffValue += value;
        break;
      case "packaging_out":
        flow.packagingQty += abs;
        flow.packagingValue += value;
        break;
      case "adjust_in":
      case "adjust_out":
      case "reversal":
        flow.adjustNetQty += qty;
        break;
    }
  }

  const products = levels.filter((l) => l.kind === "product");
  const packaging = levels.filter((l) => l.kind === "packaging");

  const valueAt = (list: typeof levels) => ({
    units: list.reduce((s, r) => s + r.qtyOnHand, 0),
    cost: list.reduce((s, r) => s + r.qtyOnHand * r.wacCost, 0),
    retail: list.reduce((s, r) => s + r.qtyOnHand * r.sellPrice, 0),
    skus: list.length,
  });

  const topMovers = [...moved.entries()]
    .map(([k, v]) => {
      const lvl = byKey.get(k);
      return {
        key: k,
        name: lvl?.name ?? "Unknown item",
        variantLabel: lvl?.variantLabel ?? null,
        sku: lvl?.sku ?? "—",
        qty: v.qty,
        cogs: v.value,
        onHand: lvl?.qtyOnHand ?? 0,
        daysCover: v.qty > 0 ? ((lvl?.qtyOnHand ?? 0) / (v.qty / days)) : null,
      };
    })
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 12);

  const deadStock = products
    .filter((l) => l.qtyOnHand > 0 && !moved.has(keyOf(l)))
    .map((l) => ({
      key: keyOf(l),
      name: l.name,
      variantLabel: l.variantLabel,
      sku: l.sku,
      onHand: l.qtyOnHand,
      costValue: l.qtyOnHand * l.wacCost,
      lastMovementAt: l.lastMovementAt,
      idleDays: l.lastMovementAt
        ? Math.floor((Date.now() - new Date(l.lastMovementAt).getTime()) / 86_400_000)
        : null,
    }))
    .sort((a, b) => b.costValue - a.costValue)
    .slice(0, 20);

  const reorderPlan = levels
    .filter((l) => l.reorderPoint > 0 && l.qtyOnHand <= l.reorderPoint)
    .map((l) => {
      const sold = moved.get(keyOf(l))?.qty ?? 0;
      const perDay = sold / days;
      const suggestQty = Math.max(
        l.reorderQty > 0 ? l.reorderQty : 0,
        Math.ceil(perDay * 14) - l.qtyOnHand,
        l.reorderPoint - l.qtyOnHand,
        1,
      );
      return {
        key: keyOf(l),
        name: l.name,
        variantLabel: l.variantLabel,
        sku: l.sku,
        kind: l.kind,
        onHand: l.qtyOnHand,
        reorderPoint: l.reorderPoint,
        suggestQty,
        estimatedCost: suggestQty * l.wacCost,
        daysCover: perDay > 0 ? l.qtyOnHand / perDay : null,
      };
    })
    .sort((a, b) => (a.daysCover ?? 9999) - (b.daysCover ?? 9999));

  return {
    days,
    generatedAt: new Date().toISOString(),
    valuation: {
      product: valueAt(products),
      packaging: valueAt(packaging),
      outOfStock: products.filter((l) => l.qtyOnHand <= 0).length,
      lowStock: products.filter((l) => l.reorderPoint > 0 && l.qtyOnHand > 0 && l.qtyOnHand <= l.reorderPoint)
        .length,
    },
    flow,
    topMovers,
    deadStock,
    reorderPlan,
  };
}
