import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";

import { adminCourierConnections } from "@/lib/delivery.functions";
import { CourierMark } from "@/components/admin/courier-logo";
import { cn } from "@/lib/utils";

const LABELS: Record<string, string> = {
  steadfast: "Steadfast",
  pathao: "Pathao",
  carrybee: "CarryBee",
};

const ORDER = ["steadfast", "pathao", "carrybee"];

/** Live API connection status for every courier partner. */
export function CourierApiStatusBar() {
  const q = useQuery({
    queryKey: ["admin", "courier", "connections"],
    queryFn: () => adminCourierConnections(),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const rows = [...(q.data ?? [])].sort(
    (a, b) => ORDER.indexOf(a.provider) - ORDER.indexOf(b.provider),
  );

  return (
    <div className="admin-rise flex flex-wrap items-center gap-2 rounded-2xl border border-border/70 bg-card px-3 py-2 shadow-sm">
      <span className="mr-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        Courier API
      </span>

      {q.isLoading
        ? ORDER.map((p) => (
            <span
              key={p}
              className="h-7 w-32 animate-pulse rounded-full bg-muted"
              aria-hidden
            />
          ))
        : rows.map((r) => {
            const state = r.ok ? "ok" : r.configured ? "fail" : "idle";
            return (
              <span
                key={r.provider}
                title={r.message}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border py-1 pl-1 pr-2.5 text-xs font-semibold transition-colors",
                  state === "ok"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                    : state === "fail"
                      ? "border-rose-200 bg-rose-50 text-rose-900"
                      : "border-border bg-muted/50 text-muted-foreground",
                )}
              >
                <CourierMark partner={r.provider} className="size-5" />
                {LABELS[r.provider] ?? r.provider}
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    state === "ok"
                      ? "bg-emerald-600"
                      : state === "fail"
                        ? "bg-rose-600"
                        : "bg-muted-foreground",
                  )}
                />
                <span className="text-[11px] font-medium">
                  {state === "ok" ? "Connected" : state === "fail" ? "Failed" : "Not set up"}
                </span>
              </span>
            );
          })}

      <button
        type="button"
        onClick={() => void q.refetch()}
        disabled={q.isFetching}
        aria-label="Recheck courier connections"
        className="ml-auto grid size-7 place-items-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:scale-95 disabled:opacity-50"
      >
        <RefreshCw className={cn("size-3.5", q.isFetching && "animate-spin")} />
      </button>
    </div>
  );
}
