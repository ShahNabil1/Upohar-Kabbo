import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

/**
 * Publishable-key Supabase client for server-side public reads.
 * Never persists a session and never uses the service role.
 * Only call this from inside a server function / server route handler.
 */
export function createPublicServerClient() {
  const url = process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"];
  const key =
    process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];

  if (!url || !key) {
    throw new Error("Missing Supabase server environment variables");
  }

  return createClient<Database>(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

export const PRODUCT_CARD_SELECT =
  "id, slug, name_bn, name_en, short_description_bn, short_description_en, price, compare_at_price, stock, badge_bn, badge_en, rating, review_count, brand, sku, sort_order, category_id, subcategory_id, product_images(url, alt_bn, alt_en, sort_order)";

export type RawProductCard = {
  id: string;
  slug: string;
  name_bn: string;
  name_en: string;
  short_description_bn: string | null;
  short_description_en: string | null;
  price: number | string;
  compare_at_price: number | string | null;
  stock: number;
  badge_bn: string | null;
  badge_en: string | null;
  rating: number | string;
  review_count: number;
  brand: string | null;
  sku: string | null;
  sort_order?: number;
  category_id?: string;
  subcategory_id?: string | null;
  product_images: Array<{
    url: string;
    alt_bn: string | null;
    alt_en: string | null;
    sort_order: number;
  }> | null;
};

export type ProductCard = {
  id: string;
  slug: string;
  nameBn: string;
  nameEn: string;
  shortBn: string | null;
  shortEn: string | null;
  price: number;
  compareAtPrice: number | null;
  stock: number;
  badgeBn: string | null;
  badgeEn: string | null;
  rating: number;
  reviewCount: number;
  brand: string | null;
  sku: string | null;
  image: string | null;
  imageAltBn: string | null;
  imageAltEn: string | null;
};

export function toProductCard(row: RawProductCard): ProductCard {
  const images = [...(row.product_images ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  const first = images[0];
  return {
    id: row.id,
    slug: row.slug,
    nameBn: row.name_bn,
    nameEn: row.name_en,
    shortBn: row.short_description_bn,
    shortEn: row.short_description_en,
    price: Number(row.price),
    compareAtPrice: row.compare_at_price == null ? null : Number(row.compare_at_price),
    stock: row.stock,
    badgeBn: row.badge_bn,
    badgeEn: row.badge_en,
    rating: Number(row.rating),
    reviewCount: row.review_count,
    brand: row.brand,
    sku: row.sku,
    image: first?.url ?? null,
    imageAltBn: first?.alt_bn ?? null,
    imageAltEn: first?.alt_en ?? null,
  };
}
