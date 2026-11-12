/**
 * Bridges cart/catalogue shapes to the tracking item shape.
 *
 * The `id` MUST be the same value the catalogue feed (`/catalog.xml`) exports,
 * otherwise Meta/TikTok/Google cannot match the event to a catalogue product.
 * That is the variant SKU when a variant is picked, else the product SKU.
 */

import { useMemo } from "react";

import type { CartItem } from "./cart-context";
import { ecommerce, useTrackOnce, type TrackingItem } from "./tracking";

export type CatalogueLike = {
  id: string;
  slug: string;
  nameEn: string;
  nameBn?: string;
  sku?: string | null;
  price: number;
};

/** Catalogue id with a deterministic fallback so events never lose an id. */
export function catalogId(sku: string | null | undefined, slug: string, productId?: string): string {
  return sku || slug || productId || "unknown";
}

export function cartTrackingItems(items: CartItem[]): TrackingItem[] {
  return items.map((i) => ({
    id: catalogId(i.sku, i.slug, i.productId),
    name: i.nameEn || i.nameBn,
    category: i.category ?? undefined,
    variant: i.variantLabelEn ?? i.variantLabelBn ?? undefined,
    item_group_id: i.slug,
    quantity: i.quantity,
    price: i.price,
  }));
}

export function listTrackingItems(
  products: CatalogueLike[],
  category?: string | undefined,
): TrackingItem[] {
  return products.map((p) => ({
    id: catalogId(p.sku, p.slug, p.id),
    name: p.nameEn || p.nameBn,
    category,
    item_group_id: p.slug,
    quantity: 1,
    price: p.price,
  }));
}

/** Fires `view_item_list` once for a listing page (category / search / offer). */
export function useViewItemList(
  listName: string,
  products: CatalogueLike[],
  category?: string | undefined,
) {
  const items = useMemo(() => listTrackingItems(products, category), [products, category]);
  const payload = useMemo(
    () => ({ ...ecommerce(items), item_list_name: listName }),
    [items, listName],
  );
  useTrackOnce("view_item_list", payload, items.length > 0);
}
