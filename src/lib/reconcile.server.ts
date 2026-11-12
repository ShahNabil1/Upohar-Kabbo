import type { Db } from "./admin.server";

/**
 * Partial delivery reconciliation.
 *
 * When a courier delivers only part of a parcel, two truths drift apart:
 *   - the money actually collected (COD remittance from the courier), and
 *   - the items the customer actually kept.
 *
 * This module lets a human line up both: mark how many units of each order
 * item were kept vs came back, enter the amount the courier remitted, and
 * store the variance. It is a *financial* record only — physical restocking
 * stays with the RTO inspection screen, so nothing is ever counted twice.
 */

/** Statuses where money and goods can legitimately disagree. */
export const RECONCILE_STATUSES = [
  "partial_delivered",
  "exchange",
  "delivered",
  "returned",
] as const;

export type ReconcileOrderRow = {
  id: string;
  orderNumber: string;
  status: string;
  customerName: string;
  customerPhone: string;
  total: number;
  deliveryCharge: number;
  discount: number;
  courierProvider: string | null;
  collectedAmount: number | null;
  createdAt: string;
  settled: boolean;
  variance: number | null;
};

export type ReconcileLine = {
  itemId: string;
  productId: string | null;
  sku: string | null;
  label: string;
  ordered: number;
  unitPrice: number;
};

export type SavedLine = {
  itemId: string;
  label: string;
  ordered: number;
  delivered: number;
  returned: number;
  unitPrice: number;
  lineTotal: number;
};

export async function listReconcileOrders(db: Db): Promise<ReconcileOrderRow[]> {
  const { data, error } = await db
    .from("orders")
    .select(
      "id,order_number,status,customer_name,customer_phone,total,delivery_charge,discount,courier_provider,created_at",
    )
    .in("status", ["partial_delivered", "exchange"])
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) throw new Error(error.message);
  const orders = (data ?? []) as Array<Record<string, any>>;
  if (orders.length === 0) return [];
  const ids = orders.map((o) => o["id"] as string);

  const { data: cons } = await db
    .from("order_consignments")
    .select("order_id, collected_amount")
    .in("order_id", ids);
  const collected = new Map<string, number | null>();
  for (const c of (cons ?? []) as Array<{ order_id: string; collected_amount: number | null }>) {
    if (c.collected_amount != null) collected.set(c.order_id, Number(c.collected_amount));
  }

  const { data: recs } = await db
    .from("order_reconciliations")
    .select("order_id, settled, collected_amount, lines, created_at")
    .in("order_id", ids)
    .order("created_at", { ascending: false });
  const settledMap = new Map<string, { settled: boolean; variance: number }>();
  for (const r of (recs ?? []) as Array<Record<string, any>>) {
    const id = r["order_id"] as string;
    if (settledMap.has(id)) continue;
    const lines = (Array.isArray(r["lines"]) ? r["lines"] : []) as SavedLine[];
    const expected = lines.reduce((s, l) => s + Number(l.lineTotal ?? 0), 0);
    settledMap.set(id, {
      settled: Boolean(r["settled"]),
      variance: Number(r["collected_amount"] ?? 0) - expected,
    });
  }

  return orders.map((o) => {
    const rec = settledMap.get(o["id"]);
    return {
      id: o["id"],
      orderNumber: o["order_number"],
      status: o["status"],
      customerName: o["customer_name"] ?? "",
      customerPhone: o["customer_phone"] ?? "",
      total: Number(o["total"] ?? 0),
      deliveryCharge: Number(o["delivery_charge"] ?? 0),
      discount: Number(o["discount"] ?? 0),
      courierProvider: o["courier_provider"] ?? null,
      collectedAmount: collected.get(o["id"]) ?? null,
      createdAt: o["created_at"],
      settled: rec?.settled ?? false,
      variance: rec ? rec.variance : null,
    };
  });
}

/** Order items with their money, plus any previously saved split. */
export async function reconcileOrderLines(
  db: Db,
  orderId: string,
): Promise<{ lines: ReconcileLine[]; saved: SavedLine[]; note: string; collected: number | null }> {
  const { data, error } = await db
    .from("order_items")
    .select("id, product_id, product_name, variant_label, sku, unit_price, quantity")
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  const lines: ReconcileLine[] = ((data ?? []) as Array<Record<string, any>>).map((i) => ({
    itemId: i["id"],
    productId: i["product_id"] ?? null,
    sku: i["sku"] ?? null,
    label: [i["product_name"], i["variant_label"]].filter(Boolean).join(" · "),
    ordered: Number(i["quantity"] ?? 0),
    unitPrice: Number(i["unit_price"] ?? 0),
  }));

  const { data: rec } = await db
    .from("order_reconciliations")
    .select("lines, note, collected_amount")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const row = rec as Record<string, any> | null;
  return {
    lines,
    saved: (Array.isArray(row?.["lines"]) ? row?.["lines"] : []) as SavedLine[],
    note: (row?.["note"] as string | null) ?? "",
    collected: row?.["collected_amount"] != null ? Number(row["collected_amount"]) : null,
  };
}

export async function saveReconciliation(
  db: Db,
  args: {
    orderId: string;
    orderNumber: string | null;
    collectedAmount: number;
    lines: SavedLine[];
    settled: boolean;
    note: string;
    actorId: string | null;
    actorName: string;
  },
): Promise<{ expected: number; collected: number; variance: number }> {
  const expected = args.lines.reduce((s, l) => s + l.lineTotal, 0);
  const variance = args.collectedAmount - expected;

  const { error } = await db.from("order_reconciliations").insert({
    order_id: args.orderId,
    collected_amount: args.collectedAmount,
    lines: args.lines,
    settled: args.settled,
    note: args.note || null,
    actor_id: args.actorId,
    actor_name: args.actorName,
  });
  if (error) throw new Error(error.message);

  const kept = args.lines.reduce((s, l) => s + l.delivered, 0);
  const back = args.lines.reduce((s, l) => s + l.returned, 0);

  await db.from("order_activity").insert({
    order_id: args.orderId,
    kind: "finance",
    message:
      `Partial delivery reconciled — ${kept} kept, ${back} returned · expected ৳${expected.toFixed(2)}, ` +
      `collected ৳${args.collectedAmount.toFixed(2)}, variance ৳${variance.toFixed(2)}` +
      (args.settled ? " · settled" : " · pending settlement"),
    meta: {
      actor: args.actorName,
      expected,
      collected: args.collectedAmount,
      variance,
      kept,
      returned: back,
      settled: args.settled,
    },
  });

  return { expected, collected: args.collectedAmount, variance };
}
