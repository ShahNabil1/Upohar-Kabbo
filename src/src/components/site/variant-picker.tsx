import { useEffect, useMemo, useState } from "react";
import { Check, Minus, Plus, ShoppingBag, Zap } from "lucide-react";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { ProductThumb } from "@/components/site/product-card";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatPrice, pick } from "@/lib/i18n";
import { useLang } from "@/lib/language-context";
import { cn } from "@/lib/utils";

export type PickerVariant = {
  id: string;
  group_name_bn: string;
  group_name_en: string;
  value_bn: string;
  value_en: string;
  sku: string | null;
  price_delta: number | string | null;
  stock: number;
};

export type PickerResult = { variant: PickerVariant; quantity: number };

export function VariantPicker({
  open,
  onOpenChange,
  mode,
  name,
  image,
  basePrice,
  variants,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "buy" | "cart";
  name: string;
  image: string | null;
  basePrice: number;
  variants: PickerVariant[];
  onConfirm: (result: PickerResult) => void;
}) {
  const { lang } = useLang();
  const isMobile = useIsMobile();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [qty, setQty] = useState(1);

  useEffect(() => {
    if (!open) return;
    const firstInStock = variants.find((v) => v.stock > 0);
    setSelectedId(variants.length === 1 && firstInStock ? firstInStock.id : null);
    setQty(1);
  }, [open, variants]);

  const groups = useMemo(() => {
    const map = new Map<string, PickerVariant[]>();
    for (const v of variants) {
      const key = pick(lang, v.group_name_bn, v.group_name_en);
      map.set(key, [...(map.get(key) ?? []), v]);
    }
    return [...map.entries()];
  }, [variants, lang]);

  const selected = variants.find((v) => v.id === selectedId) ?? null;
  const unit = basePrice + Number(selected?.price_delta ?? 0);
  const maxQty = Math.max(1, selected?.stock ?? 1);

  const body = (
    <div className="flex flex-col gap-5 p-5">
      <div className="flex gap-4">
        <div className="size-20 shrink-0 overflow-hidden rounded-xl border border-border bg-secondary">
          <ProductThumb src={image} alt={name} label={name} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 font-semibold leading-snug">{name}</p>
          <p className="mt-1 text-lg font-bold text-primary-dark">{formatPrice(lang, unit)}</p>
          <p className="text-xs text-muted-foreground">
            {selected
              ? `${pick(lang, selected.group_name_bn, selected.group_name_en)}: ${pick(lang, selected.value_bn, selected.value_en)}`
              : lang === "bn" ? "একটি অপশন বেছে নিন" : "Choose an option"}
          </p>
        </div>
      </div>

      {groups.map(([group, list]) => (
        <div key={group}>
          <p className="mb-2 text-sm font-semibold">{group}</p>
          <div className="flex flex-wrap gap-2">
            {list.map((v) => {
              const out = v.stock <= 0;
              const active = v.id === selectedId;
              const delta = Number(v.price_delta ?? 0);
              return (
                <button
                  key={v.id}
                  type="button"
                  disabled={out}
                  onClick={() => { setSelectedId(v.id); setQty(1); }}
                  className={cn(
                    "relative inline-flex min-w-14 items-center justify-center gap-1 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-all duration-200 active:scale-95",
                    active
                      ? "border-primary bg-primary text-primary-foreground shadow-md ring-2 ring-primary/30"
                      : "border-border bg-card hover:border-primary/60 hover:text-primary-dark",
                    out && "cursor-not-allowed opacity-40 line-through",
                  )}
                >
                  {active ? <Check className="size-3.5" /> : null}
                  {pick(lang, v.value_bn, v.value_en)}
                  {delta !== 0 ? (
                    <span className="text-[11px] font-medium opacity-80">
                      {delta > 0 ? "+" : "−"}{formatPrice(lang, Math.abs(delta))}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">{lang === "bn" ? "পরিমাণ" : "Quantity"}</p>
        <div className="inline-flex items-center rounded-xl border border-border">
          <button type="button" aria-label="Decrease" className="p-2.5 disabled:opacity-40" disabled={qty <= 1} onClick={() => setQty((q) => Math.max(1, q - 1))}>
            <Minus className="size-4" />
          </button>
          <span className="w-10 text-center font-semibold">{qty}</span>
          <button type="button" aria-label="Increase" className="p-2.5 disabled:opacity-40" disabled={!selected || qty >= maxQty} onClick={() => setQty((q) => Math.min(maxQty, q + 1))}>
            <Plus className="size-4" />
          </button>
        </div>
      </div>

      <button
        type="button"
        disabled={!selected}
        onClick={() => selected && onConfirm({ variant: selected, quantity: qty })}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 text-base font-bold text-primary-foreground shadow-sm transition-all duration-200 hover:bg-primary-deep active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
      >
        {mode === "buy" ? <Zap className="size-4" /> : <ShoppingBag className="size-4" />}
        {selected
          ? mode === "buy"
            ? `Buy Now · ${formatPrice(lang, unit * qty)}`
            : `Add to Cart · ${formatPrice(lang, unit * qty)}`
          : lang === "bn" ? "অপশন সিলেক্ট করুন" : "Select an option"}
      </button>
    </div>
  );

  const title = lang === "bn" ? "অপশন বেছে নিন" : "Select options";

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[88vh]">
          <DrawerTitle className="sr-only">{title}</DrawerTitle>
          <DrawerDescription className="sr-only">{name}</DrawerDescription>
          <div className="overflow-y-auto overscroll-contain">{body}</div>
        </DrawerContent>
      </Drawer>
    );
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md overflow-hidden rounded-2xl p-0">
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <DialogDescription className="sr-only">{name}</DialogDescription>
        {body}
      </DialogContent>
    </Dialog>
  );
}
