import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdmin } from "./admin.server";

/** Variables that actually resolve for order SMS in this app. */
export const SMS_TEMPLATE_VARIABLES = [
  "name",
  "order_no",
  "amount",
  "phone",
  "receipt_url",
  "address",
  "items",
] as const;

/** Templates sent automatically on order events — never offered for manual sending. */
export const AUTO_SMS_KEYS = new Set([
  "order_confirm",
  "shipped",
  "order_cancelled",
  "pre_order",
  "scheduled_order",
]);

export type SmsTemplateRow = {
  id: string;
  key: string | null;
  name: string;
  body: string;
  category: string;
  variables: string[];
  is_system: boolean;
  enabled: boolean;
  sort_order: number;
};

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(1000),
  category: z.string().trim().min(1).max(40),
});

const idSchema = z.object({ id: z.string().uuid() });
const enabledSchema = z.object({ id: z.string().uuid(), enabled: z.boolean() });

function toRow(r: Record<string, unknown>): SmsTemplateRow {
  const raw = r["variables"];
  return {
    id: String(r["id"]),
    key: (r["key"] as string | null) ?? null,
    name: String(r["name"] ?? ""),
    body: String(r["body"] ?? ""),
    category: String(r["category"] ?? "other"),
    variables: Array.isArray(raw) ? raw.map((v) => String(v)) : [...SMS_TEMPLATE_VARIABLES],
    is_system: Boolean(r["is_system"]),
    enabled: r["enabled"] !== false,
    sort_order: Number(r["sort_order"] ?? 0),
  };
}

/** All SMS templates, system ones first. */
export const adminListSmsTemplates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    const { data, error } = await db
      .from("sms_templates")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return { templates: ((data ?? []) as unknown as Record<string, unknown>[]).map(toRow) };
  });

/** Create or update a template. System templates keep their name and key. */
export const adminUpsertSmsTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => upsertSchema.parse(input))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context.supabase, context.userId);

    if (data.id) {
      const { data: existing } = await db
        .from("sms_templates")
        .select("is_system")
        .eq("id", data.id)
        .maybeSingle();
      const isSystem = Boolean((existing as { is_system?: boolean } | null)?.is_system);
      const patch: Record<string, unknown> = {
        body: data.body,
        category: data.category,
      };
      if (!isSystem) patch["name"] = data.name;
      const { error } = await db
        .from("sms_templates")
        .update(patch as never)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }

    const { data: created, error } = await db
      .from("sms_templates")
      .insert({
        name: data.name,
        body: data.body,
        category: data.category,
        variables: [...SMS_TEMPLATE_VARIABLES],
        is_system: false,
        enabled: true,
        sort_order: 100,
      } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: String((created as { id: string }).id) };
  });

/** Deletes a custom (non-system) template. */
export const adminDeleteSmsTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => idSchema.parse(input))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    const { data: existing } = await db
      .from("sms_templates")
      .select("is_system")
      .eq("id", data.id)
      .maybeSingle();
    if ((existing as { is_system?: boolean } | null)?.is_system) {
      throw new Error("System templates cannot be deleted");
    }
    const { error } = await db.from("sms_templates").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Turns auto-send on/off for an automated template (e.g. order_confirm). */
export const adminSetSmsTemplateEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => enabledSchema.parse(input))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    const { error } = await db
      .from("sms_templates")
      .update({ enabled: data.enabled })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
