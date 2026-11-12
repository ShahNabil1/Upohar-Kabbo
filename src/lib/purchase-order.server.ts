import type { Db } from "./admin.server";
import type {
  PoStatus,
  PurchaseOrderLineRow,
  PurchaseOrderRow,
  SupplierPaymentRow,
} from "./purchase-order.shared";

/** Human-friendly, collision-safe PO number: PO-YYMMDD-XXX. */
export async function nextPoNumber(db: Db): Promise<string> {
  const now = new Date();
  const stamp = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, "0")}${String(
    now.getDate(),
  ).padStart(2, "0")}`;
  const prefix = `PO-${stamp}-`;
  const { data } = await db
    .from("purchase_orders")
    .select("po_number")
    .like("po_number", `${prefix}%`)
    .order("po_number", { ascending: false })
    .limit(1);
  const last = (data as Array<{ po_number: string }> | null)?.[0]?.po_number;
  const seq = last ? Number(last.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(Number.isFinite(seq) ? seq : 1).padStart(3, "0")}`;
}

export function mapLine(row: Record<string, any>): PurchaseOrderLineRow {
  return {
    id: row["id"],
    productId: row["product_id"] ?? null,
    variantId: row["variant_id"] ?? null,
    packagingId: row["packaging_id"] ?? null,
    sku: row["sku"] ?? null,
    itemName: String(row["item_name"] ?? "Item"),
    qtyOrdered: Number(row["qty_ordered"] ?? 0),
    qtyReceived: Number(row["qty_received"] ?? 0),
    unitCost: Number(row["unit_cost"] ?? 0),
  };
}

export function mapPayment(row: Record<string, any>): SupplierPaymentRow {
  return {
    id: row["id"],
    supplierId: row["supplier_id"],
    supplierName: row["suppliers"]?.name ?? null,
    poId: row["po_id"] ?? null,
    poNumber: row["purchase_orders"]?.po_number ?? null,
    amount: Number(row["amount"] ?? 0),
    method: String(row["method"] ?? "cash"),
    reference: row["reference"] ?? null,
    note: row["note"] ?? null,
    paidAt: row["paid_at"],
  };
}

export function mapOrder(
  row: Record<string, any>,
  lines: PurchaseOrderLineRow[],
  paid: number,
): PurchaseOrderRow {
  const itemsTotal = lines.reduce((s, l) => s + l.qtyOrdered * l.unitCost, 0);
  const shipping = Number(row["shipping_cost"] ?? 0);
  const discount = Number(row["discount"] ?? 0);
  return {
    id: row["id"],
    poNumber: String(row["po_number"]),
    supplierId: row["supplier_id"] ?? null,
    supplierName: row["suppliers"]?.name ?? null,
    status: (row["status"] ?? "draft") as PoStatus,
    expectedAt: row["expected_at"] ?? null,
    orderedAt: row["ordered_at"] ?? null,
    shippingCost: shipping,
    discount,
    note: row["note"] ?? null,
    createdAt: row["created_at"],
    lineCount: lines.length,
    unitsOrdered: lines.reduce((s, l) => s + l.qtyOrdered, 0),
    unitsReceived: lines.reduce((s, l) => s + l.qtyReceived, 0),
    itemsTotal,
    grandTotal: Math.max(itemsTotal + shipping - discount, 0),
    paid,
  };
}

/** Derives ordered → partial → received from line progress. */
export function derivedStatus(current: PoStatus, lines: PurchaseOrderLineRow[]): PoStatus {
  if (current === "cancelled" || current === "draft") return current;
  const received = lines.reduce((s, l) => s + l.qtyReceived, 0);
  if (received <= 0) return "ordered";
  const complete = lines.every((l) => l.qtyReceived >= l.qtyOrdered);
  return complete ? "received" : "partial";
}
