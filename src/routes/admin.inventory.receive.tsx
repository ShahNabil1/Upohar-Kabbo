import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ImageOff, PackagePlus, Plus, Trash2 } from "lucide-react";

import { inventorySuppliers, receiveStock } from "@/lib/inventory.functions";
import { money } from "@/lib/inventory.shared";
import {
  ItemPicker,
  useCatalogItems,
  type PickableItem,
} from "@/components/admin/inventory/item-picker";
import { InfoTip, Panel, StatCard, TipTitle } from "@/components/admin/kit";
import { ModuleHero } from "@/components/admin/module-hero";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ImageLightbox } from "@/components/site/image-lightbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { SmartImage } from "@/components/site/smart-image";

export const Route = createFileRoute("/admin/inventory/receive")({
  validateSearch: (search: Record<string, unknown>) => ({
    items: typeof search["items"] === "string" && search["items"] ? String(search["items"]) : undefined,
  }),
  component: ReceiveInventory,
});


type Line = {
  uid: string;
  item: PickableItem | null;
  quantity: number;
  unitCost: number;
  batchCode: string;
  expiryDate: string;
};

const newLine = (): Line => ({
  uid: crypto.randomUUID(),
  item: null,
  quantity: 1,
  unitCost: 0,
  batchCode: "",
  expiryDate: "",
});

const fieldClass =
  "rounded-xl border-border/80 bg-background/70 transition-all duration-200 focus-visible:border-primary/60 focus-visible:ring-primary/25";

function ReceiveInventory() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [lines, setLines] = useState<Line[]>([newLine()]);
  const [supplierId, setSupplierId] = useState<string>("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [extraCost, setExtraCost] = useState(0);
  const [note, setNote] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [preview, setPreview] = useState<PickableItem | null>(null);

  const hasData = (l: Line) => Boolean(l.item) || l.quantity > 1 || l.unitCost > 0;

  const removeLines = (uids: string[]) =>
    setLines((prev) => {
      const next = prev.filter((l) => !uids.includes(l.uid));
      return next.length ? next : [newLine()];
    });

  const removeLine = async (line: Line) => {
    if (
      hasData(line) &&
      !(await confirm({
        title: "Remove this item line?",
        description: "The entered item, quantity and buying price will be cleared.",
        tone: "danger",
        confirmLabel: "Remove",
      }))
    )
      return;
    removeLines([line.uid]);
    setSelected((prev) => prev.filter((id) => id !== line.uid));
  };

  const removeSelected = async () => {
    if (!selected.length) return;
    if (
      !(await confirm({
        title: `Remove ${selected.length} selected line(s)?`,
        description: "Everything entered on those lines will be cleared.",
        tone: "danger",
        confirmLabel: "Remove",
      }))
    )
      return;
    removeLines(selected);
    setSelected([]);
  };

  const { data: suppliers = [] } = useQuery({
    queryKey: ["admin", "inventory", "suppliers"],
    queryFn: () => inventorySuppliers(),
    staleTime: 5 * 60 * 1000,
  });

  // Deep-link from Smart Combos: ?items=<productId,productId> preselects the
  // out-of-stock sub-items so the receipt is ready to fill in.
  const search = Route.useSearch() as { items?: string };
  const itemsParam = search.items;
  const { data: catalog = [] as PickableItem[] } = useCatalogItems();
  const prefilled = useRef(false);

  useEffect(() => {
    if (prefilled.current || !itemsParam || catalog.length === 0) return;
    const ids: string[] = itemsParam.split(",").filter(Boolean);
    // A sub-product with variants has one catalog row per variant SKU — every
    // one of them gets its own receipt line.
    const picked = ids.flatMap((id: string) =>
      catalog.filter((c: PickableItem) => c.productId === id),
    );
    if (picked.length === 0) return;
    prefilled.current = true;
    setLines(picked.map((item: PickableItem) => ({ ...newLine(), item })));
  }, [itemsParam, catalog]);

  const totals = useMemo(() => {
    const units = lines.reduce((s, l) => s + (l.item ? l.quantity : 0), 0);
    const goods = lines.reduce((s, l) => s + (l.item ? l.quantity * l.unitCost : 0), 0);
    return { units, goods, grand: goods + extraCost };
  }, [lines, extraCost]);

  const patch = (uid: string, next: Partial<Line>) =>
    setLines((prev) => prev.map((l) => (l.uid === uid ? { ...l, ...next } : l)));

  const submit = useMutation({
    mutationFn: () => {
      const ready = lines.filter((l) => l.item && l.quantity > 0);
      if (ready.length === 0) throw new Error("Add at least one item with a quantity");
      // Freight / duty is spread across the whole receipt, proportional to units.
      const share = totals.units > 0 ? extraCost / totals.units : 0;
      return receiveStock({
        data: {
          supplierId: supplierId || null,
          invoiceNo,
          receivedAt: null,
          note,
          lines: ready.map((l) => ({
            productId: l.item!.productId,
            variantId: l.item!.variantId,
            packagingId: l.item!.packagingId,
            sku: l.item!.sku === "—" ? "" : l.item!.sku,
            quantity: l.quantity,
            unitCost: l.unitCost,
            extraCost: share * l.quantity,
            batchCode: l.batchCode,
            expiryDate: l.expiryDate || null,
          })),
        },
      });
    },
    onSuccess: async (res) => {
      toast.success(`${res.received} item(s) received into stock`);
      await qc.invalidateQueries({ queryKey: ["admin", "inventory"] });
      // Stay on this page so the next receipt can be entered right away.
      setLines([newLine()]);
      setSelected([]);
      setInvoiceNo("");
      setExtraCost(0);
      setNote("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-5">
      <ModuleHero
        eyebrow="Inventory · Intake"
        icon={PackagePlus}
        accent="emerald"
        title="Add inventory"
        description="Add newly purchased stock — each lot is saved as a separate batch."
        backTo="/admin/inventory"
        backLabel="Inventory"
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Panel className="space-y-4">
          <TipTitle
            title="Items received"
            icon={<PackagePlus className="size-4 text-primary" />}
            tip="Scan a barcode to add an item — the product/variant SKU is the barcode. Each line can have a different cost; the system computes the weighted average cost automatically."
          />

          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/70 bg-muted/20 px-3 py-2">
            <Checkbox
              checked={selected.length > 0 && selected.length === lines.length}
              onCheckedChange={(v) => setSelected(v === true ? lines.map((l) => l.uid) : [])}
              aria-label="Select all lines"
            />
            <span className="text-xs text-muted-foreground">
              {selected.length ? `${selected.length} selected` : "Select all"}
            </span>
            {selected.length ? (
              <Button
                variant="destructive"
                size="sm"
                className="ml-auto rounded-lg"
                onClick={() => void removeSelected()}
              >
                <Trash2 className="size-4" />
                Remove selected
              </Button>
            ) : null}
          </div>

          <div className="space-y-3">
            {lines.map((line, idx) => (
              <div
                key={line.uid}
                className="admin-rise space-y-3 rounded-xl border border-border/80 bg-background/50 p-3 transition-colors duration-200 hover:border-primary/25"
              >
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={selected.includes(line.uid)}
                    onCheckedChange={(v) =>
                      setSelected((prev) =>
                        v === true ? [...new Set([...prev, line.uid])] : prev.filter((id) => id !== line.uid),
                      )
                    }
                    aria-label={`Select line ${idx + 1}`}
                    className="shrink-0"
                  />
                  <span className="font-en grid size-6 shrink-0 place-items-center rounded-full bg-muted text-[11px] font-bold">
                    {idx + 1}
                  </span>
                  {line.item ? (
                    <button
                      type="button"
                      onClick={() => setPreview(line.item)}
                      className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-md border border-border/70 bg-muted/40 transition-transform hover:scale-105"
                      aria-label="Preview product image"
                    >
                      {line.item.imageUrl ? (
                        <SmartImage
                          src={line.item.imageUrl}
                          alt={line.item.label}
                          baseWidth={80}
                          height={80}
                          fit="contain"
                          className="size-full object-contain"
                        />
                      ) : (
                        <ImageOff className="size-4 text-muted-foreground/70" />
                      )}
                    </button>
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <ItemPicker
                      value={line.item}
                      autoFocus={idx === 0}
                      onSelect={(item) =>
                        patch(line.uid, { item, unitCost: line.unitCost || 0 })
                      }
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 rounded-lg text-muted-foreground transition-colors hover:text-destructive"
                    onClick={() => void removeLine(line)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>

                <div className="grid gap-2 sm:grid-cols-4">
                  <div className="space-y-1">
                    <Label className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                      Quantity
                    </Label>
                    <Input
                      type="number"
                      min={1}
                      value={line.quantity}
                      onChange={(e) => patch(line.uid, { quantity: Number(e.target.value) })}
                      className={fieldClass}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                      Buying price
                      <InfoTip text="Cost per unit for this purchase. It will be blended with previous costs to update the average cost." />
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      placeholder="0"
                      value={line.unitCost === 0 ? "" : line.unitCost}
                      onChange={(e) => patch(line.uid, { unitCost: Number(e.target.value || 0) })}
                      className={fieldClass}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                      Batch code
                      <InfoTip text="Optional. Use it to distinguish separate lots of the same product." />
                    </Label>
                    <Input
                      value={line.batchCode}
                      onChange={(e) => patch(line.uid, { batchCode: e.target.value })}
                      className={fieldClass}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                      Expiry
                      <InfoTip text="Add an expiry date if applicable — the dashboard will alert you to sell earlier-expiring batches first." />
                    </Label>
                    <Input
                      type="date"
                      value={line.expiryDate}
                      onChange={(e) => patch(line.uid, { expiryDate: e.target.value })}
                      className={fieldClass}
                    />
                  </div>
                </div>

                {line.item ? (
                  <p className="font-en text-[11px] text-muted-foreground">
                    {line.item.sku} · line total {money(line.quantity * line.unitCost)}
                  </p>
                ) : null}
              </div>
            ))}
          </div>

          <Button
            variant="outline"
            className="w-full rounded-xl border-dashed transition-all duration-200 hover:scale-[1.01] hover:border-primary/40"
            onClick={() => setLines((prev) => [...prev, newLine()])}
          >
            <Plus className="size-4" />
            Add another item
          </Button>
        </Panel>

        <div className="space-y-4">
          <Panel className="space-y-3">
            <TipTitle
              title="Purchase details"
              tip="Adding a supplier and invoice number lets you trace which lot came from whom later."
            />
            <div className="space-y-1.5">
              <Label className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Supplier
              </Label>
              <select
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className="h-10 w-full rounded-xl border border-border/80 bg-background/70 px-3 text-sm transition-all duration-200 focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/25"
              >
                <option value="">Not specified</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Invoice / memo no.
              </Label>
              <Input
                value={invoiceNo}
                onChange={(e) => setInvoiceNo(e.target.value)}
                className={fieldClass}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Freight / other cost
                <InfoTip text="Transport or other costs for the whole shipment. Added to each item's cost proportionally (landed cost)." />
              </Label>
              <Input
                type="number"
                min={0}
                value={extraCost}
                onChange={(e) => setExtraCost(Number(e.target.value))}
                className={fieldClass}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Note
              </Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} className={fieldClass} />
            </div>
          </Panel>

          <div className="grid gap-3">
            <StatCard
              label="Units"
              value={totals.units.toLocaleString("en-US")}
              tip="Total units entering stock in this receipt."
            />
            <StatCard
              label="Goods value"
              value={money(totals.goods)}
              tip="Sum of purchase cost across all lines (excluding freight)."
            />
            <StatCard
              label="Landed total"
              value={money(totals.grand)}
              tone="good"
              tip="Actual cost of the shipment including freight and other charges."
            />
          </div>

          <Button
            className="ig-gradient w-full rounded-xl py-6 text-base transition-transform duration-300 hover:scale-[1.02]"
            loading={submit.isPending}
            onClick={() => submit.mutate()}
          >
            Receive into stock
          </Button>
          <p className="text-center text-[11px] text-muted-foreground">
            Stock records are never deleted — mistakes are corrected with a reversal entry.
          </p>
        </div>
      </div>

      <ImageLightbox
        isOpen={Boolean(preview?.imageUrl)}
        images={preview?.imageUrl ? [{ src: preview.imageUrl, alt: preview.label }] : []}
        onClose={() => setPreview(null)}
      />
    </div>
  );
}
