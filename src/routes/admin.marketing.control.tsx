import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Gauge,
  Pause,
  Play,
  RefreshCw,
  SlidersHorizontal,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";

import {
  marketingControl,
  marketingSetBudget,
  marketingSetStatus,
} from "@/lib/marketing.functions";
import {
  CAMPAIGN_LEVELS,
  DEFAULT_THRESHOLDS,
  MARKETING_PRESETS,
  levelLabel,
  presetLabel,
  type CampaignLevel,
  type ControlRow,
  type ControlThresholds,
  type MarketingPreset,
  type RuleAction,
} from "@/lib/marketing-shared";
import { AdminHeading, Panel } from "@/components/admin/kit";
import { BrandLoader } from "@/components/admin/brand-loader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/marketing/control")({
  component: MarketingControlPage,
});

const money = (n: number, currency: string) =>
  `${currency === "USD" ? "$" : `${currency} `}${n.toLocaleString("en-US", {
    maximumFractionDigits: 2,
  })}`;

const ACTION_META: Record<
  RuleAction,
  { label: string; className: string; dot: string }
> = {
  pause: { label: "Pause", className: "bg-rose-500/10 text-rose-600", dot: "bg-rose-500" },
  scale: { label: "Scale", className: "bg-emerald-500/10 text-emerald-600", dot: "bg-emerald-500" },
  reduce: { label: "Reduce", className: "bg-amber-500/10 text-amber-600", dot: "bg-amber-500" },
  watch: { label: "Watch", className: "bg-muted text-muted-foreground", dot: "bg-muted-foreground" },
};

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-200",
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "bg-muted/60 text-muted-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

function ThresholdInput({
  label,
  suffix,
  value,
  onChange,
}: {
  label: string;
  suffix?: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="min-w-0 flex-1">
      <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </span>
      <div className="mt-1 flex items-center gap-1.5">
        <Input
          type="number"
          value={value}
          min={0}
          step="0.5"
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          className="h-9 rounded-xl bg-background/70 tabular-nums"
        />
        {suffix ? (
          <span className="text-xs text-muted-foreground">{suffix}</span>
        ) : null}
      </div>
    </label>
  );
}

function ControlCard({
  row,
  currency,
  step,
  busy,
  onToggle,
  onBudget,
}: {
  row: ControlRow;
  currency: string;
  step: number;
  busy: boolean;
  onToggle: (row: ControlRow) => void;
  onBudget: (row: ControlRow, amount: number) => void;
}) {
  const [draft, setDraft] = useState<string>("");
  const meta = ACTION_META[row.action];
  const isActive = (row.effectiveStatus ?? row.status) === "ACTIVE";
  const budget = row.dailyBudget;

  return (
    <div className="rounded-2xl border border-border/70 bg-card/60 p-4 transition-colors hover:border-primary/30">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={cn("size-2 rounded-full", meta.dot)} />
            <p className="truncate text-sm font-semibold">{row.name}</p>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{row.reason}</p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide",
            meta.className,
          )}
        >
          {meta.label}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Spend", value: money(row.spend, currency) },
          { label: "ROAS", value: `${row.roas.toFixed(2)}x` },
          { label: "Purchases", value: row.purchases.toLocaleString("en-US") },
          {
            label: "CPA",
            value: row.costPerPurchase ? money(row.costPerPurchase, currency) : "—",
          },
        ].map((s) => (
          <div key={s.label}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              {s.label}
            </p>
            <p className="text-sm font-bold tabular-nums">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
        <Button
          size="sm"
          variant={isActive ? "outline" : "default"}
          disabled={busy}
          onClick={() => onToggle(row)}
          className="gap-1.5"
        >
          {isActive ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
          {isActive ? "Pause" : "Resume"}
        </Button>

        {budget != null ? (
          <>
            <span className="text-xs text-muted-foreground">
              Daily {money(budget, currency)}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => onBudget(row, budget * (1 + step / 100))}
              className="gap-1.5"
            >
              <TrendingUp className="size-3.5" />+{step}%
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => onBudget(row, budget * (1 - step / 100))}
              className="gap-1.5"
            >
              <TrendingDown className="size-3.5" />−{step}%
            </Button>
            <div className="flex items-center gap-1.5">
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Set…"
                inputMode="decimal"
                className="h-8 w-24 rounded-xl bg-background/70 text-xs tabular-nums"
              />
              <Button
                size="sm"
                variant="secondary"
                disabled={busy || !Number(draft)}
                onClick={() => {
                  onBudget(row, Number(draft));
                  setDraft("");
                }}
              >
                Apply
              </Button>
            </div>
          </>
        ) : (
          <span className="text-xs text-muted-foreground">
            No daily budget on this level (campaign budget optimisation).
          </span>
        )}
      </div>
    </div>
  );
}

function MarketingControlPage() {
  const [preset, setPreset] = useState<MarketingPreset>("7d");
  const [level, setLevel] = useState<CampaignLevel>("campaign");
  const [thresholds, setThresholds] = useState<ControlThresholds>(DEFAULT_THRESHOLDS);
  const [filter, setFilter] = useState<RuleAction | "all">("all");

  const { data, isFetching, refetch } = useQuery({
    queryKey: ["marketing", "control", preset, level, thresholds],
    queryFn: () => marketingControl({ data: { preset, level, thresholds } }),
    staleTime: 60_000,
  });

  const statusMutation = useMutation({
    mutationFn: (v: { id: string; status: "ACTIVE" | "PAUSED" }) =>
      marketingSetStatus({ data: v }),
    onSuccess: (_r, v) => {
      toast.success(v.status === "PAUSED" ? "Paused on Meta" : "Resumed on Meta");
      void refetch();
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Could not update status"),
  });

  const budgetMutation = useMutation({
    mutationFn: (v: { id: string; amount: number; level: CampaignLevel }) =>
      marketingSetBudget({ data: v }),
    onSuccess: () => {
      toast.success("Daily budget updated");
      void refetch();
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Could not update budget"),
  });

  const busy = statusMutation.isPending || budgetMutation.isPending;

  const rows = useMemo(() => {
    const all = data?.rows ?? [];
    return filter === "all" ? all : all.filter((r) => r.action === filter);
  }, [data, filter]);

  const counts = useMemo(() => {
    const base: Record<RuleAction, number> = { pause: 0, scale: 0, reduce: 0, watch: 0 };
    for (const r of data?.rows ?? []) base[r.action] += 1;
    return base;
  }, [data]);

  return (
    <div className="space-y-6">
      <AdminHeading
        title="Control center"
        description="Rule-scored campaigns with one-tap pause and budget moves."
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="gap-2"
          >
            <RefreshCw className={cn("size-4", isFetching && "animate-spin")} />
            Refresh
          </Button>
        }
      />

      <Panel className="flex flex-wrap items-center gap-2">
        {MARKETING_PRESETS.map((p) => (
          <Chip key={p} active={p === preset} onClick={() => setPreset(p)}>
            {presetLabel[p]}
          </Chip>
        ))}
        <span className="mx-1 h-5 w-px bg-border" />
        {CAMPAIGN_LEVELS.map((l) => (
          <Chip key={l} active={l === level} onClick={() => setLevel(l)}>
            {levelLabel[l]}
          </Chip>
        ))}
      </Panel>

      <Panel>
        <div className="mb-3 flex items-center gap-2">
          <SlidersHorizontal className="size-4 text-primary" />
          <h2 className="text-sm font-bold tracking-tight">Rule thresholds</h2>
        </div>
        <div className="flex flex-wrap gap-3">
          <ThresholdInput
            label="Min spend"
            value={thresholds.minSpend}
            onChange={(minSpend) => setThresholds((t) => ({ ...t, minSpend }))}
          />
          <ThresholdInput
            label="Scale at ROAS"
            suffix="x"
            value={thresholds.scaleRoas}
            onChange={(scaleRoas) => setThresholds((t) => ({ ...t, scaleRoas }))}
          />
          <ThresholdInput
            label="Pause below ROAS"
            suffix="x"
            value={thresholds.pauseRoas}
            onChange={(pauseRoas) => setThresholds((t) => ({ ...t, pauseRoas }))}
          />
          <ThresholdInput
            label="Budget step"
            suffix="%"
            value={thresholds.budgetStep}
            onChange={(budgetStep) => setThresholds((t) => ({ ...t, budgetStep }))}
          />
        </div>
      </Panel>

      {!data ? (
        <BrandLoader />
      ) : !data.connected ? (
        <Panel className="border-amber-500/40 bg-amber-500/5">
          <div className="flex items-start gap-3">
            <TriangleAlert className="mt-0.5 size-4.5 text-amber-600" />
            <p className="text-sm text-muted-foreground">
              {data.message ?? "Meta Marketing API is unavailable."}
            </p>
          </div>
        </Panel>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            {[
              { label: "Spend", value: money(data.summary.spend, data.currency), icon: Gauge },
              {
                label: "Meta revenue",
                value: money(data.summary.revenue, data.currency),
                icon: TrendingUp,
              },
              { label: "ROAS", value: `${data.summary.roas.toFixed(2)}x`, icon: Gauge },
              {
                label: "Active",
                value: `${data.summary.activeCount} / ${data.rows.length}`,
                icon: Play,
              },
            ].map((c) => (
              <Panel key={c.label} className="p-4">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    {c.label}
                  </p>
                  <c.icon className="size-4 text-primary/70" />
                </div>
                <p className="mt-1 text-xl font-bold tabular-nums">{c.value}</p>
              </Panel>
            ))}
          </div>

          <Panel className="flex flex-wrap items-center gap-2">
            <Chip active={filter === "all"} onClick={() => setFilter("all")}>
              All ({data.rows.length})
            </Chip>
            {(Object.keys(ACTION_META) as RuleAction[]).map((a) => (
              <Chip key={a} active={filter === a} onClick={() => setFilter(a)}>
                {ACTION_META[a].label} ({counts[a]})
              </Chip>
            ))}
          </Panel>

          {rows.length ? (
            <div className="space-y-3">
              {rows.map((row) => (
                <ControlCard
                  key={row.id}
                  row={row}
                  currency={data.currency}
                  step={thresholds.budgetStep}
                  busy={busy}
                  onToggle={(r) =>
                    statusMutation.mutate({
                      id: r.id,
                      status:
                        (r.effectiveStatus ?? r.status) === "ACTIVE" ? "PAUSED" : "ACTIVE",
                    })
                  }
                  onBudget={(r, amount) =>
                    budgetMutation.mutate({
                      id: r.id,
                      amount: Math.max(1, Math.round(amount * 100) / 100),
                      level,
                    })
                  }
                />
              ))}
            </div>
          ) : (
            <Panel>
              <p className="py-8 text-center text-sm text-muted-foreground">
                No entities matched this filter in the selected window.
              </p>
            </Panel>
          )}
        </>
      )}
    </div>
  );
}
