import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";

import { useCart } from "@/lib/cart-context";
import { useLang } from "@/lib/language-context";
import { formatNumber, formatPrice, pick, tr } from "@/lib/i18n";
import { ProductThumb } from "@/components/site/product-card";
import { QuantityStepper } from "@/components/site/add-to-cart";
import { cn } from "@/lib/utils";

export function CartDrawer() {
  const { lang } = useLang();
  const { items, subtotal, setQuantity, remove, open, closeCart } = useCart();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeCart();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, closeCart]);

  if (!mounted) return null;


  return (
    <div
      className={cn("fixed inset-0 z-[70]", open ? "" : "pointer-events-none")}
      aria-hidden={!open}
      {...(!open ? { inert: true } : {})}
    >
      <button
        type="button"
        tabIndex={open ? 0 : -1}
        aria-label={tr(lang, "close")}
        onClick={closeCart}
        className={cn(
          "absolute inset-0 bg-foreground/50 backdrop-blur-[2px] transition-opacity duration-500 ease-[cubic-bezier(0.4,0,0.2,1)]",
          open ? "opacity-100" : "opacity-0",
        )}
      />

      <aside
        role="dialog"
        aria-modal={open}
        aria-label={tr(lang, "cart")}
        className={cn(
          "absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-background shadow-2xl transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-transform",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        <header className="flex items-center gap-3 border-b border-border px-4 py-3">
          <button
            type="button"
            onClick={closeCart}
            aria-label={tr(lang, "close")}
            className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-full border border-border bg-card text-foreground transition-all duration-200 hover:scale-105 hover:border-primary hover:text-accent-foreground hover:shadow-sm active:scale-95"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5" />
              <path d="M12 19l-7-7 7-7" />
            </svg>
          </button>
          <h2 className="min-w-0 flex-1 text-lg font-bold sm:text-xl">
            {tr(lang, "cart")}
            <span className="ml-1.5 text-base font-semibold text-primary">
              ({formatNumber("en", items.reduce((sum, item) => sum + item.quantity, 0))} items)
            </span>
          </h2>
        </header>

        {items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
            <div className="flex w-full max-w-xs flex-col items-center gap-5">
              <div className="grid h-24 w-24 place-items-center rounded-full bg-primary/10 ring-8 ring-primary/5">
                <svg
                  viewBox="0 0 24 24"
                  className="h-11 w-11 text-primary"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M6 7h15l-1.5 8.5a2 2 0 0 1-2 1.5H8.5a2 2 0 0 1-2-1.5L5 4H2" />
                  <path d="M9 11V6a3 3 0 0 1 6 0v5" />
                  <circle cx="9" cy="20" r="1" />
                  <circle cx="17" cy="20" r="1" />
                </svg>
              </div>

              <div className="max-w-[16rem]">
                <h3 className="text-lg font-bold text-foreground">
                  {tr(lang, "emptyCartTitle")}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {tr(lang, "emptyCartBody")}
                </p>
              </div>

              <div className="flex w-full flex-col gap-2">
                <Link
                  to="/"
                  onClick={closeCart}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-primary px-6 py-3 text-sm font-bold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                    <polyline points="9 22 9 12 15 12 15 22" />
                  </svg>
                  {tr(lang, "browseGifts")}
                </Link>
                <button
                  type="button"
                  onClick={closeCart}
                  className="text-sm font-semibold text-muted-foreground transition-colors hover:text-primary"
                >
                  {tr(lang, "continueShopping")}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <ul className="flex-1 overflow-y-auto px-4 py-4">
              {items.map((item) => (
                <li
                  key={item.key}
                  className="grid grid-cols-[72px_minmax(0,1fr)] gap-3 border-b border-border/70 py-3 first:pt-0 last:border-0"
                >
                  <Link
                    to="/p/$product"
                    params={{ product: item.slug }}
                    onClick={closeCart}
                    className="aspect-square overflow-hidden rounded-sm bg-secondary"
                  >
                    <ProductThumb
                      src={item.image}
                      alt={pick(lang, item.nameBn, item.nameEn)}
                      label={item.nameEn}
                    />
                  </Link>
                  <div className="min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <Link
                        to="/p/$product"
                        params={{ product: item.slug }}
                        onClick={closeCart}
                        className="line-clamp-2 min-w-0 text-sm font-semibold hover:text-primary"
                      >
                        {pick(lang, item.nameBn, item.nameEn)}
                      </Link>
                      <span className="shrink-0 text-sm font-bold tabular-nums">
                        {formatPrice(lang, item.price * item.quantity)}
                      </span>
                    </div>
                    {item.variantLabelBn ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {pick(lang, item.variantLabelBn, item.variantLabelEn)}
                      </p>
                    ) : null}
                    {item.comboSelections.length > 0 ? (
                      <ul className="mt-2 space-y-1 text-[13px] font-medium text-foreground">
                        {item.comboSelections.map((selection) => (
                          <li key={`${selection.itemId}-${selection.variantId ?? "base"}`}>
                            {pick(lang, selection.itemNameBn, selection.itemNameEn)} ·{" "}
                            {selection.variantLabelBn || selection.variantLabelEn
                              ? pick(lang, selection.variantLabelBn ?? "", selection.variantLabelEn ?? "")
                              : `Qty ${selection.quantity}`}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      <QuantityStepper
                        value={item.quantity}
                        max={item.stock}
                        onChange={(next) => setQuantity(item.key, next)}
                      />
                      <button
                        type="button"
                        onClick={() => remove(item.key)}
                        aria-label={tr(lang, "remove")}
                        className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-full border border-border bg-card text-muted-foreground transition-all duration-200 hover:scale-110 hover:border-destructive hover:text-destructive hover:shadow-sm active:scale-95"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <footer className="border-t border-border bg-card px-4 py-4">
              <div className="flex items-center justify-between">
                <span className="text-base font-bold text-foreground">Subtotal</span>
                <span className="text-xl font-bold tabular-nums text-primary">
                  {formatPrice(lang, subtotal)}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{tr(lang, "codNote")}</p>
              <Link
                to="/checkout"
                onClick={closeCart}
                className="mt-3 block w-full rounded-sm bg-primary px-5 py-3 text-center text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                {tr(lang, "checkout")}
              </Link>
              <button
                type="button"
                onClick={closeCart}
                className="mt-2 w-full rounded-sm border border-border bg-background px-5 py-2.5 text-center text-sm font-semibold text-foreground transition-all duration-200 hover:border-primary hover:text-primary hover:shadow-sm active:scale-[0.98]"
              >
                {tr(lang, "continueShopping")}
              </button>
            </footer>
          </>
        )}
      </aside>
    </div>
  );
}
