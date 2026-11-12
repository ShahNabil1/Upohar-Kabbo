import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdmin } from "./admin.server";

/** Orders processed per network round-trip during a bulk RTS run. */
export const RTS_CHUNK_SIZE = 5;

const idsSchema = z.object({ orderIds: z.array(z.string().uuid()).min(1).max(500) });

export type RtsItemResult = {
  orderId: string;
  orderNumber: string;
  ok: boolean;
  consignmentId: string | null;
  message: string;
};

/** Creates the bulk job row and returns the chunked order id batches. */
export const adminStartRtsJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => idsSchema.parse(input))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    const ids = [...new Set(data.orderIds)];

    const { data: job, error } = await db
      .from("courier_bulk_jobs")
      .insert({
        provider: "mixed",
        created_by: context.userId,
        status: "running",
        total: ids.length,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await db
      .from("courier_bulk_job_items")
      .insert(ids.map((orderId) => ({ job_id: job.id, order_id: orderId })));

    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += RTS_CHUNK_SIZE) chunks.push(ids.slice(i, i + RTS_CHUNK_SIZE));

    return { jobId: job.id as string, total: ids.length, chunks };
  });

/** Processes one chunk. The client calls this repeatedly so nothing times out. */
export const adminProcessRtsChunk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        jobId: z.string().uuid(),
        orderIds: z.array(z.string().uuid()).min(1).max(RTS_CHUNK_SIZE),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ results: RtsItemResult[] }> => {
    const db = await requireAdmin(context.supabase, context.userId);
    const { actorName } = await import("./admin.server");
    const { dispatchOrder, dispatchBulkOrdersToCarrybee, providerKey } = await import(
      "./dispatch.server"
    );
    const who = await actorName(db, context.userId);

    /** Decide whether this chunk can be sent as one CarryBee bulk call. */
    const { data: orderRows } = await db
      .from("orders")
      .select("id, delivery_partner, courier_consignment_id, source")
      .in("id", data.orderIds);
    const orderMeta = (orderRows ?? []) as Array<{
      id: string;
      delivery_partner: string | null;
      courier_consignment_id: string | null;
      source: string | null;
    }>;

    // One order = single-order API. Two or more CarryBee orders = bulk API.
    const allCarrybee =
      data.orderIds.length > 1 &&
      orderMeta.length === data.orderIds.length &&
      orderMeta.every(
        (o) =>
          providerKey(o.delivery_partner) === "carrybee" &&
          !o.courier_consignment_id &&
          (o.source ?? "").toLowerCase() !== "exchange",
      );


    let results: RtsItemResult[] = [];

    if (allCarrybee) {
      results = (await dispatchBulkOrdersToCarrybee(db, data.orderIds, who)).map((res) => ({
        orderId: res.orderId,
        orderNumber: res.orderNumber,
        ok: res.ok,
        consignmentId: res.consignmentId,
        message: res.message,
      }));
      for (const res of results) {
        await db
          .from("courier_bulk_job_items")
          .update({
            status: res.ok ? "success" : "failed",
            message: res.message,
            consignment_id: res.consignmentId,
          })
          .eq("job_id", data.jobId)
          .eq("order_id", res.orderId);
      }
    } else {
      for (const orderId of data.orderIds) {
        const res = await dispatchOrder(db, orderId, who);
        results.push({
          orderId,
          orderNumber: res.orderNumber,
          ok: res.ok,
          consignmentId: res.consignmentId,
          message: res.message,
        });
        await db
          .from("courier_bulk_job_items")
          .update({
            status: res.ok ? "success" : "failed",
            message: res.message,
            consignment_id: res.consignmentId,
          })
          .eq("job_id", data.jobId)
          .eq("order_id", orderId);
      }
    }

    const { data: counts } = await db
      .from("courier_bulk_job_items")
      .select("status")
      .eq("job_id", data.jobId);
    const rows = counts ?? [];
    const done = rows.filter((r) => r.status !== "queued").length;
    const succeeded = rows.filter((r) => r.status === "success").length;
    const failed = rows.filter((r) => r.status === "failed").length;

    await db
      .from("courier_bulk_jobs")
      .update({
        processed: done,
        succeeded,
        failed,
        status: done >= rows.length ? "completed" : "running",
      })
      .eq("id", data.jobId);

    return { results };
  });

/** Single-order dispatch from the order workspace. */
export const adminSendOrderToCourier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ orderId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<RtsItemResult> => {
    const db = await requireAdmin(context.supabase, context.userId);
    const { actorName } = await import("./admin.server");
    const { dispatchOrder } = await import("./dispatch.server");
    const res = await dispatchOrder(db, data.orderId, await actorName(db, context.userId));
    return {
      orderId: res.orderId,
      orderNumber: res.orderNumber,
      ok: res.ok,
      consignmentId: res.consignmentId,
      message: res.message,
    };
  });

/** Pulls the latest status straight from the courier API for one order. */
export const adminRefreshCourierStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ orderId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string }> => {
    const db = await requireAdmin(context.supabase, context.userId);
    const { actorName, logActivity } = await import("./admin.server");
    const { loadPartner, providerKey } = await import("./dispatch.server");
    const { normaliseCourierStatus, courierStatusLabels } = await import("./delivery-shared");

    const { data: row } = await db
      .from("orders")
      .select("delivery_partner, courier_consignment_id, order_number, courier_status")
      .eq("id", data.orderId)
      .maybeSingle();
    const order = row as {
      delivery_partner: string | null;
      courier_consignment_id: string | null;
      order_number: string;
      courier_status: string | null;
    } | null;
    if (!order) return { ok: false, message: "Order not found" };

    const provider = providerKey(order.delivery_partner);
    if (!provider) return { ok: false, message: "No delivery partner on this order" };
    if (!order.courier_consignment_id) {
      return { ok: false, message: "This order has not been sent to the courier yet" };
    }

    try {
      const partner = await loadPartner(db, provider);
      let raw = "unknown";
      let liveFee: number | null = null;
      const { pathaoFeeFromInfo } = await import("./dispatch.server");


      if (provider === "steadfast") {
        const { steadfastStatusByCid } = await import("./steadfast.server");
        raw = await steadfastStatusByCid(
          {
            api_key: partner.credentials["api_key"]!,
            secret_key: partner.credentials["secret_key"]!,
          },
          order.courier_consignment_id,
        );
      } else if (provider === "pathao") {
        const { pathaoToken, pathaoOrderInfo } = await import("./pathao.server");
        const creds = {
          client_id: partner.credentials["client_id"]!,
          client_secret: partner.credentials["client_secret"]!,
          username: partner.credentials["username"]!,
          password: partner.credentials["password"]!,
        };
        const token = await pathaoToken(creds);
        const info = await pathaoOrderInfo(creds, token, order.courier_consignment_id);
        const d = (info["data"] ?? {}) as Record<string, unknown>;
        raw = (d["order_status"] as string) ?? "unknown";
        liveFee = pathaoFeeFromInfo(d);
      } else {
        const { carrybeeOrderDetails, carrybeeFeeFromDetails } = await import("./carrybee.server");
        const { carrybeeCreds } = await import("./dispatch.server");
        const d = await carrybeeOrderDetails(
          carrybeeCreds(partner),
          order.courier_consignment_id,
        );
        raw = String(d["transfer_status"] ?? d["order_status"] ?? d["status"] ?? "unknown");
        liveFee = carrybeeFeeFromDetails(d);
      }


      const refreshedStatus = normaliseCourierStatus(provider, raw);
      // Pathao's order-info endpoint can remain `Pending` even after a newer
      // webhook has created a return ID. Never let that stale response erase
      // a meaningful webhook state on refresh.
      const preservedStatuses = new Set([
        "picked",
        "in_transit",
        "delivered",
        "partial_delivered",
        "exchange",

        "hold",
        "return_id_created",
        "return_in_transit",
        "returned",
        "cancelled",
        "lost",
      ]);
      const status =
        (refreshedStatus === "pending" || refreshedStatus === "unknown") &&
        order.courier_status &&
        preservedStatuses.has(order.courier_status)
          ? (order.courier_status as typeof refreshedStatus)
          : refreshedStatus;
      const { courierToOrderStatus } = await import("./delivery-shared");
      const { nextOrderStatus } = await import("./dispatch.server");

      const { data: cur } = await db
        .from("orders")
        .select("status")
        .eq("id", data.orderId)
        .maybeSingle();
      const mapped = nextOrderStatus(
        (cur as { status?: string } | null)?.status ?? null,
        courierToOrderStatus[status],
      );

      await db
        .from("orders")
        .update({
          courier_status: status,
          ...(mapped ? { status: mapped as never } : {}),
        })
        .eq("id", data.orderId);
      await db
        .from("order_consignments")
        .update({
          status,
          status_message: raw,
          ...(liveFee !== null ? { total_cost: liveFee } : {}),
        })
        .eq("order_id", data.orderId)
        .eq("provider", provider);

      if (mapped) {
        try {
          const { applyOrderStock } = await import("./inventory-fulfilment.server");
          await applyOrderStock(db, data.orderId, mapped, { actorName: `${provider} sync` });
        } catch {
          // Inventory hiccups must never break a status refresh.
        }
      }


      return { ok: true, message: courierStatusLabels[status] ?? raw };
    } catch (error) {
      return { ok: false, message: (error as Error).message };
    }
  });

export type CourierWebhookEvent = {
  id: string;
  provider: string;
  event: string | null;
  status: string | null;
  message: string | null;
  createdAt: string;
  payloadJson: string;
};

/** Full A→Z webhook event history for one order (newest first). */
export const adminOrderWebhookEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        orderId: z.string().uuid(),
        limit: z.number().int().min(1).max(50).optional(),
        offset: z.number().int().min(0).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<CourierWebhookEvent[]> => {
    const db = await requireAdmin(context.supabase, context.userId);
    const { normaliseCourierStatus } = await import("./delivery-shared");

    const { data: row } = await db
      .from("orders")
      .select("order_number, courier_consignment_id")
      .eq("id", data.orderId)
      .maybeSingle();
    const order = row as { order_number: string; courier_consignment_id: string | null } | null;
    if (!order) return [];

    const filters = [`merchant_order_id.eq.${order.order_number}`];
    if (order.courier_consignment_id) {
      filters.push(`consignment_id.eq.${order.courier_consignment_id}`);
    }

    const { data: rows, error } = await db
      .from("courier_webhook_events")
      .select("id, provider, event, payload, created_at")
      .or(filters.join(","))
      .order("created_at", { ascending: false })
      .range(data.offset ?? 0, (data.offset ?? 0) + (data.limit ?? 200) - 1);
    if (error) throw new Error(error.message);

    return (rows ?? []).map((r) => {
      const payload = (r.payload ?? {}) as Record<string, unknown>;
      const raw =
        (payload["order_status"] as string) ??
        (payload["status"] as string) ??
        (payload["delivery_status"] as string) ??
        r.event ??
        null;
      return {
        id: r.id as string,
        provider: r.provider as string,
        event: (r.event as string) ?? null,
        status: raw
          ? normaliseCourierStatus(r.provider as "steadfast" | "pathao" | "carrybee", raw)
          : null,
        message:
          (payload["reason"] as string) ??
          (payload["note"] as string) ??
          (payload["message"] as string) ??
          raw ??
          null,
        createdAt: r.created_at as string,
        payloadJson: JSON.stringify(r.payload ?? {}, null, 2),
      };
    });
  });

export type PathaoDeliveryCost = {
  ok: boolean;
  message?: string;
  paid: boolean;
  provider: "pathao" | "carrybee" | null;
  lines: { label: string; amount: number; negative?: boolean }[];
  total: number;
};

/** "Cost of Delivery" breakdown for a single order (Pathao + CarryBee). */
export const adminPathaoDeliveryCost = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ orderId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<PathaoDeliveryCost> => {
    const db = await requireAdmin(context.supabase, context.userId);
    const { loadPartner, providerKey, carrybeeCreds } = await import("./dispatch.server");

    const empty: PathaoDeliveryCost = {
      ok: false,
      paid: false,
      provider: null,
      lines: [],
      total: 0,
    };

    const { data: row } = await db
      .from("orders")
      .select("delivery_partner, courier_consignment_id")
      .eq("id", data.orderId)
      .maybeSingle();
    const order = row as {
      delivery_partner: string | null;
      courier_consignment_id: string | null;
    } | null;
    if (!order) return { ...empty, message: "Order not found" };
    const provider = providerKey(order.delivery_partner);
    if (provider !== "pathao" && provider !== "carrybee") {
      return { ...empty, message: "Cost breakdown is not available for this courier" };
    }
    if (!order.courier_consignment_id) {
      return { ...empty, message: "Not sent to the courier yet" };
    }

    try {
      const partner = await loadPartner(db, provider);
      let d: Record<string, unknown> = {};

      if (provider === "pathao") {
        const { pathaoToken, pathaoOrderInfo } = await import("./pathao.server");
        const creds = {
          client_id: partner.credentials["client_id"]!,
          client_secret: partner.credentials["client_secret"]!,
          username: partner.credentials["username"]!,
          password: partner.credentials["password"]!,
        };
        const token = await pathaoToken(creds);
        const info = await pathaoOrderInfo(creds, token, order.courier_consignment_id);
        d = (info["data"] ?? {}) as Record<string, unknown>;
      } else {
        const { carrybeeOrderDetails } = await import("./carrybee.server");
        d = await carrybeeOrderDetails(carrybeeCreds(partner), order.courier_consignment_id);
      }

      const num = (...keys: string[]) => {
        for (const k of keys) {
          const v = d[k];
          if (v != null && v !== "" && !Number.isNaN(Number(v))) return Number(v);
        }
        return 0;
      };

      const deliveryFee = num("delivery_fee", "delivery_charge");
      const codFee = num("cod_fee", "collection_fee", "cod_charge");
      const discount = num("discount");
      const promoDiscount = num("promo_discount");
      const additional = num("additional_charge");
      const compensation = num("compensation_cost", "compensation");
      const invoiceId = d["invoice_id"] ?? d["payment_invoice_id"];
      const total =
        deliveryFee + codFee + additional + compensation - discount - promoDiscount;

      await db
        .from("order_consignments")
        .update({ total_cost: total })
        .eq("order_id", data.orderId)
        .eq("provider", provider);

      const lines = [
        { label: "Delivery Fee", amount: deliveryFee },
        { label: "COD Fee", amount: codFee },
        { label: "Discount", amount: discount, negative: true },
        { label: "Promo Discount", amount: promoDiscount, negative: true },
        { label: "Additional Charge", amount: additional },
        { label: "Compensation Cost", amount: compensation },
      ].filter((l) => provider === "pathao" || l.amount > 0 || l.label !== "Compensation Cost");

      return {
        ok: true,
        provider,
        paid: Boolean(invoiceId),
        total,
        lines,
      };
    } catch (error) {
      return { ...empty, message: (error as Error).message };
    }
  });


/** Courier states where a CarryBee parcel can still be cancelled (not picked yet). */
export const CARRYBEE_CANCELLABLE = ["pending", "unknown", "failed", "hold"] as const;

/** Cancels a CarryBee consignment with a reason, then cancels the order. */
export const adminCancelCarrybeeConsignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        orderId: z.string().uuid(),
        reason: z.string().trim().min(3).max(199),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string }> => {
    const db = await requireAdmin(context.supabase, context.userId);
    const { actorName, logActivity } = await import("./admin.server");
    const { loadPartner, providerKey, carrybeeCreds } = await import("./dispatch.server");

    const { data: row } = await db
      .from("orders")
      .select("delivery_partner, courier_consignment_id, courier_status, status")
      .eq("id", data.orderId)
      .maybeSingle();
    const order = row as {
      delivery_partner: string | null;
      courier_consignment_id: string | null;
      courier_status: string | null;
      status: string;
    } | null;
    if (!order) return { ok: false, message: "Order not found" };
    if (providerKey(order.delivery_partner) !== "carrybee") {
      return { ok: false, message: "Cancellation is only available for CarryBee orders" };
    }
    if (!order.courier_consignment_id) {
      return { ok: false, message: "This order has not been sent to CarryBee yet" };
    }
    if (!CARRYBEE_CANCELLABLE.includes((order.courier_status ?? "unknown") as never)) {
      return {
        ok: false,
        message: "The parcel has already been picked up — CarryBee can no longer cancel it",
      };
    }

    try {
      const partner = await loadPartner(db, "carrybee");
      const { carrybeeCancelOrder } = await import("./carrybee.server");
      await carrybeeCancelOrder(
        carrybeeCreds(partner),
        order.courier_consignment_id,
        data.reason,
      );

      await db
        .from("orders")
        .update({ status: "cancelled", courier_status: "cancelled" })
        .eq("id", data.orderId);
      await db
        .from("order_consignments")
        .update({ status: "cancelled", status_message: data.reason })
        .eq("order_id", data.orderId)
        .eq("provider", "carrybee");

      const who = await actorName(db, context.userId);
      await logActivity(
        db,
        data.orderId,
        "courier",
        `${who} cancelled the CarryBee consignment ${order.courier_consignment_id} — ${data.reason}`,
        { actor: who, meta: { provider: "carrybee", reason: data.reason } },
      );

      // Cancelling here changes the order status outside adminUpdateOrderStatus,
      // so the conversion fan-out (GA4 refund) is triggered explicitly.
      try {
        const { dispatchOrderEvents } = await import("./tracking-dispatch.server");
        await dispatchOrderEvents(db, data.orderId, "cancelled");
        const { applyOrderStock } = await import("./inventory-fulfilment.server");
        await applyOrderStock(db, data.orderId, "cancelled", { actorName: who });
      } catch {
        // Tracking outages must not fail the cancellation.
      }


      return { ok: true, message: "CarryBee consignment cancelled" };
    } catch (error) {
      return { ok: false, message: (error as Error).message };
    }
  });

export type CarrybeeAddressResolution = {
  ok: boolean;
  message: string;
  source?: "address-details" | "name-match";
  cityId?: number;
  cityName?: string;
  zoneId?: number;
  zoneName?: string;
  areaId?: number | null;
};

/** Re-resolves an order's address against CarryBee (address-details first). */
export const adminResolveCarrybeeAddress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ orderId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<CarrybeeAddressResolution> => {
    const db = await requireAdmin(context.supabase, context.userId);
    const { loadPartner, resolveCarrybeeLocation } = await import("./dispatch.server");

    const { data: row } = await db
      .from("orders")
      .select("address_line, division, district, upazila, city")
      .eq("id", data.orderId)
      .maybeSingle();
    if (!row) return { ok: false, message: "Order not found" };

    try {
      const partner = await loadPartner(db, "carrybee");
      const place = await resolveCarrybeeLocation(
        row as {
          address_line: string;
          division: string | null;
          district: string | null;
          upazila: string | null;
          city: string | null;
        },
        partner,
      );
      return {
        ok: true,
        message: `${place.cityName} · ${place.zoneName}`,
        source: place.source,
        cityId: place.cityId,
        cityName: place.cityName,
        zoneId: place.zoneId,
        zoneName: place.zoneName,
        areaId: place.areaId ?? null,
      };
    } catch (error) {
      return { ok: false, message: (error as Error).message };
    }
  });
