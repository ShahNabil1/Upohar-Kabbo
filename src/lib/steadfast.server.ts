/**
 * Steadfast Courier API (server-only).
 * Base: https://portal.packzy.com/api/v1
 * Auth headers: Api-Key, Secret-Key, Content-Type: application/json
 */

const DEFAULT_BASE = "https://portal.packzy.com/api/v1";

export type SteadfastCreds = { api_key: string; secret_key: string; base_url?: string };

async function call(creds: SteadfastCreds, path: string, init?: RequestInit) {
  const base = (creds.base_url || DEFAULT_BASE).replace(/\/+$/, "");
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      "Api-Key": creds.api_key,
      "Secret-Key": creds.secret_key,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  if (!res.ok) {
    const detail =
      (body as { message?: string } | null)?.message ??
      (body as { raw?: string } | null)?.raw ??
      "";
    const clean = String(detail).replace(/<[^>]*>/g, "").trim().slice(0, 200);
    const msg = clean
      ? `Steadfast (${res.status}): ${clean}`
      : `Steadfast request failed (${res.status})`;
    throw new Error(msg);
  }

  return (body ?? {}) as Record<string, unknown>;
}

/** Live connection check — uses the current balance endpoint. */
export async function steadfastCheck(creds: SteadfastCreds) {
  const res = await call(creds, "/get_balance", { method: "GET" });
  const balance = Number((res["current_balance"] as number) ?? 0);
  return { ok: Number(res["status"] ?? 200) === 200, message: `Connected · balance ৳${balance}` };
}

export type SteadfastOrderInput = {
  invoice: string;
  recipient_name: string;
  recipient_phone: string;
  recipient_address: string;
  cod_amount: number;
  note?: string;
  alternative_phone?: string;
  item_description?: string;
  total_lot?: number;
  delivery_type?: 0 | 1; // 0 = home delivery, 1 = point/hub delivery
};

export async function steadfastCreateOrder(creds: SteadfastCreds, order: SteadfastOrderInput) {
  const res = await call(creds, "/create_order", {
    method: "POST",
    body: JSON.stringify(order),
  });
  const c = (res["consignment"] ?? {}) as Record<string, unknown>;
  return {
    consignmentId: c["consignment_id"] != null ? String(c["consignment_id"]) : null,
    trackingCode: (c["tracking_code"] as string) ?? null,
    status: (c["status"] as string) ?? "pending",
    raw: res,
  };
}

/** Bulk create — Steadfast accepts max 500 per call; we chunk far smaller. */
export async function steadfastBulkCreate(creds: SteadfastCreds, orders: SteadfastOrderInput[]) {
  const res = await call(creds, "/create_order/bulk-order", {
    method: "POST",
    body: JSON.stringify({ data: orders }),
  });
  return res;
}

export async function steadfastStatusByCid(creds: SteadfastCreds, consignmentId: string) {
  const res = await call(creds, `/status_by_cid/${encodeURIComponent(consignmentId)}`, {
    method: "GET",
  });
  return (res["delivery_status"] as string) ?? "unknown";
}

export async function steadfastStatusByInvoice(creds: SteadfastCreds, invoice: string) {
  const res = await call(creds, `/status_by_invoice/${encodeURIComponent(invoice)}`, {
    method: "GET",
  });
  return (res["delivery_status"] as string) ?? "unknown";
}

export async function steadfastCreateReturn(creds: SteadfastCreds, consignmentId: string) {
  return call(creds, "/create_return_request", {
    method: "POST",
    body: JSON.stringify({ consignment_id: consignmentId }),
  });
}

/** 8. Get Payments — list of settled payout invoices. */
export async function steadfastPayments(creds: SteadfastCreds, page = 1) {
  const res = await call(creds, `/payments?page=${page}`, { method: "GET" });
  const data = res["data"] ?? res["payments"] ?? [];
  return Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
}

/** 9. Get Single Payment with Consignments. */
export async function steadfastPayment(creds: SteadfastCreds, paymentId: string) {
  const res = await call(creds, `/payments/${encodeURIComponent(paymentId)}`, { method: "GET" });
  const payment = (res["data"] ?? res["payment"] ?? res) as Record<string, unknown>;
  const raw =
    payment["consignments"] ?? payment["deliveries"] ?? payment["orders"] ?? res["consignments"];
  const consignments = Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [];
  return { payment, consignments };
}
