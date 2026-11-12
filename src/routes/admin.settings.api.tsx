import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ArrowRightLeft,
  CheckCircle2,
  Loader2,
  Pencil,
  PlugZap,
  Gauge,
  RefreshCw,
  Trash2,
  TriangleAlert,
  XCircle,
} from "lucide-react";

import { AdminHeading, Panel, TextField } from "@/components/admin/kit";
import { IntegrationMark } from "@/components/admin/integration-logo";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import {
  adminListIntegrations,
  adminR2DiscardMigration,
  adminR2FinishMigration,
  adminR2MigrateBatch,
  adminR2MigrationState,
  adminRemoveIntegration,
  adminSaveIntegration,
  adminImageTransformUsage,
  adminTestIntegration,
  type IntegrationGroupState,
  type IntegrationTestResult,
} from "@/lib/integrations.functions";
import {
  
  PLATFORM_GROUPS,
  TRACKING_GROUPS,
  integrationMeta,

  type IntegrationGroup,
} from "@/lib/integrations-shared";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/settings/api")({
  component: ApiSettingsAdmin,
});

function TransformUsageCard() {
  const q = useQuery({
    queryKey: ["admin", "transform-usage"],
    queryFn: () => adminImageTransformUsage(),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  const data = q.data;
  const count = data?.count ?? null;
  // No hard ceiling — the bar fills toward the next 5k milestone and rolls on.
  const STEP = 5000;
  const milestone = count === null ? STEP : (Math.floor(count / STEP) + 1) * STEP;
  const pct = count === null ? 0 : ((count % STEP) / STEP) * 100;
  const near = count !== null && count % STEP >= STEP * 0.85;
  const tone = near ? "bg-amber-500" : "bg-emerald-500";
  const resetAt = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1));

  return (
    <div className="rounded-xl border border-border/70 bg-muted/30 px-3 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Gauge className="size-4 text-muted-foreground" />
        <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
          Image transformations · this month
        </span>
        <button
          type="button"
          onClick={() => void q.refetch()}
          className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className={cn("size-3", q.isFetching && "animate-spin")} />
          Refresh
        </button>
      </div>

      <div className="mt-2 flex items-baseline gap-2">
        <span className="ig-text text-2xl font-bold tabular-nums">
          {q.isLoading ? "…" : count === null ? "—" : count.toLocaleString("en-US")}
        </span>
        <span className="text-xs font-semibold text-muted-foreground">unique transformations</span>
        {count !== null ? (
          <span className="ml-auto text-[11px] font-semibold text-muted-foreground tabular-nums">
            next {milestone.toLocaleString("en-US")}
          </span>
        ) : null}
      </div>

      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-border">
        <div className={cn("h-full rounded-full transition-all", tone)} style={{ width: `${pct}%` }} />
      </div>


      <p className="mt-2 text-[11px] text-muted-foreground">
        {data?.message || "Loading live usage…"} · resets {resetAt.toLocaleDateString("en-US", { day: "numeric", month: "short" })}
        {data?.checkedAt && data.count !== null
          ? ` · ${new Date(data.checkedAt).toLocaleTimeString()}`
          : ""}
      </p>
    </div>
  );
}

function GroupCard({
  group,
  state,
  onSaved,
}: {
  group: IntegrationGroup;
  state: IntegrationGroupState | undefined;
  onSaved: () => Promise<void>;
}) {
  const meta = integrationMeta[group];
  const confirm = useConfirm();
  const [values, setValues] = useState<Record<string, string>>({});
  const [savedSnapshot, setSavedSnapshot] = useState<string>("{}");
  const [result, setResult] = useState<IntegrationTestResult | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  useEffect(() => {
    const next = state?.values ?? {};
    setValues(next);
    setSavedSnapshot(JSON.stringify(next));
    setResult(state?.lastTest ?? null);
    setUnlocked(false);
  }, [state]);

  const locked = Boolean(state?.configured) && !unlocked;
  const isDirty = JSON.stringify(values) !== savedSnapshot;
  const hasAnyValue = Object.values(values).some((v) => v.trim().length > 0);


  const save = useMutation({
    mutationFn: () => adminSaveIntegration({ data: { group, values } }),
    onSuccess: async () => {
      toast.success(`${meta.title} saved`);
      setSavedSnapshot(JSON.stringify(values));
      setUnlocked(false);
      setResult(null);

      await onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: () => adminRemoveIntegration({ data: { group } }),
    onSuccess: async () => {
      toast.success(`${meta.title} credentials removed`);
      setResult(null);
      await onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const test = useMutation({
    mutationFn: () => adminTestIntegration({ data: { group } }),
    onSuccess: async (res) => {
      setResult(res);
      if (res.ok) toast.success(`${meta.title}: ${res.message}`);
      else toast.error(`${meta.title}: ${res.message}`);
      await onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const busy = save.isPending || remove.isPending;

  const verified = Boolean(result?.ok) && !isDirty;
  const status = !state?.configured
    ? { label: "Incomplete", cls: "border-border bg-muted/50 text-muted-foreground", dot: "bg-muted-foreground" }
    : verified
      ? {
          label: "Verified",
          cls: "border-emerald-200 bg-emerald-50 text-emerald-900",
          dot: "bg-emerald-600",
        }
      : result && !result.ok
        ? { label: "Failed", cls: "border-rose-200 bg-rose-50 text-rose-900", dot: "bg-rose-600" }
        : {
            label: "Not verified",
            cls: "border-amber-200 bg-amber-50 text-amber-900",
            dot: "bg-amber-500",
          };

  return (
    <Panel className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <IntegrationMark group={group} />
          <div>
            <h2 className="text-base font-bold text-foreground">{meta.title}</h2>
            <p className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">{meta.description}</p>
          </div>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold",
            status.cls,
          )}
        >
          <span className={cn("size-1.5 rounded-full", status.dot)} />
          {status.label}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {meta.fields.map((field) => (
          <div key={field.key} className="space-y-1.5">
            <TextField
              label={field.label}
              value={values[field.key] ?? ""}
              disabled={locked}
              placeholder={field.placeholder ?? (field.secret ? "Paste the value" : "")}
              onChange={(v: string) => setValues((prev) => ({ ...prev, [field.key]: v }))}
              {...(field.hint ? { hint: field.hint } : {})}
            />
          </div>
        ))}

      </div>

      {group === "r2" ? <TransformUsageCard /> : null}

      {state?.envOnly ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          These values are still coming from server environment variables. Save them here once and
          you no longer need them in Cloudflare env settings.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {locked ? (
          <>
            <Button type="button" onClick={() => setEditOpen(true)}>
              <Pencil className="mr-1.5 size-4" />
              Edit credentials
            </Button>
            <AlertDialog open={editOpen} onOpenChange={setEditOpen}>
              <AlertDialogContent className="rounded-2xl">
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2 text-amber-600">
                    <TriangleAlert className="size-5" />
                    Edit {meta.title} credentials?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    These credentials are live. A wrong or incomplete value will immediately break
                    this integration — uploads, SMS or courier calls can stop working across the
                    whole site. Only continue if you have the correct values at hand, and run “Test
                    connection” right after saving.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="rounded-xl bg-amber-600 text-white hover:bg-amber-700"
                    onClick={(e) => {
                      e.preventDefault();
                      setEditOpen(false);
                      setUnlocked(true);
                    }}
                  >
                    I understand, let me edit
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        ) : (
          <>
            <Button
              type="button"
              disabled={busy || !isDirty || !hasAnyValue}
              onClick={() => save.mutate()}
            >
              {save.isPending ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
              Save
            </Button>
            {state?.configured ? (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setValues(state?.values ?? {});
                  setUnlocked(false);
                }}
              >
                Cancel
              </Button>
            ) : null}
          </>
        )}
        {state?.configured && locked ? (
          <Button
            type="button"
            variant="secondary"
            disabled={test.isPending}
            onClick={() => test.mutate()}
          >
            {test.isPending ? (
              <Loader2 className="mr-1.5 size-4 animate-spin" />
            ) : (
              <PlugZap className="mr-1.5 size-4" />
            )}
            Test connection
          </Button>
        ) : null}
        {state?.configured && !locked ? (
          <Button
            type="button"
            variant="ghost"
            className="text-destructive hover:bg-destructive/10"
            disabled={busy}
            onClick={async () => {
              const ok = await confirm({
                title: `Remove all ${meta.title} credentials?`,
                description: "This disconnects the integration immediately. You can reconnect it later by saving the keys again.",
                confirmLabel: "Remove",
                tone: "danger",
              });
              if (!ok) return;
              remove.mutate();
            }}
          >
            <Trash2 className="mr-1.5 size-4" />
            Remove
          </Button>
        ) : null}
      </div>

      {result && state?.configured ? (
        <div
          className={cn(
            "min-w-0 space-y-2 overflow-hidden rounded-xl border px-3 py-3 text-xs",
            result.ok
              ? "border-emerald-200 bg-emerald-50/70"
              : "border-rose-200 bg-rose-50/70 text-rose-900",
          )}
        >
          <div className="flex min-w-0 flex-wrap items-start gap-2 font-bold">
            {result.ok ? (
              <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
            ) : (
              <XCircle className="size-4 shrink-0 text-rose-600" />
            )}
            <span className="min-w-0 flex-1 break-words">{result.message}</span>
            <span className="shrink-0 font-medium text-muted-foreground">
              {new Date(result.checkedAt).toLocaleTimeString()}
            </span>
          </div>
          {result.details.length ? (
            <dl className="grid min-w-0 gap-x-6 gap-y-2 md:grid-cols-2">
              {result.details.map((row) => (
                <div
                  key={row.label}
                  className="flex min-w-0 flex-col gap-0.5 border-b border-border/40 pb-1.5 last:border-0 min-[420px]:flex-row min-[420px]:items-start min-[420px]:justify-between min-[420px]:gap-3"
                >
                  <dt className="shrink-0 text-muted-foreground">{row.label}</dt>
                  <dd className="ig-text min-w-0 font-semibold [overflow-wrap:anywhere] min-[420px]:text-right">
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      ) : null}
    </Panel>
  );
}

function R2MigrationCard() {
  const qc = useQueryClient();
  const state = useQuery({
    queryKey: ["admin", "r2-migration"],
    queryFn: () => adminR2MigrationState(),
  });
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [progress, setProgress] = useState({ copied: 0, skipped: 0, failed: 0 });
  const [skipOpen, setSkipOpen] = useState(false);

  if (!state.data?.pending || !state.data.from || !state.data.to) return null;
  const { from, to } = state.data;

  const run = async () => {
    setRunning(true);
    setLog([]);
    setBlocked(null);
    setProgress({ copied: 0, skipped: 0, failed: 0 });
    let offset = 0;
    let copied = 0;
    let skipped = 0;
    let failed = 0;
    let total = 0;
    const errors: string[] = [];
    try {
      for (let page = 0; page < 500; page += 1) {
        const res: Awaited<ReturnType<typeof adminR2MigrateBatch>> = await adminR2MigrateBatch({
          data: { offset },
        });
        if (res.blocked) {
          setBlocked(res.blocked);
          toast.error("Old bucket is not readable");
          return;
        }
        copied += res.copied;
        skipped += res.skipped;
        failed += res.failed;
        total = res.total;
        errors.push(...res.errors);
        setProgress({ copied, skipped, failed });
        setLog((prev) => [
          `Batch ${page + 1}: ${res.copied} copied, ${res.skipped} already there${
            res.failed ? `, ${res.failed} failed` : ""
          } · ${res.total} total referenced`,
          ...prev,
        ]);
        offset = res.nextOffset ?? -1;
        if (offset < 0) break;
      }
      if (failed > 0) {
        toast.error(`${failed} file(s) failed — run migrate again to retry them.`);
        setLog((prev) => [...errors.slice(0, 5), ...prev]);
        return;
      }
      const done = await adminR2FinishMigration();
      toast.success(`Migration complete — ${copied} file(s) copied, ${done.rewritten} link(s) updated.`);
      await qc.invalidateQueries({ queryKey: ["admin", "r2-migration"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Migration failed");
    } finally {
      setRunning(false);
    }
  };

  return (
    <Panel className="space-y-4 border-amber-200 bg-amber-50/40">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="ig-text flex items-center gap-2 text-sm font-bold">
            <ArrowRightLeft className="size-4 text-amber-700" />
            Bucket change detected
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            All images, invoices and videos referenced in the database still point to the old
            bucket. Migrate copies those referenced files into the new bucket and updates every
            stored link. The old token only needs read permission; bucket listing is not required.
          </p>
        </div>
      </div>

      <dl className="grid gap-x-4 gap-y-1.5 text-xs sm:grid-cols-2">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">From</dt>
          <dd className="ig-text truncate font-semibold">{from.bucket}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">To</dt>
          <dd className="ig-text truncate font-semibold">{to.bucket}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">Old URL</dt>
          <dd className="ig-text truncate font-semibold">{from.publicBaseUrl}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">New URL</dt>
          <dd className="ig-text truncate font-semibold">{to.publicBaseUrl}</dd>
        </div>
      </dl>

      {blocked ? (
        <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
          {blocked}
        </p>
      ) : null}



      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" disabled={running} onClick={run}>
          {running ? (
            <Loader2 className="mr-1.5 size-4 animate-spin" />
          ) : (
            <ArrowRightLeft className="mr-1.5 size-4" />
          )}
          {running ? "Migrating…" : "Migrate media"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={running}
          className="text-destructive hover:bg-destructive/10"
          onClick={() => setSkipOpen(true)}
        >
          Skip
        </Button>
        <AlertDialog open={skipOpen} onOpenChange={setSkipOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <TriangleAlert className="size-4 text-destructive" />
                Skip migration?
              </AlertDialogTitle>
              <AlertDialogDescription>
                The old bucket will be forgotten and existing links will keep pointing to it. Any
                media that is not copied over may stop loading permanently. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep migration</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={async () => {
                  await adminR2DiscardMigration();
                  await qc.invalidateQueries({ queryKey: ["admin", "r2-migration"] });
                  toast.success("Migration skipped — old bucket forgotten.");
                }}
              >
                Skip migration
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {running || progress.copied || progress.skipped || progress.failed ? (
          <span className="text-xs font-semibold text-muted-foreground">
            {progress.copied} copied · {progress.skipped} skipped · {progress.failed} failed
          </span>
        ) : null}
      </div>

      {log.length ? (
        <div className="max-h-40 space-y-1 overflow-auto rounded-xl border border-border/70 bg-background/70 px-3 py-2 text-[11px] text-muted-foreground">
          {log.map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
      ) : null}
    </Panel>
  );
}

function ApiSettingsAdmin() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["admin", "integrations"],
    queryFn: () => adminListIntegrations(),
  });

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ["admin", "integrations"] });
    await qc.invalidateQueries({ queryKey: ["admin", "r2-migration"] });
  };


  return (
    <div className="space-y-6 pb-16">
      <AdminHeading title="API & Integrations" />

      <R2MigrationCard />

      {PLATFORM_GROUPS.map((group) => (
        <GroupCard
          key={group}
          group={group}
          state={q.data?.find((row) => row.group === group)}
          onSaved={refresh}
        />
      ))}

      <div className="space-y-6 pt-4">
        <div className="border-t border-border/60 pt-6">
          <h2 className="font-display text-lg font-semibold tracking-tight">
            Analytics &amp; Tracking
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Browser pixels (Meta, TikTok, GA4, Clarity) load through the GTM container below.
            The server-side credentials here power deduplicated Conversions API, TikTok Events
            API and GA4 Measurement Protocol events.
          </p>
        </div>

        {TRACKING_GROUPS.map((group) => (
          <GroupCard
            key={group}
            group={group}
            state={q.data?.find((row) => row.group === group)}
            onSaved={refresh}
          />
        ))}
      </div>

    </div>
  );
}
