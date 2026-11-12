import { z } from "zod";

export const countScopes = ["all", "products", "packaging", "low"] as const;
export type CountScope = (typeof countScopes)[number];

export const createCountSchema = z.object({
  name: z.string().trim().min(2).max(120),
  scope: z.enum(countScopes).default("all"),
  note: z.string().trim().max(500).optional().default(""),
});

export const countLineSchema = z.object({
  lineId: z.string().uuid(),
  countedQty: z.number().int().min(0).nullable(),
  note: z.string().trim().max(300).optional().default(""),
});

export const countIdSchema = z.object({ id: z.string().uuid() });

export type CountStatus = "open" | "posted" | "cancelled";

export type StockCountRow = {
  id: string;
  name: string;
  status: CountStatus;
  note: string | null;
  createdByName: string | null;
  postedByName: string | null;
  postedAt: string | null;
  createdAt: string;
  lineCount: number;
  countedCount: number;
  varianceUnits: number;
  varianceValue: number;
};

export type StockCountLineRow = {
  id: string;
  itemName: string;
  sku: string | null;
  kind: "product" | "packaging";
  systemQty: number;
  countedQty: number | null;
  unitCost: number;
  note: string | null;
};

export type StockCountDetail = {
  count: StockCountRow;
  lines: StockCountLineRow[];
};
