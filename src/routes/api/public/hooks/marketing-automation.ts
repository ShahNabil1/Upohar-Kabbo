import { createFileRoute } from "@tanstack/react-router";

/**
 * Scheduled marketing automation.
 * Called by pg_cron with the shared cron secret (x-cron-secret header) —
 * evaluates the saved rules and pauses / scales Meta entities accordingly.
 */
export const Route = createFileRoute("/api/public/hooks/marketing-automation")({
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
        const { runMarketingAutomation } = await import("@/lib/marketing-automation.server");

        try {
          const result = await runMarketingAutomation(
            supabaseAdmin as unknown as Parameters<typeof runMarketingAutomation>[0],
            { trigger: "cron" },
          );
          return Response.json({ success: true, ...result });
        } catch (error) {
          return new Response(
            JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : "Automation failed",
            }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
