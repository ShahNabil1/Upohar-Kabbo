/** Shared mapping + labels for public order receipts (client-safe). */

export type ReceiptRaw = {
  order_number: string;
  status: string;
  created_at: string;
  customer_name: string;
  customer_phone: string;
  address_line: string;
  city: string;
  delivery_area: string | null;
  upazila?: string | null;
  district?: string | null;
  division?: string | null;
  note?: string | null;
  subtotal: number;
  delivery_charge: number;
  discount: number;
  total: number;
  courier_provider?: string | null;
  courier_consignment_id?: string | null;
  courier_tracking_code?: string | null;
  coupon_code?: string | null;
  items: Array<{
    product_name: string;
    product_slug: string | null;
    variant_label: string | null;
    image_url?: string | null;
    unit_price: number;
    quantity: number;
    line_total: number;
    combo_selections?: Array<{
      item_name_bn?: string;
      item_name_en?: string;
      quantity?: number;
      variant_label_bn?: string;
      variant_label_en?: string;
      sku?: string | null;
    }>;
  }>;
} | null;

export function mapReceipt(order: ReceiptRaw) {
  if (!order) return null;
  return {
    orderNumber: order.order_number,
    status: order.status,
    createdAt: order.created_at,
    customerName: order.customer_name,
    customerPhone: order.customer_phone,
    addressLine: order.address_line,
    city: order.city,
    deliveryArea: order.delivery_area,
    upazila: order.upazila ?? null,
    district: order.district ?? null,
    division: order.division ?? null,
    note: order.note ?? null,
    subtotal: Number(order.subtotal),
    deliveryCharge: Number(order.delivery_charge),
    discount: Number(order.discount),
    couponCode: order.coupon_code ?? null,
    total: Number(order.total),
    courierProvider: order.courier_provider ?? null,
    courierConsignmentId: order.courier_consignment_id ?? null,
    courierTrackingCode: order.courier_tracking_code ?? null,
    items: (order.items ?? []).map((i) => ({
      name: i.product_name,
      slug: i.product_slug,
      variantLabel: i.variant_label,
      imageUrl: i.image_url ?? null,
      unitPrice: Number(i.unit_price),
      quantity: i.quantity,
      lineTotal: Number(i.line_total),
      comboSelections: (i.combo_selections ?? []).map((s) => ({
        itemNameBn: s.item_name_bn ?? "",
        itemNameEn: s.item_name_en ?? s.item_name_bn ?? "",
        quantity: Number(s.quantity ?? 1),
        variantLabelBn: s.variant_label_bn ?? "",
        variantLabelEn: s.variant_label_en ?? s.variant_label_bn ?? "",
        sku: s.sku ?? null,
      })),
    })),
  };
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  rts: "RTS (Ready To Ship)",
  confirmed: "Confirmed",
  processing: "Processing",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  returned: "Returned",
  incomplete: "Incomplete",
  no_response: "No Response",
  good_no_response: "Good — No Response",
  hold: "On Hold",
  partial_delivered: "Partially Delivered",
  awaiting_return: "Awaiting Return",
  unpaid: "Unpaid",
  paid: "Paid",
  lost_damaged: "Lost / Damaged",
  courier_hold: "Courier Hold",
  pre_order: "Pre-Order",
  scheduled_order: "Scheduled Order",
  exchange: "Exchange",
};

export function orderStatusLabel(status: string | null | undefined) {
  const key = String(status ?? "").toLowerCase();
  return (
    STATUS_LABELS[key] ??
    key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

/** Last 4 digits of a phone number — the short invoice link's verification code. */
export function phoneLast4(phone: string | null | undefined) {
  const digits = String(phone ?? "").replace(/\D/g, "");
  return digits.slice(-4);
}

/** Public parcel tracking link for the courier that carries the order. */
export function courierTrackingUrl(
  provider: string | null | undefined,
  consignmentId: string | null | undefined,
  trackingCode: string | null | undefined,
  phone?: string | null,
) {
  const key = String(provider ?? "").toLowerCase();
  const code = (trackingCode || consignmentId || "").trim();
  if (!key || !code) return null;
  if (key === "steadfast") return `https://steadfast.com.bd/t/${encodeURIComponent(code)}`;
  if (key === "pathao") {
    const digits = String(phone ?? "").replace(/\D/g, "");
    return `https://merchant.pathao.com/tracking?consignment_id=${encodeURIComponent(code)}&phone=${encodeURIComponent(digits)}`;
  }
  if (key === "carrybee") return `https://carrybee.com/tracking?consignment_id=${encodeURIComponent(code)}`;
  return null;
}

export function courierLabel(provider: string | null | undefined) {
  const key = String(provider ?? "").toLowerCase();
  if (key === "steadfast") return "Steadfast";
  if (key === "pathao") return "Pathao";
  if (key === "carrybee") return "CarryBee";
  return key ? key.replace(/\b\w/g, (c) => c.toUpperCase()) : "Courier";
}
