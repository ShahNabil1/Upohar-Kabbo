/**
 * Automated rule scheduling — server-only.
 *
 * A cron job hits `/api/public/hooks/marketing-automation`, which calls
 * `runMarketingAutomation()`. That re-uses the exact same rule engine the
 * Control Center shows on screen, then (unless dry-run is on) applies the
 * verdicts to Meta: pausing wasteful entities, scaling winners and trimming
 * fatigued ones. Every run is written to `marketing_automation_runs` so the
 * admin can audit what the robot touched.
 */

import {
  DEFAULT_AUTOMATION,
  DEFAULT_THRESHOLDS,
  type AutomationActionLog,
  type AutomationRun,
  type AutomationSettings,
  type CampaignLevel,
  type ControlRow,
  type MarketingPreset,
} from "./marketing-shared";
import { buildControlCenter, setDailyBudget, setEntityStatus } from "./marketing.server";

const SETTINGS_KEY = "marketing_automation";

type Db = {
  from: (table: string) => any;
};

const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);
const int = (v: unknown, fallback: number, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : fallback;
};

/** Coerces whatever is stored in `site_settings` into a complete settings object. */
export function normalizeAutomation(raw: unknown): AutomationSettings {
  const v = (raw ?? {}) as Record<string, unknown>;
  const t = (v["thresholds"] ?? {}) as Record<string, unknown>;
  const a = (v["actions"] ?? {}) as Record<string, unknown>;
  return {
    enabled: bool(v["enabled"], DEFAULT_AUTOMATION.enabled),
    dryRun: bool(v["dryRun"], DEFAULT_AUTOMATION.dryRun),
    level: (["campaign", "adset", "ad"].includes(String(v["level"]))
      ? v["level"]
      : DEFAULT_AUTOMATION.level) as CampaignLevel,
    preset: (["today", "yesterday", "7d", "14d", "30d", "90d"].includes(String(v["preset"]))
      ? v["preset"]
      : DEFAULT_AUTOMATION.preset) as MarketingPreset,
    thresholds: {
      minSpend: int(t["minSpend"], DEFAULT_THRESHOLDS.minSpend, 1_000_000),
      scaleRoas: int(t["scaleRoas"], DEFAULT_THRESHOLDS.scaleRoas, 100),
      pauseRoas: int(t["pauseRoas"], DEFAULT_THRESHOLDS.pauseRoas, 100),
      budgetStep: int(t["budgetStep"], DEFAULT_THRESHOLDS.budgetStep, 100),
    },
    actions: {
      pause: bool(a["pause"], DEFAULT_AUTOMATION.actions.pause),
      scale: bool(a["scale"], DEFAULT_AUTOMATION.actions.scale),
      reduce: bool(a["reduce"], DEFAULT_AUTOMATION.actions.reduce),
    },
    maxDailyBudget: int(v["maxDailyBudget"], DEFAULT_AUTOMATION.maxDailyBudget, 10_000_000),
    maxActionsPerRun: Math.max(
      1,
      int(v["maxActionsPerRun"], DEFAULT_AUTOMATION.maxActionsPerRun, 50),
    ),
  };
}

export async function readAutomationSettings(db: Db): Promise<AutomationSettings> {
  const { data } = await db
    .from("site_settings")
    .select("value")
    .eq("key", SETTINGS_KEY)
    .maybeSingle();
  return normalizeAutomation(data?.value);
}

export async function writeAutomationSettings(db: Db, settings: AutomationSettings) {
  const clean = normalizeAutomation(settings);
  const { error } = await db
    .from("site_settings")
    .upsert({ key: SETTINGS_KEY, value: clean }, { onConflict: "key" });
  if (error) throw new Error(error.message);
  return clean;
}

const numFmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

/** Rows the robot is allowed to touch, in priority order (pause first). */
function candidates(rows: ControlRow[], s: AutomationSettings): ControlRow[] {
  return rows.filter((r) => {
    if ((r.effectiveStatus ?? r.status) !== "ACTIVE") return false;
    if (r.action === "pause") return s.actions.pause;
    if (r.action === "scale") return s.actions.scale && r.dailyBudget !== null;
    if (r.action === "reduce") return s.actions.reduce && r.dailyBudget !== null;
    return false;
  });
}

export type AutomationResult = {
  skipped: boolean;
  currency?: string;
  message: string;
  evaluated: number;
  applied: number;
  actions: AutomationActionLog[];
};

/**
 * Evaluates the saved rules and (optionally) applies them.
 * `preview` runs the evaluation without writing a log row or touching Meta.
 */
export async function runMarketingAutomation(
  db: Db,
  opts: { trigger: string; settings?: AutomationSettings; preview?: boolean },
): Promise<AutomationResult> {
  const settings = opts.settings ?? (await readAutomationSettings(db));

  if (!settings.enabled && !opts.preview) {
    return {
      skipped: true,
      message: "Automation is turned off.",
      evaluated: 0,
      applied: 0,
      actions: [],
    };
  }

  const control = await buildControlCenter(settings.preset, settings.level, settings.thresholds);
  if (!control.connected) {
    const message = control.message ?? "Meta Marketing API is not connected.";
    if (!opts.preview) {
      await logRun(db, opts.trigger, settings, 0, [], message);
    }
    return { skipped: true, message, evaluated: 0, applied: 0, actions: [] };
  }

  const picked = candidates(control.rows, settings);
  const logs: AutomationActionLog[] = [];
  let applied = 0;

  for (const [index, row] of picked.entries()) {
    const base: AutomationActionLog = {
      id: row.id,
      name: row.name,
      action: row.action,
      reason: row.reason,
      spend: row.spend,
      roas: row.roas,
      outcome: "planned",
    };

    if (index >= settings.maxActionsPerRun) {
      logs.push({ ...base, outcome: "skipped", detail: "Per-run action limit reached." });
      continue;
    }

    if (opts.preview || settings.dryRun) {
      logs.push({
        ...base,
        outcome: "planned",
        detail:
          row.action === "pause"
            ? "Would pause"
            : `Would set daily budget to ${numFmt(nextBudget(row, settings))}`,
      });
      continue;
    }

    try {
      if (row.action === "pause") {
        await setEntityStatus(row.id, "PAUSED");
        logs.push({ ...base, outcome: "applied", detail: "Paused" });
      } else {
        const target = nextBudget(row, settings);
        if (!(target > 0) || target === row.dailyBudget) {
          logs.push({ ...base, outcome: "skipped", detail: "Budget cap reached — no change." });
          continue;
        }
        await setDailyBudget(row.id, target, settings.level);
        logs.push({
          ...base,
          outcome: "applied",
          detail: `Daily budget ${numFmt(row.dailyBudget ?? 0)} → ${numFmt(target)}`,
        });
      }
      applied += 1;
    } catch (error) {
      logs.push({
        ...base,
        outcome: "failed",
        detail: error instanceof Error ? error.message : "Meta rejected the change.",
      });
    }
  }

  if (!opts.preview) {
    await logRun(db, opts.trigger, settings, control.rows.length, logs, null);
  }

  return {
    skipped: false,
    currency: control.currency,
    message: settings.dryRun
      ? `Dry run — ${logs.length} action(s) planned.`
      : `${applied} action(s) applied.`,
    evaluated: control.rows.length,
    applied,
    actions: logs,
  };
}

function nextBudget(row: ControlRow, s: AutomationSettings): number {
  const current = row.dailyBudget ?? 0;
  if (current <= 0) return 0;
  const factor = row.action === "scale" ? 1 + s.thresholds.budgetStep / 100 : 1 - s.thresholds.budgetStep / 100;
  let next = Math.round(current * factor);
  if (row.action === "scale" && s.maxDailyBudget > 0) next = Math.min(next, s.maxDailyBudget);
  return Math.max(1, next);
}

async function logRun(
  db: Db,
  trigger: string,
  settings: AutomationSettings,
  evaluated: number,
  actions: AutomationActionLog[],
  error: string | null,
) {
  await db.from("marketing_automation_runs").insert({
    trigger,
    dry_run: settings.dryRun,
    level: settings.level,
    preset: settings.preset,
    evaluated,
    applied: actions.filter((a) => a.outcome === "applied").length,
    skipped: actions.filter((a) => a.outcome === "skipped" || a.outcome === "failed").length,
    actions,
    error,
  });
}

export async function listAutomationRuns(db: Db, limit = 20): Promise<AutomationRun[]> {
  const { data } = await db
    .from("marketing_automation_runs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  return ((data ?? []) as Record<string, any>[]).map((r) => ({
    id: String(r["id"]),
    trigger: String(r["trigger"] ?? "cron"),
    dryRun: Boolean(r["dry_run"]),
    level: String(r["level"] ?? "campaign"),
    preset: String(r["preset"] ?? "7d"),
    evaluated: Number(r["evaluated"] ?? 0),
    applied: Number(r["applied"] ?? 0),
    skipped: Number(r["skipped"] ?? 0),
    actions: (r["actions"] ?? []) as AutomationActionLog[],
    error: (r["error"] ?? null) as string | null,
    createdAt: String(r["created_at"]),
  }));
}
