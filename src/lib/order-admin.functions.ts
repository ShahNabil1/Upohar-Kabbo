import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdmin, actorName, logActivity, diffFields } from "./admin.server";
import { z } from "zod";

import {
  blockSchema,
  idSchema,
  orderCustomerSchema,
  orderDeliveryNoteSchema,
  orderItemsSchema,
  orderNoteSchema,
  smsRetrySchema,
  smsSendSchema,
} from "./admin-schema";

const orderRefSchema = z.object({ id: z.string().min(1) });

/** Full order workspace payload: order, items, activity, notes, SMS log, block state. */
export const adminOrderWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => orderRefSchema.parse(input))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context.supabase, context.userId);

    // The URL may carry either the UUID or the human order number (e.g. "uk-02").
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.id);
    const query = db
      .from("orders")
      .select("*, order_items(*), order_activity(id, kind, message, meta, created_at)");
    const { data: order, error } = await (isUuid
      ? query.eq("id", data.id)
      : query.ilike("order_number", data.id)
    ).maybeSingle();
    if (error) throw new Error(error.message);
    if (!order) return null;
    const orderId = (order as { id: string }).id;

    const o = order as unknown as Record<string, unknown>;

    // Record who opened the order: at most one entry per viewer per 30 min.
    // A view is also recorded right after a takeover, so the new handler's
    // entry always follows the takeover line. NOTE: it must never depend on
    // *other* people's views — that made two open tabs log each other in a
    // realtime refetch loop (endless "viewed this order" spam).
    const who = await actorName(db, context.userId);
    const [{ data: ownViews }, { data: takeovers }] = await Promise.all([
      db
        .from("order_activity")
        .select("created_at")
        .eq("order_id", orderId)
        .eq("kind", "view")
        .eq("meta->>actor", who)
        .order("created_at", { ascending: false })
        .limit(1),
      db
        .from("order_activity")
        .select("created_at")
        .eq("order_id", orderId)
        .eq("kind", "takeover")
        .order("created_at", { ascending: false })
        .limit(1),
    ]);
    const lastOwnAt = (ownViews ?? [])[0]
      ? new Date((ownViews as { created_at: string }[])[0]!.created_at).getTime()
      : 0;
    const lastTakeoverAt = (takeovers ?? [])[0]
      ? new Date((takeovers as { created_at: string }[])[0]!.created_at).getTime()
      : 0;
    const shouldLog =
      lastOwnAt === 0 ||
      Date.now() - lastOwnAt >= 30 * 60 * 1000 ||
      lastTakeoverAt > lastOwnAt;
    if (shouldLog) {
      await logActivity(db, orderId, "view", `${who} viewed this order`, { actor: who });
    }



    const [notes, sms, blocked, activity, redemption] = await Promise.all([
      db
        .from("order_notes")
        .select("*")
        .eq("order_id", orderId)
        .order("created_at", { ascending: false }),
      db
        .from("sms_logs")
        .select("*")
        .eq("order_id", orderId)
        .order("created_at", { ascending: false }),
      db
        .from("blocked_identifiers")
        .select("kind, value")
        .in(
          "value",
          [o["customer_ip"], o["device_fingerprint"], o["customer_phone"]].filter(
            (v): v is string => typeof v === "string" && v.length > 0,
          ),
        ),
      db
        .from("order_activity")
        .select("id, kind, message, meta, created_at")
        .eq("order_id", orderId)
        .order("created_at", { ascending: false })
        .limit(200),
      db
        .from("coupon_redemptions")
        .select("discount_amount, coupons(code, name)")
        .eq("order_id", orderId)
        .order("redeemed_at", { ascending: false })
        .limit(1),
    ]);

    const redeemed = ((redemption.data ?? [])[0] ?? null) as
      | { discount_amount: number; coupons: { code: string; name: string } | null }
      | null;
    const coupon = redeemed?.coupons
      ? {
          code: redeemed.coupons.code,
          name: redeemed.coupons.name,
          amount: Number(redeemed.discount_amount ?? 0),
        }
      : null;

    // Attach product/sub-product thumbnails and fall back to the catalogue SKU
    // so the items card can show images for combo children too.
    type RawSelection = Record<string, unknown>;
    type RawItem = Record<string, unknown> & { combo_selections?: RawSelection[] | null };
    const rawItems = ((o["order_items"] as RawItem[] | null) ?? []).slice();
    const catalogIds = new Set<string>();
    for (const it of rawItems) {
      if (typeof it["product_id"] === "string") catalogIds.add(it["product_id"] as string);
      for (const sel of it.combo_selections ?? []) {
        if (typeof sel["item_id"] === "string") catalogIds.add(sel["item_id"] as string);
      }
    }
    const catalog = catalogIds.size
      ? ((
          await db
            .from("products")
            .select("id, sku, product_images(url, sort_order)")
            .in("id", [...catalogIds])
        ).data ?? [])
      : [];
    const meta = new Map<string, { image: string | null; sku: string | null }>();
    for (const row of catalog as Array<{
      id: string;
      sku: string | null;
      product_images: Array<{ url: string; sort_order: number | null }> | null;
    }>) {
      const first = [...(row.product_images ?? [])].sort(
        (a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0),
      )[0];
      meta.set(row.id, { image: first?.url ?? null, sku: row.sku });
    }
    const itemsWithMedia = rawItems.map((it) => {
      const own = typeof it["product_id"] === "string" ? meta.get(it["product_id"] as string) : undefined;
      return {
        ...it,
        image: own?.image ?? null,
        combo_selections: (it.combo_selections ?? []).map((sel) => {
          const child = typeof sel["item_id"] === "string" ? meta.get(sel["item_id"] as string) : undefined;
          return { ...sel, image: child?.image ?? null, sku: sel["sku"] ?? child?.sku ?? null };
        }),
      };
    });

    return {
      order: {
        ...(order as object),
        order_items: itemsWithMedia,
        order_activity: activity.data ?? [],
        coupon,
      },
      notes: notes.data ?? [],
      sms: sms.data ?? [],
      blocked: (blocked.data ?? []) as Array<{ kind: string; value: string }>,
    };

  });

/** Update the full customer & delivery block of an order. */
export const adminUpdateOrderCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => orderCustomerSchema.parse(input))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    const who = await actorName(db, context.userId);

    const { data: before } = await db
      .from("orders")
      .select("customer_name, customer_phone, alt_phone, division, district, upazila, address_line")
      .eq("id", data.id)
      .maybeSingle();

    const after = {
      customer_name: data.customerName,
      customer_phone: data.customerPhone,
      alt_phone: data.altPhone,
      division: data.division || null,
      district: data.district || null,
      upazila: data.upazila || null,
      city: data.district || data.division || "—",
      address_line: data.addressLine,
    };

    const { error } = await db.from("orders").update(after).eq("id", data.id);
    if (error) throw new Error(error.message);

    const changes = diffFields((before ?? {}) as Record<string, unknown>, after, {
      customer_name: "Name",
      customer_phone: "Phone",
      alt_phone: "Alt phone",
      division: "Division",
      district: "District",
      upazila: "Thana/Upazila",
      address_line: "Address",
    });
    await logActivity(
      db,
      data.id,
      "edit",
      changes.length > 0
        ? `${who} updated customer details — ${changes.join(" · ")}`
        : `${who} saved customer details (no changes)`,
      { actor: who, meta: { changes } },
    );
    return { ok: true };
  });

/** Delivery note forwarded to the courier partner at booking time. */
export const adminSaveDeliveryNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => orderDeliveryNoteSchema.parse(input))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    const who = await actorName(db, context.userId);
    const { data: before } = await db
      .from("orders")
      .select("delivery_note")
      .eq("id", data.id)
      .maybeSingle();
    const previous = (before as { delivery_note?: string | null } | null)?.delivery_note ?? "";
    const { error } = await db
      .from("orders")
      .update({ delivery_note: data.deliveryNote || null })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    if (previous !== (data.deliveryNote || "")) {
      await logActivity(
        db,
        data.id,
        "edit",
        `${who} updated the delivery note — ${previous || "—"} → ${data.deliveryNote || "—"}`,
        { actor: who },
      );
    }
    return { ok: true };
  });

/** Replace the order line items and recompute the totals. */
export const adminSaveOrderItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => orderItemsSchema.parse(input))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    const who = await actorName(db, context.userId);

    const subtotal = data.items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
    const total = Math.max(0, subtotal + data.deliveryCharge - data.discount);

    const { data: beforeOrder } = await db
      .from("orders")
      .select("subtotal, total, discount, delivery_charge, advance_amount, advance_method")
      .eq("id", data.id)
      .maybeSingle();
    const { data: beforeItems } = await db
      .from("order_items")
      .select("product_name, variant_label, quantity, unit_price")
      .eq("order_id", data.id);

    const del = await db.from("order_items").delete().eq("order_id", data.id);
    if (del.error) throw new Error(del.error.message);

    const ins = await db.from("order_items").insert(
      data.items.map((i) => ({
        order_id: data.id,
        product_id: i.productId,
        product_name: i.productName,
        variant_label: i.variantLabel,
        sku: i.sku,
        unit_price: i.unitPrice,
        quantity: i.quantity,
        line_total: i.unitPrice * i.quantity,
        combo_selections: i.comboSelections.map((selection) => ({
          item_id: selection.itemId,
          item_name_bn: selection.itemNameBn,
          item_name_en: selection.itemNameEn,
          quantity: selection.quantity,
          variant_id: selection.variantId,
          variant_label_bn: selection.variantLabelBn,
          variant_label_en: selection.variantLabelEn,
          sku: selection.sku,
        })),
      })),
    );
    if (ins.error) throw new Error(ins.error.message);

    const advance = Math.min(data.advanceAmount, total);
    const upd = await db
      .from("orders")
      .update({
        subtotal,
        delivery_charge: data.deliveryCharge,
        discount: data.discount,
        total,
        advance_amount: advance,
        advance_method: advance > 0 ? data.advanceMethod : null,
        payment_method: advance > 0 ? "partial_advance" : "cod",
      })
      .eq("id", data.id);
    if (upd.error) throw new Error(upd.error.message);

    const label = (name: string, variant: string | null, qty: number) =>
      `${name}${variant ? ` (${variant})` : ""} ×${qty}`;
    const oldList = (beforeItems ?? []).map((i) =>
      label(i.product_name, i.variant_label, i.quantity),
    );
    const newList = data.items.map((i) => label(i.productName, i.variantLabel ?? null, i.quantity));
    const changes: string[] = [];
    if (oldList.join(", ") !== newList.join(", ")) {
      changes.push(`Products: ${oldList.join(", ") || "—"} → ${newList.join(", ") || "—"}`);
    }
    const b = (beforeOrder ?? {}) as Record<string, unknown>;
    const money = (k: string, lbl: string, next: number) => {
      if (Number(b[k] ?? 0) !== next) changes.push(`${lbl}: ৳${Number(b[k] ?? 0)} → ৳${next}`);
    };
    money("delivery_charge", "Shipping", data.deliveryCharge);
    money("discount", "Discount", data.discount);
    money("advance_amount", "Advance", advance);
    money("total", "Total", total);
    if ((b["advance_method"] ?? null) !== (advance > 0 ? data.advanceMethod : null)) {
      changes.push(
        `Advance method: ${String(b["advance_method"] ?? "—")} → ${advance > 0 ? data.advanceMethod : "—"}`,
      );
    }

    await logActivity(
      db,
      data.id,
      "edit",
      changes.length > 0
        ? `${who} updated the order items — ${changes.join(" · ")}`
        : `${who} saved order items (no changes)`,
      { actor: who, meta: { changes } },
    );
    return { ok: true, subtotal, total };
  });

/** Internal staff-only note. Never shown to customers. */
export const adminAddOrderNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => orderNoteSchema.parse(input))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    const who = await actorName(db, context.userId);
    const { error } = await db.from("order_notes").insert({
      order_id: data.orderId,
      author_id: context.userId,
      author_name: who,
      body: data.body,
    });
    if (error) throw new Error(error.message);
    await logActivity(db, data.orderId, "note", `${who} added an internal note — "${data.body}"`, {
      actor: who,
    });
    return { ok: true };
  });

export const adminDeleteOrderNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => idSchema.parse(input))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    const { error } = await db.from("order_notes").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Block or unblock any combination of IP, device fingerprint and phone number. */
export const adminSetBlocked = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => blockSchema.parse(input))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    const who = await actorName(db, context.userId);

    if (data.action === "block") {
      const { error } = await db.from("blocked_identifiers").upsert(
        data.targets.map((t) => ({
          kind: t.kind,
          value: t.value,
          reason: data.reason || null,
          blocked_by: context.userId,
        })),
        { onConflict: "kind,value" },
      );
      if (error) throw new Error(error.message);
    } else {
      for (const t of data.targets) {
        const { error } = await db
          .from("blocked_identifiers")
          .delete()
          .eq("kind", t.kind)
          .eq("value", t.value);
        if (error) throw new Error(error.message);
      }
    }

    const list = data.targets.map((t) => `${t.kind} ${t.value}`).join(", ");
    await logActivity(
      db,
      data.orderId,
      "security",
      `${who} ${data.action === "block" ? "blocked" : "unblocked"} ${list}${
        data.action === "block" && data.reason ? ` — ${data.reason}` : ""
      }`,
      { actor: who },
    );
    return { ok: true };
  });

/** Sends an SMS through BulkSMSBD and records it in the communication log. */
export const adminSendSms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => smsSendSchema.parse(input))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    const { deliverSms, renderSmsTemplate } = await import("./sms.server");
    const { receiptUrl } = await import("./sms-template");
    const { data: profile } = await db
      .from("profiles")
      .select("full_name")
      .eq("id", context.userId)
      .maybeSingle();

    // Resolve {{variables}} against the real order so the log and the SMS match.
    const { data: order } = await db
      .from("orders")
      .select("order_number, customer_name, customer_phone, total")
      .eq("id", data.orderId)
      .maybeSingle();
    const o = (order ?? {}) as unknown as Record<string, unknown>;
    const orderNo = String(o["order_number"] ?? "");
    const message = renderSmsTemplate(data.message, {
      name: String(o["customer_name"] ?? ""),
      order_no: orderNo,
      amount: String(Number(o["total"] ?? 0)),
      phone: String(o["customer_phone"] ?? data.phone),
      receipt_url: receiptUrl(orderNo, String(o["customer_phone"] ?? data.phone)),
    });

    const who = (profile?.full_name as string | null) ?? "Staff";
    const result = await deliverSms(db, {
      orderId: data.orderId,
      phone: data.phone,
      message,
      isManual: true,
      sentBy: context.userId,
      sentByName: who,
    });
    await logActivity(
      db,
      data.orderId,
      "sms",
      `${who} sent an SMS to ${data.phone} — ${result.ok ? "delivered" : "failed"} (${result.message})`,
      { actor: who, meta: { message } },
    );
    return { ok: result.ok, code: result.code, message: result.message };
  });

/** Retry a failed SMS by re-sending the same message through the gateway. */
export const adminRetrySms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => smsRetrySchema.parse(input))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    const { deliverSms } = await import("./sms.server");
    const { data: row, error } = await db
      .from("sms_logs")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("SMS not found");

    const r = row as unknown as Record<string, unknown>;
    const who = await actorName(db, context.userId);
    const result = await deliverSms(db, {
      orderId: (r["order_id"] as string | null) ?? null,
      phone: r["phone"] as string,
      message: r["message"] as string,
      isManual: true,
      sentBy: context.userId,
      sentByName: (r["sent_by_name"] as string | null) ?? who,
    });
    if (r["order_id"]) {
      await logActivity(
        db,
        r["order_id"] as string,
        "sms",
        `${who} retried an SMS to ${String(r["phone"])} — ${result.ok ? "delivered" : "failed"}`,
        { actor: who },
      );
    }
    return { ok: result.ok, code: result.code, message: result.message };
  });

/** Remaining BulkSMSBD credit balance, shown in the SMS card. */
export const adminSmsBalance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { getSmsBalance } = await import("./sms.server");
    return getSmsBalance();
  });

