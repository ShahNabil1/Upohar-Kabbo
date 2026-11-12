/** Client-safe types and constants for the Marketing dashboards. */

export const MARKETING_PRESETS = ["today", "yesterday", "7d", "14d", "30d", "90d"] as const;
export type MarketingPreset = (typeof MARKETING_PRESETS)[number];

export const presetLabel: Record<MarketingPreset, string> = {
  today: "Today",
  yesterday: "Yesterday",
  "7d": "Last 7 days",
  "14d": "Last 14 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
};

export type DateRange = { since: string; until: string; days: number };

export type MetaMetrics = {
  spend: number;
  impressions: number;
  clicks: number;
  reach: number;
  frequency: number;
  cpm: number;
  cpc: number;
  ctr: number;
  purchases: number;
  purchaseValue: number;
  roas: number;
  addToCart: number;
  initiateCheckout: number;
  landingPageViews: number;
};

export type OrderMetrics = {
  orders: number;
  revenue: number;
  deliveredOrders: number;
  deliveredRevenue: number;
  pendingOrders: number;
  cancelledOrders: number;
  averageOrderValue: number;
  deliveryRate: number;
};

export type MarketingSeriesPoint = {
  date: string;
  spend: number;
  revenue: number;
  deliveredRevenue: number;
  orders: number;
  metaPurchases: number;
};

export type MarketingOverview = {
  connected: boolean;
  message?: string;
  currency: string;
  accountName: string;
  range: DateRange;
  meta: MetaMetrics;
  metaPrevious: MetaMetrics;
  orders: OrderMetrics;
  ordersPrevious: OrderMetrics;
  series: MarketingSeriesPoint[];
  /** Store revenue ÷ ad spend across every channel. */
  blendedRoas: number;
  /** Delivered (money actually collected) revenue ÷ ad spend. */
  trueRoas: number;
  blendedRoasPrevious: number;
  trueRoasPrevious: number;
  costPerOrder: number;
  costPerDeliveredOrder: number;
  /** Ad spend as a percentage of store revenue. */
  spendShare: number;
};

export const CAMPAIGN_LEVELS = ["campaign", "adset", "ad"] as const;
export type CampaignLevel = (typeof CAMPAIGN_LEVELS)[number];

export const levelLabel: Record<CampaignLevel, string> = {
  campaign: "Campaigns",
  adset: "Ad sets",
  ad: "Ads",
};

export type CampaignRow = {
  id: string;
  name: string;
  parentName: string | null;
  status: string | null;
  effectiveStatus: string | null;
  objective: string | null;
  dailyBudget: number | null;
  lifetimeBudget: number | null;
  spend: number;
  impressions: number;
  reach: number;
  frequency: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  purchases: number;
  purchaseValue: number;
  roas: number;
  addToCart: number;
  initiateCheckout: number;
  landingPageViews: number;
  costPerPurchase: number;
};

export type CampaignPerformance = {
  connected: boolean;
  message?: string;
  currency: string;
  level: CampaignLevel;
  range: DateRange;
  rows: CampaignRow[];
  totals: MetaMetrics;
};

export type CreativeRow = {
  adId: string;
  name: string;
  campaignName: string | null;
  status: string | null;
  thumbnailUrl: string | null;
  permalink: string | null;
  body: string | null;
  isVideo: boolean;
  spend: number;
  impressions: number;
  reach: number;
  frequency: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  purchases: number;
  purchaseValue: number;
  roas: number;
  /** 3-second video views ÷ impressions (attention grabbed). */
  hookRate: number;
  /** ThruPlays ÷ 3-second views (attention held). */
  holdRate: number;
  videoViews3s: number;
  thruPlays: number;
  avgWatchSeconds: number;
  retention: { p25: number; p50: number; p75: number; p100: number };
};

export type CreativePerformance = {
  connected: boolean;
  message?: string;
  currency: string;
  range: DateRange;
  rows: CreativeRow[];
};

export type AudienceRow = {
  id: string;
  name: string;
  subtype: string | null;
  description: string | null;
  approximateCount: number | null;
  retentionDays: number | null;
  deliveryStatus: string | null;
  operationStatus: string | null;
  updatedAt: string | null;
  /** Meta only lets you advertise to audiences of 1,000+ people. */
  ready: boolean;
};

export type CatalogHealth = {
  configured: boolean;
  id: string | null;
  name: string | null;
  productCount: number | null;
  productSets: number | null;
  issues: { severity: string; title: string; affectedCount: number | null; type: string | null }[];
};

export type PixelHealth = {
  id: string;
  name: string | null;
  lastFiredAt: string | null;
  /** Hours since the last server/browser event reached the dataset. */
  hoursSinceLastEvent: number | null;
  matchRate: number | null;
  automaticMatching: boolean | null;
  /** Recent event names with volume, newest window Meta exposes. */
  events: { name: string; count: number }[];
};

export type AudienceHealth = {
  connected: boolean;
  message?: string;
  audiences: AudienceRow[];
  catalog: CatalogHealth;
  pixel: PixelHealth | null;
  /** Warnings we generate ourselves from the payload above. */
  recommendations: { tone: "critical" | "warning" | "good"; text: string }[];
};

export const RULE_ACTIONS = ["pause", "scale", "reduce", "watch"] as const;
export type RuleAction = (typeof RULE_ACTIONS)[number];

export type ControlThresholds = {
  /** Minimum spend before a rule is allowed to judge an entity. */
  minSpend: number;
  /** ROAS at or above this is a scaling candidate. */
  scaleRoas: number;
  /** ROAS below this (with enough spend) is a pause candidate. */
  pauseRoas: number;
  /** Budget change applied by the quick scale / reduce buttons, in %. */
  budgetStep: number;
};

export const DEFAULT_THRESHOLDS: ControlThresholds = {
  minSpend: 10,
  scaleRoas: 2.5,
  pauseRoas: 1,
  budgetStep: 20,
};

export type ControlRow = {
  id: string;
  name: string;
  level: CampaignLevel;
  status: string | null;
  effectiveStatus: string | null;
  dailyBudget: number | null;
  lifetimeBudget: number | null;
  spend: number;
  purchases: number;
  purchaseValue: number;
  roas: number;
  costPerPurchase: number;
  ctr: number;
  frequency: number;
  action: RuleAction;
  reason: string;
};

export type ControlCenter = {
  connected: boolean;
  message?: string;
  currency: string;
  range: DateRange;
  level: CampaignLevel;
  thresholds: ControlThresholds;
  rows: ControlRow[];
  summary: { spend: number; revenue: number; roas: number; activeCount: number };
};

/* ------------------------------------------------------------------ *
 * Product-level attribution
 * ------------------------------------------------------------------ */

export type AttributionProductRow = {
  productId: string | null;
  name: string;
  slug: string | null;
  orders: number;
  units: number;
  revenue: number;
  deliveredRevenue: number;
  deliveredOrders: number;
  cancelledOrders: number;
  /** Ad spend allocated to this product by its share of campaign revenue. */
  spend: number;
  roas: number;
  trueRoas: number;
  topChannel: string;
  topCampaign: string | null;
};

export type AttributionCampaignRow = {
  key: string;
  campaignId: string | null;
  campaignName: string;
  channel: string;
  orders: number;
  revenue: number;
  deliveredRevenue: number;
  spend: number;
  roas: number;
  trueRoas: number;
  matched: boolean;
  topProducts: { name: string; units: number; revenue: number }[];
};

export type AttributionChannelRow = {
  channel: string;
  orders: number;
  revenue: number;
  deliveredRevenue: number;
  spend: number;
  roas: number;
};

export type ProductAttribution = {
  connected: boolean;
  message?: string;
  currency: string;
  range: DateRange;
  totals: {
    orders: number;
    trackedOrders: number;
    untrackedOrders: number;
    revenue: number;
    deliveredRevenue: number;
    spend: number;
    matchedSpend: number;
    roas: number;
    trueRoas: number;
  };
  products: AttributionProductRow[];
  campaigns: AttributionCampaignRow[];
  channels: AttributionChannelRow[];
};

/* ------------------------------------------------------------------ *
 * Automated rule scheduling
 * ------------------------------------------------------------------ */

export type AutomationSettings = {
  /** Master switch — when off the cron endpoint does nothing. */
  enabled: boolean;
  /** Report only: decisions are logged but never sent to Meta. */
  dryRun: boolean;
  level: CampaignLevel;
  preset: MarketingPreset;
  thresholds: ControlThresholds;
  /** Which verdicts the robot is allowed to act on. */
  actions: { pause: boolean; scale: boolean; reduce: boolean };
  /** Never raise a daily budget above this (account currency). 0 = no cap. */
  maxDailyBudget: number;
  /** Safety valve so one bad night cannot touch the whole account. */
  maxActionsPerRun: number;
};

export const DEFAULT_AUTOMATION: AutomationSettings = {
  enabled: false,
  dryRun: true,
  level: "campaign",
  preset: "7d",
  thresholds: DEFAULT_THRESHOLDS,
  actions: { pause: true, scale: false, reduce: false },
  maxDailyBudget: 0,
  maxActionsPerRun: 5,
};

export type AutomationActionLog = {
  id: string;
  name: string;
  action: RuleAction;
  reason: string;
  spend: number;
  roas: number;
  /** applied | skipped | failed | planned (dry run) */
  outcome: "applied" | "skipped" | "failed" | "planned";
  detail?: string;
};

export type AutomationRun = {
  id: string;
  trigger: string;
  dryRun: boolean;
  level: string;
  preset: string;
  evaluated: number;
  applied: number;
  skipped: number;
  actions: AutomationActionLog[];
  error: string | null;
  createdAt: string;
};

export type AutomationState = {
  settings: AutomationSettings;
  runs: AutomationRun[];
  /** What the robot would do right now, using the saved settings. */
  preview: AutomationActionLog[];
  connected: boolean;
  message?: string;
  currency: string;
};
