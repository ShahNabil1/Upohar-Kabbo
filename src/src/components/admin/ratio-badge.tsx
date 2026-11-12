import { cn } from "@/lib/utils";
import { ratioTone } from "@/components/admin/courier-status";
import type { PhoneRatioSummary } from "@/lib/courier.functions";

const COURIER_DOT: Record<string, string> = {
  steadfast: "bg-[#1aa179]",
  pathao: "bg-[#e8402a]",
  carrybee: "bg-[#f5cf00]",
  redx: "bg-[#ef2b2b]",
};

function rateColor(pct: number) {
  if (pct >= 80) return "text-emerald-600";
  if (pct >= 50) return "text-amber-600";
  return "text-rose-600";
}

function Line({
  label,
  dot,
  total,
  success,
  cancelled,
  ratio,
}: {
  label: string;
  dot?: string | undefined;
  total: number;
  success: number;
  cancelled: number;
  ratio: number;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
        <span className={cn("size-2 rounded-full", dot ?? "bg-slate-400")} />
        {label}
      </span>
      <span className="inline-flex items-center gap-2 text-[11px] font-bold tabular-nums">
        <span className="text-slate-500">{total}</span>
        <span className="text-emerald-600">{success}</span>
        <span className="text-rose-500">{cancelled}</span>
        <span className={cn("w-9 text-right", total > 0 ? rateColor(ratio) : "text-slate-400")}>
          {total > 0 ? `${ratio}%` : "—"}
        </span>
      </span>
    </div>
  );
}

/** Success-ratio pill with a hover breakdown of each courier's received/cancelled counts. */
export function RatioBadge({ data, className }: { data: PhoneRatioSummary; className?: string }) {
  return (
    <span className={cn("group/ratio relative inline-flex", className)}>
      <span
        className={cn(
          "cursor-default rounded-full px-2 py-0.5 text-xs font-bold ring-1 tabular-nums",
          ratioTone(data.ratio),
        )}
      >
        {data.ratio}%
      </span>

      <span className="pointer-events-none invisible absolute left-1/2 top-full z-50 w-64 -translate-x-1/2 translate-y-1 pt-2 opacity-0 transition-all duration-150 group-hover/ratio:visible group-hover/ratio:translate-y-0 group-hover/ratio:opacity-100">
        <span className="block rounded-xl border border-slate-200 bg-white p-2.5 shadow-xl">
          <span className="mb-1 flex items-center justify-between gap-3 border-b border-slate-100 pb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
            <span>Courier</span>
            <span className="inline-flex items-center gap-2">
              <span>Total</span>
              <span>Recv</span>
              <span>Canc</span>
              <span className="w-9 text-right">Rate</span>
            </span>
          </span>
          <Line
            label="All"
            total={data.total}
            success={data.success}
            cancelled={data.cancelled}
            ratio={data.ratio}
          />
          {data.couriers.map((c) => (
            <Line
              key={c.key}
              label={c.name}
              dot={COURIER_DOT[c.key.toLowerCase()]}
              total={c.total}
              success={c.success}
              cancelled={c.cancelled}
              ratio={c.ratio}
            />
          ))}
        </span>
      </span>
    </span>
  );
}
