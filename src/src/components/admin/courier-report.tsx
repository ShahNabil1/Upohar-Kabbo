import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, ShieldAlert, Truck } from "lucide-react";
import { toast } from "sonner";

import { courierCheck } from "@/lib/courier.functions";
import { Panel } from "@/components/admin/kit";
import { BrandLoader } from "@/components/admin/brand-loader";

import { ratioTone } from "@/components/admin/courier-status";
import { cn } from "@/lib/utils";

const VISIBLE_COURIERS = ["pathao", "steadfast", "redx", "carrybee"];

type Theme = { from: string; to: string; text: string };

const COURIER_THEME: Record<string, Theme> = {
  all: { from: "#4a1d5f", to: "#2e1240", text: "#ffffff" },
  pathao: { from: "#e8402a", to: "#d32b1c", text: "#ffffff" },
  steadfast: { from: "#1aa179", to: "#149069", text: "#ffffff" },
  redx: { from: "#ef2b2b", to: "#d81c1c", text: "#ffffff" },
  carrybee: { from: "#f5cf00", to: "#efc300", text: "#1b1b1b" },
};

function rateColor(pct: number) {
  if (pct >= 80) return "#16a34a";
  if (pct >= 60) return "#e08b00";
  return "#e0332f";
}

function CourierTile({
  name,
  logo,
  theme,
  total,
  delivered,
  cancelled,
  ratio,
  hasData,
  action,
}: {
  name: string;
  logo?: string | null;
  theme: Theme;
  total: number;
  delivered: number;
  cancelled: number;
  ratio: number;
  hasData: boolean;
  action?: React.ReactNode;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(Number(ratio) || 0)));
  const color = rateColor(pct);
  return (
    <div className="w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div
        className="flex items-center justify-center gap-1.5 px-2 py-1.5"
        style={{ background: `linear-gradient(135deg, ${theme.from}, ${theme.to})` }}
      >
        {logo ? <img src={logo} alt="" className="size-4 rounded bg-white/95 object-contain" /> : null}
        <p className="truncate text-[13px] font-extrabold tracking-tight" style={{ color: theme.text }}>
          {name}
        </p>
        {action}
      </div>

      <div className="space-y-0.5 px-2.5 pt-2 pb-1.5">
        <Row label="Success Rate">
          <span className="text-[13px] font-extrabold tabular-nums" style={{ color: hasData ? color : "#94a3b8" }}>
            {hasData ? `${pct}%` : "—"}
          </span>
        </Row>
        <Row label="Total">{total}</Row>
        <Row label="Success">{delivered}</Row>
        <Row label="Cancelled">{cancelled}</Row>
      </div>

      <div className="px-2.5 pb-2.5">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${hasData ? pct : 0}%`, background: color }}
          />
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[12px] font-semibold text-slate-500">{label}</span>
      <span className="text-[13px] font-extrabold tabular-nums text-slate-900">{children}</span>
    </div>
  );
}


export function CourierReport({ phone }: { phone: string }) {
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "courier", "check", phone],
    queryFn: () => courierCheck({ data: { phone, refresh: false } }),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const refresh = useMutation({
    mutationFn: () => courierCheck({ data: { phone, refresh: true } }),
    onSuccess: (fresh) => {
      qc.setQueryData(["admin", "courier", "check", phone], fresh);
      qc.invalidateQueries({ queryKey: ["admin", "courier", "ratios"] });
      toast.success("Courier data refreshed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Panel>
      <div className="flex flex-col items-center gap-1.5">
        <h2 className="ig-text inline-flex items-center gap-2 text-base font-bold">
          <Truck className="size-5 text-primary" />
          Courier Fraud Check
        </h2>
        {data ? (
          <span className="text-[11px] text-muted-foreground">
            Cached: {new Date(data.checkedAt).toLocaleString("en-GB")}
          </span>
        ) : null}
      </div>

      {isLoading || refresh.isPending ? (
        <BrandLoader size="sm" className="py-6" />
      ) : error ? (
        <p className="mt-3 text-sm text-rose-700">{(error as Error).message}</p>
      ) : !data ? (
        <p className="mt-3 text-sm text-muted-foreground">No courier data.</p>
      ) : (
        <>
          <div className="-mx-1 mt-4 flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-1 pb-2 sm:gap-3 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border [&>*]:min-w-[132px] [&>*]:flex-1 [&>*]:shrink-0 [&>*]:snap-start">
            <CourierTile
              name="Overall"
              theme={COURIER_THEME['all']!}
              total={data.summary.total_parcel}
              delivered={data.summary.success_parcel}
              cancelled={data.summary.cancelled_parcel}
              ratio={data.summary.success_ratio}
              hasData={data.summary.total_parcel > 0}
              action={
                <button
                  type="button"
                  aria-label="Refresh courier data"
                  onClick={() => refresh.mutate()}
                  disabled={refresh.isPending}
                  className="ml-1 grid size-6 place-items-center rounded-full text-white/90 transition active:scale-90 hover:bg-white/20 hover:text-white disabled:opacity-50"
                >
                  <RefreshCw className={cn("size-4", refresh.isPending && "animate-spin")} />
                </button>
              }
            />

            {data.couriers
              .filter((c) => VISIBLE_COURIERS.includes(c.key.toLowerCase()))
              .sort(
                (a, b) =>
                  VISIBLE_COURIERS.indexOf(a.key.toLowerCase()) -
                  VISIBLE_COURIERS.indexOf(b.key.toLowerCase()),
              )
              .map((c) => (
                <CourierTile
                  key={c.key}
                  name={c.name}
                  logo={c.logo}
                  theme={COURIER_THEME[c.key.toLowerCase()] ?? COURIER_THEME['all']!}
                  total={c.total_parcel}
                  delivered={c.success_parcel}
                  cancelled={c.cancelled_parcel}
                  ratio={c.success_ratio}
                  hasData={c.total_parcel > 0}
                />
              ))}
          </div>


          {data.reports.length > 0 ? (
            <div className="mt-4 space-y-2 border-t border-border pt-3">
              <p className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-700">
                <ShieldAlert className="size-3.5" />
                Merchant reports ({data.reports.length})
              </p>
              <ul className="space-y-2">
                {data.reports.map((r) => (
                  <li key={r.id} className="rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-xs">
                    <div className="flex flex-wrap items-center gap-2 font-semibold text-rose-900">
                      {r.courierLogo ? (
                        <img src={r.courierLogo} alt="" className="size-4 rounded object-contain" />
                      ) : null}
                      {r.courierName ?? "Report"}
                      {r.name ? <span className="text-rose-700">· {r.name}</span> : null}
                      {r.created_at ? (
                        <span className="font-normal text-rose-700">
                          {new Date(r.created_at).toLocaleDateString("en-GB")}
                        </span>
                      ) : null}
                    </div>
                    {r.details ? <p className="mt-1 text-rose-800">{r.details}</p> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </Panel>
  );
}
