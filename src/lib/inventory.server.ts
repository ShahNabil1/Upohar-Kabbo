import type { Db } from "./admin.server";
import type { InventoryRow, LedgerRow, MovementType } from "./inventory.shared";

/* ------------------------------------------------------------------ */
/* Row shaping                                                         */
/* ------------------------------------------------------------------ */

type LevelRow = Record<string, any>;

export function itemName(row: LevelRow): string {
  const p = row["products"];
  const pack = row["packaging_materials"];
  if (pack) return String(pack.name ?? "Packaging");
  return String(p?.name_en || p?.name_bn || "Unknown product");
}

export function variantLabel(row: LevelRow): string | null {
  const v = row["product_variants"];
  if (!v) return null;
  return `${v.group_name_en ?? ""}: ${v.value_en ?? ""}`.trim();
}

export function itemSku(row: LevelRow): string {
  const v = row["product_variants"];
  const p = row["products"];
  const pack = row["packaging_materials"];
  return String(v?.sku || p?.sku || pack?.sku || "—");
}

export function mapLevel(row: LevelRow): InventoryRow {
  const p = row["products"];
  const v = row["product_variants"];
  return {
    id: row["id"],
    productId: row["product_id"] ?? null,
    variantId: row["variant_id"] ?? null,
    packagingId: row["packaging_id"] ?? null,
    name: itemName(row),
    variantLabel: variantLabel(row),
    sku: itemSku(row),
    kind: row["packaging_id"] ? "packaging" : "product",
    qtyOnHand: Number(row["qty_on_hand"] ?? 0),
    qtyReserved: Number(row["qty_reserved"] ?? 0),
    wacCost: Number(row["wac_cost"] ?? 0),
    sellPrice: p ? Number(p.price ?? 0) + Number(v?.price_delta ?? 0) : 0,
    reorderPoint: Number(row["reorder_point"] ?? 0),
    reorderQty: Number(row["reorder_qty"] ?? 0),
    lastMovementAt: row["last_movement_at"] ?? null,
    imageUrl:
      (Array.isArray(p?.product_images) && p.product_images.length
        ? [...p.product_images].sort(
            (a: any, b: any) => Number(a?.sort_order ?? 0) - Number(b?.sort_order ?? 0),
          )[0]?.url
        : null) ?? null,
  };
}

export const LEVEL_SELECT =
  "*, products(id,name_en,name_bn,sku,price,kind,product_images(url,sort_order)), product_variants(id,sku,group_name_en,value_en,price_delta), packaging_materials(id,name,sku,unit)";

export const LEDGER_SELECT =
  "*, products(name_en,name_bn), product_variants(group_name_en,value_en), packaging_materials(name)";

export function mapLedger(row: LevelRow): LedgerRow {
  const p = row["products"];
  const v = row["product_variants"];
  const pack = row["packaging_materials"];
  const base = pack?.name ?? p?.name_en ?? p?.name_bn ?? "Item";
  const vl = v ? ` · ${v.group_name_en}: ${v.value_en}` : "";
  return {
    id: row["id"],
    movementType: row["movement_type"] as MovementType,
    quantity: Number(row["quantity"] ?? 0),
    unitCost: Number(row["unit_cost"] ?? 0),
    totalCost: Number(row["total_cost"] ?? 0),
    sku: row["sku"] ?? null,
    name: `${base}${vl}`,
    reason: row["reason"] ?? null,
    note: row["note"] ?? null,
    referenceLabel: row["reference_label"] ?? null,
    actorName: row["actor_name"] ?? null,
    createdAt: row["created_at"],
  };
}

/* ------------------------------------------------------------------ */
/* Storefront stock sync                                               */
/* ------------------------------------------------------------------ */

/**
 * Mirrors the ledger-derived on-hand quantity back into the catalog
 * `stock` columns the storefront already reads, so no extra query is
 * needed on the public side.
 */
export async function syncCatalogStock(
  db: Db,
  productId: string | null,
  variantId: string | null,
): Promise<void> {
  if (!productId) return;

  if (variantId) {
    const { data: vrow } = await db
      .from("inventory_levels")
      .select("qty_on_hand")
      .eq("variant_id", variantId)
      .maybeSingle();
    const qty = Number((vrow as { qty_on_hand?: number } | null)?.qty_on_hand ?? 0);
    await db.from("product_variants").update({ stock: Math.max(qty, 0) }).eq("id", variantId);

    // Product-level stock = sum of its variants.
    const { data: all } = await db
      .from("inventory_levels")
      .select("qty_on_hand")
      .eq("product_id", productId);
    const total = (all ?? []).reduce(
      (s: number, r: { qty_on_hand: number }) => s + Number(r.qty_on_hand ?? 0),
      0,
    );
    await db.from("products").update({ stock: Math.max(total, 0) }).eq("id", productId);
    return;
  }

  const { data } = await db
    .from("inventory_levels")
    .select("qty_on_hand")
    .eq("product_id", productId)
    .is("variant_id", null)
    .maybeSingle();
  const qty = Number((data as { qty_on_hand?: number } | null)?.qty_on_hand ?? 0);
  await db.from("products").update({ stock: Math.max(qty, 0) }).eq("id", productId);
}


/** Current weighted-average cost for an item (0 when never stocked). */
export async function currentWac(
  db: Db,
  target: { productId: string | null; variantId: string | null; packagingId: string | null },
): Promise<number> {
  let q = db.from("inventory_levels").select("wac_cost");
  q = target.packagingId
    ? q.eq("packaging_id", target.packagingId)
    : q.eq("product_id", target.productId!);
  if (!target.packagingId) {
    q = target.variantId ? q.eq("variant_id", target.variantId) : q.is("variant_id", null);
  }
  const { data } = await q.maybeSingle();
  return Number((data as { wac_cost?: number } | null)?.wac_cost ?? 0);
}


/* ------------------------------------------------------------------ */
/* Smart combo availability                                            */
/* ------------------------------------------------------------------ */

export type ComboAvailability = {
  id: string;
  name: string;
  sku: string | null;
  price: number;
  isActive: boolean;
  buildable: number;
  items: Array<{
    id: string;
    name: string;
    sku: string | null;
    perBox: number;
    onHand: number;
    buildable: number;
    isFree: boolean;
    bottleneck: boolean;
    /** Variant-level SKUs of this sub-product with their own stock. */
    variants: Array<{ id: string; sku: string | null; label: string; onHand: number }>;
  }>;
};

/**
 * Combos hold no stock of their own — how many boxes can be built is decided
 * by the scarcest sub-product inside the recipe.
 */
export async function computeComboAvailability(db: Db): Promise<ComboAvailability[]> {
  const { data: comboData } = await db
    .from("products")
    .select("id,name_en,name_bn,sku,price,is_active")
    .eq("kind", "combo")
    .order("name_en");
  const combos = (comboData ?? []) as unknown as Array<Record<string, any>>;
  if (combos.length === 0) return [];

  const [bomRes, levelRes] = await Promise.all([
    db
      .from("combo_items")
      .select("combo_id,item_id,quantity,is_free,products!combo_items_item_id_fkey(name_en,name_bn,sku)")
      .in("combo_id", combos.map((c) => c["id"] as string)),
    db
      .from("inventory_levels")
      .select("product_id,variant_id,qty_on_hand")
      .not("product_id", "is", null),
  ]);

  const bom = (bomRes.data ?? []) as unknown as Array<Record<string, any>>;
  const itemIds = Array.from(new Set(bom.map((b) => b["item_id"] as string)));
  const { data: variantData } = itemIds.length
    ? await db
        .from("product_variants")
        .select("id,product_id,sku,group_name_en,value_en,is_active")
        .in("product_id", itemIds)
    : { data: [] as unknown[] };
  const variants = (variantData ?? []) as unknown as Array<Record<string, any>>;

  const onHand = new Map<string, number>();
  const variantOnHand = new Map<string, number>();
  for (const r of (levelRes.data ?? []) as Array<{
    product_id: string;
    variant_id: string | null;
    qty_on_hand: number;
  }>) {
    onHand.set(r.product_id, (onHand.get(r.product_id) ?? 0) + Number(r.qty_on_hand ?? 0));
    if (r.variant_id) variantOnHand.set(r.variant_id, Number(r.qty_on_hand ?? 0));
  }

  return combos.map((c) => {
    const lines = bom.filter((b) => b["combo_id"] === c["id"]);
    const items = lines.map((l) => {
      const perBox = Math.max(Number(l["quantity"] ?? 1), 1);
      const have = onHand.get(l["item_id"] as string) ?? 0;
      return {
        id: l["item_id"] as string,
        name: String(l["products"]?.name_en || l["products"]?.name_bn || "Sub-product"),
        sku: (l["products"]?.sku as string | null) ?? null,
        perBox,
        onHand: have,
        buildable: Math.floor(have / perBox),
        isFree: Boolean(l["is_free"]),
        bottleneck: false,
        variants: variants
          .filter((v) => v["product_id"] === l["item_id"] && v["is_active"] !== false)
          .map((v) => ({
            id: v["id"] as string,
            sku: (v["sku"] as string | null) ?? null,
            label: `${v["group_name_en"]}: ${v["value_en"]}`,
            onHand: variantOnHand.get(v["id"] as string) ?? 0,
          })),
      };
    });
    const buildable = items.length === 0 ? 0 : Math.min(...items.map((i) => i.buildable));
    for (const i of items) i.bottleneck = items.length > 0 && i.buildable === buildable;
    return {
      id: c["id"] as string,
      name: String(c["name_en"] || c["name_bn"]),
      sku: (c["sku"] as string | null) ?? null,
      price: Number(c["price"] ?? 0),
      isActive: Boolean(c["is_active"]),
      buildable,
      items,
    };
  });
}

/* ------------------------------------------------------------------ */
/* First-run onboarding                                                */
/* ------------------------------------------------------------------ */

export type OnboardResult = { created: number; opened: number; units: number };

/**
 * Brings every catalog SKU into the inventory system: creates the missing
 * `inventory_levels` rows and, for items that already carry a catalog stock
 * number, posts a one-time `adjust_in` opening-stock movement so the ledger,
 * WAC and the shop agree from day one. Safe to run repeatedly.
 */
export async function onboardCatalogStock(
  db: Db,
  actor: { id: string; name: string },
): Promise<OnboardResult> {
  const { data: productData } = await db
    .from("products")
    .select("id,sku,stock,cost_price,kind,product_variants(id,sku,stock,cost_price,is_active)")
    .neq("kind", "combo")
    .limit(2000);
  const { data: packData } = await db.from("packaging_materials").select("id").eq("is_active", true);
  const { data: levelData } = await db
    .from("inventory_levels")
    .select("id,product_id,variant_id,packaging_id")
    .limit(5000);

  type Target = {
    productId: string | null;
    variantId: string | null;
    packagingId: string | null;
    sku: string | null;
    stock: number;
    cost: number;
  };

  const targets: Target[] = [];
  for (const p of (productData ?? []) as Array<Record<string, any>>) {
    const variants = (p["product_variants"] ?? []).filter((v: any) => v.is_active);
    if (variants.length === 0) {
      targets.push({
        productId: p["id"],
        variantId: null,
        packagingId: null,
        sku: p["sku"] ?? null,
        stock: Number(p["stock"] ?? 0),
        cost: Number(p["cost_price"] ?? 0),
      });
      continue;
    }
    for (const v of variants) {
      targets.push({
        productId: p["id"],
        variantId: v.id,
        packagingId: null,
        sku: v.sku ?? p["sku"] ?? null,
        stock: Number(v.stock ?? 0),
        cost: Number(v.cost_price ?? p["cost_price"] ?? 0),
      });
    }
  }
  for (const m of (packData ?? []) as Array<Record<string, any>>) {
    targets.push({
      productId: null,
      variantId: null,
      packagingId: m["id"],
      sku: null,
      stock: 0,
      cost: 0,
    });
  }

  const key = (t: { productId: string | null; variantId: string | null; packagingId: string | null }) =>
    t.packagingId ? `k:${t.packagingId}` : `p:${t.productId}:${t.variantId ?? "-"}`;
  const existing = new Set(
    ((levelData ?? []) as Array<Record<string, any>>).map((l) =>
      key({
        productId: l["product_id"] ?? null,
        variantId: l["variant_id"] ?? null,
        packagingId: l["packaging_id"] ?? null,
      }),
    ),
  );

  let created = 0;
  let opened = 0;
  let units = 0;

  for (const t of targets) {
    if (existing.has(key(t))) continue;

    if (t.stock > 0 && t.productId) {
      const { error } = await db.from("stock_ledger").insert({
        product_id: t.productId,
        variant_id: t.variantId,
        packaging_id: null,
        sku: t.sku,
        movement_type: "adjust_in",
        quantity: t.stock,
        unit_cost: t.cost,
        total_cost: t.cost * t.stock,
        reference_type: "opening",
        reference_label: "Opening stock import",
        reason: "Opening stock",
        note: "Imported from catalog stock",
        actor_id: actor.id,
        actor_name: actor.name,
      });
      if (error) throw new Error(error.message);
      opened += 1;
      units += t.stock;
      created += 1; // the ledger trigger creates the level row
    } else {
      const { error } = await db.from("inventory_levels").insert({
        product_id: t.productId,
        variant_id: t.variantId,
        packaging_id: t.packagingId,
      });
      if (!error) created += 1;
    }
    existing.add(key(t));
  }

  return { created, opened, units };
}
