import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { PRESENCE_TTL_MS } from "@/lib/presence-shared";

export type PresenceRow = {
  order_id: string;
  user_id: string;
  actor_name: string;
  last_seen_at: string;
};

export function isPresenceLive(row: PresenceRow | undefined | null) {
  return !!row && Date.now() - new Date(row.last_seen_at).getTime() < PRESENCE_TTL_MS;
}

/**
 * Live map of `order_id -> presence row`, kept in sync through a Supabase
 * realtime subscription plus a ticker that expires stale claims client-side.
 */
export function useOrderPresence(orderIds?: string[]) {
  const [rows, setRows] = useState<Record<string, PresenceRow>>({});
  const [, setTick] = useState(0);

  useEffect(() => {
    let active = true;
    void supabase
      .from("order_presence")
      .select("order_id, user_id, actor_name, last_seen_at")
      .then(({ data }) => {
        if (!active || !data) return;
        const next: Record<string, PresenceRow> = {};
        for (const r of data as PresenceRow[]) next[r.order_id] = r;
        setRows(next);
      });

    const channel = supabase
      .channel("order-presence")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_presence" },
        (payload) => {
          const row = (payload.new ?? payload.old) as PresenceRow | null;
          if (!row?.order_id) return;
          setRows((prev) => {
            const next = { ...prev };
            if (payload.eventType === "DELETE") delete next[row.order_id];
            else next[row.order_id] = payload.new as PresenceRow;
            return next;
          });
        },
      )
      .subscribe();

    const timer = setInterval(() => setTick((t) => t + 1), 15_000);
    return () => {
      active = false;
      clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, []);

  const scoped: Record<string, PresenceRow> = {};
  for (const [id, row] of Object.entries(rows)) {
    if (orderIds && !orderIds.includes(id)) continue;
    if (isPresenceLive(row)) scoped[id] = row;
  }
  return scoped;
}
