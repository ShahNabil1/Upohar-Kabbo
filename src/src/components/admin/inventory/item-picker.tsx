import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ImageOff, Search } from "lucide-react";

import { inventoryCatalogItems } from "@/lib/inventory.functions";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { SmartImage } from "@/components/site/smart-image";

export type PickableItem = {
  key: string;
  productId: string | null;
  variantId: string | null;
  packagingId: string | null;
  label: string;
  sku: string;
  category: string;
  price: number;
  imageUrl?: string | null;
};

/** Cached catalog list — every inventory screen reuses this single query. */
export function useCatalogItems() {
  return useQuery({
    queryKey: ["admin", "inventory", "items"],
    queryFn: () => inventoryCatalogItems(),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * SKU-first item picker. The product / variant SKU is also the barcode, so a
 * barcode scanner typing into this box selects the right row instantly.
 */
export function ItemPicker({
  value,
  onSelect,
  placeholder = "Scan barcode or search name / SKU…",
  autoFocus,
}: {
  value?: PickableItem | null;
  onSelect: (item: PickableItem) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const { data: items = [], isLoading } = useCatalogItems();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items.slice(0, 25);
    const score = (i: PickableItem) => {
      const sku = i.sku.toLowerCase();
      if (sku === q) return 0; // scanned barcode / exact SKU
      if (sku.startsWith(q)) return 1;
      if (sku.includes(q)) return 2;
      if (i.label.toLowerCase().includes(q)) return 3;
      if (i.category.toLowerCase().includes(q)) return 4;
      return 99;
    };
    return items
      .map((i) => ({ i, s: score(i) }))
      .filter((r) => r.s < 99)
      .sort((a, b) => a.s - b.s)
      .slice(0, 30)
      .map((r) => r.i);
  }, [items, query]);

  const pick = (item: PickableItem) => {
    onSelect(item);
    setQuery("");
    setOpen(false);
  };

  return (
    <div className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus={autoFocus ?? false}
          value={query}
          placeholder={value ? value.label : placeholder}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            // Barcode scanners end with Enter — take the only/first match.
            if (e.key === "Enter" && results[0]) {
              e.preventDefault();
              pick(results[0]);
            }
          }}
          className="rounded-xl border-border/80 bg-background/70 pl-9 transition-all duration-200 focus-visible:border-primary/60 focus-visible:ring-primary/25"
        />
      </div>

      {open ? (
        <div className="absolute z-30 mt-1.5 max-h-72 w-full overflow-auto rounded-xl border border-border bg-popover p-1 shadow-xl">
          {isLoading ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">Loading items…</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              No item matches “{query}”.
            </p>
          ) : (
            results.map((item) => (
              <button
                key={item.key}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(item)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors duration-150 hover:bg-accent",
                  value?.key === item.key && "bg-accent",
                )}
              >
                <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/70 bg-muted/40">
                  {item.imageUrl ? (
                    <SmartImage
                      src={item.imageUrl}
                      alt={item.label}
                      baseWidth={80}
                      height={80}
                      fit="contain"
                      className="size-full object-contain"
                    />
                  ) : (
                    <ImageOff className="size-4 text-muted-foreground/70" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{item.label}</p>
                  <p className="font-en truncate text-[11px] text-muted-foreground">
                    {item.sku} · {item.category}
                  </p>
                </div>
                {value?.key === item.key ? <Check className="size-4 text-primary" /> : null}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
