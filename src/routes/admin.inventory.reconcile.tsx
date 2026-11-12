import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Coins, Scale, Search, TriangleAlert, Wallet } from "lucide-react";

import {
  reconcileLines,
  reconcileQueue,
  saveOrderReconciliation,
} from "@/lib/reconcile.functions";
import { money } from "@/lib/inventory.shared";
import {
  AdminHeading,
  AreaField,
  EmptyState,
  Panel,
  StatCard,
  StatusPill,
  TipTitle,
} from "@/components/admin/kit";
import { ModuleHero } from "@/components/admin/module-hero";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/inventory/reconcile")({
  component: ReconcilePage,
});

type Draft = { delivered: number; returned: number };

function ReconcilePage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [collected, setCollected] = useState("");
  const [settled, setSettled] = useState(true);
  const [draft, setDraft] = useState<Record<string, Draft>>({});

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["admin", "inventory", "reconcile"],
    queryFn: () => reconcileQueue(),
    staleTime: 30 * 1000,
  });

  const { data: detail, isFetching: linesLoading } = useQuery({
    queryKey: ["admin", "inventory", "reconcile", "lines", openId],
    queryFn: () => reconcileLines({ data: { orderId: openId! } }),
    enabled: !!openId,
  });

  const lines = detail?.lines ?? [];
  const open = orders.find((o) => o.id === openId) ?? null;

  // Opening an order pre-fills the last saved split, else "everything kept".
  useEffect(() => {
    if (!openId || !detail) return;
    const saved = new Map(detail.saved.map((s) => [s.itemId, s]));
    setDraft(
      Object.fromEntries(
        detail.lines.map((l) => {
          const s = saved.get(l.itemId);
          return [
            l.itemId,
            {
              delivered: s ? s.delivered : l.ordered,
              returned: s ? s.returned : 0,
            } satisfies Draft,
          ];
        }),
      ),
    );
    setNote(detail.note ?? "");
    const preset =
      detail.collected ?? (open?.collectedAmount != null ? open.collectedAmount : null);
    setCollected(preset != null ? String(preset) : "");
    setSettled(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId, detail]);

  const expected = useMemo(
    () =>
      lines.reduce((s, l) => s + (draft[l.itemId]?.delivered ?? 0) * l.unitPrice, 0) +
      (open ? open.deliveryCharge - open.discount : 0),
    [lines, draft, open],
  );
  const collectedNum = Number(collected || 0);
  const variance = collectedNum - expected;
  const mismatch = lines.some((l) => {
    const d = draft[l.itemId];
    return d ? d.delivered + d.returned !== l.ordered : false;
  });

  const save = useMutation({
    mutationFn: () =>
      saveOrderReconciliation({
        data: {
          orderId: openId!,
          collectedAmount: collectedNum,
          settled,
          note,
          lines: lines.map((l) => {
            const d = draft[l.itemId];
            const delivered = d?.delivered ?? 0;
            return {
              itemId: l.itemId,
              label: l.label,
              ordered: l.ordered,
              delivered,
              returned: d?.returned ?? 0,
              unitPrice: l.unitPrice,
              lineTotal: delivered * l.unitPrice,
            };
          }),
        },
      }),
    onSuccess: async (r) => {
      toast.success(
        `Reconciled — expected ${money(r.expected)}, collected ${money(r.collected)}, variance ${money(r.variance)}`,
      );
      setOpenId(null);
      await qc.invalidateQueries({ queryKey: ["admin", "inventory"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return orders;
    return orders.filter(
      (o) =>
        o.orderNumber.toLowerCase().includes(needle) ||
        o.customerName.toLowerCase().includes(needle) ||
        o.customerPhone.includes(needle),
    );
  }, [orders, q]);

  const pendingCount = orders.filter((o) => !o.settled).length;
  const totalVariance = orders.reduce((s, o) => s + (o.variance ?? 0), 0);

  const setLine = (key: string, patch: Partial<Draft>) =>
    setDraft((d) => ({ ...d, [key]: { delivered: 0, returned: 0, ...d[key], ...patch } }));

  return (
    <div className="space-y-5">
      <ModuleHero
        eyebrow="Inventory · Settlement"
        icon={Scale}
        accent="emerald"
        title="Partial Delivery Reconciliation"
        description="For partially delivered parcels, reconcile which items the customer kept, what was returned, and how much the courier paid."
        backTo="/admin/inventory"
        backLabel="Inventory"
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Reconcile queue"
          value={String(orders.length)}
          icon={<Scale className="size-3.5" />}
          tip="Orders with partial delivered / exchange status."
        />
        <StatCard
          label="Pending settlement"
          value={String(pendingCount)}
          tone={pendingCount > 0 ? "bad" : "good"}
          icon={<TriangleAlert className="size-3.5" />}
          tip="Not yet reconciled or marked as settled."
        />
        <StatCard
          label="Net variance"
          value={money(totalVariance)}
          tone={totalVariance < 0 ? "bad" : "good"}
          icon={<Coins className="size-3.5" />}
          tip="Sum of the difference between collected and expected amounts."
        />
      </div>

      <Panel className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TipTitle
            title="Partial parcels"
            icon={<Wallet className="size-4 text-primary" />}
            tip="Stock return is handled in the RTO Inspection screen — this is only for the money reconciliation."
          />
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Order number, name or phone"
              className="rounded-xl border-border/80 bg-background/70 pl-9 transition-all duration-200 focus-visible:border-primary/60 focus-visible:ring-primary/25"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-muted/60" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title="Nothing to reconcile"
            hint="No partial deliveries — they will appear here once the courier updates."
          />
        ) : (
          <div className="space-y-2">
            {filtered.map((o) => (
              <div
                key={o.id}
                className={cn(
                  "admin-rise rounded-2xl border bg-background/60 transition-all duration-300",
                  openId === o.id
                    ? "border-primary/40 shadow-sm"
                    : "border-border hover:border-primary/30",
                )}
              >
                <button
                  type="button"
                  onClick={() => setOpenId(openId === o.id ? null : o.id)}
                  className="flex w-full flex-wrap items-center gap-3 p-4 text-left"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-en truncate text-sm font-bold">{o.orderNumber}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {o.customerName} · <span className="font-en">{o.customerPhone}</span> ·{" "}
                      order {money(o.total)}
                      {o.collectedAmount != null ? ` · collected ${money(o.collectedAmount)}` : ""}
                      {o.courierProvider ? ` · ${o.courierProvider}` : ""}
                    </p>
                  </div>
                  <StatusPill status={o.status} />
                  <span
                    className={cn(
                      "font-en rounded-full px-3 py-1 text-[11px] font-bold ring-1",
                      o.settled
                        ? "bg-emerald-100 text-emerald-900 ring-emerald-200"
                        : "bg-amber-100 text-amber-900 ring-amber-200",
                    )}
                  >
                    {o.settled ? "settled" : "to reconcile"}
                  </span>
                </button>

                {openId === o.id && (
                  <div className="space-y-3 border-t border-border/70 p-4">
                    {linesLoading ? (
                      <div className="h-20 animate-pulse rounded-xl bg-muted/60" />
                    ) : lines.length === 0 ? (
                      <EmptyState title="No item" hint="No items in this order." />
                    ) : (
                      <>
                        {lines.map((l) => {
                          const d = draft[l.itemId] ?? { delivered: 0, returned: 0 };
                          const bad = d.delivered + d.returned !== l.ordered;
                          return (
                            <div
                              key={l.itemId}
                              className={cn(
                                "grid gap-3 rounded-xl border p-3 sm:grid-cols-[1fr_auto_auto]",
                                bad ? "border-amber-300 bg-amber-50/60" : "border-border/70",
                              )}
                            >
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold">{l.label}</p>
                                <p className="font-en text-[11px] text-muted-foreground">
                                  {l.ordered} × {money(l.unitPrice)}
                                  {l.sku ? ` · ${l.sku}` : ""}
                                </p>
                              </div>
                              <label className="text-[11px] font-semibold text-muted-foreground">
                                Delivered
                                <Input
                                  type="number"
                                  min={0}
                                  max={l.ordered}
                                  value={d.delivered}
                                  onChange={(e) => {
                                    const v = Math.max(
                                      0,
                                      Math.min(l.ordered, Number(e.target.value || 0)),
                                    );
                                    setLine(l.itemId, { delivered: v, returned: l.ordered - v });
                                  }}
                                  className="font-en mt-1 h-9 w-24 rounded-lg"
                                />
                              </label>
                              <label className="text-[11px] font-semibold text-muted-foreground">
                                Returned
                                <Input
                                  type="number"
                                  min={0}
                                  max={l.ordered}
                                  value={d.returned}
                                  onChange={(e) => {
                                    const v = Math.max(
                                      0,
                                      Math.min(l.ordered, Number(e.target.value || 0)),
                                    );
                                    setLine(l.itemId, { returned: v, delivered: l.ordered - v });
                                  }}
                                  className="font-en mt-1 h-9 w-24 rounded-lg"
                                />
                              </label>
                            </div>
                          );
                        })}

                        <div className="grid gap-3 sm:grid-cols-3">
                          <div className="rounded-xl border border-border/70 bg-muted/30 p-3">
                            <p className="text-[11px] text-muted-foreground">Expected (kept + delivery − discount)</p>
                            <p className="font-en text-lg font-bold">{money(expected)}</p>
                          </div>
                          <label className="rounded-xl border border-border/70 p-3 text-[11px] font-semibold text-muted-foreground">
                            Collected by courier
                            <Input
                              type="number"
                              min={0}
                              value={collected}
                              onChange={(e) => setCollected(e.target.value)}
                              placeholder="0"
                              className="font-en mt-1 h-9 rounded-lg"
                            />
                          </label>
                          <div
                            className={cn(
                              "rounded-xl border p-3",
                              Math.abs(variance) < 0.01
                                ? "border-emerald-200 bg-emerald-50/70"
                                : "border-amber-300 bg-amber-50/70",
                            )}
                          >
                            <p className="text-[11px] text-muted-foreground">Variance</p>
                            <p className="font-en text-lg font-bold">{money(variance)}</p>
                          </div>
                        </div>

                        <AreaField
                          label="Note"
                          value={note}
                          onChange={setNote}
                          rows={3}
                          hint="Why the variance occurred, what the courier said, etc."
                        />

                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <label className="flex items-center gap-2 text-xs font-semibold">
                            <input
                              type="checkbox"
                              checked={settled}
                              onChange={(e) => setSettled(e.target.checked)}
                              className="size-4 accent-primary"
                            />
                            Mark as closed (settled)
                          </label>
                          <div className="flex items-center gap-2">
                            {mismatch && (
                              <span className="text-[11px] font-semibold text-amber-700">
                                Delivered + Returned must equal Ordered
                              </span>
                            )}
                            <Button
                              type="button"
                              disabled={mismatch || save.isPending}
                              onClick={() => save.mutate()}
                            >
                              {save.isPending ? "Saving…" : "Save reconciliation"}
                            </Button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
