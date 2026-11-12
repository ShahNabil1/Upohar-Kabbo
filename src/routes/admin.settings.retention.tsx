import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Database, Play, Trash2 } from "lucide-react";

import {
  adminGetCleanupStats,
  adminListSettings,
  adminRunCleanup,
  adminSaveSetting,
} from "@/lib/admin.functions";
import { AdminHeading, NumberField, Panel } from "@/components/admin/kit";
import { SaveButton } from "@/components/admin/save-button";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/admin/settings/retention")({
  component: RetentionSettings,
  head: () => ({
    meta: [
      { title: "Data Cleanup · Upoharkabbo Admin" },
      { name: "description", content: "Auto-delete old order activity logs and webhook payloads to keep the database small." },
    ],
  }),
});

type Obj = Record<string, unknown>;

function readRetention(value: unknown): { days: number; enabled: boolean; lastRun: string | null } {
  const v = (value ?? {}) as Obj;
  const days = typeof v["days"] === "number" ? v["days"] : 45;
  return {
    days: Number.isFinite(days) ? days : 45,
    enabled: v["enabled"] !== false,
    lastRun: typeof v["last_run"] === "string" ? v["last_run"] : null,
  };
}

function formatDate(iso: string | null) {
  if (!iso) return "Never";
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function RetentionSettings() {
  const qc = useQueryClient();
  const { data: settings } = useQuery({
    queryKey: ["admin", "settings"],
    queryFn: () => adminListSettings(),
  });
  const retention = useMemo(
    () => readRetention(settings?.find((s: { key: string }) => s.key === "retention")?.value),
    [settings],
  );

  const [days, setDays] = useState(retention.days);
  const [enabled, setEnabled] = useState(retention.enabled);

  useEffect(() => {
    setDays(retention.days);
    setEnabled(retention.enabled);
  }, [retention.days, retention.enabled]);

  const stats = useQuery({
    queryKey: ["admin", "cleanup-stats", days],
    queryFn: () => adminGetCleanupStats({ data: { days } }),
    enabled: true,
  });

  const save = useMutation({
    mutationFn: (value: Obj) => adminSaveSetting({ data: { key: "retention", value } }),
    onSuccess: async () => {
      toast.success("Retention settings saved");
      await qc.invalidateQueries({ queryKey: ["admin", "settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const run = useMutation({
    mutationFn: () => adminRunCleanup({ data: { days } }),
    onSuccess: async (res) => {
      toast.success(
        `Cleaned: ${res.deletedActivity} activity, ${res.deletedWebhooks} webhooks, ${res.deletedNotes} notes, ${res.truncatedConsignments} payloads`,
      );
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin", "settings"] }),
        qc.invalidateQueries({ queryKey: ["admin", "cleanup-stats", days] }),
      ]);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const changed = days !== retention.days || enabled !== retention.enabled;

  return (
    <div className="space-y-6 pb-16">
      <AdminHeading
        title="Data Cleanup"
        description="Automatically remove bulky old activity logs and webhook payloads while keeping order records safe."
      />

      <Panel className="space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="ig-text text-sm font-bold">Automatic cleanup</h2>
            <p className="mt-1 max-w-xl text-xs text-muted-foreground">
              Every day at 3:30 AM Asia/Dhaka, logs and payloads older than the retention window are
              deleted. Core order data (orders, items, consignments) is never removed.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{enabled ? "On" : "Off"}</span>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField
            label="Retention window (days)"
            value={days}
            onChange={(v) => setDays(Math.max(7, Math.min(730, Math.round(v))))}
          />
          <div className="flex items-end">
            <p className="text-xs text-muted-foreground">
              Last run: <span className="font-medium text-foreground">{formatDate(retention.lastRun)}</span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <SaveButton
            saveLabel="Save schedule"
            savedLabel="Schedule updated"
            loading={save.isPending}
            dirty={changed}
            onClick={() =>
              save.mutate({
                days,
                enabled,
                last_run: retention.lastRun,
                last_result: (settings?.find((s: { key: string }) => s.key === "retention")?.value as Obj)?.["last_result"] ?? null,
              })
            }
          />
          <Button
            variant="outline"
            loading={run.isPending}
            onClick={() => run.mutate()}
            className="transition-transform duration-200 hover:-translate-y-0.5"
          >
            <Play className="size-4" />
            Run now
          </Button>
        </div>
      </Panel>

      <Panel className="space-y-4">
        <h2 className="ig-text text-sm font-bold">What would be cleaned right now</h2>
        {stats.isLoading ? (
          <p className="text-xs text-muted-foreground">Calculating…</p>
        ) : stats.error ? (
          <p className="text-xs text-destructive">Failed to load stats</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              icon={Database}
              label="Activity logs"
              value={stats.data?.activityRows ?? 0}
            />
            <StatCard
              icon={Database}
              label="Webhook payloads"
              value={stats.data?.webhookRows ?? 0}
            />
            <StatCard
              icon={Database}
              label="Order notes"
              value={stats.data?.noteRows ?? 0}
            />
            <StatCard
              icon={Trash2}
              label="Raw consignment JSON"
              value={stats.data?.rawPayloadRows ?? 0}
            />
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Cutoff: orders created before {stats.data ? new Date(stats.data.cutoff).toLocaleDateString("en-GB") : "—"}.
        </p>
      </Panel>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-background/40 p-4 transition-all hover:border-primary/30">
      <Icon className="size-5 text-primary/80" />
      <p className="mt-2 text-2xl font-bold">{value.toLocaleString("en-GB")}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
