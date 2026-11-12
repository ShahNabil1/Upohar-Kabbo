/**
 * Server-side tracking configuration & connection probes (server-only).
 *
 * The browser pixels (Meta, TikTok, GA4, Clarity) are all loaded through the
 * GTM container. This module only owns the *server* side: the credentials used
 * by Meta Conversions API, TikTok Events API and GA4 Measurement Protocol,
 * plus the "Test connection" probes shown in the admin panel.
 */

import { getIntegrationValues } from "./integration-secrets.server";

export type TrackingConfig = {
  gtmId: string;
  metaPixelId: string;
  metaCapiToken: string;
  metaTestCode: string;
  tiktokPixelId: string;
  tiktokToken: string;
  tiktokTestCode: string;
  ga4MeasurementId: string;
  ga4ApiSecret: string;
  metaApiVersion: string;
};

export async function readTrackingConfig(): Promise<TrackingConfig> {
  const v = await getIntegrationValues();
  const s = (k: string) => (v[k] ?? "").trim();
  return {
    gtmId: s("GTM_CONTAINER_ID"),
    metaPixelId: s("META_PIXEL_ID"),
    metaCapiToken: s("META_CAPI_ACCESS_TOKEN"),
    metaTestCode: s("META_TEST_EVENT_CODE"),
    tiktokPixelId: s("TIKTOK_PIXEL_ID"),
    tiktokToken: s("TIKTOK_EVENTS_ACCESS_TOKEN"),
    tiktokTestCode: s("TIKTOK_TEST_EVENT_CODE"),
    ga4MeasurementId: s("GA4_MEASUREMENT_ID"),
    ga4ApiSecret: s("GA4_API_SECRET"),
    metaApiVersion: s("META_API_VERSION") || "v21.0",
  };
}

/** SHA-256 hex — Meta requires hashed values for identity fields. */
async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input.trim().toLowerCase()));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export type Probe = {
  ok: boolean;
  message: string;
  details: { label: string; value: string }[];
};

/** GTM has no API — validate the container id shape instead. */
export function probeGtm(cfg: TrackingConfig): Probe {
  if (!cfg.gtmId) return { ok: false, message: "Container ID missing", details: [] };
  if (!/^GTM-[A-Z0-9]{6,9}$/i.test(cfg.gtmId))
    return { ok: false, message: `"${cfg.gtmId}" is not a valid GTM container ID`, details: [] };
  return {
    ok: true,
    message: "Container ID valid — injected on every page",
    details: [
      { label: "Container", value: cfg.gtmId.toUpperCase() },
      { label: "Loads", value: "Meta Pixel · TikTok Pixel · GA4 · Clarity" },
    ],
  };
}

/** Sends a Meta CAPI test payload; Graph replies with events_received. */
export async function probeMetaCapi(cfg: TrackingConfig): Promise<Probe> {
  if (!cfg.metaPixelId || !cfg.metaCapiToken)
    return { ok: false, message: "Pixel ID or access token missing", details: [] };

  // Meta rejects the payload ("Invalid parameter") unless user_data carries at
  // least one real matching key — a UA string alone is not enough. A synthetic
  // fbp + IP + hashed external_id satisfies the requirement for the probe.
  const now = Math.floor(Date.now() / 1000);
  const externalId = await sha256Hex(`connection-test-${cfg.metaPixelId}`);
  const body: Record<string, unknown> = {
    data: [
      {
        event_name: "PageView",
        event_time: now,
        event_id: `conn-test.${Date.now()}`,
        action_source: "website",
        event_source_url: "https://upoharkabbo.com/",
        user_data: {
          client_user_agent: "UpoharkabboConnectionTest/1.0",
          client_ip_address: "203.0.113.1",
          fbp: `fb.1.${Date.now()}.1234567890`,
          external_id: externalId,
        },
      },
    ],
  };
  if (cfg.metaTestCode) body["test_event_code"] = cfg.metaTestCode;

  const res = await fetch(
    `https://graph.facebook.com/${cfg.metaApiVersion}/${cfg.metaPixelId}/events?access_token=${encodeURIComponent(cfg.metaCapiToken)}`,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
  );
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = (json["error"] ?? {}) as Record<string, unknown>;
    // error_user_msg / error_data explain *which* field Meta rejected; the bare
    // "Invalid parameter" title alone is useless for debugging.
    const detail =
      err["error_user_msg"] ??
      (err["error_data"] as Record<string, unknown> | undefined)?.["details"] ??
      "";
    const base = String(err["message"] ?? `Graph API error ${res.status}`);
    return {
      ok: false,
      message: detail ? `${base} — ${String(detail)}` : base,
      details: [],
    };
  }
  return {
    ok: true,
    message: "Test event accepted by Meta",
    details: [
      { label: "Dataset", value: cfg.metaPixelId },
      { label: "Events received", value: String(json["events_received"] ?? 1) },
      { label: "Test mode", value: cfg.metaTestCode || "Live" },
      { label: "API version", value: cfg.metaApiVersion },
    ],
  };
}

/** TikTok Events API 2.0 — a test PageView proves pixel + token pairing. */
export async function probeTikTok(cfg: TrackingConfig): Promise<Probe> {
  if (!cfg.tiktokPixelId || !cfg.tiktokToken)
    return { ok: false, message: "Pixel ID or access token missing", details: [] };

  const payload: Record<string, unknown> = {
    event_source: "web",
    event_source_id: cfg.tiktokPixelId,
    data: [
      {
        event: "ViewContent",
        event_time: Math.floor(Date.now() / 1000),
        event_id: `conn-test.${Date.now()}`,
        user: { user_agent: "UpoharkabboConnectionTest/1.0", ip: "203.0.113.1" },
        page: { url: "https://upoharkabbo.com/" },
      },
    ],
  };
  if (cfg.tiktokTestCode) payload["test_event_code"] = cfg.tiktokTestCode;

  const res = await fetch("https://business-api.tiktok.com/open_api/v1.3/event/track/", {
    method: "POST",
    headers: { "content-type": "application/json", "Access-Token": cfg.tiktokToken },
    body: JSON.stringify(payload),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const code = Number(json["code"] ?? -1);
  if (!res.ok || code !== 0) {
    return {
      ok: false,
      message: String(json["message"] ?? `TikTok API error ${res.status}`),
      details: [],
    };
  }
  return {
    ok: true,
    message: "Test event accepted by TikTok",
    details: [
      { label: "Pixel", value: cfg.tiktokPixelId },
      { label: "Test mode", value: cfg.tiktokTestCode || "Live" },
      { label: "Request ID", value: String(json["request_id"] ?? "—") },
    ],
  };
}

/** GA4 Measurement Protocol validation endpoint reports payload problems. */
export async function probeGa4(cfg: TrackingConfig): Promise<Probe> {
  if (!cfg.ga4MeasurementId || !cfg.ga4ApiSecret)
    return { ok: false, message: "Measurement ID or API secret missing", details: [] };

  const res = await fetch(
    `https://www.google-analytics.com/debug/mp/collect?measurement_id=${encodeURIComponent(cfg.ga4MeasurementId)}&api_secret=${encodeURIComponent(cfg.ga4ApiSecret)}`,
    {
      method: "POST",
      body: JSON.stringify({
        client_id: "0000000000.1111111111",
        events: [{ name: "page_view", params: { page_location: "https://upoharkabbo.com/" } }],
      }),
    },
  );
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const messages = (json["validationMessages"] ?? []) as { description?: string }[];
  if (!res.ok)
    return { ok: false, message: `Measurement Protocol error ${res.status}`, details: [] };
  if (messages.length)
    return {
      ok: false,
      message: messages[0]?.description ?? "Payload rejected by GA4",
      details: [],
    };
  return {
    ok: true,
    message: "Measurement Protocol accepted the payload",
    details: [
      { label: "Measurement ID", value: cfg.ga4MeasurementId },
      { label: "Validation", value: "No errors" },
    ],
  };
}
