import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdmin } from "./admin.server";
import {
  DELIVERY_PROVIDERS,
  SECRET_MASK,
  providerFields,
  type DeliveryProvider,
} from "./delivery-shared";

const providerSchema = z.enum(DELIVERY_PROVIDERS);

const saveSchema = z.object({
  provider: providerSchema,
  enabled: z.boolean().default(true),
  credentials: z.record(z.string(), z.string().max(500)),
  noteTemplate: z.string().trim().max(500).optional().default(""),
  config: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
});

export type DeliveryPartnerRow = {
  provider: DeliveryProvider;
  enabled: boolean;
  /** Secret values are replaced with a mask; non-secret fields come back as-is. */
  credentials: Record<string, string>;
  stores: { store_id: string | number; store_name: string }[];
  connection_ok: boolean;
  connection_message: string | null;
  last_checked_at: string | null;
  configured: boolean;
  /** Shared secret the courier must send back on webhook calls. */
  webhook_secret: string | null;
  /** When true this partner is pre-selected everywhere a courier is picked. */
  is_default: boolean;
  /** Delivery note text applied automatically when this partner is selected. */
  note_template: string;
};

function maskCreds(provider: DeliveryProvider, raw: Record<string, unknown>) {
  const out: Record<string, string> = {};
  for (const field of providerFields[provider]) {
    const value = raw[field.key];
    if (value == null || value === "") continue;
    out[field.key] = field.secret ? SECRET_MASK : String(value);
  }
  return out;
}

/** Merges submitted credentials with stored ones, keeping untouched secrets. */
function mergeCreds(
  provider: DeliveryProvider,
  stored: Record<string, unknown>,
  incoming: Record<string, string>,
) {
  const out: Record<string, string> = {};
  for (const field of providerFields[provider]) {
    const next = incoming[field.key];
    if (next !== undefined && next !== SECRET_MASK && next !== "") out[field.key] = next.trim();
    else if (stored[field.key] != null) out[field.key] = String(stored[field.key]);
  }
  return out;
}

function missingFields(provider: DeliveryProvider, creds: Record<string, string>) {
  return providerFields[provider]
    .filter((f) => !f.optional && !creds[f.key])
    .map((f) => f.label);
}

/** Runs a live credential check against the provider. */
async function runCheck(provider: DeliveryProvider, creds: Record<string, string>) {
  const missing = missingFields(provider, creds);
  if (missing.length) return { ok: false, message: `Missing: ${missing.join(", ")}`, extra: {} };

  try {
    if (provider === "steadfast") {
      const { steadfastCheck } = await import("./steadfast.server");
      const res = await steadfastCheck({
        api_key: creds["api_key"]!,
        secret_key: creds["secret_key"]!,
      });
      return { ok: res.ok, message: res.message, extra: {} };
    }
    if (provider === "pathao") {
      const { pathaoCheck } = await import("./pathao.server");
      const res = await pathaoCheck({
        client_id: creds["client_id"]!,
        client_secret: creds["client_secret"]!,
        username: creds["username"]!,
        password: creds["password"]!,
      });
      return { ok: res.ok, message: res.message, extra: { stores: res.stores } };
    }
    // Carrybee: List Stores doubles as the live connection check.
    const { carrybeeCheck } = await import("./carrybee.server");
    const res = await carrybeeCheck({
      client_id: creds["client_id"]!,
      client_secret: creds["client_secret"]!,
      client_context: creds["client_context"]!,
    });
    return { ok: res.ok, message: res.message, extra: { stores: res.stores } };

  } catch (error) {
    return { ok: false, message: (error as Error).message, extra: {} };
  }
}

export const adminListDeliveryPartners = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DeliveryPartnerRow[]> => {
    const db = await requireAdmin(context.supabase, context.userId);
    const { data, error } = await db.from("delivery_partners").select("*").order("provider");
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => {
      const provider = row.provider as DeliveryProvider;
      const creds = (row.credentials ?? {}) as Record<string, unknown>;
      return {
        provider,
        enabled: row.enabled,
        credentials: maskCreds(provider, creds),
        stores: (((row.config ?? {}) as Record<string, unknown>)["stores"] ??
          []) as { store_id: string | number; store_name: string }[],
        connection_ok: row.connection_ok,
        connection_message: row.connection_message,
        last_checked_at: row.last_checked_at,
        webhook_secret: row.webhook_secret ?? null,
        is_default: row.is_default ?? false,
        note_template: row.note_template ?? "",
        configured: missingFields(provider, creds as Record<string, string>).length === 0,
      };
    });
  });

/** Tests credentials without saving — used by the "Test connection" button. */
export const adminTestDeliveryPartner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ provider: providerSchema, credentials: z.record(z.string(), z.string().max(500)) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    const { data: existing } = await db
      .from("delivery_partners")
      .select("credentials")
      .eq("provider", data.provider)
      .maybeSingle();
    const creds = mergeCreds(
      data.provider,
      ((existing?.credentials ?? {}) as Record<string, unknown>),
      data.credentials,
    );
    const res = await runCheck(data.provider, creds);
    // Persist the freshly fetched store list so the settings page can show it
    // right away, without waiting for a full save.
    const stores = (res.extra as { stores?: unknown }).stores;
    if (res.ok && Array.isArray(stores)) {
      const { data: row } = await db
        .from("delivery_partners")
        .select("config")
        .eq("provider", data.provider)
        .maybeSingle();
      if (row) {
        await db
          .from("delivery_partners")
          .update({
            config: { ...((row.config ?? {}) as Record<string, unknown>), stores } as never,
            connection_ok: res.ok,
            connection_message: res.message,
            last_checked_at: new Date().toISOString(),
          })
          .eq("provider", data.provider);
      }
    }
    return {
      ok: res.ok,
      message: res.message,
      stores: (Array.isArray(stores) ? stores : []) as {
        store_id: string | number;
        store_name: string;
      }[],
    };
  });

/** Saves a partner. The connection is verified first; a failed check blocks the save. */
export const adminSaveDeliveryPartner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => saveSchema.parse(input))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    const { data: existing } = await db
      .from("delivery_partners")
      .select("credentials, config, webhook_secret")
      .eq("provider", data.provider)
      .maybeSingle();

    const creds = mergeCreds(
      data.provider,
      ((existing?.credentials ?? {}) as Record<string, unknown>),
      data.credentials,
    );
    const missing = missingFields(data.provider, creds);
    if (missing.length) throw new Error(`Missing required field(s): ${missing.join(", ")}`);

    const check = await runCheck(data.provider, creds);
    if (!check.ok) throw new Error(check.message);

    const secret =
      existing?.webhook_secret ??
      (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)).replace(/-/g, "");

    const { error } = await db.from("delivery_partners").upsert(
      {
        provider: data.provider,
        enabled: data.enabled,
        credentials: creds as never,
        config: {
          ...((existing?.config ?? {}) as Record<string, unknown>),
          ...data.config,
          ...check.extra,
        } as never,
        webhook_secret: secret,
        note_template: data.noteTemplate || null,
        connection_ok: check.ok,
        connection_message: check.message,
        last_checked_at: new Date().toISOString(),
      },
      { onConflict: "provider" },
    );
    if (error) throw new Error(error.message);
    return { ok: true, message: check.message };
  });

export const adminSetDeliveryPartnerEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ provider: providerSchema, enabled: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    const { error } = await db
      .from("delivery_partners")
      .update({ enabled: data.enabled })
      .eq("provider", data.provider);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminRemoveDeliveryPartner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ provider: providerSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    const { error } = await db.from("delivery_partners").delete().eq("provider", data.provider);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Partners available for order dispatch (enabled + verified). */
export type ActiveDeliveryPartner = {
  provider: DeliveryProvider;
  isDefault: boolean;
  noteTemplate: string;
};

export const adminActiveDeliveryPartners = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ActiveDeliveryPartner[]> => {
    const db = await requireAdmin(context.supabase, context.userId);
    const { data } = await db
      .from("delivery_partners")
      .select("provider, enabled, is_default, note_template")
      .eq("enabled", true)
      .order("provider");
    return (data ?? []).map((r) => ({
      provider: r.provider as DeliveryProvider,
      isDefault: r.is_default ?? false,
      noteTemplate: r.note_template ?? "",
    }));
  });

/** Marks one partner as the default; every other partner is unset. */
export const adminSetDefaultDeliveryPartner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ provider: providerSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    const { error: clearError } = await db
      .from("delivery_partners")
      .update({ is_default: false })
      .neq("provider", data.provider);
    if (clearError) throw new Error(clearError.message);
    const { error } = await db
      .from("delivery_partners")
      .update({ is_default: true })
      .eq("provider", data.provider);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Fires a signed test event at our own public webhook receiver and returns the
 * raw receiver response, so admins can verify the endpoint + secret end-to-end.
 */
export const adminTestCourierWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ provider: providerSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    const { data: row } = await db
      .from("delivery_partners")
      .select("webhook_secret")
      .eq("provider", data.provider)
      .maybeSingle();
    const secret = (row as { webhook_secret?: string | null } | null)?.webhook_secret;
    if (!secret) {
      return {
        ok: false,
        status: 0,
        url: "",
        body: "Save this partner first — no webhook secret has been generated yet.",
      };
    }

    const { CARRYBEE_INTEGRATION_SECRET, PATHAO_INTEGRATION_SECRET } = await import("@/lib/courier-webhook.server");

    // Always probe the real, branded public endpoint that couriers actually call —
    // never a local self-request, so the result can't be falsely optimistic.
    const url = `https://upoharkabbo.com/api/public/courier/${data.provider}`;

    const headerName =
      data.provider === "pathao"
        ? "X-PATHAO-Signature"
        : data.provider === "steadfast"
          ? "Steadfast-Secret-Key"
          : "X-CB-Webhook-Integration-Header";
    const webhookSecret = data.provider === "carrybee" ? CARRYBEE_INTEGRATION_SECRET : secret;

    // Pathao's own integration probe: exact body, and it demands 202 + echoed header.
    const payload =
      data.provider === "pathao"
        ? { event: "webhook_integration" }
        : {
            event: "webhook.test",
            notification_type: "webhook_test",
            consignment_id: `TEST-${Date.now()}`,
            merchant_order_id: "WEBHOOK-TEST",
            source: "upoharkabbo-admin",
          };

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", [headerName]: webhookSecret },
        body: JSON.stringify(payload),
      });
      const body = await res.text();

      let ok = res.ok;
      let note = "";
      if (data.provider === "pathao") {
        const echoed = res.headers.get("x-pathao-merchant-webhook-integration-secret") ?? "";
        const statusOk = res.status === 202;
        const headerOk = echoed === PATHAO_INTEGRATION_SECRET;
        ok = statusOk && headerOk;
        if (!statusOk) note = `Pathao requires HTTP 202 — endpoint returned ${res.status}. `;
        else if (!headerOk)
          note = "Missing/incorrect X-Pathao-Merchant-Webhook-Integration-Secret response header. ";
      } else if (data.provider === "carrybee") {
        const echoed = res.headers.get("x-cb-webhook-integration-header") ?? "";
        const statusOk = res.status === 202;
        const headerOk = echoed === CARRYBEE_INTEGRATION_SECRET;
        ok = statusOk && headerOk;
        if (!statusOk) note = `CarryBee requires HTTP 202 — endpoint returned ${res.status}. `;
        else if (!headerOk) note = "Missing/incorrect X-CB-Webhook-Integration-Header response header. ";
      }

      return {
        ok,
        status: res.status,
        url,
        body: `${note}${body.slice(0, 900)}`,
      };
    } catch (error) {
      return { ok: false, status: 0, url, body: (error as Error).message };
    }
  });

export type CourierConnectionState = {
  provider: DeliveryProvider;
  enabled: boolean;
  configured: boolean;
  ok: boolean;
  message: string;
  checkedAt: string;
};

/** Live API connection check for every courier — used by the Order List status bar. */
export const adminCourierConnections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CourierConnectionState[]> => {
    const db = await requireAdmin(context.supabase, context.userId);
    const { data } = await db.from("delivery_partners").select("provider, enabled, credentials");
    const rows = data ?? [];

    return Promise.all(
      DELIVERY_PROVIDERS.map(async (provider) => {
        const row = rows.find((r) => r.provider === provider);
        const creds = (row?.credentials ?? {}) as Record<string, string>;
        const configured = missingFields(provider, creds).length === 0;
        const checkedAt = new Date().toISOString();
        if (!row) {
          return { provider, enabled: false, configured: false, ok: false, message: "Not added", checkedAt };
        }
        if (!configured) {
          return { provider, enabled: row.enabled, configured, ok: false, message: "Credentials missing", checkedAt };
        }
        const res = await runCheck(provider, creds);
        void db
          .from("delivery_partners")
          .update({ connection_ok: res.ok, connection_message: res.message, last_checked_at: checkedAt })
          .eq("provider", provider);
        return { provider, enabled: row.enabled, configured, ok: res.ok, message: res.message, checkedAt };
      }),
    );
  });
