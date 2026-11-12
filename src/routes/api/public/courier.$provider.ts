/**
 * Public courier webhook receiver: /api/public/courier/:provider
 *
 * Steadfast  → secret sent as `Steadfast-Secret-Key` header (or `?secret=`).
 * Pathao     → secret sent as `X-PATHAO-Signature`; response must echo the
 *              fixed integration secret header with a 202 status.
 * Carrybee   → integration secret via `X-CB-Webhook-Integration-Header`;
 *              response echoes the same header and always acknowledges with 202.
 */

import { createFileRoute } from "@tanstack/react-router";

import { DELIVERY_PROVIDERS, type DeliveryProvider } from "@/lib/delivery-shared";




export const Route = createFileRoute("/api/public/courier/$provider")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const provider = params.provider as DeliveryProvider;
        if (!DELIVERY_PROVIDERS.includes(provider)) {
          return Response.json({ status: 404, message: "Unknown provider" }, { status: 404 });
        }

        const {
          CARRYBEE_INTEGRATION_SECRET,
          PATHAO_INTEGRATION_SECRET,
          verifyWebhookSecret,
          processCourierWebhook,
        } = await import("@/lib/courier-webhook.server");
        const { createPublicServerClient } = await import("@/lib/supabase-public");
        const db = createPublicServerClient();

        const pathaoHeaders = { "X-Pathao-Merchant-Webhook-Integration-Secret": PATHAO_INTEGRATION_SECRET };
        // CarryBee's webhook validator requires a 202 plus this fixed header on
        // every response, otherwise "Add Webhook" fails with a 401 mismatch.
        const carrybeeHeaders = { "X-CB-Webhook-Integration-Header": CARRYBEE_INTEGRATION_SECRET };
        const respond = (body: unknown, status: number) => {
          if (provider === "pathao") {
            return Response.json(body, { status: status === 200 ? 202 : status, headers: pathaoHeaders });
          }
          if (provider === "carrybee") {
            return Response.json(body, { status: 202, headers: carrybeeHeaders });
          }
          return Response.json(body, { status });
        };

        const url = new URL(request.url);
        const supplied =
          request.headers.get("x-pathao-signature") ??
          request.headers.get("steadfast-secret-key") ??
          request.headers.get("x-webhook-secret") ??
          request.headers.get("x-cb-webhook-secret") ??
          request.headers.get("x-cb-webhook-integration-header") ??
          request.headers.get("x-carrybee-signature") ??
          url.searchParams.get("secret") ??
          "";

        // CarryBee authenticates callbacks with the integration header it first
        // asked the endpoint to echo. Other couriers use the generated secret
        // saved in Delivery Settings.
        const check =
          provider === "carrybee" && supplied === CARRYBEE_INTEGRATION_SECRET
            ? "ok"
            : await verifyWebhookSecret(db, provider, supplied);

        // CarryBee's live events (order.created / pickup-requested / cancelled)
        // do NOT carry the integration header it uses while registering the
        // endpoint, so a strict check silently dropped every real callback.
        // For CarryBee we accept and record the event regardless, and only note
        // whether the header matched. Other couriers stay strict.
        // Steadfast's live callbacks carry no secret header at all (its panel
        // only takes a URL), so a strict check dropped every real event. Like
        // CarryBee we record them and flag whether the secret matched.
        if (provider !== "carrybee" && provider !== "steadfast") {
          if (check === "unconfigured") {
            return respond({ status: 403, message: "Provider not configured" }, 403);
          }
          if (check !== "ok") {
            return respond({ status: 401, message: "Invalid webhook secret" }, 401);
          }
        }

        let payload: Record<string, unknown>;
        try {
          payload = (await request.json()) as Record<string, unknown>;
        } catch {
          return respond({ status: 400, message: "Invalid JSON body" }, 400);
        }

        if ((provider === "carrybee" || provider === "steadfast") && check !== "ok") {
          payload = { ...payload, _unverified_header: supplied || "(none)" };
        }

        const result = await processCourierWebhook(db, provider, payload);
        // Always 200/202 once authenticated so couriers stop retrying.
        return respond({ status: 200, message: result.message }, 200);

      },
    },
  },
});
