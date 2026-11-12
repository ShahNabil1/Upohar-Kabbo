import type { Db } from "./admin.server";
import { num, unwrap } from "./admin.server";
import {
  lossStatuses,
  profitStatuses,
  type ProfitOrderRow,
  type ProfitProductRow,
  type ProfitReport,
} from "./profit.shared";

type Row = Record<string, any>;

const round2 = (n: number) => Math.round(n * 100) / 100;
const pct = (part: number, whole: number) => (whole > 0 ? round2((part / whole) * 100) : 0);

/**
 * Order-level P&L for a rolling window.
 *
 * Revenue counts only money the business actually earns: for shipped orders
 * the courier's collected amount wins over the order total (partial delivery,
 * discounts at the door). Cost of goods comes from the immutable ledger, so a
 * later WAC change never rewrites history.
 */
export async function buildProfitReport(db: Db, days: number): Promise<ProfitReport> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const statuses = [...profitStatuses, ...lossStatuses] as unknown as Array<
    "delivered" | "partial_delivered" | "exchange" | "returned" | "lost_damaged"
  >;

  const orders = unwrap(
    await db
      .from("orders")
      .select(
        "id,order_number,created_at,status,customer_name,total,subtotal,discount,delivery_charge",
      )
      .gte("created_at", since)
      .in("status", statuses)
      .order("created_at", { ascending: false })
      .limit(2000),
  ) as unknown as Row[];

  const empty: ProfitReport = {
    days,
    totals: {
      orders: 0,
      deliveredOrders: 0,
      lostOrders: 0,
      revenue: 0,
      discount: 0,
      deliveryCharge: 0,
      cogs: 0,
      packagingCost: 0,
      courierFee: 0,
      grossProfit: 0,
      netProfit: 0,
      margin: 0,
      avgOrderValue: 0,
      avgProfit: 0,
      rtoLoss: 0,
    },
    daily: [],
    orders: [],
    products: [],
  };
  if (orders.length === 0) return empty;

  const ids = orders.map((o) => String(o["id"]));

  const [consignments, ledger, items, recons] = await Promise.all([
    db
      .from("order_consignments")
      .select("order_id,delivery_fee,total_cost,collected_amount,status")
      .in("order_id", ids)
      .then((r) => unwrap(r) as unknown as Row[]),
    db
      .from("stock_ledger")
      .select(
        "reference_id,reference_type,movement_type,product_id,variant_id,packaging_id,quantity,total_cost,unit_cost,sku",
      )
      .in("reference_id", ids)
      .limit(20000)
      .then((r) => unwrap(r) as unknown as Row[]),
    db
      .from("order_items")
      .select("order_id,product_id,product_name,variant_label,sku,quantity,line_total")
      .in("order_id", ids)
      .limit(20000)
      .then((r) => unwrap(r) as unknown as Row[]),
    db
      .from("order_reconciliations")
      .select("order_id,collected_amount,settled")
      .in("order_id", ids)
      .then((r) => unwrap(r) as unknown as Row[]),
  ]);

  const consByOrder = new Map<string, Row>();
  for (const c of consignments) consByOrder.set(String(c["order_id"]), c);
  const reconByOrder = new Map<string, Row>();
  for (const r of recons) reconByOrder.set(String(r["order_id"]), r);

  type Costs = { cogs: number; packaging: number; returned: number };
  const costByOrder = new Map<string, Costs>();
  const productCost = new Map<string, number>();

  for (const l of ledger) {
    const oid = String(l["reference_id"] ?? "");
    if (!oid) continue;
    const cur = costByOrder.get(oid) ?? { cogs: 0, packaging: 0, returned: 0 };
    const value = Math.abs(num(l["total_cost"], Math.abs(num(l["quantity"])) * num(l["unit_cost"])));
    const type = String(l["movement_type"]);
    if (type === "packaging_out") cur.packaging += value;
    else if (type === "sale_out" || type === "exchange_out") {
      cur.cogs += value;
      if (l["product_id"]) {
        const k = `${l["product_id"]}:${l["variant_id"] ?? ""}`;
        productCost.set(k, (productCost.get(k) ?? 0) + value);
      }
    } else if (type === "return_in" || type === "exchange_in") {
      cur.returned += value;
      if (l["product_id"]) {
        const k = `${l["product_id"]}:${l["variant_id"] ?? ""}`;
        productCost.set(k, (productCost.get(k) ?? 0) - value);
      }
    }
    costByOrder.set(oid, cur);
  }

  const rows: ProfitOrderRow[] = orders.map((o) => {
    const id = String(o["id"]);
    const status = String(o["status"]);
    const isLoss = (lossStatuses as readonly string[]).includes(status);
    const cons = consByOrder.get(id);
    const recon = reconByOrder.get(id);
    const costs = costByOrder.get(id) ?? { cogs: 0, packaging: 0, returned: 0 };

    const collected =
      recon && recon["collected_amount"] != null
        ? num(recon["collected_amount"])
        : cons && cons["collected_amount"] != null
          ? num(cons["collected_amount"])
          : null;
    const revenue = isLoss ? 0 : (collected ?? num(o["total"]));
    const courierFee = cons
      ? num(cons["delivery_fee"], 0) || Math.max(num(cons["total_cost"], 0) - num(cons["cod_amount"], 0), 0)
      : 0;

    const netProfit = round2(
      revenue - (costs.cogs - costs.returned) - costs.packaging - courierFee,
    );

    return {
      id,
      orderNumber: String(o["order_number"] ?? ""),
      createdAt: String(o["created_at"]),
      status,
      customerName: String(o["customer_name"] ?? ""),
      revenue: round2(revenue),
      discount: num(o["discount"]),
      deliveryCharge: num(o["delivery_charge"]),
      cogs: round2(costs.cogs),
      packagingCost: round2(costs.packaging),
      courierFee: round2(courierFee),
      returnedValue: round2(costs.returned),
      netProfit,
      margin: pct(netProfit, revenue),
      settled: Boolean(recon?.["settled"]),
    };
  });

  const earning = rows.filter((r) => !(lossStatuses as readonly string[]).includes(r.status));
  const losing = rows.filter((r) => (lossStatuses as readonly string[]).includes(r.status));

  const sum = (list: ProfitOrderRow[], pick: (r: ProfitOrderRow) => number) =>
    round2(list.reduce((s, r) => s + pick(r), 0));

  const revenue = sum(rows, (r) => r.revenue);
  const cogs = sum(rows, (r) => r.cogs - r.returnedValue);
  const packagingCost = sum(rows, (r) => r.packagingCost);
  const courierFee = sum(rows, (r) => r.courierFee);
  const netProfit = round2(revenue - cogs - packagingCost - courierFee);
  const rtoLoss = round2(
    losing.reduce((s, r) => s + r.courierFee + r.packagingCost + (r.cogs - r.returnedValue), 0),
  );

  /* ---------- daily trend ---------- */
  const dayMap = new Map<string, { revenue: number; profit: number; orders: number }>();
  for (const r of rows) {
    const d = r.createdAt.slice(0, 10);
    const cur = dayMap.get(d) ?? { revenue: 0, profit: 0, orders: 0 };
    cur.revenue += r.revenue;
    cur.profit += r.netProfit;
    cur.orders += 1;
    dayMap.set(d, cur);
  }
  const daily = [...dayMap.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([date, v]) => ({
      date,
      revenue: round2(v.revenue),
      profit: round2(v.profit),
      orders: v.orders,
    }));

  /* ---------- per-product profitability ---------- */
  const earningIds = new Set(earning.map((r) => r.id));
  const prodMap = new Map<string, ProfitProductRow>();
  for (const it of items) {
    if (!earningIds.has(String(it["order_id"]))) continue;
    const pid = it["product_id"] ? String(it["product_id"]) : `n:${it["product_name"]}`;
    const key = `${pid}:${it["variant_label"] ?? ""}`;
    const cur =
      prodMap.get(key) ??
      ({
        key,
        name: String(it["product_name"] ?? "Item"),
        variantLabel: it["variant_label"] ? String(it["variant_label"]) : null,
        sku: String(it["sku"] ?? ""),
        units: 0,
        revenue: 0,
        cogs: 0,
        profit: 0,
        margin: 0,
      } satisfies ProfitProductRow);
    cur.units += num(it["quantity"], 1);
    cur.revenue += num(it["line_total"]);
    prodMap.set(key, cur);
  }

  // Ledger costs are keyed by product+variant id, item revenue by label —
  // spread the product's total cost across its rows by unit share.
  const costByProduct = new Map<string, number>();
  for (const [k, v] of productCost) {
    const pid = k.split(":")[0] ?? "";
    costByProduct.set(pid, (costByProduct.get(pid) ?? 0) + v);
  }
  const unitsByProduct = new Map<string, number>();
  for (const p of prodMap.values()) {
    const pid = p.key.split(":")[0] ?? "";
    unitsByProduct.set(pid, (unitsByProduct.get(pid) ?? 0) + p.units);
  }
  const products = [...prodMap.values()]
    .map((p) => {
      const pid = p.key.split(":")[0] ?? "";
      const totalUnits = unitsByProduct.get(pid) ?? 0;
      const share = totalUnits > 0 ? p.units / totalUnits : 0;
      const cost = round2((costByProduct.get(pid) ?? 0) * share);
      const profit = round2(p.revenue - cost);
      return {
        ...p,
        revenue: round2(p.revenue),
        cogs: cost,
        profit,
        margin: pct(profit, p.revenue),
      };
    })
    .sort((a, b) => b.profit - a.profit);

  return {
    days,
    totals: {
      orders: rows.length,
      deliveredOrders: earning.length,
      lostOrders: losing.length,
      revenue,
      discount: sum(rows, (r) => r.discount),
      deliveryCharge: sum(rows, (r) => r.deliveryCharge),
      cogs,
      packagingCost,
      courierFee,
      grossProfit: round2(revenue - cogs),
      netProfit,
      margin: pct(netProfit, revenue),
      avgOrderValue: earning.length > 0 ? round2(revenue / earning.length) : 0,
      avgProfit: earning.length > 0 ? round2(netProfit / earning.length) : 0,
      rtoLoss,
    },
    daily,
    orders: rows,
    products,
  };
}
