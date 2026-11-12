import type { Db } from "./admin.server";
import { currentWac, syncCatalogStock } from "./inventory.server";
import { orderStockLines } from "./inventory-fulfilment.server";

/**
 * RTO (return-to-origin) inspection.
 *
 * A returned parcel is NOT stock until a human opens the box. This module
 * turns that physical inspection into ledger truth:
 *   good     → `return_in`  (+qty, back on the shelf)
 *   damaged  → `return_in` then `damage_out` (came back, written off, cost lands in damage)
 *   missing  → no movement (it never came back; the sale_out stands as a loss)
 *
 * Every movement is keyed by `reference_id = order_id` with
 * `reference_type = 'rto'`, and the screen refuses to inspect twice.
 */

/** Order statuses whose parcels can physically land back in the warehouse. */
export const RTO_STATUSES = [
  "awaiting_return",
  "returned",
  "partial_delivered",
  "exchange",
] as const;

export type RtoOrderRow = {
  id: string;
  orderNumber: string;
  status: string;
  customerName: string;
  customerPhone: string;
  total: number;
  courierProvider: string | null;
  createdAt: string;
  inspected: boolean;
  inspectedAt: string | null;
};

export type RtoLine = {
  key: string;
  productId: string;
  variantId: string | null;
  sku: string | null;
  label: string;
  quantity: number;
  wac: number;
};

export async function listRtoOrders(db: Db): Promise<RtoOrderRow[]> {
  const { data, error } = await db
    .from("orders")
    .select(
      "id,order_number,status,customer_name,customer_phone,total,courier_provider,created_at",
    )
    .in("status", [...RTO_STATUSES])
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) throw new Error(error.message);
  const orders = (data ?? []) as Array<Record<string, any>>;
  if (orders.length === 0) return [];

  const { data: done } = await db
    .from("rto_inspections")
    .select("order_id, created_at")
    .in(
      "order_id",
      orders.map((o) => o["id"] as string),
    );
  const seen = new Map<string, string>();
  for (const r of (done ?? []) as Array<{ order_id: string; created_at: string }>) {
    if (!seen.has(r.order_id)) seen.set(r.order_id, r.created_at);
  }

  return orders.map((o) => ({
    id: o["id"],
    orderNumber: o["order_number"],
    status: o["status"],
    customerName: o["customer_name"] ?? "",
    customerPhone: o["customer_phone"] ?? "",
    total: Number(o["total"] ?? 0),
    courierProvider: o["courier_provider"] ?? null,
    createdAt: o["created_at"],
    inspected: seen.has(o["id"]),
    inspectedAt: seen.get(o["id"]) ?? null,
  }));
}

/** Physical lines of a parcel (combos already exploded) with their cost basis. */
export async function rtoOrderLines(db: Db, orderId: string): Promise<RtoLine[]> {
  const lines = await orderStockLines(db, orderId);
  const out: RtoLine[] = [];
  for (const l of lines) {
    const wac = await currentWac(db, {
      productId: l.productId,
      variantId: l.variantId,
      packagingId: null,
    });
    out.push({
      key: `${l.productId}|${l.variantId ?? "-"}`,
      productId: l.productId,
      variantId: l.variantId,
      sku: l.sku,
      label: l.label,
      quantity: l.quantity,
      wac,
    });
  }
  return out;
}

export type InspectionLine = {
  productId: string;
  variantId: string | null;
  sku: string | null;
  label: string;
  good: number;
  damaged: number;
  missing: number;
  resalable: boolean;
  salvagePrice: number | null;
  packagingDamaged: boolean;
  note: string;
};

/** Writes the inspection rows and the resulting stock movements. */
export async function applyRtoInspection(
  db: Db,
  args: {
    orderId: string;
    orderNumber: string | null;
    lines: InspectionLine[];
    note: string;
    actorId: string | null;
    actorName: string;
  },
): Promise<{ restocked: number; damaged: number; missing: number }> {
  const { data: existing } = await db
    .from("rto_inspections")
    .select("id")
    .eq("order_id", args.orderId)
    .limit(1);
  if ((existing ?? []).length > 0) {
    throw new Error("This order has already been inspected — reverse the movements instead.");
  }

  let restocked = 0;
  let damaged = 0;
  let missing = 0;

  for (const line of args.lines) {
    const wac = await currentWac(db, {
      productId: line.productId,
      variantId: line.variantId,
      packagingId: null,
    });

    for (const condition of ["good", "damaged", "missing"] as const) {
      const qty =
        condition === "good" ? line.good : condition === "damaged" ? line.damaged : line.missing;
      if (qty <= 0) continue;

      const { error: iErr } = await db.from("rto_inspections").insert({
        order_id: args.orderId,
        product_id: line.productId,
        variant_id: line.variantId,
        sku: line.sku,
        quantity: qty,
        condition,
        packaging_damaged: line.packagingDamaged,
        resalable: condition === "good" ? true : condition === "damaged" ? line.resalable : false,
        salvage_price: condition === "damaged" ? line.salvagePrice : null,
        note: line.note || args.note || null,
        inspected_by: args.actorId,
        inspected_by_name: args.actorName,
      });
      if (iErr) throw new Error(iErr.message);
    }

    const back = line.good + line.damaged;
    if (back > 0) {
      const { error } = await db.from("stock_ledger").insert({
        product_id: line.productId,
        variant_id: line.variantId,
        sku: line.sku,
        movement_type: "return_in",
        quantity: back,
        unit_cost: wac,
        total_cost: wac * back,
        reference_type: "rto",
        reference_id: args.orderId,
        reference_label: args.orderNumber,
        reason: `RTO inspection · ${line.good} good, ${line.damaged} damaged`,
        note: line.note || args.note || null,
        actor_id: args.actorId,
        actor_name: args.actorName,
      });
      if (error) throw new Error(error.message);
      restocked += line.good;
    }

    if (line.damaged > 0) {
      const { error } = await db.from("stock_ledger").insert({
        product_id: line.productId,
        variant_id: line.variantId,
        sku: line.sku,
        movement_type: "damage_out",
        quantity: -line.damaged,
        unit_cost: wac,
        total_cost: wac * line.damaged,
        reference_type: "rto",
        reference_id: args.orderId,
        reference_label: args.orderNumber,
        reason: "Damaged on return",
        note:
          line.salvagePrice != null
            ? `Salvage price ৳${line.salvagePrice}${line.note ? ` · ${line.note}` : ""}`
            : line.note || null,
        actor_id: args.actorId,
        actor_name: args.actorName,
      });
      if (error) throw new Error(error.message);
      damaged += line.damaged;
    }

    missing += line.missing;
    if (back > 0) await syncCatalogStock(db, line.productId, line.variantId);
  }

  await db.from("order_activity").insert({
    order_id: args.orderId,
    kind: "inventory",
    message: `RTO inspected — ${restocked} restocked, ${damaged} damaged, ${missing} missing`,
    meta: { actor: args.actorName, restocked, damaged, missing },
  });

  return { restocked, damaged, missing };
}
