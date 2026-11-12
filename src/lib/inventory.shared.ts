import { z } from "zod";

/**
 * Inventory domain — shared schemas & types.
 *
 * Identity rule: an inventory item is either a catalog item
 * (`product_id` + optional `variant_id`) or an internal `packaging_id`.
 * The SKU printed on the product IS the barcode — no separate barcode field.
 */

const uuid = z.string().uuid();

export const movementTypes = [
  "purchase_in",
  "sale_out",
  "return_in",
  "damage_out",
  "loss_out",
  "expiry_out",
  "adjust_in",
  "adjust_out",
  "reversal",
  "exchange_out",
  "exchange_in",
  "packaging_out",
] as const;
export type MovementType = (typeof movementTypes)[number];

export const movementLabels: Record<MovementType, string> = {
  purchase_in: "Purchase in",
  sale_out: "Sale out",
  return_in: "Return in",
  damage_out: "Damaged",
  loss_out: "Lost",
  expiry_out: "Expired",
  adjust_in: "Correction (+)",
  adjust_out: "Correction (−)",
  reversal: "Reversal",
  exchange_out: "Exchange out",
  exchange_in: "Exchange in",
  packaging_out: "Packaging used",
};

/** Write-off reasons offered in the Loss / Damage / Expiry screen. */
export const writeOffTypes = ["damage_out", "loss_out", "expiry_out"] as const;
export type WriteOffType = (typeof writeOffTypes)[number];

export const supplierSchema = z.object({
  id: uuid.optional(),
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(30).optional().default(""),
  address: z.string().trim().max(300).optional().default(""),
  note: z.string().trim().max(500).optional().default(""),
  is_active: z.boolean().default(true),
});
export type SupplierInput = z.infer<typeof supplierSchema>;

export const packagingSchema = z.object({
  id: uuid.optional(),
  name: z.string().trim().min(2).max(120),
  sku: z.string().trim().max(60).optional().default(""),
  unit: z.string().trim().max(20).default("pcs"),
  consumption: z.enum(["per_order", "per_unit"]).default("per_order"),
  reorder_point: z.number().int().min(0).default(0),
  note: z.string().trim().max(500).optional().default(""),
  is_active: z.boolean().default(true),
});
export type PackagingInput = z.infer<typeof packagingSchema>;

/** One row of a stock receiving (purchase) form. */
export const receiveLineSchema = z.object({
  productId: uuid.nullable().default(null),
  variantId: uuid.nullable().default(null),
  packagingId: uuid.nullable().default(null),
  sku: z.string().trim().max(120).optional().default(""),
  quantity: z.number().int().min(1).max(100000),
  unitCost: z.number().min(0),
  extraCost: z.number().min(0).default(0),
  batchCode: z.string().trim().max(60).optional().default(""),
  expiryDate: z.string().trim().max(20).nullable().default(null),
});

export const receiveSchema = z.object({
  supplierId: uuid.nullable().default(null),
  invoiceNo: z.string().trim().max(60).optional().default(""),
  receivedAt: z.string().trim().max(40).nullable().default(null),
  note: z.string().trim().max(500).optional().default(""),
  lines: z.array(receiveLineSchema).min(1).max(60),
});
export type ReceiveInput = z.infer<typeof receiveSchema>;

export const adjustSchema = z.object({
  productId: uuid.nullable().default(null),
  variantId: uuid.nullable().default(null),
  packagingId: uuid.nullable().default(null),
  sku: z.string().trim().max(120).optional().default(""),
  movementType: z.enum([...writeOffTypes, "adjust_in", "adjust_out"]),
  quantity: z.number().int().min(1).max(100000),
  reason: z.string().trim().max(200).optional().default(""),
  /** Damaged goods can still be sold at a discount — recorded for reporting. */
  salvagePrice: z.number().min(0).nullable().default(null),
  note: z.string().trim().max(500).optional().default(""),
});
export type AdjustInput = z.infer<typeof adjustSchema>;

export const reorderSchema = z.object({
  levelId: uuid,
  reorderPoint: z.number().int().min(0),
  reorderQty: z.number().int().min(0),
});

export const ledgerQuerySchema = z.object({
  productId: uuid.nullable().default(null),
  variantId: uuid.nullable().default(null),
  packagingId: uuid.nullable().default(null),
  limit: z.number().int().min(1).max(200).default(60),
});

export type InventoryRow = {
  id: string;
  productId: string | null;
  variantId: string | null;
  packagingId: string | null;
  name: string;
  variantLabel: string | null;
  sku: string;
  kind: "product" | "packaging";
  qtyOnHand: number;
  qtyReserved: number;
  wacCost: number;
  sellPrice: number;
  reorderPoint: number;
  reorderQty: number;
  lastMovementAt: string | null;
  imageUrl?: string | null;
};

export type LedgerRow = {
  id: string;
  movementType: MovementType;
  quantity: number;
  unitCost: number;
  totalCost: number;
  sku: string | null;
  name: string;
  reason: string | null;
  note: string | null;
  referenceLabel: string | null;
  actorName: string | null;
  createdAt: string;
};

export type BatchRow = {
  id: string;
  name: string;
  sku: string | null;
  batchCode: string | null;
  qtyRemaining: number;
  unitCost: number;
  expiryDate: string | null;
  receivedAt: string;
  supplierName: string | null;
};

export type SupplierRow = {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  note: string | null;
  is_active: boolean;
  created_at: string;
};

export type PackagingRow = {
  id: string;
  name: string;
  sku: string | null;
  unit: string;
  consumption: string;
  reorder_point: number;
  note: string | null;
  is_active: boolean;
  created_at: string;
};

export const money = (n: number) =>
  `৳ ${Math.round(n).toLocaleString("en-US")}`;

/* ------------------------- reporting ------------------------- */

export const reportQuerySchema = z.object({
  days: z.coerce.number().int().min(7).max(365).default(30),
});

export type ValuationBucket = {
  units: number;
  cost: number;
  retail: number;
  skus: number;
};

export type InventoryReport = {
  days: number;
  generatedAt: string;
  valuation: {
    product: ValuationBucket;
    packaging: ValuationBucket;
    outOfStock: number;
    lowStock: number;
  };
  flow: {
    purchaseQty: number;
    purchaseValue: number;
    soldQty: number;
    cogs: number;
    returnQty: number;
    returnValue: number;
    writeOffQty: number;
    writeOffValue: number;
    packagingQty: number;
    packagingValue: number;
    adjustNetQty: number;
  };
  topMovers: Array<{
    key: string;
    name: string;
    variantLabel: string | null;
    sku: string;
    qty: number;
    cogs: number;
    onHand: number;
    daysCover: number | null;
  }>;
  deadStock: Array<{
    key: string;
    name: string;
    variantLabel: string | null;
    sku: string;
    onHand: number;
    costValue: number;
    lastMovementAt: string | null;
    idleDays: number | null;
  }>;
  reorderPlan: Array<{
    key: string;
    name: string;
    variantLabel: string | null;
    sku: string;
    kind: "product" | "packaging";
    onHand: number;
    reorderPoint: number;
    suggestQty: number;
    estimatedCost: number;
    daysCover: number | null;
  }>;
};
