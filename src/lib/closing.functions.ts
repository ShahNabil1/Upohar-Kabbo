import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { actorName, requireAdmin, unwrap } from "./admin.server";
import {
  closePeriodSchema,
  closingIdSchema,
  periodSchema,
  type ClosingPreview,
  type ClosingRow,
} from "./closing.shared";

/** Live (unsaved) numbers for a month. */
export const closingPreview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => periodSchema.parse(input))
  .handler(async ({ data, context }): Promise<ClosingPreview> => {
    const db = await requireAdmin(context.supabase, context.userId);
    const { buildClosingPreview } = await import("./closing.server");
    return buildClosingPreview(db, data.period);
  });

export const closingList = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ClosingRow[]> => {
    const db = await requireAdmin(context.supabase, context.userId);
    const { mapClosing } = await import("./closing.server");
    const rows = unwrap(
      await db.from("inventory_closings").select("*").order("period", { ascending: false }).limit(60),
    ) as unknown as Array<Record<string, unknown>>;
    return rows.map(mapClosing);
  });

/** Freezes the month: stores the computed totals plus a per-item snapshot. */
export const closePeriod = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => closePeriodSchema.parse(input))
  .handler(async ({ data, context }): Promise<ClosingRow> => {
    const db = await requireAdmin(context.supabase, context.userId);
    const { buildClosingPreview, mapClosing } = await import("./closing.server");
    const who = await actorName(db, context.userId);
    const p = await buildClosingPreview(db, data.period);

    const row = unwrap(
      await db
        .from("inventory_closings")
        .upsert(
          {
            period: p.period,
            period_start: p.periodStart,
            period_end: p.periodEnd,
            opening_value: p.openingValue,
            purchase_value: p.purchaseValue,
            cogs_value: p.cogsValue,
            writeoff_value: p.writeoffValue,
            packaging_value: p.packagingValue,
            adjustment_value: p.adjustmentValue,
            closing_value: p.closingValue,
            closing_qty: p.closingQty,
            supplier_due: p.supplierDue,
            snapshot: p.lines.slice(0, 500) as unknown as never,
            note: data.note || null,
            closed_by: context.userId,
            closed_by_name: who,
          },
          { onConflict: "period" },
        )
        .select("*")
        .single(),
    ) as unknown as Record<string, unknown>;

    return mapClosing(row);
  });

/** Reopens a month by deleting its frozen record. */
export const reopenPeriod = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => closingIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    const { error } = await db.from("inventory_closings").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
