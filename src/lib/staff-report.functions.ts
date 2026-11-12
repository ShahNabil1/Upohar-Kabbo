import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireSuperAdmin } from "./admin.server";

/** A new login session starts after this much silence in the activity trail. */
const SESSION_GAP_MS = 30 * 60_000;
/** Every recorded action is worth at least this much "on the clock" time. */
const MIN_EVENT_MS = 60_000;

export type StaffPerson = {
  userId: string;
  name: string;
  email: string;
  events: number;
  sessions: number;
  activeMinutes: number;
  firstAt: string | null;
  lastAt: string | null;
  ordersCreated: number;
  ordersCreatedValue: number;
  confirmed: number;
  confirmedValue: number;
  delivered: number;
  deliveredValue: number;
  cancelled: number;
  returned: number;
  incompleteConverted: number;
  lastIp: string | null;
};

export type StaffSession = {
  key: string;
  userId: string;
  name: string;
  startAt: string;
  endAt: string;
  minutes: number;
  events: number;
  ip: string | null;
  userAgent: string | null;
};

export type StaffReport = {
  from: string;
  to: string;
  people: StaffPerson[];
  sessions: StaffSession[];
  recent: Array<{
    id: string;
    created_at: string;
    action: string;
    area: string | null;
    detail: string | null;
    actor_name: string | null;
    user_id: string | null;
    ip: string | null;
  }>;
  revoked: Array<{ user_id: string; revoked_at: string; revoked_by_name: string | null }>;
};

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

type LogRow = {
  id: string;
  user_id: string | null;
  actor_name: string | null;
  actor_email: string | null;
  action: string;
  area: string | null;
  detail: string | null;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
};

/**
 * Employee performance for a date range: time on the system (sessionised from
 * the activity trail), login sessions with IP, order outcomes they handled and
 * the sales value behind them.
 */
export const adminStaffReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ from: z.string(), to: z.string(), userId: z.string().uuid().optional() })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<StaffReport> => {
    const db = await requireSuperAdmin(context.supabase, context.userId);

    const [logRes, staffRes, ordersRes, statusRes, revokedRes] = await Promise.all([
      db
        .from("admin_activity_log")
        .select("id, user_id, actor_name, actor_email, action, area, detail, ip, user_agent, created_at")
        .gte("created_at", data.from)
        .lte("created_at", data.to)
        .order("created_at", { ascending: true })
        .limit(5000),
      db.from("staff_accounts").select("user_id, full_name, email"),
      db
        .from("orders")
        .select("id, total, status, created_by, created_by_name, created_at")
        .gte("created_at", data.from)
        .lte("created_at", data.to)
        .not("created_by", "is", null)
        .limit(2000),
      db
        .from("order_activity")
        .select("order_id, meta, created_at")
        .eq("kind", "status")
        .gte("created_at", data.from)
        .lte("created_at", data.to)
        .limit(4000),
      db.from("admin_session_revocations").select("user_id, revoked_at, revoked_by_name"),
    ]);

    const logs = ((logRes.data ?? []) as LogRow[]).filter(
      (r) => !data.userId || r.user_id === data.userId,
    );
    const staff = (staffRes.data ?? []) as Array<{ user_id: string; full_name: string; email: string }>;

    // name -> userId so order activity (which stores the actor's name) can be
    // attributed back to an account.
    const byName = new Map<string, string>();
    for (const s of staff) byName.set(norm(s.full_name), s.user_id);
    for (const r of logs) if (r.user_id && r.actor_name) byName.set(norm(r.actor_name), r.user_id);

    const people = new Map<string, StaffPerson>();
    const person = (userId: string, name: string, email = "") => {
      let p = people.get(userId);
      if (!p) {
        p = {
          userId,
          name,
          email,
          events: 0,
          sessions: 0,
          activeMinutes: 0,
          firstAt: null,
          lastAt: null,
          ordersCreated: 0,
          ordersCreatedValue: 0,
          confirmed: 0,
          confirmedValue: 0,
          delivered: 0,
          deliveredValue: 0,
          cancelled: 0,
          returned: 0,
          incompleteConverted: 0,
          lastIp: null,
        };
        people.set(userId, p);
      }
      if (name && (p.name === "Admin" || !p.name)) p.name = name;
      if (email && !p.email) p.email = email;
      return p;
    };

    for (const s of staff) {
      if (data.userId && s.user_id !== data.userId) continue;
      person(s.user_id, s.full_name, s.email);
    }

    // Sessionise the activity trail per user.
    const grouped = new Map<string, LogRow[]>();
    for (const r of logs) {
      const key = r.user_id ?? "unknown";
      const list = grouped.get(key);
      if (list) list.push(r);
      else grouped.set(key, [r]);
    }

    const sessions: StaffSession[] = [];
    for (const [userId, rows] of grouped) {
      const first = rows[0];
      const p = person(userId, first?.actor_name ?? "Admin", first?.actor_email ?? "");
      p.events += rows.length;
      p.firstAt = rows[0]?.created_at ?? null;
      p.lastAt = rows[rows.length - 1]?.created_at ?? null;
      p.lastIp = [...rows].reverse().find((r) => r.ip)?.ip ?? null;

      let start = rows[0];
      let prev = rows[0];
      let count = 0;
      const push = () => {
        if (!start || !prev) return;
        const span = Math.max(
          new Date(prev.created_at).getTime() - new Date(start.created_at).getTime(),
          MIN_EVENT_MS,
        );
        sessions.push({
          key: `${userId}-${start.created_at}`,
          userId,
          name: p.name,
          startAt: start.created_at,
          endAt: prev.created_at,
          minutes: Math.round(span / 60_000),
          events: count,
          ip: start.ip ?? prev.ip ?? null,
          userAgent: start.user_agent ?? null,
        });
        p.sessions += 1;
        p.activeMinutes += Math.round(span / 60_000);
      };

      for (const row of rows) {
        if (!start || !prev) {
          start = row;
          prev = row;
          count = 1;
          continue;
        }
        const gap = new Date(row.created_at).getTime() - new Date(prev.created_at).getTime();
        if (gap > SESSION_GAP_MS) {
          push();
          start = row;
          count = 0;
        }
        prev = row;
        count += 1;
      }
      push();
    }

    // Manual orders created in the range.
    const orders = (ordersRes.data ?? []) as Array<{
      id: string;
      total: number | null;
      status: string;
      created_by: string | null;
      created_by_name: string | null;
    }>;
    for (const o of orders) {
      if (!o.created_by) continue;
      if (data.userId && o.created_by !== data.userId) continue;
      const p = person(o.created_by, o.created_by_name ?? "Staff");
      p.ordersCreated += 1;
      p.ordersCreatedValue += Number(o.total ?? 0);
    }

    // Status changes → who confirmed / cancelled / delivered / returned what.
    const statusRows = (statusRes.data ?? []) as Array<{
      order_id: string;
      meta: Record<string, unknown> | null;
      created_at: string;
    }>;
    const orderIds = [...new Set(statusRows.map((r) => r.order_id))];
    const totals = new Map<string, number>();
    for (let i = 0; i < orderIds.length; i += 400) {
      const chunk = orderIds.slice(i, i + 400);
      if (!chunk.length) break;
      const { data: rows } = await db.from("orders").select("id, total").in("id", chunk);
      for (const r of (rows ?? []) as Array<{ id: string; total: number | null }>) {
        totals.set(r.id, Number(r.total ?? 0));
      }
    }

    const counted = new Set<string>();
    for (const r of statusRows) {
      const meta = r.meta ?? {};
      const actor = String(meta["actor"] ?? "").trim();
      const to = String(meta["to"] ?? "");
      const from = String(meta["from"] ?? "");
      if (!actor || !to) continue;
      const userId = byName.get(norm(actor));
      if (!userId) continue;
      if (data.userId && userId !== data.userId) continue;
      const p = person(userId, actor);
      const value = totals.get(r.order_id) ?? 0;
      const once = (tag: string) => {
        const key = `${userId}:${r.order_id}:${tag}`;
        if (counted.has(key)) return false;
        counted.add(key);
        return true;
      };

      if (to === "confirmed" && once("confirmed")) {
        p.confirmed += 1;
        p.confirmedValue += value;
        if (from === "incomplete" || from === "no_response" || from === "good_no_response") {
          p.incompleteConverted += 1;
        }
      }
      if (to === "delivered" && once("delivered")) {
        p.delivered += 1;
        p.deliveredValue += value;
      }
      if (to === "cancelled" && once("cancelled")) p.cancelled += 1;
      if ((to === "returned" || to === "awaiting_return") && once("returned")) p.returned += 1;
    }

    const list = [...people.values()].sort((a, b) => b.confirmedValue - a.confirmedValue);

    return {
      from: data.from,
      to: data.to,
      people: list,
      sessions: sessions.sort((a, b) => b.startAt.localeCompare(a.startAt)).slice(0, 120),
      recent: [...logs]
        .reverse()
        .slice(0, 80)
        .map((r) => ({
          id: r.id,
          created_at: r.created_at,
          action: r.action,
          area: r.area,
          detail: r.detail,
          actor_name: r.actor_name,
          user_id: r.user_id,
          ip: r.ip,
        })),
      revoked: (revokedRes.data ?? []) as StaffReport["revoked"],
    };
  });

/** Ends every active admin session of an employee within a minute. */
export const adminForceLogout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context.supabase, context.userId);
    if (data.userId === context.userId) throw new Error("You cannot sign yourself out from here");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { actorName } = await import("./admin.server");
    const who = await actorName(context.supabase, context.userId);
    const now = new Date().toISOString();

    const { error } = await supabaseAdmin.from("admin_session_revocations").upsert(
      { user_id: data.userId, revoked_at: now, revoked_by: context.userId, revoked_by_name: who },
      { onConflict: "user_id" },
    );
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("admin_activity_log").insert({
      user_id: context.userId,
      actor_name: who,
      action: "staff.logout",
      area: "/admin/staff",
      detail: "Signed an employee out of every device",
      meta: { target: data.userId },
    });

    return { ok: true };
  });
