import { useEffect } from "react";

import { useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

/**
 * Keeps admin order screens live.
 *
 * Courier webhooks (Pathao / Steadfast / CarryBee) write straight into the
 * database, so nothing tells the browser to refetch. This subscribes to the
 * relevant tables through Supabase realtime and invalidates the admin queries
 * whenever a row changes — no manual "Refresh courier status" click needed.
 *
 * Pass an order id to watch a single order, or nothing to watch every order
 * (used by the order boards).
 */
export function useOrderRealtime(orderId?: string) {
  const qc = useQueryClient();

  useEffect(() => {
    const invalidate = () => {
      void qc.invalidateQueries({ queryKey: ["admin"] });
    };

    const filter = orderId ? `order_id=eq.${orderId}` : undefined;
    const channel = supabase
      .channel(orderId ? `order-live-${orderId}` : "orders-live")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          ...(orderId ? { filter: `id=eq.${orderId}` } : {}),
        },
        invalidate,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_consignments", ...(filter ? { filter } : {}) },
        invalidate,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_activity", ...(filter ? { filter } : {}) },
        (payload) => {
          // A "view" row is written by the workspace fetch itself — refetching
          // on it would loop forever between open tabs.
          if ((payload.new as { kind?: string } | null)?.kind === "view") return;
          invalidate();
        },
      )

      // Webhook events are not linked to an order id, so always listen broadly.
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "courier_webhook_events" },
        invalidate,
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [orderId, qc]);
}
