import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";

import { useBlockedSupport } from "@/components/site/blocked-support-dialog";
import { getBrowserFingerprint } from "@/lib/browser-fingerprint";
import { checkStorefrontAccess } from "@/lib/storefront-security.functions";

const CART_KEY = "upoharkabbo_cart_v1";

export type CartItem = {
  key: string;
  productId: string;
  slug: string;
  nameBn: string;
  nameEn: string;
  image: string | null;
  price: number;
  quantity: number;
  stock: number;
  sku: string | null;
  variantId: string | null;
  variantLabelBn: string | null;
  variantLabelEn: string | null;
  /** Catalogue category name (English) — sent with marketing events. */
  category?: string | null;
  comboSelections: ComboSelection[];
};

export type ComboSelection = {
  itemId: string;
  itemNameBn: string;
  itemNameEn: string;
  quantity: number;
  /** null when the child item has no variants — it still ships in the box. */
  variantId: string | null;
  variantLabelBn: string | null;
  variantLabelEn: string | null;
  sku: string | null;
};

export type NewCartItem = Omit<CartItem, "key">;

export type CartStep = "cart" | "checkout";

type CartContextValue = {
  items: CartItem[];
  count: number;
  subtotal: number;
  ready: boolean;
  open: boolean;
  step: CartStep;
  openCart: (step?: CartStep) => void;
  closeCart: () => void;
  setStep: (step: CartStep) => void;
  add: (item: NewCartItem) => Promise<boolean>;
  setQuantity: (key: string, quantity: number) => void;
  remove: (key: string) => void;
  clear: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

function itemKey(productId: string, variantId: string | null, comboSelections: ComboSelection[] = []) {
  const comboKey = comboSelections
    .map((selection) => selection.variantId)
    .filter((id): id is string => Boolean(id))
    .sort()
    .join("+");
  return `${productId}::${variantId ?? "base"}${comboKey ? `::${comboKey}` : ""}`;
}

function isCartItem(value: unknown): value is CartItem {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v["productId"] === "string" &&
    typeof v["slug"] === "string" &&
    typeof v["price"] === "number" &&
    typeof v["quantity"] === "number"
  );
}

function readStorage(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CART_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isCartItem).map((item) => ({
      ...item,
      comboSelections: Array.isArray(item.comboSelections) ? item.comboSelections : [],
      key: item.key || itemKey(item.productId, item.variantId ?? null, item.comboSelections ?? []),
      quantity: Math.max(1, Math.min(99, Math.round(item.quantity))),
    }));
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const checkAccess = useServerFn(checkStorefrontAccess);
  const { showBlockedDialog } = useBlockedSupport();
  const [items, setItems] = useState<CartItem[]>([]);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<CartStep>("cart");

  useEffect(() => {
    setItems(readStorage());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(CART_KEY, JSON.stringify(items));
    } catch {
      /* storage unavailable — cart stays in memory */
    }
  }, [items, ready]);

  // The access check is cached for a few minutes and pre-warmed on page load so
  // "Add to Cart"/"Buy Now" never wait on it. Checkout re-verifies server-side.
  const accessRef = useRef<{ at: number; promise: Promise<boolean> } | null>(null);
  const getBlocked = useCallback(() => {
    const now = Date.now();
    if (accessRef.current && now - accessRef.current.at < 5 * 60_000) return accessRef.current.promise;
    const promise = (async () => {
      try {
        const fingerprint = await getBrowserFingerprint();
        const result = await checkAccess({ data: { fingerprint } });
        return Boolean(result.blocked);
      } catch {
        // A transient security-check failure must not make the storefront unusable.
        accessRef.current = null;
        return false;
      }
    })();
    accessRef.current = { at: now, promise };
    return promise;
  }, [checkAccess]);

  useEffect(() => {
    if (!ready) return;
    const t = window.setTimeout(() => void getBlocked(), 800);
    return () => window.clearTimeout(t);
  }, [ready, getBlocked]);

  const add = useCallback(async (incoming: NewCartItem) => {
    if (await getBlocked()) {
      showBlockedDialog();
      return false;
    }
    const key = itemKey(incoming.productId, incoming.variantId, incoming.comboSelections);
    setItems((prev) => {
      const existing = prev.find((i) => i.key === key);
      if (existing) {
        const max = existing.stock > 0 ? existing.stock : 99;
        return prev.map((i) =>
          i.key === key
            ? { ...i, quantity: Math.min(max, i.quantity + incoming.quantity) }
            : i,
        );
      }
      return [...prev, { ...incoming, key }];
    });
    return true;
  }, [getBlocked, showBlockedDialog]);

  const setQuantity = useCallback((key: string, quantity: number) => {
    setItems((prev) =>
      prev.flatMap((i) => {
        if (i.key !== key) return [i];
        const max = i.stock > 0 ? i.stock : 99;
        const next = Math.min(max, Math.max(0, Math.round(quantity)));
        return next <= 0 ? [] : [{ ...i, quantity: next }];
      }),
    );
  }, []);

  const remove = useCallback((key: string) => {
    setItems((prev) => prev.filter((i) => i.key !== key));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const openCart = useCallback((next: CartStep = "cart") => {
    setStep(next);
    setOpen(true);
  }, []);

  const closeCart = useCallback(() => setOpen(false), []);

  const value = useMemo<CartContextValue>(() => {
    const count = items.reduce((sum, i) => sum + i.quantity, 0);
    const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
    return {
      items,
      count,
      subtotal,
      ready,
      open,
      step,
      openCart,
      closeCart,
      setStep,
      add,
      setQuantity,
      remove,
      clear,
    };
  }, [items, ready, open, step, openCart, closeCart, add, setQuantity, remove, clear]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside CartProvider");
  return ctx;
}
