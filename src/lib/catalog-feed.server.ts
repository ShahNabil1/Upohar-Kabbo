/**
 * Dynamic product catalogue feed — Meta Catalog, TikTok Catalog and Google
 * Merchant Center all consume the same normalised rows.
 *
 * Matching rules (must stay 100% aligned with the storefront):
 *  - only products that HAVE a page of their own are rows: singles and combos.
 *    Combo components (sub-products) never get a row — they are not separately
 *    purchasable, so listing them would advertise a page that sells something
 *    else and destroys the matching rate.
 *  - `id` is the SKU whenever one exists, so feed ids equal the SKU stored on
 *    `order_items.sku` — that is what makes catalogue ↔ order matching exact
 *  - variants of the same product share `item_group_id`
 *  - `link` deep-links to the exact variant via `?sku=`, so the landing page
 *    shows the same option/price the feed advertised
 *  - `mobile_link` points at the product's landing page when one is published
 */

import { cdnImage } from "./cdn-image";
import { SITE_URL } from "./site";
import { createPublicServerClient } from "./supabase-public";

export type FeedItem = {
  id: string;
  itemGroupId: string;
  title: string;
  description: string;
  link: string;
  mobileLink: string | null;
  imageLink: string | null;
  additionalImages: string[];
  availability: "in stock" | "out of stock";
  price: number;
  salePrice: number | null;
  brand: string;
  condition: "new";
  productType: string;
  googleProductCategory: string;
  fbProductCategory: string;
  sku: string | null;
  mpn: string;
  quantity: number;
  variantLabel: string | null;
  kind: "single" | "combo";
  categoryName: string;
  categorySlug: string | null;
  subcategoryName: string | null;
  subcategorySlug: string | null;
  categoryLink: string | null;
  promotionSlugs: string[];
  /** ISO window of the running offer, e.g. "2026-08-01T00:00+06:00/2026-08-10T00:00+06:00". */
  salePriceEffectiveDate: string | null;
  offerDisclaimer: string | null;
  offerDisclaimerUrl: string | null;
  ratingAverage: number | null;
  ratingCount: number;
  /** Google/Meta shipping triplet — free nationwide delivery. */
  shipping: string;
  shippingLabel: string;
  /** Comma separated list of what is inside a combo (empty for singles). */
  comboContents: string;
};

type RawVariant = {
  id: string;
  group_name_bn: string;
  group_name_en: string;
  value_bn: string;
  value_en: string;
  sku: string | null;
  price_delta: number | string;
  stock: number;
  sort_order: number;
  is_active: boolean;
};

type RawProduct = {
  id: string;
  slug: string;
  kind: "single" | "combo" | "component";
  name_bn: string;
  name_en: string;
  short_description_bn: string | null;
  short_description_en: string | null;
  description_bn: string | null;
  description_en: string | null;
  price: number | string;
  compare_at_price: number | string | null;
  stock: number;
  sku: string | null;
  brand: string | null;
  rating: number | string | null;
  review_count: number | null;
  is_active: boolean;
  categories: { slug: string; name_en: string; name_bn: string } | null;
  subcategories: { slug: string; name_en: string; name_bn: string } | null;
  product_images: Array<{ url: string; sort_order: number }> | null;
  product_variants: RawVariant[] | null;
};

const num = (v: number | string | null | undefined) => Number(v ?? 0) || 0;

/**
 * Google product taxonomy + Meta category paths per storefront category slug.
 * Google list: https://www.google.com/basepages/producttype/taxonomy-with-ids.en-US.txt
 * Meta list:   https://www.facebook.com/products/categories/en_US.txt
 */
const TAXONOMY: Record<string, { google: string; fb: string }> = {
  "gift-combo": {
    google: "Apparel & Accessories > Clothing > Shirts & Tops",
    fb: "apparel & accessories > clothing > shirts & tops",
  },
  saree: { google: "Apparel & Accessories > Clothing > Dresses", fb: "apparel & accessories > clothing > dresses" },
  panjabi: { google: "Apparel & Accessories > Clothing > Shirts & Tops", fb: "apparel & accessories > clothing > shirts & tops" },
  jewelry: { google: "Apparel & Accessories > Jewelry", fb: "apparel & accessories > jewelry" },
  cosmetics: { google: "Health & Beauty > Personal Care > Cosmetics", fb: "health & beauty > beauty > makeup" },
  watch: { google: "Apparel & Accessories > Jewelry > Watches", fb: "apparel & accessories > jewelry > watches" },
  chocolate: { google: "Food, Beverages & Tobacco > Food Items > Candy & Chocolate", fb: "food & drink > food > candy & chocolate" },
  flower: { google: "Home & Garden > Decor > Artificial Flowers", fb: "home > decor > artificial flowers" },
};

const DEFAULT_TAXONOMY = {
  google: "Apparel & Accessories > Clothing > Shirts & Tops",
  fb: "apparel & accessories > clothing > shirts & tops",
};

const taxonomyFor = (categorySlug: string | null, subcategorySlug: string | null) =>
  (subcategorySlug ? TAXONOMY[subcategorySlug] : undefined) ??
  (categorySlug ? TAXONOMY[categorySlug] : undefined) ??
  DEFAULT_TAXONOMY;

/** Slug-safe fallback id so a missing SKU never collapses two feed rows. */
const fallbackId = (base: string, suffix?: string) =>
  [base, suffix]
    .filter(Boolean)
    .join("-")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90);

const clean = (v: string | null | undefined) =>
  (v ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

/** Feed images go through Cloudflare so crawlers always get a small, valid JPEG-ish file. */
const feedImage = (url: string) =>
  cdnImage(url, { width: 1200, fit: "contain", gravity: "center", quality: 85 });

export async function fetchCatalogFeed(): Promise<FeedItem[]> {
  const db = createPublicServerClient();

  const [{ data: productRows }, { data: comboRows }, { data: landingRows }] = await Promise.all([
    db
      .from("products")
      .select(
        `id, slug, kind, name_bn, name_en, short_description_bn, short_description_en,
         description_bn, description_en, price, compare_at_price, stock, sku, brand, is_active,
         rating, review_count,
         categories(slug, name_en, name_bn), subcategories(slug, name_en, name_bn),
         product_images(url, sort_order),
         product_variants(id, group_name_bn, group_name_en, value_bn, value_en, sku, price_delta, stock, sort_order, is_active)`,
      )
      .eq("is_active", true)
      .order("sort_order"),
    db.from("combo_items").select("combo_id, item_id, quantity, sort_order"),
    db.from("landing_pages").select("product_id, slug, is_active").eq("is_active", true),
  ]);

  // Offer/promotion membership → feed labels + sale window (storefront reads the
  // same rows on /offers, so catalogue and site never disagree).
  const { data: promoRows } = await db
    .from("promotions")
    .select("slug, title_bn, title_en, starts_at, ends_at, is_active, promotion_products(product_id)")
    .eq("is_active", true);

  const nowMs = Date.now();
  const promoBySlug = new Map<
    string,
    { starts_at: string | null; ends_at: string | null; title: string }
  >();
  const promosOf = new Map<string, string[]>();
  for (const promo of (promoRows ?? []) as Array<{
    slug: string;
    title_bn: string;
    title_en: string;
    starts_at: string | null;
    ends_at: string | null;
    promotion_products: Array<{ product_id: string }> | null;
  }>) {
    const started = !promo.starts_at || new Date(promo.starts_at).getTime() <= nowMs;
    const ended = promo.ends_at ? new Date(promo.ends_at).getTime() < nowMs : false;
    if (!started || ended) continue;
    promoBySlug.set(promo.slug, {
      starts_at: promo.starts_at,
      ends_at: promo.ends_at,
      title: clean(promo.title_bn) || clean(promo.title_en) || "অফার",
    });
    for (const link of promo.promotion_products ?? []) {
      const list = promosOf.get(link.product_id) ?? [];
      list.push(promo.slug);
      promosOf.set(link.product_id, list);
    }
  }

  const all = (productRows ?? []) as unknown as RawProduct[];
  const byId = new Map(all.map((p) => [p.id, p]));

  const landingOf = new Map<string, string>();
  for (const lp of (landingRows ?? []) as Array<{ product_id: string; slug: string }>) {
    if (!landingOf.has(lp.product_id)) landingOf.set(lp.product_id, lp.slug);
  }

  /** combo id → human list of the items inside (used as an extra feed detail). */
  const contentsOf = new Map<string, string[]>();
  for (const link of [...((comboRows ?? []) as Array<{
    combo_id: string;
    item_id: string;
    quantity: number;
    sort_order: number;
  }>)].sort((a, b) => a.sort_order - b.sort_order)) {
    const child = byId.get(link.item_id);
    if (!child) continue;
    const list = contentsOf.get(link.combo_id) ?? [];
    const name = clean(child.name_bn) || clean(child.name_en);
    list.push(link.quantity > 1 ? `${name} × ${link.quantity}` : name);
    contentsOf.set(link.combo_id, list);
  }

  // Only sellable pages become feed rows — components live inside combos.
  const products = all.filter((p) => p.kind === "single" || p.kind === "combo");

  const items: FeedItem[] = [];

  for (const p of products) {
    const images = [...(p.product_images ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((i) => i.url)
      .filter(Boolean)
      .map(feedImage);

    const basePath = `${SITE_URL}/p/${p.slug}`;
    const landingSlug = landingOf.get(p.id);
    const mobileLink = landingSlug ? `${SITE_URL}/lp/${landingSlug}` : null;
    const contents = contentsOf.get(p.id) ?? [];
    const description =
      clean(p.short_description_bn) ||
      clean(p.short_description_en) ||
      clean(p.description_bn) ||
      clean(p.description_en) ||
      clean(p.name_bn);

    const categorySlug = p.categories?.slug ?? null;
    const subcategorySlug = p.subcategories?.slug ?? null;
    const categoryName = p.categories?.name_bn || p.categories?.name_en || "গিফট";
    const subcategoryName = p.subcategories?.name_bn || p.subcategories?.name_en || null;
    const productType = [categoryName, subcategoryName].filter(Boolean).join(" > ");
    const categoryLink = categorySlug
      ? `${SITE_URL}/c/${categorySlug}${subcategorySlug ? `/${subcategorySlug}` : ""}`
      : null;
    const taxonomy = taxonomyFor(categorySlug, subcategorySlug);

    const promotionSlugs = promosOf.get(p.id) ?? [];
    const promo = promotionSlugs.map((s) => promoBySlug.get(s)).find(Boolean);
    const salePriceEffectiveDate =
      promo && (promo.starts_at || promo.ends_at)
        ? `${promo.starts_at ?? new Date().toISOString()}/${promo.ends_at ?? "2099-12-31T23:59:59Z"}`
        : null;
    const offerDisclaimer = promo
      ? `${promo.title} — অফার চলাকালীন সময়ে ডিসকাউন্ট প্রযোজ্য, স্টক থাকা সাপেক্ষে।`
      : null;
    const offerDisclaimerUrl = promo ? `${SITE_URL}/offers/${promotionSlugs[0]}` : null;

    const listPrice = num(p.compare_at_price);
    const brand = p.brand || "Upoharkabbo";
    const groupId = p.sku || fallbackId(p.slug);
    const ratingCount = p.review_count ?? 0;
    const ratingAverage = ratingCount > 0 && num(p.rating) > 0 ? Number(num(p.rating).toFixed(1)) : null;

    const variants = [...(p.product_variants ?? [])]
      .filter((v) => v.is_active)
      .sort((a, b) => a.sort_order - b.sort_order);

    const push = (row: {
      id: string;
      title: string;
      price: number;
      compareAt: number;
      stock: number;
      sku: string | null;
      variantLabel: string | null;
    }) => {
      const onSale = row.compareAt > row.price;
      items.push({
        id: row.id,
        itemGroupId: groupId,
        title: row.title,
        description,
        link: row.sku ? `${basePath}?sku=${encodeURIComponent(row.sku)}` : basePath,
        mobileLink:
          mobileLink && row.sku ? `${mobileLink}?sku=${encodeURIComponent(row.sku)}` : mobileLink,
        imageLink: images[0] ?? null,
        additionalImages: images.slice(1, 11),
        availability: row.stock > 0 ? "in stock" : "out of stock",
        price: onSale ? row.compareAt : row.price,
        salePrice: onSale ? row.price : null,
        brand,
        condition: "new",
        productType: productType || "গিফট",
        googleProductCategory: taxonomy.google,
        fbProductCategory: taxonomy.fb,
        sku: row.sku,
        mpn: row.sku || row.id,
        quantity: Math.max(0, row.stock),
        variantLabel: row.variantLabel,
        kind: p.kind as "single" | "combo",
        categoryName,
        categorySlug,
        subcategoryName,
        subcategorySlug,
        categoryLink,
        promotionSlugs,
        salePriceEffectiveDate,
        offerDisclaimer,
        offerDisclaimerUrl,
        ratingAverage,
        ratingCount,
        shipping: "BD:::0.00 BDT",
        shippingLabel: "free_delivery_bd",
        comboContents: contents.join(", "),
      });
    };

    if (variants.length === 0) {
      push({
        id: groupId,
        title: clean(p.name_bn) || clean(p.name_en),
        price: num(p.price),
        compareAt: listPrice,
        stock: p.stock,
        sku: p.sku,
        variantLabel: null,
      });
      continue;
    }

    for (const v of variants) {
      const label = `${clean(v.group_name_bn) || clean(v.group_name_en)}: ${clean(v.value_bn) || clean(v.value_en)}`;
      const price = num(p.price) + num(v.price_delta);
      push({
        id: v.sku || fallbackId(groupId, v.id.slice(0, 8)),
        title: `${clean(p.name_bn) || clean(p.name_en)} — ${label}`,
        price,
        compareAt: listPrice > 0 ? listPrice + num(v.price_delta) : 0,
        stock: v.stock,
        sku: v.sku,
        variantLabel: label,
      });
    }
  }

  // Duplicate ids would silently overwrite rows inside Meta/TikTok catalogues.
  const seen = new Set<string>();
  return items.filter((i) => {
    if (seen.has(i.id)) return false;
    seen.add(i.id);
    return true;
  });
}
