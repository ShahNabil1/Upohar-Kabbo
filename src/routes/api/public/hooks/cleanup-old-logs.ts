import { createFileRoute } from "@tanstack/react-router";

/**
 * Daily order-log retention cleanup.
 * Called by pg_cron with a server-only cron secret (x-cron-secret header).
 */
export const Route = createFileRoute("/api/public/hooks/cleanup-old-logs")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { isValidCronSecret } = await import("@/lib/cron-secret.server");
        if (!(await isValidCronSecret(request.headers.get("x-cron-secret")))) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: setting } = await supabaseAdmin
          .from("site_settings")
          .select("value")
          .eq("key", "retention")
          .maybeSingle();

        const value = (setting?.value ?? {}) as Record<string, unknown>;
        if ((value["enabled"] ?? true) === false) {
          return Response.json({ success: true, message: "Cleanup disabled" });
        }

        const days = Number(value["days"] ?? 45);
        const safeDays = Number.isFinite(days) && days > 0 ? Math.min(days, 730) : 45;

        const { data, error } = await supabaseAdmin.rpc("cleanup_old_order_logs", {
          _retention_days: safeDays,
        });

        if (error) {
          return new Response(JSON.stringify({ success: false, error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        const result = (data as Record<string, unknown> | null) ?? {};
        const nextValue = {
          ...value,
          days: safeDays,
          last_run: new Date().toISOString(),
          last_result: result,
        };

        await supabaseAdmin
          .from("site_settings")
          .upsert({ key: "retention", value: nextValue as never }, { onConflict: "key" });

        return Response.json({ success: true, result });
      },
    },
  },
});
