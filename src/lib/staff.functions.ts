import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireSuperAdmin } from "./admin.server";
import { STAFF_PERMISSION_KEYS, type AdminAccess } from "./rbac-shared";

const permissionsSchema = z.array(z.string()).default([]);

const createSchema = z.object({
  fullName: z.string().trim().min(2).max(80),
  email: z.string().trim().email(),
  password: z.string().min(8).max(72),
  phone: z.string().trim().max(30).optional(),
  fullAccess: z.boolean().default(false),
  permissions: permissionsSchema,
  note: z.string().trim().max(300).optional(),
});

const updateSchema = z.object({
  userId: z.string().uuid(),
  fullName: z.string().trim().min(2).max(80).optional(),
  password: z.string().min(8).max(72).optional().or(z.literal("")),
  phone: z.string().trim().max(30).optional(),
  fullAccess: z.boolean().optional(),
  isActive: z.boolean().optional(),
  permissions: permissionsSchema.optional(),
  note: z.string().trim().max(300).optional(),
});

export type StaffRow = {
  user_id: string;
  email: string;
  full_name: string;
  phone: string | null;
  is_active: boolean;
  full_access: boolean;
  permissions: string[];
  note: string | null;
  last_login_at: string | null;
  created_at: string;
};

const clean = (keys: string[]) => [...new Set(keys.filter((k) => STAFF_PERMISSION_KEYS.includes(k)))];

/** Who am I in the admin panel, and which pages may I open? */
export const getAdminAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminAccess> => {
    const { data: adminRole } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    const isAdmin = Boolean(adminRole);

    const { data: staff } = await context.supabase
      .from("staff_accounts")
      .select("full_name, email, is_active, full_access, permissions")
      .eq("user_id", context.userId)
      .maybeSingle();

    const { data: profile } = await context.supabase
      .from("profiles")
      .select("full_name")
      .eq("id", context.userId)
      .maybeSingle();

    // An admin can end someone's sessions; any token issued before that moment
    // is treated as signed out by the admin shell.
    const { data: revocation } = await context.supabase
      .from("admin_session_revocations")
      .select("revoked_at")
      .eq("user_id", context.userId)
      .maybeSingle();
    const issuedAt = Number((context.claims as { iat?: number } | undefined)?.iat ?? 0) * 1000;
    const revokedAt = (revocation as { revoked_at?: string } | null)?.revoked_at;
    const revoked = Boolean(revokedAt && issuedAt && new Date(revokedAt).getTime() > issuedAt);

    const row = staff as {
      full_name?: string;
      email?: string;
      is_active?: boolean;
      full_access?: boolean;
      permissions?: string[];
    } | null;

    return {
      userId: context.userId,
      isAdmin,
      isStaff: Boolean(row),
      fullAccess: isAdmin || Boolean(row?.full_access),
      isActive: !revoked && (isAdmin || Boolean(row?.is_active)),
      revoked,
      permissions: clean(row?.permissions ?? []),
      name:
        row?.full_name ??
        (profile as { full_name?: string | null } | null)?.full_name ??
        (context.claims as { email?: string } | undefined)?.email ??
        "Staff",
      email: row?.email ?? (context.claims as { email?: string } | undefined)?.email ?? "",
    };
  });

export const adminListStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<StaffRow[]> => {
    const db = await requireSuperAdmin(context.supabase, context.userId);
    const { data, error } = await db
      .from("staff_accounts")
      .select("user_id, email, full_name, phone, is_active, full_access, permissions, note, last_login_at, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as StaffRow[];
  });

export const adminCreateStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.fullName, phone: data.phone ?? null },
    });
    if (error || !created.user) throw new Error(error?.message ?? "Could not create the account");

    const userId = created.user.id;
    const { error: insertError } = await supabaseAdmin.from("staff_accounts").insert({
      user_id: userId,
      email: data.email,
      full_name: data.fullName,
      phone: data.phone ?? null,
      full_access: data.fullAccess,
      permissions: data.fullAccess ? STAFF_PERMISSION_KEYS : clean(data.permissions),
      note: data.note ?? null,
      created_by: context.userId,
    });
    if (insertError) {
      await supabaseAdmin.auth.admin.deleteUser(userId);
      throw new Error(insertError.message);
    }

    await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: userId, role: "staff" }, { onConflict: "user_id,role" });

    await supabaseAdmin.from("admin_activity_log").insert({
      user_id: context.userId,
      action: "staff.create",
      area: "/admin/staff",
      detail: `Created staff account ${data.fullName} (${data.email})`,
      meta: { target: userId, full_access: data.fullAccess },
    });

    return { userId };
  });

export type StaffUpdateInput = z.infer<typeof updateSchema>;

export const adminUpdateStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => updateSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const patch: {
      full_name?: string;
      phone?: string | null;
      note?: string | null;
      is_active?: boolean;
      full_access?: boolean;
      permissions?: string[];
    } = {};
    if (data.fullName !== undefined) patch.full_name = data.fullName;
    if (data.phone !== undefined) patch.phone = data.phone || null;
    if (data.note !== undefined) patch.note = data.note || null;
    if (data.isActive !== undefined) patch.is_active = data.isActive;
    if (data.fullAccess !== undefined) patch.full_access = data.fullAccess;
    if (data.permissions !== undefined || data.fullAccess !== undefined) {
      patch.permissions = data.fullAccess
        ? STAFF_PERMISSION_KEYS
        : clean(data.permissions ?? []);
    }

    if (Object.keys(patch).length) {
      const { error } = await supabaseAdmin
        .from("staff_accounts")
        .update(patch)
        .eq("user_id", data.userId);
      if (error) throw new Error(error.message);
    }

    if (data.password) {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
        password: data.password,
      });
      if (error) throw new Error(error.message);
    }

    if (data.fullName) {
      await supabaseAdmin.from("profiles").update({ full_name: data.fullName }).eq("id", data.userId);
    }

    await supabaseAdmin.from("admin_activity_log").insert({
      user_id: context.userId,
      action: "staff.update",
      area: "/admin/staff",
      detail: `Updated staff account${data.isActive === false ? " (deactivated)" : ""}${data.password ? " (password changed)" : ""}`,
      meta: { target: data.userId },
    });

    return { ok: true };
  });

export const adminDeleteStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context.supabase, context.userId);
    if (data.userId === context.userId) throw new Error("You cannot delete your own account");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    await supabaseAdmin.from("staff_accounts").delete().eq("user_id", data.userId);
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("admin_activity_log").insert({
      user_id: context.userId,
      action: "staff.delete",
      area: "/admin/staff",
      detail: "Deleted a staff account",
      meta: { target: data.userId },
    });

    return { ok: true };
  });

/** Records one admin-panel action or page visit for the signed-in user. */
export const logAdminActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        action: z.string().trim().min(1).max(60),
        area: z.string().trim().max(120).optional(),
        detail: z.string().trim().max(300).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: staff } = await context.supabase
      .from("staff_accounts")
      .select("full_name, email")
      .eq("user_id", context.userId)
      .maybeSingle();
    const row = staff as { full_name?: string; email?: string } | null;

    const { getRequestSecurityContext } = await import("./request-security.server");
    const security = await getRequestSecurityContext().catch(() => null);

    await context.supabase.from("admin_activity_log").insert({
      user_id: context.userId,
      actor_name: row?.full_name ?? null,
      actor_email: row?.email ?? (context.claims as { email?: string } | undefined)?.email ?? null,
      action: data.action,
      area: data.area ?? null,
      detail: data.detail ?? null,
      ip: security?.ip ?? null,
      user_agent: security?.userAgent ?? null,
    });

    if (data.action === "login") {
      await context.supabase
        .from("staff_accounts")
        .update({ last_login_at: new Date().toISOString() })
        .eq("user_id", context.userId);
    }
    return { ok: true };
  });

