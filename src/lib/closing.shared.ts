import { z } from "zod";

export const periodSchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/, "Use YYYY-MM"),
});

export const closePeriodSchema = periodSchema.extend({
  note: z.string().trim().max(500).optional().default(""),
});

export const closingIdSchema = z.object({ id: z.string().uuid() });

export type ClosingLine = {
  key: string;
  name: string;
  sku: string;
  kind: "product" | "packaging";
  openingQty: number;
  inQty: number;
  outQty: number;
  closingQty: number;
  unitCost: number;
  closingValue: number;
};

export type ClosingPreview = {
  period: string;
  periodStart: string;
  periodEnd: string;
  openingValue: number;
  purchaseValue: number;
  cogsValue: number;
  writeoffValue: number;
  packagingValue: number;
  adjustmentValue: number;
  closingValue: number;
  closingQty: number;
  supplierDue: number;
  supplierBilled: number;
  supplierPaid: number;
  lines: ClosingLine[];
};

export type ClosingRow = {
  id: string;
  period: string;
  periodStart: string;
  periodEnd: string;
  openingValue: number;
  purchaseValue: number;
  cogsValue: number;
  writeoffValue: number;
  packagingValue: number;
  adjustmentValue: number;
  closingValue: number;
  closingQty: number;
  supplierDue: number;
  note: string | null;
  closedByName: string | null;
  createdAt: string;
  lines: ClosingLine[];
};

/** Last 18 months as YYYY-MM, newest first. */
export function recentPeriods(count = 18): string[] {
  const out: string[] = [];
  const d = new Date();
  d.setUTCDate(1);
  for (let i = 0; i < count; i += 1) {
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
    d.setUTCMonth(d.getUTCMonth() - 1);
  }
  return out;
}

export function periodBounds(period: string): { start: string; end: string } {
  const [y, m] = period.split("-").map(Number);
  const start = new Date(Date.UTC(y!, m! - 1, 1));
  const end = new Date(Date.UTC(y!, m!, 1));
  return { start: start.toISOString(), end: end.toISOString() };
}
