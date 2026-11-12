import { useQuery } from "@tanstack/react-query";
import { PlugZap } from "lucide-react";

import { courierConnectionStatus, courierPlan } from "@/lib/courier.functions";
import { cn } from "@/lib/utils";

export function CourierStatusBar() {
  const conn = useQuery({
    queryKey: ["admin", "courier", "connection"],
    queryFn: () => courierConnectionStatus(),
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const plan = useQuery({
    queryKey: ["admin", "courier", "plan"],
    queryFn: () => courierPlan(),
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const ok = conn.data?.ok ?? false;
  const p = plan.data;

  return (
    <div className="admin-rise inline-flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2 shadow-sm">
      <div className="flex items-center gap-2">
        <PlugZap className="size-4 text-primary" />
        <span className="text-sm font-bold text-foreground">Fraud Checker</span>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1",
            conn.isLoading
              ? "bg-muted text-muted-foreground ring-border"
              : ok
                ? "bg-emerald-100 text-emerald-900 ring-emerald-200"
                : "bg-rose-100 text-rose-900 ring-rose-200",
          )}
        >
          <span
            className={cn(
              "size-1.5 rounded-full",
              conn.isLoading ? "bg-muted-foreground" : ok ? "bg-emerald-600" : "bg-rose-600",
            )}
          />
          {conn.isLoading ? "Checking…" : ok ? "Connected" : "Disconnected"}
        </span>
      </div>

      <div className="hidden h-4 w-px bg-border sm:block" />

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        {p && p.ok ? (
          <span>
            Overall:{" "}
            <span className="font-semibold text-foreground tabular-nums">
              {p.remainingFreeCalls + p.remainingPaidCalls}/{p.callLimit + p.paidLimit}
            </span>
          </span>
        ) : p && !p.ok ? (
          <span className="text-rose-700">{p.message}</span>
        ) : (
          <span>—</span>
        )}
      </div>
    </div>
  );
}

export function ratioTone(ratio: number) {
  if (ratio >= 80) return "bg-emerald-100 text-emerald-900 ring-emerald-200";
  if (ratio >= 50) return "bg-amber-100 text-amber-900 ring-amber-200";
  return "bg-rose-100 text-rose-900 ring-rose-200";
}
