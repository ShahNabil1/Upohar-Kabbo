import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { actorName, requireAdmin, unwrap } from "./admin.server";
import {
  LEDGER_SELECT,
  LEVEL_SELECT,
  currentWac,
  mapLedger,
  mapLevel,
  syncCatalogStock,
} from "./inventory.server";
import {
  adjustSchema,
  ledgerQuerySchema,
  packagingSchema,
  receiveSchema,
  reorderSchema,
  reportQuerySchema,
  supplierSchema,
  type BatchRow,
  type InventoryReport,
  type InventoryRow,
  type LedgerRow,
  type PackagingRow,
  type SupplierRow,
} from "./inventory.shared";

/* ----------------------------- reads ----------------------------- */

export const inventoryLevels = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<InventoryRow[]> => {
    const db = await requireAdmin(context.supabase, context.userId);
    const rows = unwrap(
      await db.from("inventory_levels").select(LEVEL_SELECT).limit(2000),
    ) as unknown as Array<Record<string, unknown>>;
    return rows.map(mapLevel).sort((a, b) => a.name.localeCompare(b.name));
  });

export const inventoryMovements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ledgerQuerySchema.parse(input ?? {}))
  .handler(async ({ data, context }): Promise<LedgerRow[]> => {
    const db = await requireAdmin(context.supabase, context.userId);
    let q = db
      .from("stock_ledger")
      .select(LEDGER_SELECT)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.productId) q = q.eq("product_id", data.productId);
    if (data.variantId) q = q.eq("variant_id", data.variantId);
    if (data.packagingId) q = q.eq("packaging_id", data.packagingId);
    const rows = unwrap(await q) as unknown as Array<Record<string, unknown>>;
    return rows.map(mapLedger);
  });

export const inventoryBatches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BatchRow[]> => {
    const db = await requireAdmin(context.supabase, context.userId);
    const rows = unwrap(
      await db
        .from("inventory_batches")
        .select(
          "*, products(name_en,name_bn,sku), product_variants(group_name_en,value_en,sku), packaging_materials(name,sku), suppliers(name)",
        )
        .gt("qty_remaining", 0)
        .order("received_at", { ascending: false })
        .limit(500),
    ) as unknown as Array<Record<string, any>>;
    return rows.map((r) => ({
      id: r["id"],
      name:
        r["packaging_materials"]?.name ??
        `${r["products"]?.name_en ?? "Item"}${
          r["product_variants"] ? ` · ${r["product_variants"].value_en}` : ""
        }`,
      sku:
        r["product_variants"]?.sku ??
        r["products"]?.sku ??
        r["packaging_materials"]?.sku ??
        null,
      batchCode: r["batch_code"] ?? null,
      qtyRemaining: Number(r["qty_remaining"] ?? 0),
      unitCost: Number(r["unit_cost"] ?? 0),
      expiryDate: r["expiry_date"] ?? null,
      receivedAt: r["received_at"],
      supplierName: r["suppliers"]?.name ?? null,
    }));
  });

/** SKU-level pickable catalog items (products, variants, packaging). */
export const inventoryCatalogItems = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    const products = unwrap(
      await db
        .from("products")
        .select(
          "id,name_en,name_bn,sku,price,kind,category_id,categories(name_en),product_images(url,sort_order),product_variants(id,sku,group_name_en,value_en,price_delta,is_active)",
        )
        .neq("kind", "combo")
        .order("name_en")
        .limit(1000),
    ) as unknown as Array<Record<string, any>>;

    const packaging = unwrap(
      await db
        .from("packaging_materials")
        .select("id,name,sku,unit")
        .eq("is_active", true)
        .order("name"),
    ) as unknown as Array<Record<string, any>>;

    const items: Array<{
      key: string;
      productId: string | null;
      variantId: string | null;
      packagingId: string | null;
      label: string;
      sku: string;
      category: string;
      price: number;
      imageUrl: string | null;
    }> = [];

    for (const p of products) {
      const variants = (p["product_variants"] ?? []).filter((v: any) => v.is_active);
      const category = p["categories"]?.name_en ?? "Uncategorised";
      const imageUrl =
        [...((p["product_images"] ?? []) as Array<Record<string, any>>)].sort(
          (a, b) => Number(a["sort_order"] ?? 0) - Number(b["sort_order"] ?? 0),
        )[0]?.["url"] ?? null;
      if (variants.length === 0) {
        items.push({
          key: `p:${p["id"]}`,
          productId: p["id"],
          variantId: null,
          packagingId: null,
          label: p["name_en"] || p["name_bn"],
          sku: p["sku"] || "—",
          category,
          price: Number(p["price"] ?? 0),
          imageUrl,
        });
        continue;
      }
      for (const v of variants) {
        items.push({
          key: `v:${v.id}`,
          productId: p["id"],
          variantId: v.id,
          packagingId: null,
          label: `${p["name_en"] || p["name_bn"]} · ${v.group_name_en}: ${v.value_en}`,
          sku: v.sku || p["sku"] || "—",
          category,
          price: Number(p["price"] ?? 0) + Number(v.price_delta ?? 0),
          imageUrl,
        });
      }
    }

    for (const m of packaging) {
      items.push({
        key: `k:${m["id"]}`,
        productId: null,
        variantId: null,
        packagingId: m["id"],
        label: `${m["name"]} (packaging)`,
        sku: m["sku"] || "—",
        category: "Packaging",
        price: 0,
        imageUrl: null,
      });
    }

    return items;
  });

export const inventorySuppliers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SupplierRow[]> => {
    const db = await requireAdmin(context.supabase, context.userId);
    return unwrap(
      await db.from("suppliers").select("*").order("name"),
    ) as unknown as SupplierRow[];
  });

export const inventoryPackaging = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PackagingRow[]> => {
    const db = await requireAdmin(context.supabase, context.userId);
    return unwrap(
      await db.from("packaging_materials").select("*").order("name"),
    ) as unknown as PackagingRow[];
  });

/* ----------------------------- writes ---------------------------- */

export const saveSupplier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => supplierSchema.parse(input))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    const payload = {
      name: data.name,
      phone: data.phone || null,
      address: data.address || null,
      note: data.note || null,
      is_active: data.is_active,
    };
    if (data.id) {
      const { error } = await db.from("suppliers").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await db
      .from("suppliers")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: (row as { id: string }).id };
  });

export const savePackaging = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => packagingSchema.parse(input))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    const payload = {
      name: data.name,
      sku: data.sku || null,
      unit: data.unit,
      consumption: data.consumption,
      reorder_point: data.reorder_point,
      note: data.note || null,
      is_active: data.is_active,
    };
    if (data.id) {
      const { error } = await db.from("packaging_materials").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await db
      .from("packaging_materials")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: (row as { id: string }).id };
  });

/** Receives a purchase: one batch + one ledger entry per line. */
export const receiveStock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => receiveSchema.parse(input))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    const who = await actorName(db, context.userId);
    const receivedAt = data.receivedAt ?? new Date().toISOString();

    for (const line of data.lines) {
      const landed = line.unitCost + (line.quantity > 0 ? line.extraCost / line.quantity : 0);

      const { data: batch, error: bErr } = await db
        .from("inventory_batches")
        .insert({
          product_id: line.productId,
          variant_id: line.variantId,
          packaging_id: line.packagingId,
          supplier_id: data.supplierId,
          batch_code: line.batchCode || null,
          qty_received: line.quantity,
          qty_remaining: 0,
          unit_cost: line.unitCost,
          extra_cost: line.extraCost,
          received_at: receivedAt,
          expiry_date: line.expiryDate || null,
          invoice_no: data.invoiceNo || null,
          note: data.note || null,
          created_by: context.userId,
        })
        .select("id")
        .single();
      if (bErr) throw new Error(bErr.message);

      const { error: lErr } = await db.from("stock_ledger").insert({
        product_id: line.productId,
        variant_id: line.variantId,
        packaging_id: line.packagingId,
        batch_id: (batch as { id: string }).id,
        sku: line.sku || null,
        movement_type: "purchase_in",
        quantity: line.quantity,
        unit_cost: landed,
        total_cost: landed * line.quantity,
        reference_type: "purchase",
        reference_label: data.invoiceNo || null,
        note: data.note || null,
        actor_id: context.userId,
        actor_name: who,
      });
      if (lErr) throw new Error(lErr.message);

      await syncCatalogStock(db, line.productId, line.variantId);
    }

    return { received: data.lines.length };
  });

/** Loss / damage / expiry write-offs and manual count corrections. */
export const adjustStock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => adjustSchema.parse(input))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    const who = await actorName(db, context.userId);
    const wac = await currentWac(db, {
      productId: data.productId,
      variantId: data.variantId,
      packagingId: data.packagingId,
    });
    const signed = data.movementType === "adjust_in" ? data.quantity : -data.quantity;

    const { error } = await db.from("stock_ledger").insert({
      product_id: data.productId,
      variant_id: data.variantId,
      packaging_id: data.packagingId,
      sku: data.sku || null,
      movement_type: data.movementType,
      quantity: signed,
      unit_cost: wac,
      total_cost: wac * Math.abs(signed),
      reference_type: "adjustment",
      reason: data.reason || null,
      note:
        data.salvagePrice != null
          ? `${data.note ?? ""}${data.note ? " · " : ""}Salvage price ৳${data.salvagePrice}`
          : data.note || null,
      actor_id: context.userId,
      actor_name: who,
    });
    if (error) throw new Error(error.message);

    await syncCatalogStock(db, data.productId, data.variantId);
    return { ok: true };
  });

export const setReorderRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => reorderSchema.parse(input))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    const { error } = await db
      .from("inventory_levels")
      .update({ reorder_point: data.reorderPoint, reorder_qty: data.reorderQty })
      .eq("id", data.levelId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Reverses a ledger entry by writing its mirror image (never deletes). */
export const reverseMovement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    const who = await actorName(db, context.userId);
    const { data: src, error } = await db
      .from("stock_ledger")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    const row = src as Record<string, any>;

    const { error: insErr } = await db.from("stock_ledger").insert({
      product_id: row["product_id"],
      variant_id: row["variant_id"],
      packaging_id: row["packaging_id"],
      batch_id: row["batch_id"],
      sku: row["sku"],
      movement_type: "reversal",
      quantity: -Number(row["quantity"]),
      unit_cost: Number(row["unit_cost"] ?? 0),
      total_cost: Number(row["total_cost"] ?? 0),
      reference_type: "reversal",
      reference_id: row["id"],
      reverses_id: row["id"],
      reason: "Manual reversal",
      actor_id: context.userId,
      actor_name: who,
    });
    if (insErr) throw new Error(insErr.message);

    await syncCatalogStock(db, row["product_id"], row["variant_id"]);
    return { ok: true };
  });

/* --------------------- smart combo availability -------------------- */

export const comboAvailability = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    const { computeComboAvailability } = await import("./inventory.server");
    return computeComboAvailability(db);
  });

/** Mirrors combo buildable counts into `products.stock` so the shop stays honest. */
export const syncComboStock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    const { computeComboAvailability } = await import("./inventory.server");
    const rows = await computeComboAvailability(db);
    for (const c of rows) {
      await db.from("products").update({ stock: Math.max(c.buildable, 0) }).eq("id", c.id);
    }
    return { synced: rows.length };
  });

/** Period report: valuation, COGS, movers, dead stock, reorder plan. */
export const inventoryReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => reportQuerySchema.parse(input ?? {}))
  .handler(async ({ data, context }): Promise<InventoryReport> => {
    const db = await requireAdmin(context.supabase, context.userId);
    const { buildInventoryReport } = await import("./inventory-report.server");
    return buildInventoryReport(db, data.days);
  });

/**
 * First-run onboarding: pulls every catalog SKU into inventory and posts the
 * opening-stock movements. Idempotent — already-tracked items are skipped.
 */
export const importCatalogStock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    const who = await actorName(db, context.userId);
    const { onboardCatalogStock } = await import("./inventory.server");
    const result = await onboardCatalogStock(db, { id: context.userId, name: who });
    return result;
  });
