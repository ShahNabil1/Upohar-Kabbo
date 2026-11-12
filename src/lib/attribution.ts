/**
 * Marketing attribution capture (client-safe).
 *
 * Captures UTM parameters, Meta click identifiers (fbclid → _fbc) and the
 * browser id (_fbp) on every page view of the main site AND landing pages,
 * then stores both the first touch and the last touch so checkout can attach
 * them to the order. Everything lives in localStorage + first-party cookies,
 * so it survives the whole session and works without the Pixel being loaded.
 */

export type Attribution = {
  /** utm_source / utm_medium / … */
  utm_source?: string | undefined;
  utm_medium?: string | undefined;
  utm_campaign?: string | undefined;
  utm_content?: string | undefined;
  utm_term?: string | undefined;
  /** Meta dynamic-URL parameters ({{campaign.id}} etc.) */
  campaign_id?: string | undefined;
  adset_id?: string | undefined;
  ad_id?: string | undefined;
  campaign_name?: string | undefined;
  adset_name?: string | undefined;
  ad_name?: string | undefined;
  placement?: string | undefined;
  site_source_name?: string | undefined;
  /** Click identifiers */
  fbclid?: string | undefined;
  fbc?: string | undefined;
  fbp?: string | undefined;
  ttclid?: string | undefined;
  gclid?: string | undefined;
  /** TikTok browser id cookie (_ttp) — needed by the TikTok Events API. */
  ttp?: string | undefined;
  /** GA4 client id parsed out of the _ga cookie (Measurement Protocol). */
  ga_client_id?: string | undefined;
  /** GA4 session id parsed out of the _ga_<container> cookie. */
  ga_session_id?: string | undefined;
  /** Stable first-party visitor id — Meta/TikTok `external_id`. */
  external_id?: string | undefined;
  /** Context */

  referrer?: string | undefined;
  landing_page?: string | undefined;
  channel?: string | undefined;
  captured_at?: string | undefined;
};

export type AttributionPayload = {
  first?: Attribution;
  last?: Attribution;
};

const STORE_KEY = "upoharkabbo-attribution";
const MAX_LEN = 300;

const PARAM_MAP: Record<string, keyof Attribution> = {
  utm_source: "utm_source",
  utm_medium: "utm_medium",
  utm_campaign: "utm_campaign",
  utm_content: "utm_content",
  utm_term: "utm_term",
  campaign_id: "campaign_id",
  utm_campaign_id: "campaign_id",
  adset_id: "adset_id",
  utm_adset_id: "adset_id",
  ad_id: "ad_id",
  utm_ad_id: "ad_id",
  campaign_name: "campaign_name",
  adset_name: "adset_name",
  ad_name: "ad_name",
  placement: "placement",
  site_source_name: "site_source_name",
  fbclid: "fbclid",
  ttclid: "ttclid",
  gclid: "gclid",
};

function clean(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim().slice(0, MAX_LEN);
  return trimmed.length ? trimmed : undefined;
}

function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match?.[1] ? clean(decodeURIComponent(match[1])) : undefined;
}

/**
 * Root-domain scope for first-party cookies. Meta's fbevents.js writes
 * `_fbp`/`_fbc` on `.upoharkabbo.com`; writing the same names host-only would
 * create competing cookies. On preview/localhost hosts we stay host-only.
 */
function cookieDomain(): string | undefined {
  if (typeof location === "undefined") return undefined;
  const host = location.hostname;
  return host === "upoharkabbo.com" || host.endsWith(".upoharkabbo.com")
    ? ".upoharkabbo.com"
    : undefined;
}

function writeCookie(name: string, value: string) {
  if (typeof document === "undefined") return;
  const maxAge = 60 * 60 * 24 * 90; // Meta's own _fbc/_fbp window.
  const domain = cookieDomain();
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Lax${domain ? `; domain=${domain}` : ""}`;
}

function randomFbp(): string {
  const rand = Math.floor(Math.random() * 2_147_483_647);
  return `fb.1.${Date.now()}.${rand}`;
}

const VISITOR_KEY = "upoharkabbo-visitor-id";

/**
 * Stable first-party visitor id, reused as `external_id` for Meta/TikTok.
 * It never contains personal data — just a random UUID kept in localStorage
 * and mirrored into a cookie so it survives across landing pages too.
 */
export function visitorId(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const stored = localStorage.getItem(VISITOR_KEY) ?? readCookie(VISITOR_KEY);
    if (stored) {
      writeCookie(VISITOR_KEY, stored);
      localStorage.setItem(VISITOR_KEY, stored);
      return stored;
    }
    const next =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `v-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
    localStorage.setItem(VISITOR_KEY, next);
    writeCookie(VISITOR_KEY, next);
    return next;
  } catch {
    return undefined;
  }
}

/** GA4 session id — stored by GA in a `_ga_<CONTAINER>` cookie. */
export function gaSessionId(): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(/_ga_[A-Z0-9]+=GS\d\.\d\.(\d+)/);
  return match?.[1] ?? undefined;
}


/** Human-readable bucket used in the admin panel and the attribution report. */
export function channelOf(a: Attribution): string {
  const source = (a.utm_source ?? "").toLowerCase();
  if (a.fbclid || a.fbc || source.includes("facebook") || source.includes("instagram") || source.includes("meta")) {
    return "meta";
  }
  if (a.gclid || source.includes("google")) return a.gclid ? "google_ads" : "google";
  if (a.ttclid || source.includes("tiktok")) return "tiktok";
  if (source) return source;
  const ref = (a.referrer ?? "").toLowerCase();
  if (!ref) return "direct";
  if (ref.includes("facebook") || ref.includes("instagram")) return "meta_organic";
  if (ref.includes("google") || ref.includes("bing") || ref.includes("yahoo")) return "organic_search";
  return "referral";
}

function parseCurrent(): Attribution {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  const out: Attribution = {};

  for (const [param, key] of Object.entries(PARAM_MAP)) {
    const value = clean(params.get(param));
    if (value) out[key] = value;
  }

  // Meta click id → _fbc (Meta's documented format).
  const existingFbc = readCookie("_fbc");
  if (out.fbclid) {
    const fbc = existingFbc?.includes(out.fbclid) ? existingFbc : `fb.1.${Date.now()}.${out.fbclid}`;
    out.fbc = fbc;
    writeCookie("_fbc", fbc);
  } else if (existingFbc) {
    out.fbc = existingFbc;
  }

  // Browser id — the Pixel normally sets it; we create it when it is absent so
  // server-side matching (CAPI) has something stable to work with later.
  let fbp = readCookie("_fbp");
  if (!fbp) {
    fbp = randomFbp();
    writeCookie("_fbp", fbp);
  }
  out.fbp = fbp;

  // TikTok browser id — only read, never faked (TikTok rejects invented ids).
  const ttp = readCookie("_ttp");
  if (ttp) out.ttp = ttp;

  // GA4 client id lives in the _ga cookie: GA1.1.<clientId>.
  const ga = readCookie("_ga");
  const gaParts = ga?.split(".") ?? [];
  if (gaParts.length >= 4) out.ga_client_id = `${gaParts[2]}.${gaParts[3]}`;
  const gaSession = gaSessionId();
  if (gaSession) out.ga_session_id = gaSession;

  out.external_id = visitorId();



  const referrer = clean(document.referrer);
  if (referrer && !referrer.includes(window.location.host)) out.referrer = referrer;
  out.landing_page = clean(window.location.pathname + window.location.search);
  out.captured_at = new Date().toISOString();
  out.channel = channelOf(out);
  return out;
}

function hasSignal(a: Attribution): boolean {
  return Boolean(
    a.utm_source || a.utm_campaign || a.campaign_id || a.ad_id || a.adset_id ||
      a.fbclid || a.gclid || a.ttclid || a.referrer,
  );
}

function readStore(): AttributionPayload {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as AttributionPayload) : {};
  } catch {
    return {};
  }
}

/**
 * Records the current page view. Call it on every navigation — the first touch
 * is written once, the last touch only when the new visit carries a real
 * marketing signal (so an internal click never wipes the campaign).
 */
export function captureAttribution(): AttributionPayload {
  if (typeof window === "undefined") return {};
  const current = parseCurrent();
  const store = readStore();
  const next: AttributionPayload = {
    first: store.first && hasSignal(store.first) ? store.first : hasSignal(current) ? current : store.first ?? current,
    last: hasSignal(current) ? current : store.last ?? current,
  };
  // Keep _fbp/_fbc fresh on the stored last touch even without a new signal.
  if (next.last) next.last = { ...next.last, fbp: current.fbp, fbc: current.fbc ?? next.last.fbc };
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(next));
  } catch {
    // Private-mode storage failures must never break checkout.
  }
  return next;
}

/** Attribution payload to attach to an order / abandoned checkout. */
export function getAttribution(): AttributionPayload {
  if (typeof window === "undefined") return {};
  const store = readStore();
  if (store.first || store.last) return store;
  return captureAttribution();
}
