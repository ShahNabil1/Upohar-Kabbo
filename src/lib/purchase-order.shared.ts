import { z } from "zod";

const uuid = z.string().uuid();

export const poStatuses = ["draft", "ordered", "partial", "received", "cancelled"] as const;
export type PoStatus = (typeof poStatuses)[number];

export const poStatusLabels: Record<PoStatus, string> = {
  draft: "Draft",
  ordered: "Ordered",
  partial: "Partially received",
  received: "Received",
  cancelled: "Cancelled",
};

export const paymentMethods = ["cash", "bkash", "nagad", "bank", "cheque", "other"] as const;
export type PaymentMethod = (typeof paymentMethods)[number];

export const poLineSchema = z.object({
  id: uuid.optional(),
  productId: uuid.nullable().default(null),
  variantId: uuid.nullable().default(null),
  packagingId: uuid.nullable().default(null),
  sku: z.string().trim().max(120).optional().default(""),
  itemName: z.string().trim().max(200).optional().default(""),
  qtyOrdered: z.number().int().min(1).max(100000),
  unitCost: z.number().min(0),
});
export type PoLineInput = z.infer<typeof poLineSchema>;

export const poSchema = z.object({
  id: uuid.optional(),
  supplierId: uuid.nullable().default(null),
  expectedAt: z.string().trim().max(20).nullable().default(null),
  shippingCost: z.number().min(0).default(0),
  discount: z.number().min(0).default(0),
  note: z.string().trim().max(500).optional().default(""),
  lines: z.array(poLineSchema).min(1).max(80),
});
export type PoInput = z.infer<typeof poSchema>;

export const poIdSchema = z.object({ id: uuid });

export const poStatusSchema = z.object({
  id: uuid,
  status: z.enum(["draft", "ordered", "cancelled"]),
});

export const receivePoSchema = z.object({
  poId: uuid,
  invoiceNo: z.string().trim().max(60).optional().default(""),
  receivedAt: z.string().trim().max(40).nullable().default(null),
  note: z.string().trim().max(500).optional().default(""),
  lines: z
    .array(
      z.object({
        lineId: uuid,
        quantity: z.number().int().min(0).max(100000),
        unitCost: z.number().min(0),
      }),
    )
    .min(1)
    .max(80),
});
export type ReceivePoInput = z.infer<typeof receivePoSchema>;

export const supplierPaymentSchema = z.object({
  supplierId: uuid,
  poId: uuid.nullable().default(null),
  amount: z.number().min(1),
  method: z.enum(paymentMethods).default("cash"),
  reference: z.string().trim().max(80).optional().default(""),
  note: z.string().trim().max(300).optional().default(""),
  paidAt: z.string().trim().max(40).nullable().default(null),
});
export type SupplierPaymentInput = z.infer<typeof supplierPaymentSchema>;

export type PurchaseOrderLineRow = {
  id: string;
  productId: string | null;
  variantId: string | null;
  packagingId: string | null;
  sku: string | null;
  itemName: string;
  qtyOrdered: number;
  qtyReceived: number;
  unitCost: number;
};

export type PurchaseOrderRow = {
  id: string;
  poNumber: string;
  supplierId: string | null;
  supplierName: string | null;
  status: PoStatus;
  expectedAt: string | null;
  orderedAt: string | null;
  shippingCost: number;
  discount: number;
  note: string | null;
  createdAt: string;
  lineCount: number;
  unitsOrdered: number;
  unitsReceived: number;
  itemsTotal: number;
  grandTotal: number;
  paid: number;
};

export type PurchaseOrderDetail = PurchaseOrderRow & {
  lines: PurchaseOrderLineRow[];
  payments: SupplierPaymentRow[];
};

export type SupplierPaymentRow = {
  id: string;
  supplierId: string;
  supplierName: string | null;
  poId: string | null;
  poNumber: string | null;
  amount: number;
  method: string;
  reference: string | null;
  note: string | null;
  paidAt: string;
};

export type SupplierDueRow = {
  supplierId: string;
  supplierName: string;
  billed: number;
  paid: number;
  due: number;
  openOrders: number;
};
