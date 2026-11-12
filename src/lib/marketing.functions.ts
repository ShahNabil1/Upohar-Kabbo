import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdmin } from "./admin.server";
import {
  CAMPAIGN_LEVELS,
  DEFAULT_THRESHOLDS,
  MARKETING_PRESETS,
  type AudienceHealth,
  type CampaignPerformance,
  type ControlCenter,
  type CreativePerformance,
  type MarketingOverview,
  type AutomationState,
  type ProductAttribution,
} from "./marketing-shared";
import {
  buildAudienceHealth,
  buildCampaignPerformance,
  buildControlCenter,
  buildCreativePerformance,
  buildMarketingOverview,
  buildProductAttribution,
  clearMarketingCache,
  setDailyBudget,
  setEntityStatus,
} from "./marketing.server";

const overviewSchema = z.object({
  preset: z.enum(MARKETING_PRESETS).default("7d"),
  refresh: z.boolean().optional(),
});

/** Admin-only: Meta ad performance blended with real store orders. */
export const marketingOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => overviewSchema.parse(input ?? {}))
  .handler(async ({ data, context }): Promise<MarketingOverview> => {
    const db = await requireAdmin(context.supabase, context.userId);
    if (data.refresh) clearMarketingCache();
    return buildMarketingOverview(
      db as unknown as Parameters<typeof buildMarketingOverview>[0],
      data.preset,
    );
  });

const campaignSchema = z.object({
  preset: z.enum(MARKETING_PRESETS).default("7d"),
  level: z.enum(CAMPAIGN_LEVELS).default("campaign"),
  refresh: z.boolean().optional(),
});

/** Admin-only: campaign / ad-set / ad level Meta performance. */
export const marketingCampaigns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => campaignSchema.parse(input ?? {}))
  .handler(async ({ data, context }): Promise<CampaignPerformance> => {
    await requireAdmin(context.supabase, context.userId);
    if (data.refresh) clearMarketingCache();
    return buildCampaignPerformance(data.preset, data.level);
  });

const creativeSchema = z.object({
  preset: z.enum(MARKETING_PRESETS).default("7d"),
  refresh: z.boolean().optional(),
});

/** Admin-only: creative level performance with hook / hold rates. */
export const marketingCreatives = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => creativeSchema.parse(input ?? {}))
  .handler(async ({ data, context }): Promise<CreativePerformance> => {
    await requireAdmin(context.supabase, context.userId);
    if (data.refresh) clearMarketingCache();
    return buildCreativePerformance(data.preset);
  });

const refreshSchema = z.object({ refresh: z.boolean().optional() });

/** Admin-only: custom audience, catalog and pixel health snapshot. */
export const marketingAudiences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => refreshSchema.parse(input ?? {}))
  .handler(async ({ data, context }): Promise<AudienceHealth> => {
    await requireAdmin(context.supabase, context.userId);
    if (data.refresh) clearMarketingCache();
    return buildAudienceHealth();
  });

const thresholdSchema = z.object({
  minSpend: z.number().min(0).max(100000).default(DEFAULT_THRESHOLDS.minSpend),
  scaleRoas: z.number().min(0).max(100).default(DEFAULT_THRESHOLDS.scaleRoas),
  pauseRoas: z.number().min(0).max(100).default(DEFAULT_THRESHOLDS.pauseRoas),
  budgetStep: z.number().min(1).max(200).default(DEFAULT_THRESHOLDS.budgetStep),
});

const controlSchema = z.object({
  preset: z.enum(MARKETING_PRESETS).default("7d"),
  level: z.enum(CAMPAIGN_LEVELS).default("campaign"),
  thresholds: thresholdSchema.default(DEFAULT_THRESHOLDS),
  refresh: z.boolean().optional(),
});

/** Admin-only: rule-scored campaign list for the control center. */
export const marketingControl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => controlSchema.parse(input ?? {}))
  .handler(async ({ data, context }): Promise<ControlCenter> => {
    await requireAdmin(context.supabase, context.userId);
    if (data.refresh) clearMarketingCache();
    return buildControlCenter(data.preset, data.level, data.thresholds);
  });

const statusSchema = z.object({
  id: z.string().min(1).max(64),
  status: z.enum(["ACTIVE", "PAUSED"]),
});

/** Admin-only: pause or resume a Meta campaign / ad set / ad. */
export const marketingSetStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => statusSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    return setEntityStatus(data.id, data.status);
  });

const budgetSchema = z.object({
  id: z.string().min(1).max(64),
  amount: z.number().positive().max(1_000_000),
  level: z.enum(CAMPAIGN_LEVELS).default("campaign"),
});

/** Admin-only: update the daily budget of a campaign or ad set. */
export const marketingSetBudget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => budgetSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    return setDailyBudget(data.id, data.amount, data.level);
  });

const attributionSchema = z.object({
  preset: z.enum(MARKETING_PRESETS).default("30d"),
  refresh: z.boolean().optional(),
});

/** Admin-only: product-level attribution (orders × campaigns × Meta spend). */
export const marketingAttribution = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => attributionSchema.parse(input ?? {}))
  .handler(async ({ data, context }): Promise<ProductAttribution> => {
    const db = await requireAdmin(context.supabase, context.userId);
    if (data.refresh) clearMarketingCache();
    return buildProductAttribution(
      db as unknown as Parameters<typeof buildProductAttribution>[0],
      data.preset,
    );
  });

const automationSettingsSchema = z.object({
  enabled: z.boolean(),
  dryRun: z.boolean(),
  level: z.enum(CAMPAIGN_LEVELS),
  preset: z.enum(MARKETING_PRESETS),
  thresholds: z.object({
    minSpend: z.number().min(0).max(1_000_000),
    scaleRoas: z.number().min(0).max(100),
    pauseRoas: z.number().min(0).max(100),
    budgetStep: z.number().min(1).max(100),
  }),
  actions: z.object({ pause: z.boolean(), scale: z.boolean(), reduce: z.boolean() }),
  maxDailyBudget: z.number().min(0).max(10_000_000),
  maxActionsPerRun: z.number().int().min(1).max(50),
});

/** Admin-only: saved automation rules, recent runs and a live dry-run preview. */
export const marketingAutomationState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ refresh: z.boolean().optional() }).parse(input ?? {}))
  .handler(async ({ data, context }): Promise<AutomationState> => {
    const db = await requireAdmin(context.supabase, context.userId);
    if (data.refresh) clearMarketingCache();
    const { listAutomationRuns, readAutomationSettings, runMarketingAutomation } = await import(
      "./marketing-automation.server"
    );
    const anyDb = db as unknown as Parameters<typeof readAutomationSettings>[0];
    const settings = await readAutomationSettings(anyDb);
    const [runs, preview] = await Promise.all([
      listAutomationRuns(anyDb),
      runMarketingAutomation(anyDb, { trigger: "preview", settings, preview: true }),
    ]);
    return {
      settings,
      runs,
      preview: preview.actions,
      connected: !preview.skipped,
      ...(preview.skipped ? { message: preview.message } : {}),
      currency: preview.currency ?? "BDT",
    };
  });

/** Admin-only: persist the automation rules used by the scheduled job. */
export const marketingSaveAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => automationSettingsSchema.parse(input))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    const { writeAutomationSettings } = await import("./marketing-automation.server");
    return writeAutomationSettings(
      db as unknown as Parameters<typeof writeAutomationSettings>[0],
      data,
    );
  });

/** Admin-only: execute the automation immediately (respects the dry-run flag). */
export const marketingRunAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({}).parse(input ?? {}))
  .handler(async ({ context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    const { readAutomationSettings, runMarketingAutomation } = await import(
      "./marketing-automation.server"
    );
    const anyDb = db as unknown as Parameters<typeof readAutomationSettings>[0];
    const settings = await readAutomationSettings(anyDb);
    return runMarketingAutomation(anyDb, { trigger: "manual", settings: { ...settings, enabled: true } });
  });
