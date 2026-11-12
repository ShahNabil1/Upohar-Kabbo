import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { actorName, requireAdmin } from "./admin.server";
import {
  cancelStockCount,
  getStockCount,
  listStockCounts,
  openStockCount,
  postStockCount,
  saveCountLine,
} from "./stock-count.server";
import {
  countIdSchema,
  countLineSchema,
  createCountSchema,
  type StockCountDetail,
  type StockCountRow,
} from "./stock-count.shared";

export const stockCounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<StockCountRow[]> => {
    const db = await requireAdmin(context.supabase, context.userId);
    return listStockCounts(db);
  });

export const stockCountDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => countIdSchema.parse(input))
  .handler(async ({ data, context }): Promise<StockCountDetail> => {
    const db = await requireAdmin(context.supabase, context.userId);
    return getStockCount(db, data.id);
  });

export const startStockCount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createCountSchema.parse(input))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    const who = await actorName(db, context.userId);
    return openStockCount(db, data, { id: context.userId, name: who });
  });

export const updateCountLine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => countLineSchema.parse(input))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    await saveCountLine(db, data);
    return { ok: true };
  });

export const commitStockCount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => countIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    const who = await actorName(db, context.userId);
    return postStockCount(db, data.id, { id: context.userId, name: who });
  });

export const voidStockCount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => countIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    await cancelStockCount(db, data.id);
    return { ok: true };
  });
