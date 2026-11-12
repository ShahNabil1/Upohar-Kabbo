import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { actorName, requireAdmin, unwrap } from "./admin.server";
import { syncCatalogStock } from "./inventory.server";
import {
  derivedStatus,
  mapLine,
  mapOrder,
  mapPayment,
  nextPoNumber,
} from "./purchase-order.server";
import {
  poIdSchema,
  poSchema,
  poStatusSchema,
  receivePoSchema,
  supplierPaymentSchema,
  type PurchaseOrderDetail,
  type PurchaseOrderRow,
  type SupplierDueRow,
  type SupplierPaymentRow,
} from "./purchase-order.shared";

const PO_SELECT = "*, suppliers(name), purchase_order_lines(*)";
const PAYMENT_SELECT = "*, suppliers(name), purchase_orders(po_number)";

/* ------------------------------- reads ------------------------------- */

export const purchaseOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PurchaseOrderRow[]> => {
    const db = await requireAdmin(context.supabase, context.userId);
    const rows = unwrap(
      await db
        .from("purchase_orders")
        .select(PO_SELECT)
        .order("created_at", { ascending: false })
        .limit(300),
    ) as unknown as Array<Record<string, any>>;

    const payRows = unwrap(
      await db.from("supplier_payments").select("po_id,amount").limit(2000),
    ) as unknown as Array<{ po_id: string | null; amount: number }>;
    const paidByPo = new Map<string, number>();
    for (const p of payRows) {
      if (!p.po_id) continue;
      paidByPo.set(p.po_id, (paidByPo.get(p.po_id) ?? 0) + Number(p.amount ?? 0));
    }

    return rows.map((r) =>
      mapOrder(r, (r["purchase_order_lines"] ?? []).map(mapLine), paidByPo.get(r["id"]) ?? 0),
    );
  });

export const purchaseOrderDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => poIdSchema.parse(input))
  .handler(async ({ data, context }): Promise<PurchaseOrderDetail> => {
    const db = await requireAdmin(context.supabase, context.userId);
    const row = unwrap(
      await db.from("purchase_orders").select(PO_SELECT).eq("id", data.id).single(),
    ) as unknown as Record<string, any>;
    const payments = (
      unwrap(
        await db
          .from("supplier_payments")
          .select(PAYMENT_SELECT)
          .eq("po_id", data.id)
          .order("paid_at", { ascending: false }),
      ) as unknown as Array<Record<string, any>>
    ).map(mapPayment);

    const lines = (row["purchase_order_lines"] ?? [])
      .map(mapLine)
      .sort((a: { itemName: string }, b: { itemName: string }) =>
        a.itemName.localeCompare(b.itemName),
      );
    const paid = payments.reduce((s, p) => s + p.amount, 0);
    return { ...mapOrder(row, lines, paid), lines, payments };
  });

export const supplierDues = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SupplierDueRow[]> => {
    const db = await requireAdmin(context.supabase, context.userId);
    const [suppliers, orders, payments] = await Promise.all([
      db.from("suppliers").select("id,name").order("name"),
      db.from("purchase_orders").select("id,supplier_id,status,shipping_cost,discount,purchase_order_lines(qty_ordered,unit_cost)").limit(1000),
      db.from("supplier_payments").select("supplier_id,amount").limit(3000),
    ]);

    const billed = new Map<string, number>();
    const open = new Map<string, number>();
    for (const o of (orders.data ?? []) as Array<Record<string, any>>) {
      const sid = o["supplier_id"] as string | null;
      if (!sid || o["status"] === "draft" || o["status"] === "cancelled") continue;
      const items = (o["purchase_order_lines"] ?? []).reduce(
        (s: number, l: any) => s + Number(l.qty_ordered ?? 0) * Number(l.unit_cost ?? 0),
        0,
      );
      const total = Math.max(items + Number(o["shipping_cost"] ?? 0) - Number(o["discount"] ?? 0), 0);
      billed.set(sid, (billed.get(sid) ?? 0) + total);
      if (o["status"] !== "received") open.set(sid, (open.get(sid) ?? 0) + 1);
    }

    const paid = new Map<string, number>();
    for (const p of (payments.data ?? []) as Array<{ supplier_id: string; amount: number }>) {
      paid.set(p.supplier_id, (paid.get(p.supplier_id) ?? 0) + Number(p.amount ?? 0));
    }

    return ((suppliers.data ?? []) as Array<{ id: string; name: string }>)
      .map((s) => {
        const b = billed.get(s.id) ?? 0;
        const p = paid.get(s.id) ?? 0;
        return {
          supplierId: s.id,
          supplierName: s.name,
          billed: b,
          paid: p,
          due: b - p,
          openOrders: open.get(s.id) ?? 0,
        };
      })
      .filter((r) => r.billed > 0 || r.paid > 0)
      .sort((a, b) => b.due - a.due);
  });

export const supplierPayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SupplierPaymentRow[]> => {
    const db = await requireAdmin(context.supabase, context.userId);
    const rows = unwrap(
      await db
        .from("supplier_payments")
        .select(PAYMENT_SELECT)
        .order("paid_at", { ascending: false })
        .limit(100),
    ) as unknown as Array<Record<string, any>>;
    return rows.map(mapPayment);
  });

/* ------------------------------- writes ------------------------------ */

export const savePurchaseOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => poSchema.parse(input))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context.supabase, context.userId);

    const header = {
      supplier_id: data.supplierId,
      expected_at: data.expectedAt || null,
      shipping_cost: data.shippingCost,
      discount: data.discount,
      note: data.note || null,
    };

    let poId = data.id ?? null;
    if (poId) {
      const existing = unwrap(
        await db.from("purchase_orders").select("status").eq("id", poId).single(),
      ) as unknown as { status: string };
      if (existing.status === "received" || existing.status === "cancelled") {
        throw new Error("This purchase order is closed and can no longer be edited");
      }
      const { error } = await db.from("purchase_orders").update(header).eq("id", poId);
      if (error) throw new Error(error.message);
    } else {
      const { data: row, error } = await db
        .from("purchase_orders")
        .insert({ ...header, po_number: await nextPoNumber(db), created_by: context.userId })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      poId = (row as { id: string }).id;
    }

    // Received quantities must survive an edit, so keep them per line.
    const current = unwrap(
      await db.from("purchase_order_lines").select("id,qty_received").eq("po_id", poId),
    ) as unknown as Array<{ id: string; qty_received: number }>;
    const receivedById = new Map(current.map((l) => [l.id, Number(l.qty_received ?? 0)]));
    const keepIds = data.lines.map((l) => l.id).filter(Boolean) as string[];

    const stale = current.filter((l) => !keepIds.includes(l.id));
    for (const l of stale) {
      if ((receivedById.get(l.id) ?? 0) > 0) {
        throw new Error("A line that already has received stock cannot be removed");
      }
    }
    if (stale.length > 0) {
      const { error } = await db
        .from("purchase_order_lines")
        .delete()
        .in("id", stale.map((l) => l.id));
      if (error) throw new Error(error.message);
    }

    for (const line of data.lines) {
      const payload = {
        po_id: poId,
        product_id: line.productId,
        variant_id: line.variantId,
        packaging_id: line.packagingId,
        sku: line.sku || null,
        item_name: line.itemName || "Item",
        qty_ordered: line.qtyOrdered,
        unit_cost: line.unitCost,
      };
      if (line.id) {
        const { error } = await db.from("purchase_order_lines").update(payload).eq("id", line.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await db.from("purchase_order_lines").insert(payload);
        if (error) throw new Error(error.message);
      }
    }

    return { id: poId! };
  });

export const setPurchaseOrderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => poStatusSchema.parse(input))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    const row = unwrap(
      await db
        .from("purchase_orders")
        .select("status,purchase_order_lines(qty_received)")
        .eq("id", data.id)
        .single(),
    ) as unknown as Record<string, any>;

    const received = (row["purchase_order_lines"] ?? []).reduce(
      (s: number, l: any) => s + Number(l.qty_received ?? 0),
      0,
    );
    if (data.status === "draft" && received > 0) {
      throw new Error("Stock already received — this order cannot go back to draft");
    }
    if (data.status === "cancelled" && received > 0) {
      throw new Error("Stock already received — cancel is not possible, close it instead");
    }

    const { error } = await db
      .from("purchase_orders")
      .update({
        status: data.status,
        ordered_at: data.status === "ordered" ? new Date().toISOString() : row["ordered_at"] ?? null,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deletePurchaseOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => poIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    const row = unwrap(
      await db.from("purchase_orders").select("status").eq("id", data.id).single(),
    ) as unknown as { status: string };
    if (row.status !== "draft" && row.status !== "cancelled") {
      throw new Error("Only draft or cancelled purchase orders can be deleted");
    }
    const { error } = await db.from("purchase_orders").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Receiving against a PO writes real batches + immutable ledger rows (so WAC
 * updates exactly like a manual receive) and advances the PO progress.
 */
export const receivePurchaseOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => receivePoSchema.parse(input))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    const who = await actorName(db, context.userId);
    const receivedAt = data.receivedAt ?? new Date().toISOString();

    const po = unwrap(
      await db
        .from("purchase_orders")
        .select("id,po_number,status,supplier_id,purchase_order_lines(*)")
        .eq("id", data.poId)
        .single(),
    ) as unknown as Record<string, any>;
    if (po["status"] === "cancelled") throw new Error("This purchase order is cancelled");

    const lines = (po["purchase_order_lines"] ?? []).map(mapLine);
    let receivedCount = 0;

    for (const input of data.lines) {
      if (input.quantity <= 0) continue;
      const line = lines.find((l: { id: string }) => l.id === input.lineId);
      if (!line) continue;
      const remaining = line.qtyOrdered - line.qtyReceived;
      const qty = Math.min(input.quantity, Math.max(remaining, 0));
      if (qty <= 0) continue;

      const { data: batch, error: bErr } = await db
        .from("inventory_batches")
        .insert({
          product_id: line.productId,
          variant_id: line.variantId,
          packaging_id: line.packagingId,
          supplier_id: po["supplier_id"] ?? null,
          po_id: po["id"],
          qty_received: qty,
          qty_remaining: 0,
          unit_cost: input.unitCost,
          extra_cost: 0,
          received_at: receivedAt,
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
        sku: line.sku,
        movement_type: "purchase_in",
        quantity: qty,
        unit_cost: input.unitCost,
        total_cost: input.unitCost * qty,
        reference_type: "purchase_order",
        reference_id: po["id"],
        reference_label: `${po["po_number"]}${data.invoiceNo ? ` · ${data.invoiceNo}` : ""}`,
        note: data.note || null,
        actor_id: context.userId,
        actor_name: who,
      });
      if (lErr) throw new Error(lErr.message);

      const { error: uErr } = await db
        .from("purchase_order_lines")
        .update({ qty_received: line.qtyReceived + qty, unit_cost: input.unitCost })
        .eq("id", line.id);
      if (uErr) throw new Error(uErr.message);
      line.qtyReceived += qty;
      receivedCount += qty;

      await syncCatalogStock(db, line.productId, line.variantId);
    }

    const nextStatus = derivedStatus(
      po["status"] === "draft" ? "ordered" : po["status"],
      lines,
    );
    const { error: sErr } = await db
      .from("purchase_orders")
      .update({
        status: nextStatus,
        ordered_at: po["ordered_at"] ?? receivedAt,
      })
      .eq("id", po["id"]);
    if (sErr) throw new Error(sErr.message);

    return { received: receivedCount, status: nextStatus };
  });

export const recordSupplierPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => supplierPaymentSchema.parse(input))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    const { error } = await db.from("supplier_payments").insert({
      supplier_id: data.supplierId,
      po_id: data.poId,
      amount: data.amount,
      method: data.method,
      reference: data.reference || null,
      note: data.note || null,
      paid_at: data.paidAt ?? new Date().toISOString(),
      created_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteSupplierPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => poIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    const { error } = await db.from("supplier_payments").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
