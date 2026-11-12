/**
 * Public server function used by the storefront to send the server-side twin
 * of a browser funnel event (ViewContent / AddToCart / InitiateCheckout).
 * Thin wrapper — all runtime logic lives in `funnel-capi.server.ts`.
 */

import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";
import { z } from "zod";

const contentSchema = z.object({
  id: z.string().trim().min(1).max(120),
  name: z.string().trim().max(200).optional(),
  category: z.string().trim().max(200).optional(),
  quantity: z.number().int().min(1).max(999),
  price: z.number().min(0).max(10_000_000),
});

const schema = z.object({
  event: z.enum(["view_item", "add_to_cart", "begin_checkout"]),
  eventId: z.string().trim().min(4).max(120),
  url: z.string().trim().url().max(600),
  value: z.number().min(0).max(10_000_000),
  contents: z.array(contentSchema).min(1).max(50),
  fbp: z.string().trim().max(120).optional(),
  fbc: z.string().trim().max(300).optional(),
  ttp: z.string().trim().max(200).optional(),
  ttclid: z.string().trim().max(300).optional(),
  externalId: z.string().trim().max(120).optional(),
});

export const trackFunnelEvent = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => schema.parse(input))
  .handler(async ({ data }) => {
    try {
      const { sendFunnelEvent } = await import("./funnel-capi.server");
      const ip = getRequestIP({ xForwardedFor: true }) ?? null;
      const userAgent = getRequestHeader("user-agent") ?? null;
      return await sendFunnelEvent(data, { ip, userAgent });
    } catch {
      return { sent: 0, failed: 0 };
    }
  });
