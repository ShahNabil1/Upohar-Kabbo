import type { Db } from "./admin.server";
import { currentWac, syncCatalogStock } from "./inventory.server";

/**
 * Order ↔ inventory bridge.
 *
 * Stock leaves the warehouse when an order is committed to the fulfilment
 * pipeline (pending / rts / shipped …) and comes back when that commitment is
 * cancelled before dispatch. Every write goes through the immutable
 * `stock_ledger`, keyed by `reference_id = order_id`, so the whole thing is
 * idempotent: an order can never be deducted twice.
 */

/** Statuses that mean "this parcel is (or was) packed and committed". */
const COMMITTED = new Set([
  "pending",
  "confirmed",
  "rts",
  "shipped",
  "courier_hold",
  "delivered",
  "partial_delivered",
  "awaiting_return",
  "returned",
  "exchange",
  "lost_damaged",
]);

/** Statuses that release a commitment made earlier (nothing shipped). */
const RELEASED = new Set(["cancelled", "hold", "no_response", "good_no_response", "incomplete"]);

export type StockLine = {
  productId: string;
  variantId: string | null;
  sku: string | null;
  quantity: number;
  label: string;
  variantLabel?: string | null;
};

/**
 * Expands an order into physical stock lines. Combo boxes hold no stock of
 * their own — they explode into the sub-products the customer picked
 * (falling back to the combo's own recipe when nothing was picked).
 */
export async function orderStockLines(db: Db, orderId: string): Promise<StockLine[]> {
  const { data: rows } = await db
    .from("order_items")
    .select("product_id, product_name, variant_label, sku, quantity, combo_selections, products(id,kind,sku)")
    .eq("order_id", orderId);

  const items = (rows ?? []) as unknown as Array<Record<string, any>>;
  const out: StockLine[] = [];
  const comboFallback: Array<{ comboId: string; qty: number }> = [];

  for (const it of items) {
    const qty = Number(it["quantity"] ?? 0);
    const productId = it["product_id"] as string | null;
    if (!productId || qty <= 0) continue;
    const kind = it["products"]?.kind ?? "single";
    const selections = Array.isArray(it["combo_selections"]) ? it["combo_selections"] : [];

    if (kind === "combo") {
      if (selections.length > 0) {
        for (const sel of selections) {
          const subId = sel?.itemId as string | undefined;
          if (!subId) continue;
          out.push({
            productId: subId,
            variantId: (sel?.variantId as string | null) ?? null,
            sku: (sel?.sku as string | null) ?? null,
            quantity: qty * Number(sel?.quantity ?? 1),
            label: String(sel?.itemNameEn || sel?.itemNameBn || it["product_name"]),
          });
        }
      } else {
        comboFallback.push({ comboId: productId, qty });
      }
      continue;
    }

    out.push({
      productId,
      variantId: null,
      sku: (it["sku"] as string | null) ?? null,
      quantity: qty,
      label: String(it["product_name"] ?? "Item"),
      variantLabel: (it["variant_label"] as string | null) ?? null,
    });
  }

  // Combos ordered without explicit picks fall back to their recipe.
  if (comboFallback.length > 0) {
    const { data: bom } = await db
      .from("combo_items")
      .select("combo_id, item_id, quantity, products!combo_items_item_id_fkey(name_en,sku)")
      .in("combo_id", comboFallback.map((c) => c.comboId));
    for (const c of comboFallback) {
      for (const line of ((bom ?? []) as unknown as Array<Record<string, any>>).filter(
        (b) => b["combo_id"] === c.comboId,
      )) {
        out.push({
          productId: line["item_id"],
          variantId: null,
          sku: line["products"]?.sku ?? null,
          quantity: c.qty * Number(line["quantity"] ?? 1),
          label: String(line["products"]?.name_en ?? "Combo item"),
        });
      }
    }
  }

  // Resolve variant ids from the SKU stored on the order line.
  const needsLookup = out.filter((l) => !l.variantId && l.sku);
  if (needsLookup.length > 0) {
    const { data: variants } = await db
      .from("product_variants")
      .select("id, sku, product_id")
      .in("sku", Array.from(new Set(needsLookup.map((l) => l.sku!))));
    const bySku = new Map(
      ((variants ?? []) as Array<{ id: string; sku: string | null; product_id: string }>).map(
        (v) => [`${v.product_id}|${v.sku}`, v.id],
      ),
    );
    for (const line of out) {
      if (line.variantId || !line.sku) continue;
      line.variantId = bySku.get(`${line.productId}|${line.sku}`) ?? null;
    }
  }

  // Fallback: variants without their own SKU are matched by the stored "Group: Value" label.
  const byLabel = out.filter((l) => !l.variantId && l.variantLabel);
  if (byLabel.length > 0) {
    const { data: vrows } = await db
      .from("product_variants")
      .select("id, product_id, group_name_bn, group_name_en, value_bn, value_en")
      .in("product_id", Array.from(new Set(byLabel.map((l) => l.productId))));
    const norm = (x: string) => x.replace(/\s+/g, " ").trim().toLowerCase();
    const map = new Map<string, string>();
    for (const v of (vrows ?? []) as Array<Record<string, string>>) {
      map.set(`${v["product_id"]}|${norm(`${v["group_name_bn"]}: ${v["value_bn"]}`)}`, v["id"]!);
      map.set(`${v["product_id"]}|${norm(`${v["group_name_en"]}: ${v["value_en"]}`)}`, v["id"]!);
    }
    for (const line of byLabel) {
      line.variantId = map.get(`${line.productId}|${norm(line.variantLabel!)}`) ?? null;
    }
  }

  // Merge duplicates so one item never produces two ledger rows.
  const merged = new Map<string, StockLine>();
  for (const l of out) {
    const key = `${l.productId}|${l.variantId ?? "-"}`;
    const found = merged.get(key);
    if (found) found.quantity += l.quantity;
    else merged.set(key, { ...l });
  }
  return Array.from(merged.values());
}

/** True when this order already has live (non-reversed) sale movements. */
async function saleApplied(db: Db, orderId: string): Promise<boolean> {
  const { data } = await db
    .from("stock_ledger")
    .select("id, movement_type")
    .eq("reference_id", orderId)
    .in("movement_type", ["sale_out", "return_in"]);
  const rows = (data ?? []) as Array<{ movement_type: string }>;
  const out = rows.filter((r) => r.movement_type === "sale_out").length;
  const back = rows.filter((r) => r.movement_type === "return_in").length;
  return out > back;
}

/**
 * Applies (or releases) an order's stock for a status change.
 * Safe to call on every status update — it no-ops when nothing is needed.
 */
export async function applyOrderStock(
  db: Db,
  orderId: string,
  status: string,
  opts: { actorName?: string; orderNumber?: string | null } = {},
): Promise<{ moved: number; direction: "out" | "in" | "none" }> {
  const committed = COMMITTED.has(status);
  const released = RELEASED.has(status);
  if (!committed && !released) return { moved: 0, direction: "none" };

  const already = await saleApplied(db, orderId);
  if (committed && already) return { moved: 0, direction: "none" };
  if (released && !already) return { moved: 0, direction: "none" };

  const lines = await orderStockLines(db, orderId);
  if (lines.length === 0) return { moved: 0, direction: "none" };

  const label = opts.orderNumber ?? null;
  const who = opts.actorName ?? "System";

  for (const line of lines) {
    const wac = await currentWac(db, {
      productId: line.productId,
      variantId: line.variantId,
      packagingId: null,
    });
    const signed = committed ? -line.quantity : line.quantity;
    const { error } = await db.from("stock_ledger").insert({
      product_id: line.productId,
      variant_id: line.variantId,
      packaging_id: null,
      sku: line.sku,
      movement_type: committed ? "sale_out" : "return_in",
      quantity: signed,
      unit_cost: wac,
      total_cost: wac * line.quantity,
      reference_type: "order",
      reference_id: orderId,
      reference_label: label,
      reason: committed ? `Order ${label ?? ""} committed (${status})` : `Order ${label ?? ""} released (${status})`,
      actor_name: who,
    });
    if (error) throw new Error(error.message);
    await syncCatalogStock(db, line.productId, line.variantId);
  }

  await applyOrderPackaging(db, orderId, {
    consume: committed,
    units: lines.reduce((s, l) => s + l.quantity, 0),
    orderNumber: label,
    actorName: who,
    status,
  });

  return { moved: lines.length, direction: committed ? "out" : "in" };
}

/**
 * Packaging consumption.
 *
 * A parcel eats real money in boxes, tape and bubble wrap. Each active
 * packaging material declares how it is used:
 *   per_order → 1 unit per parcel
 *   per_unit  → 1 unit per physical item inside the parcel
 *
 * Consumption is written as `packaging_out` keyed by the order, and released
 * with `adjust_in` when the parcel is cancelled before dispatch. Idempotent:
 * a parcel can never burn the same box twice.
 */
export async function applyOrderPackaging(
  db: Db,
  orderId: string,
  args: {
    consume: boolean;
    units: number;
    orderNumber: string | null;
    actorName: string;
    status: string;
  },
): Promise<{ used: number }> {
  const { data: existing } = await db
    .from("stock_ledger")
    .select("movement_type, packaging_id")
    .eq("reference_id", orderId)
    .eq("reference_type", "packaging")
    .not("packaging_id", "is", null);
  const rows = (existing ?? []) as Array<{ movement_type: string }>;
  const outCount = rows.filter((r) => r.movement_type === "packaging_out").length;
  const backCount = rows.filter((r) => r.movement_type === "adjust_in").length;
  const applied = outCount > backCount;

  if (args.consume === applied) return { used: 0 };

  const { data: materials } = await db
    .from("packaging_materials")
    .select("id, name, sku, consumption")
    .eq("is_active", true);
  const list = (materials ?? []) as Array<Record<string, any>>;
  if (list.length === 0) return { used: 0 };

  let used = 0;
  for (const m of list) {
    const qty = m["consumption"] === "per_unit" ? Math.max(args.units, 0) : 1;
    if (qty <= 0) continue;
    const wac = await currentWac(db, {
      productId: null,
      variantId: null,
      packagingId: m["id"],
    });
    const { error } = await db.from("stock_ledger").insert({
      packaging_id: m["id"],
      sku: m["sku"] ?? null,
      movement_type: args.consume ? "packaging_out" : "adjust_in",
      quantity: args.consume ? -qty : qty,
      unit_cost: wac,
      total_cost: wac * qty,
      reference_type: "packaging",
      reference_id: orderId,
      reference_label: args.orderNumber,
      reason: args.consume
        ? `Packaging used for order ${args.orderNumber ?? ""} (${m["name"]})`
        : `Packaging returned — order ${args.orderNumber ?? ""} released (${args.status})`,
      actor_name: args.actorName,
    });
    if (error) throw new Error(error.message);
    used += qty;
  }

  return { used };
}

