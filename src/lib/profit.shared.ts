import { z } from "zod";

/**
 * Profitability domain — shared schemas & types.
 *
 * Every number here is derived from immutable sources: the order row
 * (revenue, discount, delivery charge), the stock ledger (COGS + packaging
 * at the cost recorded when the movement happened) and the courier
 * consignment (delivery fee actually charged / amount actually collected).
 */

export const profitQuerySchema = z.object({
  days: z.number().int().min(1).max(365).default(30),
});
export type ProfitQuery = z.infer<typeof profitQuerySchema>;

export type ProfitOrderRow = {
  id: string;
  orderNumber: string;
  createdAt: string;
  status: string;
  customerName: string;
  /** Money actually earned — collected amount when the courier reported one. */
  revenue: number;
  discount: number;
  deliveryCharge: number;
  cogs: number;
  packagingCost: number;
  courierFee: number;
  returnedValue: number;
  netProfit: number;
  margin: number;
  settled: boolean;
};

export type ProfitProductRow = {
  key: string;
  name: string;
  variantLabel: string | null;
  sku: string;
  units: number;
  revenue: number;
  cogs: number;
  profit: number;
  margin: number;
};

export type ProfitReport = {
  days: number;
  totals: {
    orders: number;
    deliveredOrders: number;
    lostOrders: number;
    revenue: number;
    discount: number;
    deliveryCharge: number;
    cogs: number;
    packagingCost: number;
    courierFee: number;
    grossProfit: number;
    netProfit: number;
    margin: number;
    avgOrderValue: number;
    avgProfit: number;
    rtoLoss: number;
  };
  daily: Array<{ date: string; revenue: number; profit: number; orders: number }>;
  orders: ProfitOrderRow[];
  products: ProfitProductRow[];
};

export const profitStatuses = ["delivered", "partial_delivered", "exchange"] as const;
export const lossStatuses = ["returned", "lost_damaged"] as const;
