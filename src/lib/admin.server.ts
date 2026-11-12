import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

export type Db = SupabaseClient<Database>;

/**
 * Verifies the caller holds the `admin` role and returns their own
 * RLS-scoped client. Admin policies on every table grant full access, so no
 * service-role key is required anywhere.
 * Never call this before `requireSupabaseAuth` has run.
 */
export async function requireAdmin(supabase: Db, userId: string): Promise<Db> {
  const { data, error } = await supabase.rpc("is_admin_user", { _user_id: userId });
  if (error) throw new Error("Role check failed");
  if (!data) throw new Error("Forbidden");
  return supabase;
}

/** Stricter gate: only real admins (never staff accounts). */
export async function requireSuperAdmin(supabase: Db, userId: string): Promise<Db> {
  const { data, error } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (error) throw new Error("Role check failed");
  if (!data) throw new Error("Forbidden");
  return supabase;
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u0980-\u09FF]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function num(value: unknown, fallback = 0): number {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
}

export function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return (res.data ?? []) as T;
}

/** Human-readable name of the staff member performing an action. */
export async function actorName(db: Db, userId: string): Promise<string> {
  const { data } = await db.from("profiles").select("full_name").eq("id", userId).maybeSingle();
  const name = (data as { full_name?: string | null } | null)?.full_name;
  return name && name.trim().length > 0 ? name : "Staff";
}

/** Appends an entry to the order activity timeline. */
export async function logActivity(
  db: Db,
  orderId: string,
  kind: string,
  message: string,
  opts?: { actor?: string; meta?: Record<string, unknown> },
): Promise<void> {
  await db.from("order_activity").insert({
    order_id: orderId,
    kind,
    message,
    meta: { actor: opts?.actor ?? "System", ...(opts?.meta ?? {}) },
  });
}

/** Builds "Field: old → new" strings for every changed value. */
export function diffFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  labels: Record<string, string>,
): string[] {
  const out: string[] = [];
  for (const key of Object.keys(labels)) {
    const a = before[key] ?? "";
    const b = after[key] ?? "";
    if (String(a) !== String(b)) {
      out.push(`${labels[key]}: ${String(a) || "—"} → ${String(b) || "—"}`);
    }
  }
  return out;
}
