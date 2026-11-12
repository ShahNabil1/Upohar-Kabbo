import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { actorName, requireAdmin } from "./admin.server";

const uuid = z.string().uuid();

const lineSchema = z.object({
  itemId: uuid,
  label: z.string().trim().max(300).default("Item"),
  ordered: z.number().int().min(0).max(100000).default(0),
  delivered: z.number().int().min(0).max(100000).default(0),
  returned: z.number().int().min(0).max(100000).default(0),
  unitPrice: z.number().min(0).default(0),
  lineTotal: z.number().min(0).default(0),
});

const saveSchema = z.object({
  orderId: uuid,
  collectedAmount: z.number().min(0).max(10_000_000),
  settled: z.boolean().default(false),
  note: z.string().trim().max(500).optional().default(""),
  lines: z.array(lineSchema).min(1).max(120),
});

export const reconcileQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    const { listReconcileOrders } = await import("./reconcile.server");
    return listReconcileOrders(db);
  });

export const reconcileLines = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ orderId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    const { reconcileOrderLines } = await import("./reconcile.server");
    return reconcileOrderLines(db, data.orderId);
  });

export const saveOrderReconciliation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => saveSchema.parse(input))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    const who = await actorName(db, context.userId);
    const { saveReconciliation } = await import("./reconcile.server");

    const { data: order } = await db
      .from("orders")
      .select("order_number")
      .eq("id", data.orderId)
      .maybeSingle();

    return saveReconciliation(db, {
      orderId: data.orderId,
      orderNumber: (order as { order_number?: string } | null)?.order_number ?? null,
      collectedAmount: data.collectedAmount,
      lines: data.lines,
      settled: data.settled,
      note: data.note ?? "",
      actorId: context.userId,
      actorName: who,
    });
  });
