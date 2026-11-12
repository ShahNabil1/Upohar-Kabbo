import type { Db } from "./admin.server";
import { unwrap } from "./admin.server";
import { LEVEL_SELECT, mapLevel, syncCatalogStock } from "./inventory.server";
import type {
  CountScope,
  StockCountDetail,
  StockCountLineRow,
  StockCountRow,
} from "./stock-count.shared";

type Row = Record<string, any>;

const LINE_SELECT =
  "id,product_id,variant_id,packaging_id,sku,item_name,system_qty,counted_qty,unit_cost,note,created_at";

function mapLine(r: Row): StockCountLineRow {
  return {
    id: r["id"],
    itemName: r["item_name"] || "Item",
    sku: r["sku"] ?? null,
    kind: r["packaging_id"] ? "packaging" : "product",
    systemQty: Number(r["system_qty"] ?? 0),
    countedQty: r["counted_qty"] == null ? null : Number(r["counted_qty"]),
    unitCost: Number(r["unit_cost"] ?? 0),
    note: r["note"] ?? null,
  };
}

function summarise(head: Row, lines: Row[]): StockCountRow {
  let counted = 0;
  let units = 0;
  let value = 0;
  for (const l of lines) {
    if (l["counted_qty"] == null) continue;
    counted += 1;
    const diff = Number(l["counted_qty"]) - Number(l["system_qty"] ?? 0);
    units += diff;
    value += diff * Number(l["unit_cost"] ?? 0);
  }
  return {
    id: head["id"],
    name: head["name"],
    status: head["status"],
    note: head["note"] ?? null,
    createdByName: head["created_by_name"] ?? null,
    postedByName: head["posted_by_name"] ?? null,
    postedAt: head["posted_at"] ?? null,
    createdAt: head["created_at"],
    lineCount: lines.length,
    countedCount: counted,
    varianceUnits: units,
    varianceValue: value,
  };
}

export async function listStockCounts(db: Db): Promise<StockCountRow[]> {
  const heads = unwrap(
    await db
      .from("stock_counts")
      .select("*, stock_count_lines(counted_qty,system_qty,unit_cost)")
      .order("created_at", { ascending: false })
      .limit(100),
  ) as unknown as Row[];
  return heads.map((h) => summarise(h, (h["stock_count_lines"] ?? []) as Row[]));
}

export async function getStockCount(db: Db, id: string): Promise<StockCountDetail> {
  const head = unwrap(
    await db.from("stock_counts").select("*").eq("id", id).maybeSingle(),
  ) as unknown as Row | null;
  if (!head) throw new Error("Count session not found");
  const lines = unwrap(
    await db
      .from("stock_count_lines")
      .select(LINE_SELECT)
      .eq("count_id", id)
      .order("item_name")
      .limit(3000),
  ) as unknown as Row[];
  return { count: summarise(head, lines), lines: lines.map(mapLine) };
}

/** Freezes a snapshot of current levels into count lines. */
export async function openStockCount(
  db: Db,
  input: { name: string; scope: CountScope; note: string },
  actor: { id: string; name: string },
): Promise<{ id: string; lines: number }> {
  const levelRows = unwrap(
    await db.from("inventory_levels").select(LEVEL_SELECT).limit(3000),
  ) as unknown as Row[];
  const levels = levelRows.map(mapLevel).filter((l) => {
    if (input.scope === "packaging") return l.kind === "packaging";
    if (input.scope === "products") return l.kind === "product";
    if (input.scope === "low") return l.reorderPoint > 0 && l.qtyOnHand <= l.reorderPoint;
    return true;
  });
  if (levels.length === 0) throw new Error("No inventory item matches this scope");

  const { data: head, error } = await db
    .from("stock_counts")
    .insert({
      name: input.name,
      note: input.note || null,
      status: "open",
      created_by: actor.id,
      created_by_name: actor.name,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const countId = (head as { id: string }).id;

  const payload = levels.map((l) => ({
    count_id: countId,
    product_id: l.productId,
    variant_id: l.variantId,
    packaging_id: l.packagingId,
    sku: l.sku === "—" ? null : l.sku,
    item_name: l.variantLabel ? `${l.name} · ${l.variantLabel}` : l.name,
    system_qty: l.qtyOnHand,
    unit_cost: l.wacCost,
  }));

  for (let i = 0; i < payload.length; i += 500) {
    const { error: lErr } = await db.from("stock_count_lines").insert(payload.slice(i, i + 500));
    if (lErr) throw new Error(lErr.message);
  }
  return { id: countId, lines: payload.length };
}

export async function saveCountLine(
  db: Db,
  input: { lineId: string; countedQty: number | null; note: string },
): Promise<void> {
  const { error } = await db
    .from("stock_count_lines")
    .update({ counted_qty: input.countedQty, note: input.note || null })
    .eq("id", input.lineId);
  if (error) throw new Error(error.message);
}

/**
 * Posts variances as immutable ledger corrections. Only lines with a
 * counted value and a non-zero difference create a movement, so posting
 * twice is impossible (session flips to `posted`).
 */
export async function postStockCount(
  db: Db,
  id: string,
  actor: { id: string; name: string },
): Promise<{ posted: number; varianceValue: number }> {
  const head = unwrap(
    await db.from("stock_counts").select("id,name,status").eq("id", id).maybeSingle(),
  ) as unknown as Row | null;
  if (!head) throw new Error("Count session not found");
  if (head["status"] !== "open") throw new Error("This count is already closed");

  const lines = unwrap(
    await db.from("stock_count_lines").select(LINE_SELECT).eq("count_id", id).limit(3000),
  ) as unknown as Row[];

  let posted = 0;
  let varianceValue = 0;

  for (const l of lines) {
    if (l["counted_qty"] == null) continue;
    const diff = Number(l["counted_qty"]) - Number(l["system_qty"] ?? 0);
    if (diff === 0) continue;
    const cost = Number(l["unit_cost"] ?? 0);

    const { error } = await db.from("stock_ledger").insert({
      product_id: l["product_id"],
      variant_id: l["variant_id"],
      packaging_id: l["packaging_id"],
      sku: l["sku"],
      movement_type: diff > 0 ? "adjust_in" : "adjust_out",
      quantity: diff,
      unit_cost: cost,
      total_cost: cost * Math.abs(diff),
      reference_type: "stock_count",
      reference_id: id,
      reference_label: head["name"],
      reason: "Physical count variance",
      note: l["note"] || null,
      actor_id: actor.id,
      actor_name: actor.name,
    });
    if (error) throw new Error(error.message);

    if (l["product_id"]) await syncCatalogStock(db, l["product_id"], l["variant_id"] ?? null);
    posted += 1;
    varianceValue += diff * cost;
  }

  const { error: uErr } = await db
    .from("stock_counts")
    .update({
      status: "posted",
      posted_at: new Date().toISOString(),
      posted_by: actor.id,
      posted_by_name: actor.name,
    })
    .eq("id", id);
  if (uErr) throw new Error(uErr.message);

  return { posted, varianceValue };
}

export async function cancelStockCount(db: Db, id: string): Promise<void> {
  const { error } = await db
    .from("stock_counts")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("status", "open");
  if (error) throw new Error(error.message);
}
