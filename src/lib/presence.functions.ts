import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdmin, actorName, logActivity } from "./admin.server";
import { PRESENCE_TTL_MS } from "./presence-shared";

const claimSchema = z.object({ id: z.string().uuid(), force: z.boolean().optional() });
const idOnly = z.object({ id: z.string().uuid() });

type PresenceRow = {
  order_id: string;
  user_id: string;
  actor_name: string;
  last_seen_at: string;
};

function isLive(row: PresenceRow | null | undefined) {
  return !!row && Date.now() - new Date(row.last_seen_at).getTime() < PRESENCE_TTL_MS;
}

/**
 * Claims exclusive handling of an order for the current staff member.
 * Returns `{ ok: false, heldBy }` when someone else holds a live claim and
 * `force` was not set; with `force` the previous holder is evicted and the
 * takeover is written to the activity log.
 */
export const adminClaimOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => claimSchema.parse(input))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    const who = await actorName(db, context.userId);

    const { data: existing } = await db
      .from("order_presence")
      .select("order_id, user_id, actor_name, last_seen_at")
      .eq("order_id", data.id)
      .maybeSingle();
    const current = existing as PresenceRow | null;

    const heldByOther = current && current.user_id !== context.userId && isLive(current);
    if (heldByOther && !data.force) {
      return { ok: false as const, heldBy: current.actor_name };
    }

    const { error } = await db.from("order_presence").upsert(
      {
        order_id: data.id,
        user_id: context.userId,
        actor_name: who,
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "order_id" },
    );
    if (error) throw new Error(error.message);

    if (heldByOther) {
      await logActivity(
        db,
        data.id,
        "takeover",
        `${who} took over this order from ${current.actor_name}`,
        { actor: who, meta: { from: current.actor_name } },
      );
    }
    return { ok: true as const, heldBy: who };
  });

/** Keeps the current claim alive; no-op when the claim already moved on. */
export const adminHeartbeatOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => idOnly.parse(input))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    await db
      .from("order_presence")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("order_id", data.id)
      .eq("user_id", context.userId);
    return { ok: true };
  });

/** Releases the claim when the staff member leaves the order workspace. */
export const adminReleaseOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => idOnly.parse(input))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    await db
      .from("order_presence")
      .delete()
      .eq("order_id", data.id)
      .eq("user_id", context.userId);
    return { ok: true };
  });
