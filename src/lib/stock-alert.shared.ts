export const alertKinds = [
  "out_of_stock",
  "low_stock",
  "negative_stock",
  "no_reorder_rule",
  "combo_blocked",
  "dead_stock",
  "po_overdue",
] as const;
export type AlertKind = (typeof alertKinds)[number];

export type AlertSeverity = "critical" | "warning" | "info";

export const alertLabels: Record<AlertKind, string> = {
  out_of_stock: "Out of stock",
  low_stock: "Low stock",
  negative_stock: "Negative stock",
  no_reorder_rule: "No reorder rule",
  combo_blocked: "Combo not buildable",
  dead_stock: "Dead stock",
  po_overdue: "PO overdue",
};

export const alertHints: Record<AlertKind, string> = {
  out_of_stock: "Product is listed for sale but has zero stock on hand — ad spend is being wasted.",
  low_stock: "Stock has dropped to the reorder point — time to place an order now.",
  negative_stock: "Ledger balance is below zero — an audit or entry correction is needed.",
  no_reorder_rule: "An active product has no reorder point set, so no early warning will be raised.",
  combo_blocked: "Combo is active, but an item inside it is out of stock — none can be built.",
  dead_stock: "No movement for a long time — capital is tied up.",
  po_overdue: "The ordered shipment is past its expected date and still not received.",
};

export type StockAlert = {
  id: string;
  kind: AlertKind;
  severity: AlertSeverity;
  name: string;
  variantLabel: string | null;
  sku: string;
  detail: string;
  onHand: number | null;
  reorderPoint: number | null;
  suggestQty: number;
  valueAtRisk: number;
  link: string;
};

export type StockAlertReport = {
  generatedAt: string;
  counts: { critical: number; warning: number; info: number; total: number };
  byKind: Array<{ kind: AlertKind; count: number }>;
  capitalAtRisk: number;
  alerts: StockAlert[];
};
