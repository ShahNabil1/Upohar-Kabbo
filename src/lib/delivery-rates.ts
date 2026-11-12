/**
 * Delivery charge configuration (client + server safe).
 *
 * Stored in `site_settings` under the `delivery` key. Supports:
 *  - a site-wide zone rate (inside/outside Dhaka) or a single universal rate
 *  - free delivery for everything, or above a subtotal threshold
 *  - per-product (single or combo) overrides: free, universal, or zone rates
 */

export type DeliveryArea = "inside_dhaka" | "outside_dhaka";

export type DeliveryMode = "zone" | "uniform";
export type ProductDeliveryMode = "free" | "uniform" | "zone";

export type ProductDeliveryRule = {
  productId: string;
  label: string;
  mode: ProductDeliveryMode;
  uniform: number;
  inside_dhaka: number;
  outside_dhaka: number;
};

export type DeliveryConfig = {
  /** Free delivery everywhere. */
  freeAll: boolean;
  /** Site-wide charge style. */
  mode: DeliveryMode;
  uniform: number;
  inside_dhaka: number;
  outside_dhaka: number;
  freeAbove: number;
  rules: ProductDeliveryRule[];
};

const num = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : fallback;

function readRule(raw: unknown): ProductDeliveryRule | null {
  const v = (raw ?? {}) as Record<string, unknown>;
  const productId = typeof v["productId"] === "string" ? v["productId"] : "";
  if (!productId) return null;
  const mode = v["mode"];
  return {
    productId,
    label: typeof v["label"] === "string" ? v["label"] : "",
    mode: mode === "free" || mode === "uniform" || mode === "zone" ? mode : "free",
    uniform: num(v["uniform"], 0),
    inside_dhaka: num(v["inside_dhaka"], 0),
    outside_dhaka: num(v["outside_dhaka"], 0),
  };
}

export function normalizeDeliveryConfig(raw: unknown): DeliveryConfig {
  const v = (raw ?? {}) as Record<string, unknown>;
  const rulesRaw = Array.isArray(v["rules"]) ? (v["rules"] as unknown[]) : [];
  const seen = new Set<string>();
  const rules: ProductDeliveryRule[] = [];
  for (const entry of rulesRaw) {
    const rule = readRule(entry);
    if (!rule || seen.has(rule.productId)) continue;
    seen.add(rule.productId);
    rules.push(rule);
  }
  return {
    freeAll: v["free_all"] === true,
    mode: v["mode"] === "uniform" ? "uniform" : "zone",
    uniform: num(v["uniform"], 80),
    inside_dhaka: num(v["inside_dhaka"], 60),
    outside_dhaka: num(v["outside_dhaka"], 120),
    freeAbove: num(v["free_above"], 0),
    rules,
  };
}

/** Serialises back to the shape stored in `site_settings`. */
export function serializeDeliveryConfig(config: DeliveryConfig): Record<string, unknown> {
  return {
    free_all: config.freeAll,
    mode: config.mode,
    uniform: config.uniform,
    inside_dhaka: config.inside_dhaka,
    outside_dhaka: config.outside_dhaka,
    free_above: config.freeAbove,
    rules: config.rules,
  };
}

/** Site-wide charge for an area, ignoring per-product rules. */
export function baseDeliveryCharge(config: DeliveryConfig, area: DeliveryArea): number {
  return config.mode === "uniform" ? config.uniform : config[area];
}

function ruleCharge(rule: ProductDeliveryRule, area: DeliveryArea): number {
  if (rule.mode === "free") return 0;
  if (rule.mode === "uniform") return rule.uniform;
  return rule[area];
}

/**
 * Final delivery charge for a cart. Products without a rule use the site rate;
 * when a cart mixes items, the highest applicable charge wins (so a free item
 * never subsidises a paid one).
 */
export function deliveryChargeFor(
  config: DeliveryConfig,
  area: DeliveryArea,
  subtotal: number,
  productIds: string[],
): number {
  if (config.freeAll) return 0;
  if (config.freeAbove > 0 && subtotal >= config.freeAbove) return 0;
  const base = baseDeliveryCharge(config, area);
  const ids = [...new Set(productIds.filter(Boolean))];
  if (!ids.length) return base;
  let charge = 0;
  for (const id of ids) {
    const rule = config.rules.find((r) => r.productId === id);
    charge = Math.max(charge, rule ? ruleCharge(rule, area) : base);
  }
  return charge;
}
