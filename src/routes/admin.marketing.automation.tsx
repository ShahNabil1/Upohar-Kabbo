import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Bot,
  CheckCircle2,
  CircleSlash,
  History,
  PlayCircle,
  Save,
  TriangleAlert,
  XCircle,
} from "lucide-react";

import { marketingAutomationState, marketingRunAutomation, marketingSaveAutomation } from "@/lib/marketing.functions";
import {
  CAMPAIGN_LEVELS,
  DEFAULT_AUTOMATION,
  MARKETING_PRESETS,
  presetLabel,
  type AutomationActionLog,
  type AutomationSettings,
  type CampaignLevel,
  type MarketingPreset,
} from "@/lib/marketing-shared";
import { AdminHeading, Panel } from "@/components/admin/kit";
import { BrandLoader } from "@/components/admin/brand-loader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/marketing/automation")({
  component: MarketingAutomationPage,
});

const levelLabel: Record<CampaignLevel, string> = {
  campaign: "Campaigns",
  adset: "Ad sets",
  ad: "Ads",
};

const outcomeStyle: Record<AutomationActionLog["outcome"], string> = {
  applied: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600",
  planned: "border-sky-500/30 bg-sky-500/10 text-sky-600",
  skipped: "border-border bg-muted text-muted-foreground",
  failed: "border-rose-500/30 bg-rose-500/10 text-rose-600",
};

const actionStyle: Record<string, string> = {
  pause: "text-rose-600",
  scale: "text-emerald-600",
  reduce: "text-amber-600",
  watch: "text-muted-foreground",
};

function NumberField({
  label,
  hint,
  value,
  onChange,
  min = 0,
  step = 1,
}: {
  label: string;
  hint?: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  step?: number;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold">{label}</Label>
      <Input
        type="number"
        min={min}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-9"
      />
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3 rounded-lg border border-border bg-card/50 p-3">
      <span className="min-w-0">
        <span className="block text-xs font-bold">{label}</span>
        {hint ? <span className="block text-[11px] text-muted-foreground">{hint}</span> : null}
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

function ActionList({ actions }: { actions: AutomationActionLog[] }) {
  if (!actions.length) {
    return <p className="text-xs text-muted-foreground">No entity matched the rules.</p>;
  }
  return (
    <ul className="space-y-2">
      {actions.map((a) => (
        <li
          key={`${a.id}-${a.action}-${a.outcome}`}
          className="rounded-lg border border-border bg-card/50 p-2.5"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-xs font-bold">{a.name}</p>
              <p className="text-[11px] text-muted-foreground">{a.reason}</p>
              {a.detail ? <p className="text-[11px] text-foreground/70">{a.detail}</p> : null}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span className={cn("text-[11px] font-bold uppercase", actionStyle[a.action])}>
                {a.action}
              </span>
              <span
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase",
                  outcomeStyle[a.outcome],
                )}
              >
                {a.outcome}
              </span>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function MarketingAutomationPage() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["marketing-automation"],
    queryFn: () => marketingAutomationState({ data: {} }),
    staleTime: 30_000,
  });

  const [draft, setDraft] = useState<AutomationSettings>(DEFAULT_AUTOMATION);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (query.data?.settings && !dirty) setDraft(query.data.settings);
  }, [query.data?.settings, dirty]);

  const patch = (p: Partial<AutomationSettings>) => {
    setDirty(true);
    setDraft((d) => ({ ...d, ...p }));
  };

  const save = useMutation({
    mutationFn: () => marketingSaveAutomation({ data: draft }),
    onSuccess: () => {
      setDirty(false);
      toast.success("Automation rules saved");
      void qc.invalidateQueries({ queryKey: ["marketing-automation"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const runNow = useMutation({
    mutationFn: () => marketingRunAutomation({ data: {} }),
    onSuccess: (res) => {
      toast.success(res.message);
      void qc.invalidateQueries({ queryKey: ["marketing-automation"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const data = query.data;

  return (
    <div className="space-y-4">
      <AdminHeading
        title="Rule Automation"
        description="Let the scheduler apply your Control Center rules automatically — pause wasteful ads, scale winners."
      />

      {query.isLoading ? (
        <BrandLoader />
      ) : !data ? (
        <Panel>
          <p className="text-sm text-muted-foreground">Could not load the automation settings.</p>
        </Panel>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-4">
            <Panel className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Bot className="size-4 text-muted-foreground" />
                  <h2 className="text-sm font-bold">Robot settings</h2>
                </div>
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase",
                    draft.enabled
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
                      : "border-border bg-muted text-muted-foreground",
                  )}
                >
                  {draft.enabled ? (draft.dryRun ? "Dry run" : "Live") : "Off"}
                </span>
              </div>

              <div className="grid gap-2.5 sm:grid-cols-2">
                <Toggle
                  label="Enable scheduled automation"
                  hint="The cron job only acts when this is on."
                  checked={draft.enabled}
                  onChange={(v) => patch({ enabled: v })}
                />
                <Toggle
                  label="Dry run (log only)"
                  hint="Decisions are recorded but nothing is sent to Meta."
                  checked={draft.dryRun}
                  onChange={(v) => patch({ dryRun: v })}
                />
                <Toggle
                  label="Auto-pause losers"
                  hint="Pause entities below break-even ROAS or with zero purchases."
                  checked={draft.actions.pause}
                  onChange={(v) => patch({ actions: { ...draft.actions, pause: v } })}
                />
                <Toggle
                  label="Auto-scale winners"
                  hint="Raise the daily budget of entities above your scaling bar."
                  checked={draft.actions.scale}
                  onChange={(v) => patch({ actions: { ...draft.actions, scale: v } })}
                />
                <Toggle
                  label="Auto-reduce fatigued"
                  hint="Trim budget when frequency gets too high."
                  checked={draft.actions.reduce}
                  onChange={(v) => patch({ actions: { ...draft.actions, reduce: v } })}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Level</Label>
                  <div className="flex gap-1.5">
                    {CAMPAIGN_LEVELS.map((l) => (
                      <button
                        key={l}
                        type="button"
                        onClick={() => patch({ level: l })}
                        className={cn(
                          "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                          draft.level === l
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-card text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {levelLabel[l]}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Look-back window</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {MARKETING_PRESETS.map((p: MarketingPreset) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => patch({ preset: p })}
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-[11px] font-semibold transition",
                          draft.preset === p
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-card text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {presetLabel[p]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <NumberField
                  label="Minimum spend"
                  hint="Ignore entities below this spend."
                  value={draft.thresholds.minSpend}
                  onChange={(n) => patch({ thresholds: { ...draft.thresholds, minSpend: n } })}
                />
                <NumberField
                  label="Scale above ROAS"
                  step={0.1}
                  value={draft.thresholds.scaleRoas}
                  onChange={(n) => patch({ thresholds: { ...draft.thresholds, scaleRoas: n } })}
                />
                <NumberField
                  label="Pause below ROAS"
                  step={0.1}
                  value={draft.thresholds.pauseRoas}
                  onChange={(n) => patch({ thresholds: { ...draft.thresholds, pauseRoas: n } })}
                />
                <NumberField
                  label="Budget step (%)"
                  value={draft.thresholds.budgetStep}
                  onChange={(n) => patch({ thresholds: { ...draft.thresholds, budgetStep: n } })}
                />
                <NumberField
                  label="Max daily budget"
                  hint="0 = no ceiling."
                  value={draft.maxDailyBudget}
                  onChange={(n) => patch({ maxDailyBudget: n })}
                />
                <NumberField
                  label="Max actions per run"
                  value={draft.maxActionsPerRun}
                  onChange={(n) => patch({ maxActionsPerRun: n })}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
                  <Save className="size-3.5" />
                  Save rules
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => runNow.mutate()}
                  disabled={runNow.isPending}
                >
                  <PlayCircle className="size-3.5" />
                  Run now
                </Button>
                {dirty ? (
                  <span className="self-center text-[11px] text-amber-600">Unsaved changes</span>
                ) : null}
              </div>

              {!draft.dryRun && draft.enabled ? (
                <p className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5 text-[11px] text-amber-700 dark:text-amber-500">
                  <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                  Live mode changes real campaigns on Meta. Every action is logged below.
                </p>
              ) : null}
            </Panel>

            <Panel className="space-y-3">
              <div className="flex items-center gap-2">
                <History className="size-4 text-muted-foreground" />
                <h2 className="text-sm font-bold">Run history</h2>
              </div>
              {data.runs.length ? (
                <ul className="space-y-2">
                  {data.runs.map((r) => (
                    <li key={r.id} className="rounded-lg border border-border bg-card/50 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-bold">
                          {new Date(r.createdAt).toLocaleString("en-GB", { hour12: false })}
                          <span className="ml-2 font-medium text-muted-foreground">
                            {r.trigger} · {r.level} · {r.preset}
                            {r.dryRun ? " · dry run" : ""}
                          </span>
                        </p>
                        <p className="flex items-center gap-2 text-[11px] font-semibold">
                          <span className="inline-flex items-center gap-1 text-emerald-600">
                            <CheckCircle2 className="size-3" />
                            {r.applied}
                          </span>
                          <span className="inline-flex items-center gap-1 text-muted-foreground">
                            <CircleSlash className="size-3" />
                            {r.skipped}
                          </span>
                          <span className="text-muted-foreground">of {r.evaluated} checked</span>
                        </p>
                      </div>
                      {r.error ? (
                        <p className="mt-1 flex items-center gap-1 text-[11px] text-rose-600">
                          <XCircle className="size-3" />
                          {r.error}
                        </p>
                      ) : null}
                      {r.actions.length ? (
                        <ul className="mt-2 space-y-1">
                          {r.actions.map((a, i) => (
                            <li
                              key={`${r.id}-${i}`}
                              className="flex items-center justify-between gap-2 text-[11px]"
                            >
                              <span className="truncate text-muted-foreground">{a.name}</span>
                              <span className={cn("shrink-0 font-semibold", actionStyle[a.action])}>
                                {a.action} · {a.outcome}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No automation run yet. Save your rules, then use “Run now” to test them safely in dry-run mode.
                </p>
              )}
            </Panel>
          </div>

          <Panel className="space-y-3 self-start">
            <h2 className="text-sm font-bold">What would happen right now</h2>
            {data.message ? (
              <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5 text-[11px] text-amber-700 dark:text-amber-500">
                {data.message}
              </p>
            ) : null}
            <ActionList actions={data.preview} />
            <p className="text-[11px] text-muted-foreground">
              Preview uses your saved rules. Changes take effect after you save.
            </p>
          </Panel>
        </div>
      )}
    </div>
  );
}
