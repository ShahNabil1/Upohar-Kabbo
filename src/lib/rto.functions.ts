import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { actorName, requireAdmin } from "./admin.server";

const uuid = z.string().uuid();

const inspectionLineSchema = z.object({
  productId: uuid,
  variantId: uuid.nullable().default(null),
  sku: z.string().trim().max(120).nullable().default(null),
  label: z.string().trim().max(200).default("Item"),
  good: z.number().int().min(0).max(100000).default(0),
  damaged: z.number().int().min(0).max(100000).default(0),
  missing: z.number().int().min(0).max(100000).default(0),
  resalable: z.boolean().default(false),
  salvagePrice: z.number().min(0).nullable().default(null),
  packagingDamaged: z.boolean().default(false),
  note: z.string().trim().max(300).optional().default(""),
});

const inspectionSchema = z.object({
  orderId: uuid,
  note: z.string().trim().max(500).optional().default(""),
  lines: z.array(inspectionLineSchema).min(1).max(80),
});

export const rtoQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    const { listRtoOrders } = await import("./rto.server");
    return listRtoOrders(db);
  });

export const rtoLines = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ orderId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    const { rtoOrderLines } = await import("./rto.server");
    return rtoOrderLines(db, data.orderId);
  });

export const saveRtoInspection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => inspectionSchema.parse(input))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    const who = await actorName(db, context.userId);
    const { applyRtoInspection } = await import("./rto.server");

    const { data: order } = await db
      .from("orders")
      .select("order_number")
      .eq("id", data.orderId)
      .maybeSingle();

    return applyRtoInspection(db, {
      orderId: data.orderId,
      orderNumber: (order as { order_number?: string } | null)?.order_number ?? null,
      lines: data.lines,
      note: data.note ?? "",
      actorId: context.userId,
      actorName: who,
    });
  });
