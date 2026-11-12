import type { Db } from "./admin.server";
import { unwrap } from "./admin.server";
import { LEVEL_SELECT, mapLevel } from "./inventory.server";
import type { MovementType } from "./inventory.shared";
import { periodBounds, type ClosingLine, type ClosingPreview, type ClosingRow } from "./closing.shared";

type Row = Record<string, any>;

const keyOf = (r: { productId?: string | null; variantId?: string | null; packagingId?: string | null }) =>
  r.packagingId ? `pk:${r.packagingId}` : `pr:${r.productId ?? ""}:${r.variantId ?? ""}`;

const ledgerKey = (r: Row) =>
  r["packaging_id"]
    ? `pk:${r["packaging_id"]}`
    : `pr:${r["product_id"] ?? ""}:${r["variant_id"] ?? ""}`;

const WRITE_OFF: MovementType[] = ["damage_out", "loss_out", "expiry_out"];

/**
 * Rolls the immutable ledger back from today's levels to reconstruct the
 * opening and closing position of a calendar month, plus the money that moved
 * through it (purchases, COGS, write-offs, packaging, adjustments) and what is
 * still owed to suppliers at the end of the period.
 */
export async function buildClosingPreview(db: Db, period: string): Promise<ClosingPreview> {
  const { start, end } = periodBounds(period);

  const levels = (
    unwrap(await db.from("inventory_levels").select(LEVEL_SELECT).limit(3000)) as unknown as Row[]
  ).map(mapLevel);

  const ledger = unwrap(
    await db
      .from("stock_ledger")
      .select("product_id,variant_id,packaging_id,movement_type,quantity,unit_cost,created_at")
      .gte("created_at", start)
      .limit(40000),
  ) as unknown as Row[];

  const after = new Map<string, number>(); // movements strictly after the period
  const inPeriod = new Map<string, { in: number; out: number }>();

  const flow = {
    purchaseValue: 0,
    cogsValue: 0,
    writeoffValue: 0,
    packagingValue: 0,
    adjustmentValue: 0,
  };

  for (const r of ledger) {
    const key = ledgerKey(r);
    const qty = Number(r["quantity"] ?? 0);
    const cost = Number(r["unit_cost"] ?? 0);
    const value = Math.abs(qty) * cost;
    const type = r["movement_type"] as MovementType;
    const at = String(r["created_at"]);

    if (at >= end) {
      after.set(key, (after.get(key) ?? 0) + qty);
      continue;
    }

    const bucket = inPeriod.get(key) ?? { in: 0, out: 0 };
    if (qty >= 0) bucket.in += qty;
    else bucket.out += -qty;
    inPeriod.set(key, bucket);

    if (type === "purchase_in") flow.purchaseValue += value;
    else if (type === "sale_out") flow.cogsValue += value;
    else if (type === "return_in") flow.cogsValue -= value;
    else if (WRITE_OFF.includes(type)) flow.writeoffValue += value;
    else if (type === "packaging_out") flow.packagingValue += value;
    else if (type === "adjust_in") flow.adjustmentValue += value;
    else if (type === "adjust_out") flow.adjustmentValue -= value;
  }

  const lines: ClosingLine[] = [];
  let closingValue = 0;
  let closingQty = 0;
  let openingValue = 0;

  for (const l of levels) {
    const key = keyOf(l);
    const closing = l.qtyOnHand - (after.get(key) ?? 0);
    const moved = inPeriod.get(key) ?? { in: 0, out: 0 };
    const opening = closing - moved.in + moved.out;
    if (closing === 0 && opening === 0 && moved.in === 0 && moved.out === 0) continue;

    const unitCost = l.wacCost || 0;
    const value = closing * unitCost;
    closingValue += value;
    closingQty += closing;
    openingValue += opening * unitCost;

    lines.push({
      key,
      name: l.variantLabel ? `${l.name} · ${l.variantLabel}` : l.name,
      sku: l.sku,
      kind: l.kind,
      openingQty: opening,
      inQty: moved.in,
      outQty: moved.out,
      closingQty: closing,
      unitCost,
      closingValue: value,
    });
  }

  lines.sort((a, b) => b.closingValue - a.closingValue);

  /* ------------------------- supplier dues ------------------------- */
  const [poRes, lineRes, payRes] = await Promise.all([
    db.from("purchase_orders").select("id,status,shipping_cost,discount,created_at").lt("created_at", end),
    db.from("purchase_order_lines").select("po_id,qty_received,unit_cost"),
    db.from("supplier_payments").select("amount,paid_at").lt("paid_at", end),
  ]);

  const validPo = new Set(
    ((poRes.data ?? []) as Row[])
      .filter((p) => String(p["status"]) !== "cancelled")
      .map((p) => String(p["id"])),
  );
  const extras = ((poRes.data ?? []) as Row[])
    .filter((p) => validPo.has(String(p["id"])))
    .reduce((s, p) => s + Number(p["shipping_cost"] ?? 0) - Number(p["discount"] ?? 0), 0);

  const billed =
    ((lineRes.data ?? []) as Row[])
      .filter((l) => validPo.has(String(l["po_id"])))
      .reduce((s, l) => s + Number(l["qty_received"] ?? 0) * Number(l["unit_cost"] ?? 0), 0) + extras;

  const paid = ((payRes.data ?? []) as Row[]).reduce((s, p) => s + Number(p["amount"] ?? 0), 0);

  return {
    period,
    periodStart: start.slice(0, 10),
    periodEnd: new Date(Date.parse(end) - 86_400_000).toISOString().slice(0, 10),
    openingValue,
    purchaseValue: flow.purchaseValue,
    cogsValue: flow.cogsValue,
    writeoffValue: flow.writeoffValue,
    packagingValue: flow.packagingValue,
    adjustmentValue: flow.adjustmentValue,
    closingValue,
    closingQty,
    supplierBilled: billed,
    supplierPaid: paid,
    supplierDue: billed - paid,
    lines,
  };
}

export function mapClosing(row: Row): ClosingRow {
  return {
    id: String(row["id"]),
    period: String(row["period"]),
    periodStart: String(row["period_start"]),
    periodEnd: String(row["period_end"]),
    openingValue: Number(row["opening_value"] ?? 0),
    purchaseValue: Number(row["purchase_value"] ?? 0),
    cogsValue: Number(row["cogs_value"] ?? 0),
    writeoffValue: Number(row["writeoff_value"] ?? 0),
    packagingValue: Number(row["packaging_value"] ?? 0),
    adjustmentValue: Number(row["adjustment_value"] ?? 0),
    closingValue: Number(row["closing_value"] ?? 0),
    closingQty: Number(row["closing_qty"] ?? 0),
    supplierDue: Number(row["supplier_due"] ?? 0),
    note: (row["note"] as string | null) ?? null,
    closedByName: (row["closed_by_name"] as string | null) ?? null,
    createdAt: String(row["created_at"]),
    lines: (row["snapshot"] as ClosingLine[] | null) ?? [],
  };
}
