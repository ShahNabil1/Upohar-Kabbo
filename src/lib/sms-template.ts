import { phoneLast4 } from "./order-receipt";

/** Short receipt domain (Cloudflare-redirected to /inv/*) — keeps SMS segments low. */
export const RECEIPT_SHORT_URL = "https://upkb.ink";

/** Short invoice link used in SMS: https://upkb.ink/UK-03?p=6863 */
export function receiptUrl(orderNo: string, phone: string | null | undefined) {
  const code = phoneLast4(phone);
  return orderNo && code ? `${RECEIPT_SHORT_URL}/${orderNo}?p=${code}` : "";
}

/** Fills {{variables}} in an SMS template. Client-safe (no server-only imports). */
export function renderSmsTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key: string) => vars[key] ?? "");
}

/** Columns every SMS render needs (orders select string). */
export const ORDER_SMS_SELECT =
  "order_number, customer_name, customer_phone, total, address_line, upazila, district, scheduled_for, order_items(product_name, variant_label, quantity)";

type SmsOrderItem = {
  product_name?: string | null;
  variant_label?: string | null;
  quantity?: number | string | null;
};

function dhakaDate(value: unknown): string {
  if (!value) return "";
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", {
    timeZone: "Asia/Dhaka",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Builds the canonical variable map used for every order SMS. */
export function orderSmsVars(order: {
  customer_name?: string | null;
  order_number?: string | null;
  total?: number | string | null;
  customer_phone?: string | null;
  address_line?: string | null;
  upazila?: string | null;
  district?: string | null;
  scheduled_for?: string | null;
  order_items?: SmsOrderItem[] | null;
}): Record<string, string> {
  const orderNo = String(order.order_number ?? "");
  const items = (order.order_items ?? [])
    .map(
      (i) =>
        `${String(i.product_name ?? "")}${i.variant_label ? ` (${String(i.variant_label)})` : ""} x${Number(i.quantity ?? 1)}`,
    )
    .join(", ");
  return {
    name: String(order.customer_name ?? ""),
    order_no: orderNo,
    amount: String(Number(order.total ?? 0)),
    phone: String(order.customer_phone ?? ""),
    receipt_url: receiptUrl(orderNo, order.customer_phone),
    items,
    address: [order.address_line, order.upazila, order.district]
      .map((v) => (v ?? "").trim())
      .filter(Boolean)
      .join(", "),
    scheduled_date: dhakaDate(order.scheduled_for),
  };
}
