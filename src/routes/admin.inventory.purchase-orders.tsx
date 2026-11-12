import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  Ban,
  ClipboardList,
  Coins,
  PackageCheck,
  Plus,
  Search,
  Send,
  Trash2,
  Wallet,
  X,
} from "lucide-react";

import { inventoryCatalogItems, inventorySuppliers } from "@/lib/inventory.functions";
import { money } from "@/lib/inventory.shared";
import {
  deletePurchaseOrder,
  deleteSupplierPayment,
  purchaseOrderDetail,
  purchaseOrders,
  receivePurchaseOrder,
  recordSupplierPayment,
  savePurchaseOrder,
  setPurchaseOrderStatus,
  supplierDues,
} from "@/lib/purchase-order.functions";
import {
  paymentMethods,
  poStatusLabels,
  type PoLineInput,
  type PoStatus,
} from "@/lib/purchase-order.shared";
import { AdminHeading, EmptyState, Panel, StatCard, TipTitle } from "@/components/admin/kit";
import { ModuleHero } from "@/components/admin/module-hero";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/admin/inventory/purchase-orders")({
  component: PurchaseOrdersPage,
});

const fieldClass =
  "rounded-xl border-border/80 bg-background/70 transition-all duration-200 focus-visible:border-primary/60 focus-visible:ring-primary/25";

const statusTone: Record<PoStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  ordered: "bg-sky-100 text-sky-900",
  partial: "bg-amber-100 text-amber-900",
  received: "bg-emerald-100 text-emerald-900",
  cancelled: "bg-rose-100 text-rose-900",
};

function StatusChip({ status }: { status: PoStatus }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${statusTone[status]}`}
    >
      {poStatusLabels[status]}
    </span>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

function PurchaseOrdersPage() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  if (creating) return <PoEditor onClose={() => setCreating(false)} onOpen={setOpenId} />;
  if (openId) return <PoDetail id={openId} onBack={() => setOpenId(null)} />;
  return <PoList onOpen={setOpenId} onCreate={() => setCreating(true)} />;
}

/* ------------------------------- list -------------------------------- */

function PoList({ onOpen, onCreate }: { onOpen: (id: string) => void; onCreate: () => void }) {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["admin", "purchase-orders"],
    queryFn: () => purchaseOrders(),
    staleTime: 30_000,
  });
  const { data: dues = [] } = useQuery({
    queryKey: ["admin", "supplier-dues"],
    queryFn: () => supplierDues(),
    staleTime: 30_000,
  });

  const kpi = useMemo(() => {
    const open = rows.filter((r) => r.status === "ordered" || r.status === "partial");
    return {
      open: open.length,
      openValue: open.reduce((s, r) => s + r.grandTotal, 0),
      pendingUnits: open.reduce((s, r) => s + (r.unitsOrdered - r.unitsReceived), 0),
      due: dues.reduce((s, d) => s + Math.max(d.due, 0), 0),
    };
  }, [rows, dues]);

  return (
    <div className="space-y-5">
      <ModuleHero
        eyebrow="Inventory · Procurement"
        icon={ClipboardList}
        accent="indigo"
        title="Purchase orders"
        description="Order from suppliers, receive shipments and track dues — all in one place."
        backTo="/admin/inventory"
        backLabel="Inventory"
        action={
          <Button
            className="ig-gradient rounded-xl transition-transform duration-300 hover:scale-[1.02]"
            onClick={onCreate}
          >
            <Plus className="size-4" />
            New purchase order
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Open orders"
          value={String(kpi.open)}
          icon={<ClipboardList className="size-3.5" />}
          tip="Orders placed with suppliers where the full shipment hasn't arrived yet."
        />
        <StatCard
          label="On order (value)"
          value={money(kpi.openValue)}
          icon={<Coins className="size-3.5" />}
          tip="Total value of open orders — including shipping and after discount."
        />
        <StatCard
          label="Units pending"
          value={kpi.pendingUnits.toLocaleString("en-US")}
          icon={<PackageCheck className="size-3.5" />}
          tip="Number of units ordered but not yet received."
        />
        <StatCard
          label="Supplier dues"
          value={money(kpi.due)}
          icon={<Wallet className="size-3.5" />}
          tone={kpi.due > 0 ? "warn" : "good"}
          tip="Total amount due across all suppliers (billed − paid)."
        />
      </div>

      <Panel className="space-y-3">
        <TipTitle
          title="All purchase orders"
          icon={<ClipboardList className="size-4 text-primary" />}
          tip="Save as draft, mark Ordered once sent to the supplier, then receive line by line as goods arrive."
        />
        {isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <EmptyState
            title="No purchase orders yet"
            hint="Create your first order and set the supplier, items and purchase cost."
          />
        ) : (
          <div className="space-y-2">
            {rows.map((r) => {
              const progress =
                r.unitsOrdered > 0 ? Math.round((r.unitsReceived / r.unitsOrdered) * 100) : 0;
              return (
                <button
                  key={r.id}
                  onClick={() => onOpen(r.id)}
                  className="flex w-full flex-wrap items-center gap-3 rounded-xl border border-border/70 bg-background/60 p-3 text-left transition-all duration-200 hover:border-primary/40 hover:bg-background"
                >
                  <div className="min-w-[180px] flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{r.poNumber}</span>
                      <StatusChip status={r.status} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {r.supplierName ?? "No supplier"} · {r.lineCount} items ·{" "}
                      {new Date(r.createdAt).toLocaleDateString("en-GB")}
                    </p>
                  </div>
                  <div className="w-28">
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all duration-500"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {r.unitsReceived}/{r.unitsOrdered} received
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{money(r.grandTotal)}</p>
                    <p className="text-[10px] text-muted-foreground">
                      Paid {money(r.paid)} · Due {money(Math.max(r.grandTotal - r.paid, 0))}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </Panel>

      <Panel className="space-y-3">
        <TipTitle
          title="Supplier dues"
          icon={<Wallet className="size-4 text-primary" />}
          tip="How much each supplier has billed, been paid, and what's still due."
        />
        {dues.length === 0 ? (
          <EmptyState title="No supplier activity yet" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                  <th className="pb-2">Supplier</th>
                  <th className="pb-2 text-right">Billed</th>
                  <th className="pb-2 text-right">Paid</th>
                  <th className="pb-2 text-right">Due</th>
                  <th className="pb-2 text-right">Open POs</th>
                </tr>
              </thead>
              <tbody>
                {dues.map((d) => (
                  <tr key={d.supplierId} className="border-t border-border/60">
                    <td className="py-2 font-medium">{d.supplierName}</td>
                    <td className="py-2 text-right">{money(d.billed)}</td>
                    <td className="py-2 text-right">{money(d.paid)}</td>
                    <td
                      className={`py-2 text-right font-semibold ${d.due > 0 ? "text-amber-700" : "text-emerald-700"}`}
                    >
                      {money(d.due)}
                    </td>
                    <td className="py-2 text-right">{d.openOrders}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

/* ------------------------------ editor ------------------------------- */

type EditorState = {
  id?: string;
  supplierId: string | null;
  expectedAt: string | null;
  shippingCost: number;
  discount: number;
  note: string;
  lines: PoLineInput[];
};

function PoEditor({
  initial,
  onClose,
  onOpen,
}: {
  initial?: EditorState;
  onClose: () => void;
  onOpen?: (id: string) => void;
}) {
  const qc = useQueryClient();
  const [state, setState] = useState<EditorState>(
    initial ?? {
      supplierId: null,
      expectedAt: null,
      shippingCost: 0,
      discount: 0,
      note: "",
      lines: [],
    },
  );
  const [search, setSearch] = useState("");

  const { data: suppliers = [] } = useQuery({
    queryKey: ["admin", "inventory", "suppliers"],
    queryFn: () => inventorySuppliers(),
    staleTime: 5 * 60 * 1000,
  });
  const { data: catalog = [] } = useQuery({
    queryKey: ["admin", "inventory", "catalog-items"],
    queryFn: () => inventoryCatalogItems(),
    staleTime: 5 * 60 * 1000,
  });

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length < 2) return [];
    return catalog
      .filter(
        (c) => c.label.toLowerCase().includes(q) || (c.sku ?? "").toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [catalog, search]);

  const itemsTotal = state.lines.reduce((s, l) => s + l.qtyOrdered * l.unitCost, 0);
  const grand = Math.max(itemsTotal + state.shippingCost - state.discount, 0);

  const save = useMutation({
    mutationFn: () =>
      savePurchaseOrder({
        data: {
          id: state.id,
          supplierId: state.supplierId,
          expectedAt: state.expectedAt,
          shippingCost: state.shippingCost,
          discount: state.discount,
          note: state.note,
          lines: state.lines,
        },
      }),
    onSuccess: async (r) => {
      toast.success("Purchase order saved");
      await qc.invalidateQueries({ queryKey: ["admin", "purchase-orders"] });
      await qc.invalidateQueries({ queryKey: ["admin", "purchase-order", r.id] });
      onClose();
      onOpen?.(r.id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function addLine(item: (typeof catalog)[number]) {
    if (
      state.lines.some(
        (l) =>
          l.productId === item.productId &&
          l.variantId === item.variantId &&
          l.packagingId === item.packagingId,
      )
    ) {
      toast.info("Item already on this order");
      return;
    }
    setState((s) => ({
      ...s,
      lines: [
        ...s.lines,
        {
          productId: item.productId,
          variantId: item.variantId,
          packagingId: item.packagingId,
          sku: item.sku === "—" ? "" : item.sku,
          itemName: item.label,
          qtyOrdered: 1,
          unitCost: 0,
        },
      ],
    }));
    setSearch("");
  }

  return (
    <div className="space-y-5">
      <AdminHeading
        title={state.id ? "Edit purchase order" : "New purchase order"}
        description="Select a supplier, add items and set the purchase cost."
        action={
          <Button variant="ghost" className="rounded-xl" onClick={onClose}>
            <ArrowLeft className="size-4" />
            Back
          </Button>
        }
      />

      <Panel className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Row label="Supplier">
            <select
              value={state.supplierId ?? ""}
              onChange={(e) => setState({ ...state, supplierId: e.target.value || null })}
              className="h-10 w-full rounded-xl border border-border/80 bg-background/70 px-3 text-sm"
            >
              <option value="">— Select supplier —</option>
              {suppliers
                .filter((s) => s.is_active)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </Row>
          <Row label="Expected date">
            <Input
              type="date"
              value={state.expectedAt ?? ""}
              onChange={(e) => setState({ ...state, expectedAt: e.target.value || null })}
              className={fieldClass}
            />
          </Row>
          <Row label="Note">
            <Input
              value={state.note}
              onChange={(e) => setState({ ...state, note: e.target.value })}
              className={fieldClass}
              placeholder="Payment terms, delivery instructions…"
            />
          </Row>
        </div>

        <div className="space-y-2">
          <Row label="Add item">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search product, variant, packaging or SKU…"
                className={`${fieldClass} pl-9`}
              />
            </div>
          </Row>
          {matches.length > 0 && (
            <div className="admin-rise space-y-1 rounded-xl border border-border/70 bg-background/70 p-2">
              {matches.map((m) => (
                <button
                  key={m.key}
                  onClick={() => addLine(m)}
                  className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted"
                >
                  <span>{m.label}</span>
                  <span className="text-xs text-muted-foreground">{m.sku}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {state.lines.length === 0 ? (
          <EmptyState title="No items yet" hint="Add items using the search above." />
        ) : (
          <div className="space-y-2">
            {state.lines.map((l, i) => (
              <div
                key={l.id ?? `${l.productId}-${l.variantId}-${l.packagingId}-${i}`}
                className="flex flex-wrap items-end gap-3 rounded-xl border border-border/70 bg-background/60 p-3"
              >
                <div className="min-w-[180px] flex-1">
                  <p className="text-sm font-medium">{l.itemName}</p>
                  <p className="text-[11px] text-muted-foreground">{l.sku || "No SKU"}</p>
                </div>
                <div className="w-24">
                  <Row label="Qty">
                    <Input
                      type="number"
                      min={1}
                      value={l.qtyOrdered}
                      onChange={(e) =>
                        setState((s) => ({
                          ...s,
                          lines: s.lines.map((x, j) =>
                            j === i ? { ...x, qtyOrdered: Math.max(Number(e.target.value) || 0, 0) } : x,
                          ),
                        }))
                      }
                      className={fieldClass}
                    />
                  </Row>
                </div>
                <div className="w-28">
                  <Row label="Unit cost">
                    <Input
                      type="number"
                      min={0}
                      value={l.unitCost}
                      onChange={(e) =>
                        setState((s) => ({
                          ...s,
                          lines: s.lines.map((x, j) =>
                            j === i ? { ...x, unitCost: Math.max(Number(e.target.value) || 0, 0) } : x,
                          ),
                        }))
                      }
                      className={fieldClass}
                    />
                  </Row>
                </div>
                <div className="w-24 pb-2 text-right text-sm font-semibold">
                  {money(l.qtyOrdered * l.unitCost)}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-xl text-muted-foreground hover:text-destructive"
                  onClick={() =>
                    setState((s) => ({ ...s, lines: s.lines.filter((_, j) => j !== i) }))
                  }
                >
                  <X className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <Row label="Shipping / extra cost">
            <Input
              type="number"
              min={0}
              value={state.shippingCost}
              onChange={(e) =>
                setState({ ...state, shippingCost: Math.max(Number(e.target.value) || 0, 0) })
              }
              className={fieldClass}
            />
          </Row>
          <Row label="Discount">
            <Input
              type="number"
              min={0}
              value={state.discount}
              onChange={(e) =>
                setState({ ...state, discount: Math.max(Number(e.target.value) || 0, 0) })
              }
              className={fieldClass}
            />
          </Row>
          <div className="flex items-end justify-end pb-1 text-right">
            <div>
              <p className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                Order total
              </p>
              <p className="text-lg font-semibold">{money(grand)}</p>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            className="ig-gradient rounded-xl transition-transform duration-300 hover:scale-[1.02]"
            loading={save.isPending}
            disabled={state.lines.length === 0}
            onClick={() => save.mutate()}
          >
            Save purchase order
          </Button>
          <Button variant="ghost" className="rounded-xl" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </Panel>
    </div>
  );
}

/* ------------------------------ detail ------------------------------- */

function PoDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [receiveQty, setReceiveQty] = useState<Record<string, number>>({});
  const [receiveCost, setReceiveCost] = useState<Record<string, number>>({});
  const [invoiceNo, setInvoiceNo] = useState("");
  const [payAmount, setPayAmount] = useState(0);
  const [payMethod, setPayMethod] = useState<(typeof paymentMethods)[number]>("cash");
  const [payRef, setPayRef] = useState("");

  const { data: po, isLoading } = useQuery({
    queryKey: ["admin", "purchase-order", id],
    queryFn: () => purchaseOrderDetail({ data: { id } }),
  });

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ["admin", "purchase-order", id] });
    await qc.invalidateQueries({ queryKey: ["admin", "purchase-orders"] });
    await qc.invalidateQueries({ queryKey: ["admin", "supplier-dues"] });
    await qc.invalidateQueries({ queryKey: ["admin", "inventory"] });
  };

  const status = useMutation({
    mutationFn: (next: "draft" | "ordered" | "cancelled") =>
      setPurchaseOrderStatus({ data: { id, status: next } }),
    onSuccess: async () => {
      toast.success("Status updated");
      await refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const receive = useMutation({
    mutationFn: () =>
      receivePurchaseOrder({
        data: {
          poId: id,
          invoiceNo,
          receivedAt: null,
          note: "",
          lines: (po?.lines ?? []).map((l) => ({
            lineId: l.id,
            quantity: receiveQty[l.id] ?? 0,
            unitCost: receiveCost[l.id] ?? l.unitCost,
          })),
        },
      }),
    onSuccess: async (r) => {
      toast.success(`${r.received} units received into stock`);
      setReceiveQty({});
      setInvoiceNo("");
      await refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pay = useMutation({
    mutationFn: () =>
      recordSupplierPayment({
        data: {
          supplierId: po!.supplierId!,
          poId: id,
          amount: payAmount,
          method: payMethod,
          reference: payRef,
          note: "",
          paidAt: null,
        },
      }),
    onSuccess: async () => {
      toast.success("Payment recorded");
      setPayAmount(0);
      setPayRef("");
      await refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removePayment = useMutation({
    mutationFn: (paymentId: string) => deleteSupplierPayment({ data: { id: paymentId } }),
    onSuccess: async () => {
      toast.success("Payment removed");
      await refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removePo = useMutation({
    mutationFn: () => deletePurchaseOrder({ data: { id } }),
    onSuccess: async () => {
      toast.success("Purchase order deleted");
      await refresh();
      onBack();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !po) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>;
  }

  if (editing) {
    return (
      <PoEditor
        initial={{
          id: po.id,
          supplierId: po.supplierId,
          expectedAt: po.expectedAt,
          shippingCost: po.shippingCost,
          discount: po.discount,
          note: po.note ?? "",
          lines: po.lines.map((l) => ({
            id: l.id,
            productId: l.productId,
            variantId: l.variantId,
            packagingId: l.packagingId,
            sku: l.sku ?? "",
            itemName: l.itemName,
            qtyOrdered: l.qtyOrdered,
            unitCost: l.unitCost,
          })),
        }}
        onClose={() => setEditing(false)}
      />
    );
  }

  const closed = po.status === "received" || po.status === "cancelled";
  const due = Math.max(po.grandTotal - po.paid, 0);

  return (
    <div className="space-y-5">
      <AdminHeading
        title={po.poNumber}
        description={`${po.supplierName ?? "No supplier"} · ${poStatusLabels[po.status]}`}
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" className="rounded-xl" onClick={onBack}>
              <ArrowLeft className="size-4" />
              Back
            </Button>
            {!closed && (
              <Button variant="outline" className="rounded-xl" onClick={() => setEditing(true)}>
                Edit
              </Button>
            )}
            {po.status === "draft" && (
              <Button
                className="ig-gradient rounded-xl"
                loading={status.isPending}
                onClick={() => status.mutate("ordered")}
              >
                <Send className="size-4" />
                Mark as ordered
              </Button>
            )}
            {(po.status === "draft" || po.status === "ordered") && po.unitsReceived === 0 && (
              <Button
                variant="outline"
                className="rounded-xl text-destructive"
                onClick={() => status.mutate("cancelled")}
              >
                <Ban className="size-4" />
                Cancel
              </Button>
            )}
            {(po.status === "draft" || po.status === "cancelled") && (
              <Button
                variant="ghost"
                className="rounded-xl text-destructive"
                loading={removePo.isPending}
                onClick={() => removePo.mutate()}
              >
                <Trash2 className="size-4" />
                Delete
              </Button>
            )}
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Order total" value={money(po.grandTotal)} icon={<Coins className="size-3.5" />} />
        <StatCard label="Paid" value={money(po.paid)} icon={<Wallet className="size-3.5" />} tone="good" />
        <StatCard
          label="Due"
          value={money(due)}
          icon={<Wallet className="size-3.5" />}
          tone={due > 0 ? "warn" : "good"}
        />
        <StatCard
          label="Received"
          value={`${po.unitsReceived}/${po.unitsOrdered}`}
          icon={<PackageCheck className="size-3.5" />}
          sub={po.expectedAt ? `Expected ${new Date(po.expectedAt).toLocaleDateString("en-GB")}` : ""}
        />
      </div>

      <Panel className="space-y-3">
        <TipTitle
          title="Items & receiving"
          icon={<PackageCheck className="size-4 text-primary" />}
          tip="Enter the quantity received and click Receive — a purchase_in entry is added to the stock ledger and the WAC is updated."
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                <th className="pb-2">Item</th>
                <th className="pb-2 text-right">Ordered</th>
                <th className="pb-2 text-right">Received</th>
                <th className="pb-2 text-right">Unit cost</th>
                {!closed && <th className="pb-2 text-right">Receive now</th>}
                {!closed && <th className="pb-2 text-right">Actual cost</th>}
              </tr>
            </thead>
            <tbody>
              {po.lines.map((l) => {
                const remaining = l.qtyOrdered - l.qtyReceived;
                return (
                  <tr key={l.id} className="border-t border-border/60">
                    <td className="py-2">
                      <p className="font-medium">{l.itemName}</p>
                      <p className="text-[11px] text-muted-foreground">{l.sku ?? "No SKU"}</p>
                    </td>
                    <td className="py-2 text-right">{l.qtyOrdered}</td>
                    <td className="py-2 text-right">{l.qtyReceived}</td>
                    <td className="py-2 text-right">{money(l.unitCost)}</td>
                    {!closed && (
                      <td className="py-2 text-right">
                        <Input
                          type="number"
                          min={0}
                          max={remaining}
                          value={receiveQty[l.id] ?? ""}
                          placeholder={String(remaining)}
                          onChange={(e) =>
                            setReceiveQty((s) => ({
                              ...s,
                              [l.id]: Math.max(Math.min(Number(e.target.value) || 0, remaining), 0),
                            }))
                          }
                          className={`${fieldClass} ml-auto h-9 w-20 text-right`}
                          disabled={remaining <= 0}
                        />
                      </td>
                    )}
                    {!closed && (
                      <td className="py-2 text-right">
                        <Input
                          type="number"
                          min={0}
                          value={receiveCost[l.id] ?? l.unitCost}
                          onChange={(e) =>
                            setReceiveCost((s) => ({
                              ...s,
                              [l.id]: Math.max(Number(e.target.value) || 0, 0),
                            }))
                          }
                          className={`${fieldClass} ml-auto h-9 w-24 text-right`}
                          disabled={remaining <= 0}
                        />
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {!closed && (
          <div className="flex flex-wrap items-end gap-3 border-t border-border/60 pt-3">
            <div className="w-48">
              <Row label="Supplier invoice no.">
                <Input
                  value={invoiceNo}
                  onChange={(e) => setInvoiceNo(e.target.value)}
                  className={fieldClass}
                />
              </Row>
            </div>
            <Button
              className="ig-gradient rounded-xl transition-transform duration-300 hover:scale-[1.02]"
              loading={receive.isPending}
              disabled={Object.values(receiveQty).every((v) => !v)}
              onClick={() => receive.mutate()}
            >
              <PackageCheck className="size-4" />
              Receive into stock
            </Button>
            <Button
              variant="ghost"
              className="rounded-xl"
              onClick={() =>
                setReceiveQty(
                  Object.fromEntries(
                    po.lines.map((l) => [l.id, Math.max(l.qtyOrdered - l.qtyReceived, 0)]),
                  ),
                )
              }
            >
              Fill remaining
            </Button>
          </div>
        )}
      </Panel>

      <Panel className="space-y-3">
        <TipTitle
          title="Payments"
          icon={<Wallet className="size-4 text-primary" />}
          tip="Record payments made to the supplier here — the due amount updates automatically."
        />
        {po.supplierId ? (
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-32">
              <Row label="Amount">
                <Input
                  type="number"
                  min={0}
                  value={payAmount || ""}
                  onChange={(e) => setPayAmount(Math.max(Number(e.target.value) || 0, 0))}
                  className={fieldClass}
                />
              </Row>
            </div>
            <div className="w-36">
              <Row label="Method">
                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value as (typeof paymentMethods)[number])}
                  className="h-10 w-full rounded-xl border border-border/80 bg-background/70 px-3 text-sm"
                >
                  {paymentMethods.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </Row>
            </div>
            <div className="w-40">
              <Row label="Reference">
                <Input
                  value={payRef}
                  onChange={(e) => setPayRef(e.target.value)}
                  className={fieldClass}
                />
              </Row>
            </div>
            <Button
              variant="outline"
              className="rounded-xl"
              loading={pay.isPending}
              disabled={payAmount <= 0}
              onClick={() => pay.mutate()}
            >
              <Plus className="size-4" />
              Record payment
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Select a supplier for this order before recording a payment.
          </p>
        )}

        {po.payments.length === 0 ? (
          <EmptyState title="No payments recorded" />
        ) : (
          <div className="space-y-2">
            {po.payments.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-xl border border-border/70 bg-background/60 px-3 py-2 text-sm"
              >
                <div>
                  <p className="font-medium">
                    {money(p.amount)} · {p.method}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {new Date(p.paidAt).toLocaleDateString("en-GB")}
                    {p.reference ? ` · ${p.reference}` : ""}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-xl text-muted-foreground hover:text-destructive"
                  onClick={() => removePayment.mutate(p.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
