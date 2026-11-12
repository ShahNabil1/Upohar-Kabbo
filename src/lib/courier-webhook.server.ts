/**
 * Courier webhook processing (server-only).
 *
 * Receives delivery-status callbacks from Steadfast / Pathao / Carrybee,
 * verifies the shared secret configured in Delivery Settings, records the raw
 * event, then syncs the normalised status onto the consignment + order.
 *
 * All database work runs through security-definer routines, so the receiver
 * only needs the public publishable key — never the service-role key.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

import {
  courierStatusLabels,
  normaliseCourierStatus,
  type DeliveryProvider,
} from "./delivery-shared";

/** Fixed value Pathao expects echoed back on every webhook response. */
export const PATHAO_INTEGRATION_SECRET = "f3992ecc-59da-4cbe-a049-a13da2018d51";
/** Fixed value registered in CarryBee's webhook configuration. */
export const CARRYBEE_INTEGRATION_SECRET = "40489fe0-9386-4fc9-8e92-2b2fcb9d451c";

type Payload = Record<string, unknown>;

type Db = SupabaseClient<Database>;

const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null;

/** Pulls the provider-specific identifiers + status out of a raw payload. */
export function parseCourierPayload(provider: DeliveryProvider, payload: Payload) {
  if (provider === "pathao") {
    return {
      event: str(payload["event"]),
      consignmentId: str(payload["consignment_id"]),
      merchantOrderId: str(payload["merchant_order_id"]),
      // `order_status` is the human label ("Pickup" for a picked parcel), so the
      // canonical machine values come first: slug, then the event name.
      rawStatus:
        str(payload["order_status_slug"]) ??
        str(payload["event"]) ??
        str(payload["order_status"]) ??
        "",
      message: str(payload["reason"]) ?? str(payload["order_status"]),

    };
  }
  if (provider === "carrybee") {
    const causes = payload["causes"];
    // CarryBee is inconsistent about key names between its docs, the test
    // ping and live events, so every known alias is accepted here.
    return {
      event: str(payload["event"]) ?? str(payload["event_type"]) ?? str(payload["type"]),
      consignmentId:
        str(payload["consignment_id"]) ??
        str(payload["consignmentId"]) ??
        str(payload["tracking_id"]) ??
        str(payload["tracking_code"]) ??
        str(payload["order_id"]),
      merchantOrderId:
        str(payload["merchant_order_id"]) ??
        str(payload["merchantOrderId"]) ??
        str(payload["merchant_order_no"]) ??
        str(payload["invoice"]) ??
        str(payload["reference"]),
      rawStatus:
        str(payload["event"]) ??
        str(payload["event_type"]) ??
        str(payload["status"]) ??
        str(payload["order_status"]) ??
        str(payload["order_status_slug"]) ??
        "",
      message:
        str(payload["reason"]) ??
        (Array.isArray(causes) ? causes.map((c) => String(c)).join(", ") : str(causes)) ??
        ([str(payload["agent_name"]), str(payload["agent_phone"])]
          .filter(Boolean)
          .join(" · ") || null),

    };
  }

  // Steadfast shares a flat delivery-status shape.

  // Steadfast posts two shapes: `delivery_status` updates and `tracking_update`
  // pings, with the parcel id sometimes under `tracking_code`/`trackingCode`.
  return {
    event: str(payload["notification_type"]) ?? str(payload["event"]) ?? "delivery_status",
    consignmentId:
      str(payload["consignment_id"]) ??
      str(payload["consignmentId"]) ??
      str(payload["tracking_code"]) ??
      str(payload["trackingCode"]),
    merchantOrderId:
      str(payload["invoice"]) ??
      str(payload["merchant_order_id"]) ??
      str(payload["merchantOrderId"]),
    rawStatus:
      str(payload["delivery_status"]) ??
      str(payload["status"]) ??
      str(payload["order_status"]) ??
      str(payload["tracking_message"]) ??
      "",
    message:
      str(payload["note"]) ?? str(payload["reason"]) ?? str(payload["tracking_message"]),
  };
}

/**
 * Compares the supplied secret with the one an admin saved for this provider.
 * The secret itself never leaves the database.
 */
export async function verifyWebhookSecret(
  db: Db,
  provider: DeliveryProvider,
  supplied: string,
): Promise<"ok" | "invalid" | "unconfigured"> {
  const { data, error } = await db.rpc("courier_webhook_check_secret", {
    _provider: provider,
    _supplied: supplied,
  });
  if (error) return "unconfigured";
  return (data as "ok" | "invalid" | "unconfigured" | null) ?? "unconfigured";
}

/**
 * Every payload key any part of the system actually reads: the provider
 * parsers above plus the `courier_webhook_apply` SQL routine. Anything else
 * (agent GPS traces, full order echoes, nested item arrays…) is dead weight
 * that would slowly fill the database, so it is dropped before storing.
 */
const KEEP_KEYS = new Set([
  "event",
  "event_type",
  "type",
  "notification_type",
  "consignment_id",
  "consignmentId",
  "tracking_id",
  "tracking_code",
  "trackingCode",
  "order_id",
  "merchant_order_id",
  "merchantOrderId",
  "merchant_order_no",
  "invoice",
  "reference",
  "status",
  "order_status",
  "order_status_slug",
  "delivery_status",
  "tracking_message",
  "reason",
  "note",
  "causes",
  "agent_name",
  "agent_phone",
  "updated_at",
  "timestamp",
  // Money / return / payout fields read by courier_webhook_apply
  "collected_amount",
  "collected_amount_in_bdt",
  "amount_collected",
  "partial_delivery_amount",
  "delivery_fee",
  "cod_amount",
  "total_fee",
  "return_id",
  "return_consignment_id",
  "return_order_id",
  "returned_consignment_id",
  "invoice_id",
  // Added by the receiver when the secret could not be verified
  "_unverified_header",
]);

const MAX_STRING = 500;

/** Keeps only the fields we read, with strings capped so one event stays tiny. */
export function slimCourierPayload(payload: Payload): Payload {
  const out: Payload = {};
  for (const [key, value] of Object.entries(payload)) {
    if (!KEEP_KEYS.has(key)) continue;
    if (typeof value === "string") {
      out[key] = value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
    } else if (Array.isArray(value)) {
      out[key] = value.slice(0, 10).map((v) => (typeof v === "object" ? JSON.stringify(v).slice(0, MAX_STRING) : v));
    } else if (value !== null && typeof value === "object") {
      continue;
    } else {
      out[key] = value as never;
    }
  }
  return out;
}

/**
 * Stores the raw event, then updates the matching consignment + order.
 * Never throws: webhook senders retry aggressively, so failures are recorded
 * on the event row instead.
 */
export async function processCourierWebhook(
  db: Db,
  provider: DeliveryProvider,
  payload: Payload,
): Promise<{ processed: boolean; message: string }> {
  // Parse from the full payload, store only the slimmed copy.
  const parsed = parseCourierPayload(provider, payload);
  const stored = slimCourierPayload(payload);
  const status = parsed.rawStatus ? normaliseCourierStatus(provider, parsed.rawStatus) : "";

  const { data, error } = await db.rpc("courier_webhook_apply", {
    _provider: provider,
    _event: parsed.event ?? "",
    _consignment_id: parsed.consignmentId ?? "",
    _merchant_order_id: parsed.merchantOrderId ?? "",
    _payload: stored as never,
    _status: status,
    _raw_status: parsed.rawStatus,
    _message: parsed.message ?? (status ? courierStatusLabels[status] : ""),
  });

  if (error) return { processed: false, message: error.message };
  const result = data as { processed?: boolean; message?: string } | null;

  // A courier callback can move the order to delivered / returned / cancelled,
  // which are conversion-relevant. The webhook runs with the publishable key,
  // so the fan-out uses the service-role client (RLS blocks anon here).
  // Never allowed to fail the acknowledgement — couriers retry aggressively.
  if (result?.processed) {
    const to = /→ order (shipped|cancelled)\b/.exec(result.message ?? "")?.[1];
    if (to) {
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        let orderId: string | null = null;
        if (parsed.consignmentId) {
          const { data: c } = await supabaseAdmin.from("order_consignments").select("order_id").eq("consignment_id", parsed.consignmentId).limit(1).maybeSingle();
          orderId = (c as { order_id?: string } | null)?.order_id ?? null;
        }
        if (!orderId && parsed.merchantOrderId) {
          const { data: o } = await supabaseAdmin.from("orders").select("id").eq("order_number", parsed.merchantOrderId).limit(1).maybeSingle();
          orderId = (o as { id?: string } | null)?.id ?? null;
        }
        if (orderId) {
          const { sendAutoStatusSms } = await import("./sms-auto.server");
          await sendAutoStatusSms(supabaseAdmin as never, orderId, to);
        }
      } catch {
        // SMS must never break webhook acknowledgement.
      }
    }
    try {
      await dispatchCourierConversions(provider, parsed.consignmentId, parsed.merchantOrderId);
    } catch {
      // Tracking outages must not break webhook acknowledgement.
    }
  }

  return {
    processed: result?.processed ?? false,
    message: result?.message ?? "No response from the database",
  };
}

/** Resolves the order touched by a courier callback and fires its conversions. */
async function dispatchCourierConversions(
  provider: DeliveryProvider,
  consignmentId: string | null,
  merchantOrderId: string | null,
): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { dispatchOrderEvents } = await import("./tracking-dispatch.server");

  let orderId: string | null = null;
  let orderStatus: string | null = null;

  if (consignmentId) {
    const { data } = await supabaseAdmin
      .from("order_consignments")
      .select("order_id, orders(status)")
      .eq("consignment_id", consignmentId)
      .eq("provider", provider)
      .maybeSingle();
    const row = data as { order_id?: string; orders?: { status?: string } | null } | null;
    orderId = row?.order_id ?? null;
    orderStatus = row?.orders?.status ?? null;
  }
  if (!orderId && merchantOrderId) {
    const { data } = await supabaseAdmin
      .from("orders")
      .select("id, status")
      .eq("order_number", merchantOrderId)
      .maybeSingle();
    const row = data as { id?: string; status?: string } | null;
    orderId = row?.id ?? null;
    orderStatus = row?.status ?? null;
  }
  if (!orderId || !orderStatus) return;

  await dispatchOrderEvents(supabaseAdmin as unknown as Db, orderId, orderStatus);

  // Courier-driven status changes move stock too (e.g. cancelled → back in).
  try {
    const { applyOrderStock } = await import("./inventory-fulfilment.server");
    await applyOrderStock(supabaseAdmin as unknown as Db, orderId, orderStatus, {
      actorName: `${provider} webhook`,
    });
  } catch {
    // Inventory hiccups must never break webhook processing.
  }

}
