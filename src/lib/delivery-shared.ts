/**
 * Shared (client + server safe) delivery-partner metadata.
 * Providers: Steadfast, Pathao, Carrybee.
 */

export const DELIVERY_PROVIDERS = ["steadfast", "pathao", "carrybee"] as const;
export type DeliveryProvider = (typeof DELIVERY_PROVIDERS)[number];

export const providerLabels: Record<DeliveryProvider, string> = {
  steadfast: "Steadfast",
  pathao: "Pathao",
  carrybee: "Carrybee",
};

export type CredentialField = {
  key: string;
  label: string;
  placeholder?: string;
  secret?: boolean;
  optional?: boolean;
  hint?: string;
};

/** Credential inputs shown per provider — mirrors each provider's API docs. */
export const providerFields: Record<DeliveryProvider, CredentialField[]> = {
  steadfast: [
    { key: "api_key", label: "API Key", placeholder: "Api-Key from Steadfast portal", secret: true },
    { key: "secret_key", label: "Secret Key", placeholder: "Secret-Key from Steadfast portal", secret: true },
  ],
  pathao: [
    { key: "client_id", label: "Client ID", placeholder: "Pathao client id", secret: true },
    { key: "client_secret", label: "Client Secret", placeholder: "Pathao client secret", secret: true },
    { key: "username", label: "Merchant Email", placeholder: "merchant@example.com" },
    { key: "password", label: "Merchant Password", placeholder: "••••••••", secret: true },
  ],
  carrybee: [
    { key: "client_id", label: "Client ID", placeholder: "CarryBee Client-ID", secret: true },
    { key: "client_secret", label: "Client Secret", placeholder: "CarryBee Client-Secret", secret: true },
    { key: "client_context", label: "Client Context", placeholder: "CarryBee Client-Context", secret: true },
  ],

};

/** Normalised courier status used across the admin UI. */
export type CourierStatus =
  | "pending"
  | "in_review"
  | "failed"
  | "picked"
  | "in_transit"
  | "delivered"
  | "partial_delivered"
  | "exchange"
  | "hold"
  | "return_id_created"
  | "return_in_transit"
  | "returned"
  | "cancelled"
  | "lost"
  | "paid_invoice"
  | "unknown";

export const courierStatusLabels: Record<CourierStatus, string> = {
  pending: "Pending",
  in_review: "In review",
  failed: "Create failed",
  picked: "Picked up",
  in_transit: "In transit",
  delivered: "Delivered",
  partial_delivered: "Partial delivered",
  exchange: "Exchange",
  hold: "On hold",
  return_id_created: "Return ID Created",
  return_in_transit: "Return in transit",
  returned: "Returned to merchant",
  cancelled: "Cancelled",
  lost: "Lost / damaged",
  paid_invoice: "Payment invoice",
  unknown: "Unknown",
};


/**
 * Order status each normalised courier status drives.
 * `null` means the courier event is informational only — the order keeps
 * whatever status it already has. Mirrors `courier_webhook_apply` in the DB.
 */
export const courierToOrderStatus: Record<CourierStatus, string | null> = {
  // Pathao's created / updated / pickup-requested / assigned-for-pickup phase.
  pending: "rts",
  // Steadfast puts every freshly-created consignment in `in_review`.
  in_review: "rts",
  // CarryBee `order.create-failed` — the parcel was never created, fix + resend.
  failed: "pending",
  unknown: null,

  // Pathao payment invoices settle money, not parcels — order status untouched.
  paid_invoice: null,
  hold: "courier_hold",
  picked: "shipped",
  in_transit: "shipped",
  delivered: "delivered",
  partial_delivered: "partial_delivered",
  exchange: "exchange",
  return_id_created: "awaiting_return",
  return_in_transit: "awaiting_return",
  returned: "returned",
  cancelled: "cancelled",
  lost: "lost_damaged",
};


/** Maps a raw provider status string to our normalised status. */
export function normaliseCourierStatus(provider: DeliveryProvider, raw: string): CourierStatus {
  const s = raw.toLowerCase().replace(/[\s.\-]+/g, "_");
  if (provider === "pathao") {
    // Strip the `order_` prefix so events ("order.picked") and human labels
    // ("Picked") resolve to the same key.
    const key = s.replace(/^order_/, "");
    const map: Record<string, CourierStatus> = {
      // → RTS
      created: "pending",
      updated: "pending",
      pickup_requested: "pending",
      assigned_for_pickup: "pending",
      // → Shipped
      picked: "picked",
      pickup: "picked",
      at_the_sorting_hub: "in_transit",
      in_transit: "in_transit",
      received_at_last_mile_hub: "in_transit",
      assigned_for_delivery: "in_transit",
      // → Courier Hold
      pickup_failed: "hold",
      delivery_failed: "hold",
      on_hold: "hold",
      hold: "hold",
      // → Cancelled
      pickup_cancelled: "cancelled",
      cancelled: "cancelled",
      // → Delivered
      delivered: "delivered",
      // → Partial Delivered
      partial_delivery: "partial_delivered",
      partial_delivered: "partial_delivered",
      paid_return: "partial_delivered",
      // → Awaiting Return
      returned: "return_in_transit",
      return: "return_in_transit",
      return_id_created: "return_id_created",
      return_in_transit: "return_in_transit",
      pickup_failed_and_return: "return_in_transit",
      delivery_failed_and_return: "return_in_transit",
      // → Returned
      returned_to_merchant: "returned",
      return_completed: "returned",
      // → Exchange
      exchanged: "exchange",
      exchange: "exchange",
      // Money settlement only — no parcel movement.
      paid: "paid_invoice",
      payment_invoice: "paid_invoice",
      lost: "lost",
      damaged: "lost",
      lost_or_damaged: "lost",
    };
    return map[key] ?? "unknown";
  }

  if (provider === "carrybee") {
    // CarryBee webhook events arrive as "order.at-the-sorting-hub" etc.
    const key = s.replace(/^order_/, "");
    const map: Record<string, CourierStatus> = {
      // → RTS
      created: "pending",
      updated: "pending",
      pickup_requested: "pending",
      assigned_for_pickup: "pending",
      // → Pending again (creation rejected, fix the order and resend)
      create_failed: "failed",
      failed: "failed",
      // → Shipped
      picked: "picked",
      at_the_sorting_hub: "in_transit",
      on_the_way_to_central_warehouse: "in_transit",
      at_central_warehouse: "in_transit",
      in_transit: "in_transit",
      received_at_last_mile_hub: "in_transit",
      assigned_for_delivery: "in_transit",
      // → Courier Hold
      pickup_failed: "hold",
      delivery_on_hold: "hold",
      delivery_failed: "hold",
      // → Cancelled
      pickup_cancelled: "cancelled",
      cancelled: "cancelled",
      // → Returned (CarryBee has no awaiting-return step for us)
      returned: "returned",
      returned_at_sorting: "returned",
      returned_in_transit: "returned",
      returned_to_merchant: "returned",
      // → Partial delivered (money collected, payout still pending)
      partial_delivery: "partial_delivered",
      paid_return: "partial_delivered",
      // → Delivered
      delivered: "delivered",
      // → Exchange
      exchange: "exchange",
      // Money settlement only — flips the payment view to Paid.
      paid: "paid_invoice",
    };
    return map[key] ?? "unknown";
  }

  return genericStatus(s);
}



function genericStatus(s: string): CourierStatus {
  const map: Record<string, CourierStatus> = {
    pending: "pending",
    in_review: "in_review",
    review: "in_review",
    picked: "picked",
    picked_up: "picked",
    in_transit: "in_transit",
    shipped: "in_transit",
    out_for_delivery: "in_transit",
    delivered: "delivered",
    delivered_approval_pending: "delivered",
    partial_delivered: "partial_delivered",
    partial_delivery: "partial_delivered",
    partial_delivered_approval_pending: "partial_delivered",
    cancelled: "cancelled",
    canceled: "cancelled",
    cancelled_approval_pending: "cancelled",
    hold: "hold",
    on_hold: "hold",
    // Steadfast marks a parcel heading back to the merchant before it lands.
    return_in_transit: "return_in_transit",
    returning: "return_in_transit",
    return_requested: "return_in_transit",
    return_id_created: "return_id_created",
    returned: "returned",
    return: "returned",
    returned_to_merchant: "returned",
    paid_return: "returned",
    lost: "lost",
    damaged: "lost",
    lost_or_damaged: "lost",
    unknown_approval_pending: "unknown",
    unknown: "unknown",
  };
  return map[s] ?? "unknown";
}

export function courierStatusTone(status: CourierStatus): string {
  switch (status) {
    case "delivered":
      return "bg-emerald-50 text-emerald-700 ring-emerald-200";
    case "partial_delivered":
      return "bg-amber-50 text-amber-700 ring-amber-200";
    case "exchange":
      return "bg-violet-50 text-violet-700 ring-violet-200";

    case "in_transit":
    case "picked":
      return "bg-sky-50 text-sky-700 ring-sky-200";
    case "return_id_created":
    case "return_in_transit":
      return "bg-orange-50 text-orange-700 ring-orange-200";
    case "returned":
    case "cancelled":
      return "bg-rose-50 text-rose-700 ring-rose-200";
    case "lost":
      return "bg-neutral-900 text-white ring-neutral-700";
    case "hold":
      return "bg-orange-50 text-orange-700 ring-orange-200";
    default:
      return "bg-muted text-muted-foreground ring-border";
  }
}

/** Value stored in place of a secret once saved — never sent back to the browser. */
export const SECRET_MASK = "••••••••";
