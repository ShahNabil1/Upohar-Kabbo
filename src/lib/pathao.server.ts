/**
 * Pathao Courier (Aladdin) API — server-only.
 * Base: https://api-hermes.pathao.com (sandbox: https://courier-api-sandbox.pathao.com)
 */

const DEFAULT_BASE = "https://api-hermes.pathao.com";

export type PathaoCreds = {
  client_id: string;
  client_secret: string;
  username: string;
  password: string;
};

/** Pathao production API host is fixed. */
function base(_creds: PathaoCreds) {
  return DEFAULT_BASE;
}

async function parse(res: Response, label: string) {
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  if (!res.ok) {
    const b = body as { message?: string; errors?: unknown } | null;
    throw new Error(b?.message ?? `${label} failed (${res.status})`);
  }
  return (body ?? {}) as Record<string, unknown>;
}

/** Issues an access token with the password grant. */
export async function pathaoToken(creds: PathaoCreds): Promise<string> {
  const res = await fetch(`${base(creds)}/aladdin/api/v1/issue-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: creds.client_id,
      client_secret: creds.client_secret,
      username: creds.username,
      password: creds.password,
      grant_type: "password",
    }),
  });
  const body = await parse(res, "Pathao token");
  const token = body["access_token"];
  if (typeof token !== "string") throw new Error("Pathao did not return an access token");
  return token;
}

async function authed(
  creds: PathaoCreds,
  token: string,
  path: string,
  init?: RequestInit,
) {
  const res = await fetch(`${base(creds)}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });
  return parse(res, `Pathao ${path}`);
}

export type PathaoStore = { store_id: number; store_name: string };

export async function pathaoStores(creds: PathaoCreds, token: string): Promise<PathaoStore[]> {
  const body = await authed(creds, token, "/aladdin/api/v1/stores", { method: "GET" });
  const data = (body["data"] ?? {}) as Record<string, unknown>;
  const list = Array.isArray(data["data"]) ? (data["data"] as unknown[]) : [];
  return list.map((row) => {
    const r = (row ?? {}) as Record<string, unknown>;
    return {
      store_id: Number(r["store_id"] ?? 0),
      store_name: String(r["store_name"] ?? "Store"),
    };
  });
}

/** Live connection check — issues a token and lists stores. */
export async function pathaoCheck(creds: PathaoCreds) {
  const token = await pathaoToken(creds);
  const stores = await pathaoStores(creds, token);
  return {
    ok: true,
    message: stores.length ? `Connected · ${stores.length} store(s)` : "Connected",
    stores,
  };
}

export type PathaoOrderInput = {
  store_id: number;
  merchant_order_id: string;
  recipient_name: string;
  recipient_phone: string;
  recipient_address: string;
  recipient_city?: number;
  recipient_zone?: number;
  recipient_area?: number;
  delivery_type: 48 | 12;
  item_type: 1 | 2;
  special_instruction?: string;
  item_quantity: number;
  item_weight: number;
  item_description?: string;
  amount_to_collect: number;
};

export async function pathaoCreateOrder(
  creds: PathaoCreds,
  token: string,
  order: PathaoOrderInput,
) {
  const body = await authed(creds, token, "/aladdin/api/v1/orders", {
    method: "POST",
    body: JSON.stringify(order),
  });
  const data = (body["data"] ?? {}) as Record<string, unknown>;
  return {
    consignmentId: data["consignment_id"] != null ? String(data["consignment_id"]) : null,
    status: (data["order_status"] as string) ?? "pending",
    deliveryFee: data["delivery_fee"] != null ? Number(data["delivery_fee"]) : null,
    raw: body,
  };
}

export async function pathaoOrderInfo(creds: PathaoCreds, token: string, consignmentId: string) {
  return authed(creds, token, `/aladdin/api/v1/orders/${encodeURIComponent(consignmentId)}`, {
    method: "GET",
  });
}

export async function pathaoCities(creds: PathaoCreds, token: string) {
  return authed(creds, token, "/aladdin/api/v1/city-list", { method: "GET" });
}

export async function pathaoZones(creds: PathaoCreds, token: string, cityId: number) {
  return authed(creds, token, `/aladdin/api/v1/cities/${cityId}/zone-list`, { method: "GET" });
}

export async function pathaoAreas(creds: PathaoCreds, token: string, zoneId: number) {
  return authed(creds, token, `/aladdin/api/v1/zones/${zoneId}/area-list`, { method: "GET" });
}

export async function pathaoPrice(
  creds: PathaoCreds,
  token: string,
  input: {
    store_id: number;
    item_type: 1 | 2;
    delivery_type: 48 | 12;
    item_weight: number;
    recipient_city: number;
    recipient_zone: number;
  },
) {
  return authed(creds, token, "/aladdin/api/v1/merchant/price-plan", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
