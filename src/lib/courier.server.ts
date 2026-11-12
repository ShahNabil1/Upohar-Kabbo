/**
 * BD Courier API helpers (server-only).
 * Docs: https://api.bdcourier.com
 *  - GET  /check-connection  → connection + auth status
 *  - GET  /my-plan           → subscription/limits
 *  - POST /courier-check     → { phone } courier fraud report
 *
 * Every response is cached in `courier_checks`; the API is only called on the
 * first lookup for a phone number or on an explicit manual refresh.
 */

import { getIntegrationValues } from "./integration-secrets.server";

const BASE_URL = "https://api.bdcourier.com";

export type CourierEntry = {
  key: string;
  name: string;
  logo: string | null;
  total_parcel: number;
  success_parcel: number;
  cancelled_parcel: number;
  success_ratio: number;
};

export type CourierReport = {
  id: string;
  name: string | null;
  details: string | null;
  created_at: string | null;
  courierLogo: string | null;
  courierName: string | null;
};

export type CourierCheckResult = {
  phone: string;
  summary: {
    total_parcel: number;
    success_parcel: number;
    cancelled_parcel: number;
    success_ratio: number;
  };
  couriers: CourierEntry[];
  reports: CourierReport[];
  checkedAt: string;
  cached: boolean;
};

async function apiKey(): Promise<string> {
  const key = (await getIntegrationValues())["BDCOURIER_API_KEY"];
  if (!key) throw new Error("BDCOURIER_API_KEY is not configured");
  return key;
}

async function request(path: string, init?: RequestInit) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${await apiKey()}`,
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
    const msg =
      (body as { message?: string } | null)?.message ?? `BD Courier request failed (${res.status})`;
    throw new Error(msg);
  }
  return body as Record<string, unknown>;
}

export function checkConnection() {
  return request("/check-connection", { method: "GET" });
}

export function myPlan() {
  return request("/my-plan", { method: "GET" });
}

const numOf = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** Normalises the raw `/courier-check` payload into a stable shape for the UI. */
export function normaliseCourierCheck(phone: string, raw: unknown): Omit<CourierCheckResult, "cached"> {
  const root = (raw ?? {}) as Record<string, unknown>;
  const data = (root["data"] ?? {}) as Record<string, unknown>;
  const summaryRaw = (data["summary"] ?? {}) as Record<string, unknown>;

  const couriers: CourierEntry[] = Object.entries(data)
    .filter(([key, value]) => key !== "summary" && value && typeof value === "object")
    .map(([key, value]) => {
      const v = value as Record<string, unknown>;
      return {
        key,
        name: typeof v["name"] === "string" ? (v["name"] as string) : key,
        logo: typeof v["logo"] === "string" ? (v["logo"] as string) : null,
        total_parcel: numOf(v["total_parcel"]),
        success_parcel: numOf(v["success_parcel"]),
        cancelled_parcel: numOf(v["cancelled_parcel"]),
        success_ratio: numOf(v["success_ratio"]),
      };
    })
    .sort((a, b) => b.total_parcel - a.total_parcel);

  const reportsRaw = Array.isArray(root["reports"]) ? (root["reports"] as unknown[]) : [];
  const reports: CourierReport[] = reportsRaw.map((item, index) => {
    const r = (item ?? {}) as Record<string, unknown>;
    return {
      id: typeof r["id"] === "string" ? (r["id"] as string) : String(index),
      name: typeof r["name"] === "string" ? (r["name"] as string) : null,
      details: typeof r["details"] === "string" ? (r["details"] as string) : null,
      created_at: typeof r["created_at"] === "string" ? (r["created_at"] as string) : null,
      courierLogo: typeof r["courierLogo"] === "string" ? (r["courierLogo"] as string) : null,
      courierName: typeof r["courierName"] === "string" ? (r["courierName"] as string) : null,
    };
  });

  const totals = couriers.reduce(
    (acc, c) => ({
      total: acc.total + c.total_parcel,
      success: acc.success + c.success_parcel,
      cancelled: acc.cancelled + c.cancelled_parcel,
    }),
    { total: 0, success: 0, cancelled: 0 },
  );

  const total = numOf(summaryRaw["total_parcel"]) || totals.total;
  const success = numOf(summaryRaw["success_parcel"]) || totals.success;
  const cancelled = numOf(summaryRaw["cancelled_parcel"]) || totals.cancelled;
  const ratio =
    summaryRaw["success_ratio"] !== undefined
      ? numOf(summaryRaw["success_ratio"])
      : total > 0
        ? Math.round((success / total) * 10000) / 100
        : 0;

  return {
    phone,
    summary: {
      total_parcel: total,
      success_parcel: success,
      cancelled_parcel: cancelled,
      success_ratio: ratio,
    },
    couriers,
    reports,
    checkedAt: new Date().toISOString(),
  };
}

export async function fetchCourierCheck(phone: string) {
  const raw = await request("/courier-check", {
    method: "POST",
    body: JSON.stringify({ phone }),
  });
  return normaliseCourierCheck(phone, raw);
}
