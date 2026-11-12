import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ImageOff, Radar, Search, SlidersHorizontal } from "lucide-react";

import { inventoryLevels, setReorderRule } from "@/lib/inventory.functions";
import { money, type InventoryRow } from "@/lib/inventory.shared";
import { getAdminAccess } from "@/lib/staff.functions";
import { hasFlag } from "@/lib/rbac-shared";
import { EmptyState, InfoTip, Panel, StatCard } from "@/components/admin/kit";
import { ModuleHero } from "@/components/admin/module-hero";
import { ImportCatalogStockButton } from "@/components/admin/inventory/import-catalog";
import { Pagination } from "@/components/admin/pagination";
import { ImageLightbox, useLightbox } from "@/components/site/image-lightbox";
import { SmartImage } from "@/components/site/smart-image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/admin/inventory/live")({
  component: LiveInventory,
});

type Filter = "all" | "low" | "out" | "packaging";

function stockTone(row: InventoryRow) {
  if (row.qtyOnHand <= 0) return "bg-rose-100 text-rose-900";
  if (row.reorderPoint > 0 && row.qtyOnHand <= row.reorderPoint)
    return "bg-amber-100 text-amber-900";
  return "bg-emerald-100 text-emerald-900";
}

function LiveInventory() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ point: 0, qty: 0 });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const lightbox = useLightbox();

  const { data: access } = useQuery({
    queryKey: ["admin-access"],
    queryFn: () => getAdminAccess(),
  });
  const canSeeCost = hasFlag(access, "flag:inventory.cost");
  const canReorder = hasFlag(access, "flag:inventory.reorder");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["admin", "inventory", "levels"],
    queryFn: () => inventoryLevels(),
    staleTime: 60_000,
  });

  const save = useMutation({
    mutationFn: (levelId: string) =>
      setReorderRule({
        data: { levelId, reorderPoint: draft.point, reorderQty: draft.qty },
      }),
    onSuccess: async () => {
      toast.success("Reorder rule saved");
      setEditing(null);
      await qc.invalidateQueries({ queryKey: ["admin", "inventory", "levels"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "packaging" && r.kind !== "packaging") return false;
      if (filter !== "packaging" && r.kind === "packaging") return false;
      if (filter === "low" && !(r.reorderPoint > 0 && r.qtyOnHand <= r.reorderPoint)) return false;
      if (filter === "out" && r.qtyOnHand > 0) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        r.sku.toLowerCase().includes(q) ||
        (r.variantLabel ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, search, filter]);

  useEffect(() => {
    setPage(1);
  }, [search, filter, pageSize]);

  const totalPages = Math.max(1, Math.ceil(visible.length / pageSize));
  const current = Math.min(page, totalPages);
  const paged = visible.slice((current - 1) * pageSize, current * pageSize);

  const totals = useMemo(
    () => ({
      cost: visible.reduce((s, r) => s + r.qtyOnHand * r.wacCost, 0),
      retail: visible.reduce((s, r) => s + r.qtyOnHand * r.sellPrice, 0),
      units: visible.reduce((s, r) => s + r.qtyOnHand, 0),
      skus: visible.length,
    }),
    [visible],
  );

  const filters: Array<{ id: Filter; label: string }> = [
    { id: "all", label: "Products" },
    { id: "low", label: "Low stock" },
    { id: "out", label: "Out of stock" },
    { id: "packaging", label: "Packaging" },
  ];

  const openImage = (r: InventoryRow) => {
    if (!r.imageUrl) return;
    lightbox.open([{ src: r.imageUrl, alt: r.name }], 0);
  };

  return (
    <div className="space-y-5">
      <ModuleHero
        eyebrow="Inventory · Live view"
        icon={Radar}
        accent="sky"
        title="Live inventory"
        description="Read-only view — search by SKU or name, see stock counts at a glance."
        action={<ImportCatalogStockButton />}
      />

      {!isLoading && rows.length === 0 ? (
        <Panel className="space-y-2">
          <p className="text-sm font-semibold">No SKU is tracked yet</p>
          <p className="text-xs text-muted-foreground">
            Inventory starts empty until your products are registered in the ledger. Click{" "}
            <strong>Sync products from database</strong> once — every product, variant and packaging
            item from your product tables is added, and its current stock is posted as opening balance.
          </p>
        </Panel>
      ) : null}

      <div className={`grid gap-3 ${canSeeCost ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
        <StatCard
          label="Total items (SKU)"
          value={totals.skus.toLocaleString("en-US")}
          tip="How many distinct SKUs match the current filter and search."
        />
        <StatCard
          label="Total quantity"
          value={totals.units.toLocaleString("en-US")}
          tip="Sum of all units in stock for the current view."
        />
        {canSeeCost ? (
          <StatCard
            label="Value at cost"
            value={money(totals.cost)}
            tip="Value calculated at weighted average purchase cost."
          />
        ) : null}
        <StatCard
          label="Value at retail"
          value={money(totals.retail)}
          tone="good"
          tip="Potential sale value calculated at today's selling price."
        />
      </div>

      <Panel className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Scan barcode or type SKU / name…"
              className="rounded-xl border-border/80 bg-background/70 pl-9 transition-all duration-200 focus-visible:border-primary/60 focus-visible:ring-primary/25"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {filters.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 hover:scale-[1.03] ${
                  filter === f.id
                    ? "ig-gradient-soft border-primary/40 text-foreground"
                    : "border-border bg-background/60 text-muted-foreground hover:border-primary/30"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <p className="py-10 text-center text-xs text-muted-foreground">Loading inventory…</p>
        ) : visible.length === 0 ? (
          <EmptyState
            title="No item matches this view"
            hint="Try changing the search or filter, or add new inventory."
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-border text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                    <th className="px-2 py-2 text-left font-semibold">#</th>
                    <th className="px-2 py-2 text-left font-semibold">Item</th>
                    <th className="px-2 py-2 text-left font-semibold">SKU / Barcode</th>
                    <th className="px-2 py-2 text-right font-semibold">On hand</th>
                    {canSeeCost ? (
                      <>
                        <th className="px-2 py-2 text-right font-semibold">Avg cost</th>
                        <th className="px-2 py-2 text-right font-semibold">Cost value</th>
                      </>
                    ) : null}
                    <th className="px-2 py-2 text-right font-semibold">Retail value</th>
                    {canReorder ? (
                      <th className="px-2 py-2 text-right font-semibold">
                        <span className="inline-flex items-center gap-1">
                          Reorder
                          <InfoTip text="An alert appears on the dashboard when stock drops to the reorder point. Quantity = suggested order size." />
                        </span>
                      </th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {paged.map((r, i) => (
                    <tr
                      key={r.id}
                      className="border-b border-border/60 transition-colors duration-150 hover:bg-accent/50"
                    >
                      <td className="font-en px-2 py-2.5 text-xs tabular-nums text-muted-foreground">
                        {(current - 1) * pageSize + i + 1}
                      </td>
                      <td className="max-w-[300px] px-2 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <button
                            type="button"
                            onClick={() => openImage(r)}
                            disabled={!r.imageUrl}
                            className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/70 bg-muted/40 transition-transform duration-150 hover:scale-[1.05] disabled:cursor-default disabled:hover:scale-100"
                          >
                            {r.imageUrl ? (
                              <SmartImage
                                src={r.imageUrl}
                                alt={r.name}
                                baseWidth={80}
                                height={80}
                                fit="contain"
                                className="size-full object-contain"
                              />
                            ) : (
                              <ImageOff className="size-4 text-muted-foreground/70" />
                            )}
                          </button>
                          <div className="min-w-0">
                            <p className="truncate font-medium">{r.name}</p>
                            {r.variantLabel ? (
                              <p className="truncate text-[11px] text-muted-foreground">
                                {r.variantLabel}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td className="font-en px-2 py-2.5 text-xs text-muted-foreground">{r.sku}</td>
                      <td className="px-2 py-2.5 text-right">
                        <span
                          className={`font-en inline-block rounded-full px-2.5 py-1 text-xs font-bold tabular-nums ${stockTone(r)}`}
                        >
                          {r.qtyOnHand}
                        </span>
                      </td>
                      {canSeeCost ? (
                        <>
                          <td className="font-en px-2 py-2.5 text-right tabular-nums">
                            {money(r.wacCost)}
                          </td>
                          <td className="font-en px-2 py-2.5 text-right tabular-nums">
                            {money(r.qtyOnHand * r.wacCost)}
                          </td>
                        </>
                      ) : null}
                      <td className="font-en px-2 py-2.5 text-right tabular-nums text-emerald-700">
                        {money(r.qtyOnHand * r.sellPrice)}
                      </td>
                      {canReorder ? (
                        <td className="px-2 py-2.5 text-right">
                          {editing === r.id ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <Input
                                type="number"
                                value={draft.point}
                                onChange={(e) =>
                                  setDraft({ ...draft, point: Number(e.target.value) })
                                }
                                className="h-8 w-16 rounded-lg text-right"
                              />
                              <Input
                                type="number"
                                value={draft.qty}
                                onChange={(e) => setDraft({ ...draft, qty: Number(e.target.value) })}
                                className="h-8 w-16 rounded-lg text-right"
                              />
                              <Button
                                size="sm"
                                className="h-8 rounded-lg"
                                loading={save.isPending}
                                onClick={() => save.mutate(r.id)}
                              >
                                Save
                              </Button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setEditing(r.id);
                                setDraft({ point: r.reorderPoint, qty: r.reorderQty });
                              }}
                              className="font-en inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs font-semibold tabular-nums transition-all duration-200 hover:scale-[1.03] hover:border-primary/40 hover:text-primary"
                            >
                              <SlidersHorizontal className="size-3" />
                              {r.reorderPoint} / {r.reorderQty}
                            </button>
                          )}
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination
              page={current}
              pageSize={pageSize}
              total={visible.length}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
          </>
        )}
      </Panel>

      <ImageLightbox
        images={lightbox.images}
        startIndex={lightbox.startIndex}
        isOpen={lightbox.isOpen}
        onClose={lightbox.close}
      />
    </div>
  );
}
