import type { Db } from "./admin.server";

/** Order status → automatic SMS template key. */
const STATUS_KEYS: Record<string, string> = {
  shipped: "shipped",
  cancelled: "order_cancelled",
  pre_order: "pre_order",
  scheduled_order: "scheduled_order",
};


/**
 * Sends the automatic SMS tied to an order status (if its template is on).
 * Sent at most once per template per order. Never throws.
 */
export async function sendAutoStatusSms(db: Db, orderId: string, status: string): Promise<void> {
  const key = STATUS_KEYS[status];
  if (!key) return;
  try {
    const { data: tpl } = await db
      .from("sms_templates")
      .select("body, enabled")
      .eq("key", key)
      .maybeSingle();
    const t = tpl as { body?: string; enabled?: boolean } | null;
    if (!t || t.enabled === false || !t.body) return;

    const { data: prior } = await db
      .from("order_activity")
      .select("id")
      .eq("order_id", orderId)
      .eq("kind", "sms")
      .contains("meta", { auto_key: key })
      .limit(1);
    if (prior && prior.length) return;

    const { renderSmsTemplate, orderSmsVars, ORDER_SMS_SELECT } = await import("./sms-template");
    const { data: order } = await db
      .from("orders")
      .select(ORDER_SMS_SELECT)
      .eq("id", orderId)
      .maybeSingle();
    const o = order as unknown as Record<string, unknown> | null;
    if (!o || !o["customer_phone"]) return;

    const message = renderSmsTemplate(t.body, orderSmsVars(o as never));
    const { deliverSms } = await import("./sms.server");
    const result = await deliverSms(db, {
      orderId,
      phone: String(o["customer_phone"]),
      message,
      isManual: false,
      sentByName: "System",
    });
    await db.from("order_activity").insert({
      order_id: orderId,
      kind: "sms",
      message: `Auto ${key.replace(/_/g, " ")} SMS ${result.ok ? "sent" : "failed"} — ${result.message}`,
      meta: { actor: "System", auto_key: key },
    });
  } catch {
    // SMS problems must never break the order flow.
  }
}
