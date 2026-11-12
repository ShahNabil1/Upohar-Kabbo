import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Lock, Package, Plus, Save, Search, Trash2, Truck } from "lucide-react";

import { advanceMethods } from "@/lib/admin-schema";
import { adminSearchProducts } from "@/lib/admin.functions";
import { adminSaveDeliveryNote, adminSaveOrderItems } from "@/lib/order-admin.functions";
import { Panel } from "@/components/admin/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ImageLightbox, useLightbox } from "@/components/site/image-lightbox";

export type EditableItem = {
  productId: string | null;
  productName: string;
  variantLabel: string | null;
  sku: string | null;
  unitPrice: number;
  quantity: number;
  image?: string | null;
  comboSelections: Array<{
    itemId: string;
    itemNameBn: string;
    itemNameEn: string;
    quantity: number;
    variantId: string | null;
    variantLabelBn: string;
    variantLabelEn: string;
    sku: string | null;
    image?: string | null;
  }>;

};

const money = (n: number) => `৳ ${Number(n || 0).toLocaleString("en-US")}`;

type SearchVariant = {
  id: string;
  value_bn: string;
  value_en: string;
  group_name_bn: string;
  group_name_en: string;
  sku: string | null;
  price_delta?: number | string;
  stock?: number;
  is_active: boolean;
};
type SearchRow = {
  id: string;
  name_bn: string;
  name_en: string;
  sku: string | null;
  price: number | string;
  stock?: number;
  product_images?: Array<{ url: string; sort_order?: number | null }>;
  product_variants?: SearchVariant[];
  combo_items?: Array<{
    id: string;
    quantity: number;
    label_bn: string | null;
    label_en: string | null;
    products: { id: string; name_bn: string; name_en: string; product_variants?: SearchVariant[] } | null;
  }>;
};

/** Delivery note forwarded to the selected courier partner at booking time. */
export function DeliveryNoteCard({
  orderId,
  initial,
  partner,
  template = "",
  locked = false,
}: {
  orderId: string;
  initial: string;
  partner: string | null;
  /** Note template of the currently selected courier. */
  template?: string;
  locked?: boolean;
}) {
  const qc = useQueryClient();
  const [enabled, setEnabled] = useState(Boolean(initial));
  const [note, setNote] = useState(initial);
  // CarryBee caps the special instruction at 255 characters.
  const limit = (partner ?? "").toLowerCase().replace(/\s+/g, "") === "carrybee" ? 255 : 500;


  const save = useMutation({
    mutationFn: (value?: string) =>
      adminSaveDeliveryNote({
        data: { id: orderId, deliveryNote: enabled ? (value ?? note) : "" },
      }),
    onSuccess: async () => {
      toast.success("Delivery note saved");
      await qc.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Selecting a courier fills the note with that courier's template automatically.
  const lastTemplate = useRef(template);
  useEffect(() => {
    if (locked) return;
    if (template === lastTemplate.current) return;
    lastTemplate.current = template;
    if (!template) return;
    setEnabled(true);
    setNote(template);
  }, [template, locked]);

  return (
    <Panel className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex cursor-pointer items-center gap-2.5 text-sm font-bold">
          <Checkbox
            checked={enabled}
            disabled={locked}
            onCheckedChange={(v) => {
              const on = Boolean(v);
              setEnabled(on);
              if (!on) {
                setNote("");
                adminSaveDeliveryNote({ data: { id: orderId, deliveryNote: "" } })
                  .then(() => qc.invalidateQueries({ queryKey: ["admin"] }))
                  .catch((e: Error) => toast.error(e.message));
              } else if (template) {
                setNote(template);
              }
            }}
          />
          <Truck className="size-4 text-primary" />
          Add delivery note
        </label>
        {locked ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground ring-1 ring-border">
            <Lock className="size-3" />
            Locked — sent to courier
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">
            for {partner ?? "courier"} · optional
          </span>
        )}
      </div>

      {enabled ? (
        <div className="space-y-2">
          <Textarea
            rows={3}
            maxLength={limit}
            readOnly={locked}
            className="rounded-xl"
            placeholder="Optional — e.g. Deliver by 3 PM, call before arrival, leave with security…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          {locked ? null : (
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {note.length}/{limit} characters
              </span>
              <Button size="sm" loading={save.isPending} onClick={() => save.mutate(undefined)}>
                <Save className="size-3.5" />
                Save note
              </Button>
            </div>
          )}
        </div>
      ) : null}

    </Panel>
  );
}

/** Order line items with search-based add, inline quantity/price edit and delete. */
export function ItemsCard({
  orderId,
  initialItems,
  deliveryCharge: initialDeliveryCharge,
  discount: initialDiscount,
  couponCode = null,
  advanceAmount: initialAdvance,
  advanceMethod: initialAdvanceMethod,
  locked = false,
}: {
  orderId: string;
  initialItems: EditableItem[];
  deliveryCharge: number;
  discount: number;
  couponCode?: string | null;
  advanceAmount?: number;
  advanceMethod?: string | null;
  locked?: boolean;
}) {
  const qc = useQueryClient();
  const lightbox = useLightbox();
  const openImage = (src: string, alt = "") => lightbox.open([{ src, alt }], 0);
  const [items, setItems] = useState<EditableItem[]>(initialItems);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [comboDrafts, setComboDrafts] = useState<Record<string, Record<string, string>>>({});
  const [discount, setDiscount] = useState(initialDiscount);
  const [deliveryCharge, setDeliveryCharge] = useState(initialDeliveryCharge);
  const [advance, setAdvance] = useState(initialAdvance ?? 0);
  const [advanceMethod, setAdvanceMethod] = useState<string>(
    initialAdvanceMethod ?? advanceMethods[0],
  );

  const snapshot = (
    list: EditableItem[],
    d: number,
    a: number,
    m: string,
  ) =>
    JSON.stringify({
      items: list.map(({ image: _image, ...rest }) => rest),
      discount: Number(d) || 0,
      advance: Number(a) || 0,
      method: (Number(a) || 0) > 0 ? m : null,
    });

  const [savedSnapshot, setSavedSnapshot] = useState(() =>
    snapshot(initialItems, initialDiscount, initialAdvance ?? 0, initialAdvanceMethod ?? advanceMethods[0]) +
      `|dc:${Number(initialDeliveryCharge) || 0}`,
  );

  const { data: results } = useQuery({
    queryKey: ["admin", "product-search", query],
    queryFn: () => adminSearchProducts({ data: { query } }),
    enabled: adding,
  });

  const subtotal = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  const total = Math.max(0, subtotal + deliveryCharge - discount);
  const paidAdvance = Math.min(advance, total);
  const due = Math.max(0, total - paidAdvance);

  const currentSnapshot =
    snapshot(items, discount, paidAdvance, advanceMethod) + `|dc:${Number(deliveryCharge) || 0}`;
  const isDirty = currentSnapshot !== savedSnapshot;

  const save = useMutation({
    mutationFn: () =>
      adminSaveOrderItems({
        data: {
          id: orderId,
          items: items.map(({ image: _image, ...rest }) => rest),
          deliveryCharge,
          discount,
          advanceAmount: paidAdvance,
          advanceMethod:
            paidAdvance > 0
              ? (advanceMethod as (typeof advanceMethods)[number])
              : null,
        },
      }),
    onSuccess: async () => {
      setSavedSnapshot(currentSnapshot);
      toast.success("Items updated");
      await qc.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const patch = (index: number, next: Partial<EditableItem>) =>
    setItems(items.map((it, i) => (i === index ? { ...it, ...next } : it)));

  const addRow = (row: SearchRow, variantId: string | null, comboPicks: Record<string, string>) => {
    const variant = row.product_variants?.find((v) => v.id === variantId) ?? null;
    const image =
      [...(row.product_images ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))[0]?.url ?? null;
    const variantLabel = variant ? `${variant.group_name_bn}: ${variant.value_bn}` : null;
    const comboSelections = (row.combo_items ?? []).flatMap((ci) => {
      const child = ci.products;
      const sel = child?.product_variants?.find((v) => v.id === comboPicks[ci.id]);
      return child && sel
        ? [{
            itemId: child.id,
            itemNameBn: ci.label_bn || child.name_bn,
            itemNameEn: ci.label_en || child.name_en,
            quantity: ci.quantity,
            variantId: sel.id,
            variantLabelBn: `${sel.group_name_bn}: ${sel.value_bn}`,
            variantLabelEn: `${sel.group_name_en}: ${sel.value_en}`,
            sku: sel.sku,
          }]
        : [];
    });
    const sku = variant?.sku ?? row.sku;
    const comboKey = comboSelections.map((s) => s.variantId).join("+");
    const existing = items.findIndex(
      (it) =>
        it.productId === row.id &&
        it.variantLabel === variantLabel &&
        it.comboSelections.map((s) => s.variantId).join("+") === comboKey,
    );
    if (existing >= 0) {
      patch(existing, { quantity: (items[existing]?.quantity ?? 0) + 1 });
    } else {
      setItems([
        ...items,
        {
          productId: row.id,
          productName: row.name_bn,
          variantLabel,
          sku,
          unitPrice: Number(row.price) + Number(variant?.price_delta ?? 0),
          quantity: 1,
          image,
          comboSelections,
        },
      ]);
    }
    toast.success(variantLabel ? `${row.name_bn} · ${variantLabel} added` : `${row.name_bn} added`);
  };





  return (
    <Panel className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <Package className="size-4 text-primary" />
          Items
        </h2>
        {locked ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground ring-1 ring-border">
            <Lock className="size-3" />
            Locked — sent to courier
          </span>
        ) : (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setAdding((v) => !v)}>
              <Plus className="size-3.5" />
              Add Product
            </Button>
            <Button
              size="sm"
              variant={isDirty ? "default" : "secondary"}
              loading={save.isPending}
              disabled={!isDirty}
              onClick={() => save.mutate(undefined)}
            >
              {isDirty ? <Save className="size-3.5" /> : <Check className="size-3.5" />}
              {save.isPending ? "Saving…" : isDirty ? "Save" : "Saved"}
            </Button>
          </div>
        )}
      </div>

      {adding && !locked ? (
        <div className="space-y-2 rounded-xl border border-border/70 bg-background/60 p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              className="rounded-xl pl-9"
              placeholder="Search product title…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <ul className="max-h-72 space-y-2 overflow-y-auto overscroll-contain pr-0.5">
            {(results ?? []).map((p) => {
              const row = p as unknown as SearchRow;
              const variants = (row.product_variants ?? []).filter((v) => v.is_active);
              const comboDefaults =
                comboDrafts[row.id] ??
                Object.fromEntries(
                  (row.combo_items ?? []).flatMap((ci) => {
                    const first = ci.products?.product_variants?.find((v) => v.is_active);
                    return first ? [[ci.id, first.id]] : [];
                  }),
                );
              const thumb = [...(row.product_images ?? [])].sort(
                (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
              )[0]?.url;
              return (
                <li key={row.id} className="rounded-xl border border-border/70 bg-background px-3 py-2">
                  <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-2 sm:items-center">
                    <div className="flex min-w-0 items-start gap-2.5 sm:items-center sm:gap-3">
                      {thumb ? (
                        <img src={thumb} alt={row.name_bn} loading="lazy" className="size-11 shrink-0 rounded-lg border border-border/70 object-cover" />
                      ) : (
                        <div className="grid size-11 shrink-0 place-items-center rounded-lg border border-dashed border-border text-[10px] text-muted-foreground">No img</div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-sm font-semibold leading-5 sm:line-clamp-2">{row.name_bn}</p>
                        <p className="mt-0.5 break-words text-xs leading-4 text-muted-foreground">
                          {row.sku ?? "—"} · {money(Number(row.price))} · stock {row.stock ?? 0}
                        </p>
                      </div>
                    </div>
                    {variants.length === 0 ? (
                      <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={() => addRow(row, null, comboDefaults)}>
                        <Plus className="size-4" />
                        Add
                      </Button>
                    ) : (
                      <div className="flex max-w-[8.5rem] flex-wrap justify-end gap-1.5 sm:max-w-none">
                        {variants.map((v) => (
                          <button
                            key={v.id}
                            type="button"
                            onClick={() => addRow(row, v.id, comboDefaults)}
                            className="min-h-8 rounded-full border border-border px-2.5 py-1 text-xs font-semibold transition-colors hover:border-primary/50 hover:bg-accent"
                          >
                            + {v.value_bn}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {(row.combo_items ?? []).some((ci) => ci.products?.product_variants?.some((v) => v.is_active)) ? (
                    <div className="mt-2 grid min-w-0 gap-2 border-t border-border/70 pt-2 sm:grid-cols-2">
                      {(row.combo_items ?? []).map((ci) => {
                        const child = ci.products;
                        const options = child?.product_variants?.filter((v) => v.is_active) ?? [];
                        if (!child || options.length === 0) return null;
                        return (
                          <label key={ci.id} className="min-w-0 text-xs font-semibold">
                            <span className="block break-words">{ci.label_bn || child.name_bn}</span>
                            <select
                              className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5"
                              value={comboDefaults[ci.id] ?? options[0]?.id}
                              onChange={(e) =>
                                setComboDrafts((cur) => ({
                                  ...cur,
                                  [row.id]: { ...comboDefaults, [ci.id]: e.target.value },
                                }))
                              }
                            >
                              {options.map((o) => (
                                <option key={o.id} value={o.id}>{o.value_bn}</option>
                              ))}
                            </select>
                          </label>
                        );
                      })}
                    </div>
                  ) : null}
                </li>
              );
            })}
            {(results ?? []).length === 0 ? (
              <li className="py-4 text-center text-sm text-muted-foreground">No products found</li>
            ) : null}
          </ul>
        </div>
      ) : null}

      <ul className="space-y-2">
        {items.map((item, index) => (
          <li
            key={`${item.productId ?? "custom"}-${index}`}
            className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-3 rounded-xl border border-border/70 bg-background/60 p-2.5 sm:flex sm:flex-wrap sm:items-center"
          >
            {item.image ? (
              <button
                type="button"
                onClick={() => openImage(item.image!, item.productName)}
                className="shrink-0 rounded-md transition-transform hover:scale-[1.04]"
                title="Preview image"
              >
                <img src={item.image} alt="" className="size-11 rounded-md object-cover" />
              </button>
            ) : (
              <span className="size-11 rounded-md bg-muted" />
            )}
            <div className="min-w-0 flex-1">
              <p className="break-words text-sm font-semibold sm:truncate">{item.productName}</p>
              <p className="break-all font-mono text-xs text-muted-foreground">
                {item.sku ?? "no-sku"} · {item.variantLabel ?? "physical"}
              </p>
              {item.comboSelections.length > 0 ? (
                <ul className="mt-1.5 space-y-1.5 rounded-lg bg-muted/60 px-2.5 py-2 text-xs">
                  {item.comboSelections.map((selection) => (
                    <li
                      key={`${selection.itemId}-${selection.variantId}`}
                      className="flex items-center gap-2"
                    >
                      {selection.image ? (
                        <button
                          type="button"
                          onClick={() => openImage(selection.image!, selection.itemNameBn)}
                          className="shrink-0 rounded-md transition-transform hover:scale-[1.06]"
                          title="Preview image"
                        >
                          <img
                            src={selection.image}
                            alt=""
                            loading="lazy"
                            className="size-8 rounded-md object-cover ring-1 ring-border"
                          />
                        </button>
                      ) : (
                        <span className="size-8 shrink-0 rounded-md bg-muted ring-1 ring-border" />
                      )}

                      <span className="min-w-0 flex-1">
                        <span className="block truncate">
                          <span className="font-semibold">{selection.itemNameBn}</span>
                          {selection.variantLabelBn ? (
                            <span className="text-muted-foreground"> · {selection.variantLabelBn}</span>
                          ) : null}

                          {selection.quantity > 1 ? (
                            <span className="text-muted-foreground"> × {selection.quantity}</span>
                          ) : null}
                        </span>
                        <span className="block font-mono text-[11px] text-muted-foreground">
                          {selection.sku ?? "no-sku"}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}

            </div>
            <div className="col-span-2 grid w-full grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)] items-center gap-2 sm:ml-auto sm:flex sm:w-auto">
            <Input
              type="number"
              min={1}
              readOnly={locked}
              disabled={locked}
              aria-label="Quantity"
              className="h-9 w-full rounded-lg text-center sm:w-20"
              value={item.quantity}
              onChange={(e) => patch(index, { quantity: Math.max(1, Number(e.target.value)) })}
            />
            <Input
              type="number"
              min={0}
              readOnly={locked}
              disabled={locked}
              aria-label="Unit price"
              className="h-9 w-full rounded-lg text-center sm:w-28"
              value={item.unitPrice}
              onChange={(e) => patch(index, { unitPrice: Math.max(0, Number(e.target.value)) })}
            />
            <span className="text-right text-sm font-bold tabular-nums sm:w-24">
              {money(item.unitPrice * item.quantity)}
            </span>
            {locked ? null : (
              <button
                type="button"
                aria-label="Remove item"
                className="text-muted-foreground transition-colors hover:text-destructive"
                onClick={() => setItems(items.filter((_, i) => i !== index))}
              >
                <Trash2 className="size-4" />
              </button>
            )}
            </div>
          </li>
        ))}
      </ul>

      <div className="grid gap-3 rounded-xl border border-border/70 bg-background/60 p-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Delivery Charge (৳)
          </p>
          <Input
            type="number"
            min={0}
            readOnly={locked}
            disabled={locked}
            className="h-9 rounded-lg"
            value={deliveryCharge}
            onChange={(e) => setDeliveryCharge(Math.max(0, Number(e.target.value) || 0))}
          />
          <p className="text-[11px] text-muted-foreground">
            Site charge: {money(initialDeliveryCharge)}
            {deliveryCharge !== initialDeliveryCharge ? (
              <button
                type="button"
                disabled={locked}
                className="ml-1.5 font-semibold text-primary hover:underline"
                onClick={() => setDeliveryCharge(initialDeliveryCharge)}
              >
                Reset
              </button>
            ) : null}
          </p>
        </div>
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Discount (৳)
          </p>
          <Input
            type="number"
            min={0}
            readOnly={locked}
            disabled={locked}
            className="h-9 rounded-lg"
            value={discount}
            onChange={(e) => setDiscount(Math.max(0, Number(e.target.value)))}
          />
        </div>
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Advance (৳)
          </p>
          <div className="flex gap-2">
            <Input
              type="number"
              min={0}
              readOnly={locked}
              disabled={locked}
              className="h-9 rounded-lg"
              value={advance}
              onChange={(e) => setAdvance(Math.max(0, Number(e.target.value)))}
            />
            {advance > 0 ? (
              <select
                disabled={locked}
                className="h-9 rounded-lg border border-border/80 bg-background px-2 text-sm disabled:opacity-70"
                value={advanceMethod}
                onChange={(e) => setAdvanceMethod(e.target.value)}
              >
                {advanceMethods.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
          {advance > 0 ? (
            <p className="text-[11px] text-muted-foreground">
              Paid via {advanceMethod} · rest is cash on delivery
            </p>
          ) : null}
        </div>
      </div>

      <dl className="space-y-1.5 border-t border-dashed border-border pt-3 text-sm">
        <div className="flex justify-end gap-3">
          <dt className="text-muted-foreground">Subtotal:</dt>
          <dd className="w-28 text-right font-semibold tabular-nums">{money(subtotal)}</dd>
        </div>
        <div className="flex justify-end gap-3">
          <dt className="text-muted-foreground">Shipping:</dt>
          <dd className="w-28 text-right font-semibold tabular-nums">{money(deliveryCharge)}</dd>
        </div>
        {discount > 0 ? (
          <div className="flex justify-end gap-3 text-emerald-600">
            <dt>
              Discount:
              {couponCode ? (
                <span className="ml-1.5 rounded border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                  {couponCode}
                </span>
              ) : null}
            </dt>
            <dd className="w-28 text-right font-semibold tabular-nums">-{money(discount)}</dd>
          </div>
        ) : null}
        <div className="flex justify-end gap-3">
          <dt className="text-muted-foreground">Total:</dt>
          <dd className="w-28 text-right font-semibold tabular-nums">{money(total)}</dd>
        </div>
        {paidAdvance > 0 ? (
          <div className="flex justify-end gap-3 text-emerald-600">
            <dt>Advance ({advanceMethod}):</dt>
            <dd className="w-28 text-right font-semibold tabular-nums">-{money(paidAdvance)}</dd>
          </div>
        ) : null}
        <div className="flex justify-end gap-3 border-t border-border/70 pt-2 text-base">
          <dt className="font-semibold">{paidAdvance > 0 ? "Due (COD):" : "Total:"}</dt>
          <dd className="w-28 text-right font-bold tabular-nums text-primary">{money(due)}</dd>
        </div>
      </dl>

      <ImageLightbox
        images={lightbox.images}
        startIndex={lightbox.startIndex}
        isOpen={lightbox.isOpen}
        onClose={lightbox.close}
      />
    </Panel>
  );
}
