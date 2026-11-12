import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdmin } from "./admin.server";
import { buildProfitReport } from "./profit.server";
import { profitQuerySchema, type ProfitReport } from "./profit.shared";

export const profitReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => profitQuerySchema.parse(input ?? {}))
  .handler(async ({ data, context }): Promise<ProfitReport> => {
    const db = await requireAdmin(context.supabase, context.userId);
    return buildProfitReport(db, data.days);
  });
