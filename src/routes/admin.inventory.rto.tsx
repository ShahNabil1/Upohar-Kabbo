import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PackageCheck, PackageX, Search, Undo2, TriangleAlert } from "lucide-react";

import { rtoLines, rtoQueue, saveRtoInspection } from "@/lib/rto.functions";
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

export const Route = createFileRoute("/admin/inventory/rto")({
  component: RtoInspection,
});

type Draft = {
  good: number;
  damaged: number;
  missing: number;
  resalable: boolean;
  salvagePrice: string;
  packagingDamaged: boolean;
  note: string;
};

function RtoInspection() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [draft, setDraft] = useState<Record<string, Draft>>({});

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["admin", "inventory", "rto"],
    queryFn: () => rtoQueue(),
    staleTime: 30 * 1000,
  });

  const { data: lines = [], isFetching: linesLoading } = useQuery({
    queryKey: ["admin", "inventory", "rto", "lines", openId],
    queryFn: () => rtoLines({ data: { orderId: openId! } }),
    enabled: !!openId,
  });

  // Fresh parcel opened → assume everything came back good, staff edits from there.
  useEffect(() => {
    if (!openId) return;
    setDraft(
      Object.fromEntries(
        lines.map((l) => [
          l.key,
          {
            good: l.quantity,
            damaged: 0,
            missing: 0,
            resalable: false,
            salvagePrice: "",
            packagingDamaged: false,
            note: "",
          } satisfies Draft,
        ]),
      ),
    );
  }, [openId, lines]);

  const save = useMutation({
    mutationFn: () =>
      saveRtoInspection({
        data: {
          orderId: openId!,
          note,
          lines: lines.map((l) => {
            const d = draft[l.key];
            return {
              productId: l.productId,
              variantId: l.variantId,
              sku: l.sku,
              label: l.label,
              good: d?.good ?? 0,
              damaged: d?.damaged ?? 0,
              missing: d?.missing ?? 0,
              resalable: d?.resalable ?? false,
              salvagePrice: d?.salvagePrice ? Number(d.salvagePrice) : null,
              packagingDamaged: d?.packagingDamaged ?? false,
              note: d?.note ?? "",
            };
          }),
        },
      }),
    onSuccess: async (r) => {
      toast.success(
        `Inspection saved — ${r.restocked} restocked, ${r.damaged} damaged, ${r.missing} missing`,
      );
      setOpenId(null);
      setNote("");
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

  const pending = orders.filter((o) => !o.inspected).length;
  const open = orders.find((o) => o.id === openId) ?? null;

  const setLine = (key: string, patch: Partial<Draft>) =>
    setDraft((d) => ({
      ...d,
      [key]: {
        good: 0,
        damaged: 0,
        missing: 0,
        resalable: false,
        salvagePrice: "",
        packagingDamaged: false,
        note: "",
        ...d[key],
        ...patch,
      },
    }));

  const mismatch = lines.some((l) => {
    const d = draft[l.key];
    if (!d) return false;
    return d.good + d.damaged + d.missing !== l.quantity;
  });

  return (
    <div className="space-y-5">
      <ModuleHero
        eyebrow="Inventory · Returns"
        icon={PackageX}
        accent="violet"
        title="RTO Inspection"
        description="After opening a returned parcel, split each item into Good / Damaged / Missing — stock is restocked or written off accordingly."
        backTo="/admin/inventory"
        backLabel="Inventory"
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Return queue"
          value={String(orders.length)}
          icon={<Undo2 className="size-3.5" />}
          tip="Orders with returned / awaiting return / partial delivered / exchange status."
        />
        <StatCard
          label="Awaiting inspection"
          value={String(pending)}
          tone={pending > 0 ? "bad" : "good"}
          icon={<TriangleAlert className="size-3.5" />}
          tip="Not yet opened for inspection — until inspected, this stock hasn't been returned to inventory."
        />
        <StatCard
          label="Inspected"
          value={String(orders.length - pending)}
          tone="good"
          icon={<PackageCheck className="size-3.5" />}
          tip="Inspection complete, movement recorded in the ledger."
        />
      </div>

      <Panel className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TipTitle
            title="Returned parcels"
            icon={<Undo2 className="size-4 text-primary" />}
            tip="Click an order to see its items (combos broken down)."
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
            title="No returned parcel"
            hint="No orders in return status — they will appear here once the courier updates."
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
                  onClick={() => {
                    setOpenId(openId === o.id ? null : o.id);
                    setNote("");
                  }}
                  className="flex w-full flex-wrap items-center gap-3 p-4 text-left"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-en truncate text-sm font-bold">{o.orderNumber}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {o.customerName} · <span className="font-en">{o.customerPhone}</span> ·{" "}
                      {money(o.total)}
                      {o.courierProvider ? ` · ${o.courierProvider}` : ""}
                    </p>
                  </div>
                  <StatusPill status={o.status} />
                  <span
                    className={cn(
                      "font-en rounded-full px-3 py-1 text-[11px] font-bold ring-1",
                      o.inspected
                        ? "bg-emerald-100 text-emerald-900 ring-emerald-200"
                        : "bg-amber-100 text-amber-900 ring-amber-200",
                    )}
                  >
                    {o.inspected ? "inspected" : "to inspect"}
                  </span>
                </button>

                {openId === o.id && (
                  <div className="space-y-3 border-t border-border/70 p-4">
                    {o.inspected ? (
                      <p className="rounded-xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                        This parcel has already been inspected. If something is wrong, reverse it from Live Inventory → movement.
                      </p>
                    ) : linesLoading ? (
                      <div className="h-20 animate-pulse rounded-xl bg-muted/60" />
                    ) : lines.length === 0 ? (
                      <EmptyState title="No stock line" hint="No trackable items in this order." />
                    ) : (
                      <>
                        {lines.map((l) => {
                          const d = draft[l.key];
                          const total = (d?.good ?? 0) + (d?.damaged ?? 0) + (d?.missing ?? 0);
                          return (
                            <div
                              key={l.key}
                              className={cn(
                                "rounded-xl border px-3 py-3 transition-colors duration-200",
                                total === l.quantity
                                  ? "border-border/70 bg-card"
                                  : "border-rose-300/70 bg-rose-50/50",
                              )}
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="truncate text-xs font-semibold">{l.label}</p>
                                  <p className="font-en mt-0.5 truncate text-[11px] tabular-nums text-muted-foreground">
                                    {l.sku || "—"} · shipped {l.quantity} · cost {money(l.wac)}
                                  </p>
                                </div>
                                <span className="font-en text-[11px] tabular-nums text-muted-foreground">
                                  {total}/{l.quantity}
                                </span>
                              </div>

                              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                                {(
                                  [
                                    ["good", "Good (restock)"],
                                    ["damaged", "Damaged"],
                                    ["missing", "Missing"],
                                  ] as const
                                ).map(([field, label]) => (
                                  <label key={field} className="space-y-1">
                                    <span className="text-[11px] font-medium text-muted-foreground">
                                      {label}
                                    </span>
                                    <Input
                                      type="number"
                                      min={0}
                                      max={l.quantity}
                                      value={String(d?.[field] ?? 0)}
                                      onChange={(e) =>
                                        setLine(l.key, {
                                          [field]: Math.max(0, Number(e.target.value) || 0),
                                        } as Partial<Draft>)
                                      }
                                      className="font-en h-9 rounded-lg tabular-nums"
                                    />
                                  </label>
                                ))}
                              </div>

                              {(d?.damaged ?? 0) > 0 && (
                                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                                  <label className="flex items-center gap-2 text-[11px] font-medium">
                                    <input
                                      type="checkbox"
                                      checked={d?.resalable ?? false}
                                      onChange={(e) =>
                                        setLine(l.key, { resalable: e.target.checked })
                                      }
                                      className="size-4 accent-[hsl(var(--primary))]"
                                    />
                                    Sellable at discount
                                  </label>
                                  <label className="flex items-center gap-2 text-[11px] font-medium">
                                    <input
                                      type="checkbox"
                                      checked={d?.packagingDamaged ?? false}
                                      onChange={(e) =>
                                        setLine(l.key, { packagingDamaged: e.target.checked })
                                      }
                                      className="size-4 accent-[hsl(var(--primary))]"
                                    />
                                    Packaging damaged
                                  </label>
                                  <Input
                                    inputMode="decimal"
                                    placeholder="Salvage price ৳"
                                    value={d?.salvagePrice ?? ""}
                                    onChange={(e) =>
                                      setLine(l.key, { salvagePrice: e.target.value })
                                    }
                                    className="font-en h-9 rounded-lg"
                                  />
                                </div>
                              )}
                            </div>
                          );
                        })}

                        <AreaField
                          label="Inspection note"
                          value={note}
                          onChange={setNote}
                          hint="Box condition, courier damage, etc."
                        />


                        {mismatch && (
                          <p className="flex items-center gap-2 text-[11px] font-medium text-rose-600">
                            <TriangleAlert className="size-3.5" />
                            For each item, Good + Damaged + Missing must equal the quantity shipped.
                          </p>
                        )}

                        <div className="flex flex-wrap gap-2">
                          <Button
                            className="rounded-xl transition-transform duration-200 hover:scale-[1.02]"
                            loading={save.isPending}
                            disabled={mismatch}
                            onClick={() => save.mutate()}
                          >
                            <PackageCheck className="size-4" />
                            Save inspection
                          </Button>
                          <Button
                            variant="ghost"
                            className="rounded-xl"
                            onClick={() => setOpenId(null)}
                          >
                            <PackageX className="size-4" />
                            Cancel
                          </Button>
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
