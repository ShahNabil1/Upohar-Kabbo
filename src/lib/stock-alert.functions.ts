import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdmin } from "./admin.server";
import type { StockAlertReport } from "./stock-alert.shared";

/** Prioritised inventory action list (stock-outs, reorder, dead stock, late POs). */
export const stockAlerts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<StockAlertReport> => {
    const db = await requireAdmin(context.supabase, context.userId);
    const { buildStockAlerts } = await import("./stock-alert.server");
    return buildStockAlerts(db);
  });
