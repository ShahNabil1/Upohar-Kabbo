import type { CategoryRow, SettingsMap, SettingValue, SubcategoryRow } from "./types";
import {
  PRODUCT_CARD_SELECT,
  createPublicServerClient,
  toProductCard,
  type ProductCard,
  type RawProductCard,
} from "./supabase-public";

const CATEGORY_SELECT =
  "id, slug, name_bn, name_en, description_bn, description_en, image_url, meta_title, meta_description, sort_order, is_active, is_featured, show_in_header";
const SUBCATEGORY_SELECT =
  "id, category_id, slug, name_bn, name_en, description_bn, description_en, image_url, meta_title, meta_description, sort_order, is_active";

function cards(rows: unknown): ProductCard[] {
  return ((rows ?? []) as RawProductCard[]).map(toProductCard);
}

export async function fetchHome() {
  const db = createPublicServerClient();

  const [settingsRes, categoriesRes, subcategoriesRes, promoRes, featuredRes, faqRes] =
    await Promise.all([
      db.from("site_settings").select("key, value"),
      db.from("categories").select(CATEGORY_SELECT).eq("is_active", true).order("sort_order"),
      db.from("subcategories").select(SUBCATEGORY_SELECT).eq("is_active", true).order("sort_order"),
      db
        .from("promotions")
        .select(
          `id, slug, title_bn, title_en, subtitle_bn, subtitle_en, type, banner_url, sort_order,
           promotion_products(sort_order, products(${PRODUCT_CARD_SELECT}))`,
        )
        .eq("show_on_home", true)
        .order("sort_order"),
      db
        .from("products")
        .select(PRODUCT_CARD_SELECT)
        .eq("is_active", true)
        .neq("kind", "component")
        .order("sort_order")
        .limit(12),
      db.from("faqs").select("id, question_bn, question_en, answer_bn, answer_en").order("sort_order"),
    ]);

  const settings: SettingsMap = {};
  for (const row of settingsRes.data ?? []) {
    settings[row.key] = (row.value ?? {}) as Record<string, SettingValue>;
  }

  const subcategories = (subcategoriesRes.data ?? []) as SubcategoryRow[];
  const categories = ((categoriesRes.data ?? []) as CategoryRow[]).map((c) => ({
    ...c,
    subcategories: subcategories.filter((s) => s.category_id === c.id),
  }));

  const promotions = (promoRes.data ?? []).map((p) => {
    const links = (p.promotion_products ?? []) as Array<{
      sort_order: number;
      products: RawProductCard | null;
    }>;
    return {
      id: p.id,
      slug: p.slug,
      titleBn: p.title_bn,
      titleEn: p.title_en,
      subtitleBn: p.subtitle_bn,
      subtitleEn: p.subtitle_en,
      type: p.type,
      bannerUrl: p.banner_url,
      products: links
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((l) => l.products)
        .filter((x): x is RawProductCard => Boolean(x))
        .map(toProductCard),
    };
  });

  return {
    settings,
    categories,
    promotions: promotions.filter((p) => p.products.length > 0),
    featured: cards(featuredRes.data),
    faqs: faqRes.data ?? [],
  };
}

export async function fetchLayoutData() {
  const db = createPublicServerClient();
  const [settingsRes, categoriesRes, subcategoriesRes] = await Promise.all([
    db.from("site_settings").select("key, value"),
    db.from("categories").select(CATEGORY_SELECT).eq("is_active", true).order("sort_order"),
    db.from("subcategories").select(SUBCATEGORY_SELECT).eq("is_active", true).order("sort_order"),
  ]);

  const settings: SettingsMap = {};
  for (const row of settingsRes.data ?? []) {
    settings[row.key] = (row.value ?? {}) as Record<string, SettingValue>;
  }

  const subcategories = (subcategoriesRes.data ?? []) as SubcategoryRow[];
  const categories = ((categoriesRes.data ?? []) as CategoryRow[]).map((c) => ({
    ...c,
    subcategories: subcategories.filter((s) => s.category_id === c.id),
  }));

  return { settings, categories };
}

export async function fetchLegalPage(key: "about" | "legal_privacy" | "legal_terms" | "legal_returns") {
  const db = createPublicServerClient();
  const { data } = await db.from("site_settings").select("value").eq("key", key).maybeSingle();
  const value = (data?.value ?? {}) as Record<string, unknown>;
  const stringValue = (field: string) => (typeof value[field] === "string" ? value[field] : "");
  return {
    title: stringValue("title"),
    meta_title: stringValue("meta_title"),
    meta_description: stringValue("meta_description"),
    content: stringValue("content"),
  };
}

export async function fetchCategoryPage(slug: string) {
  const db = createPublicServerClient();
  const { data: category } = await db
    .from("categories")
    .select(CATEGORY_SELECT)
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  if (!category) return null;

  const [subRes, productRes] = await Promise.all([
    db
      .from("subcategories")
      .select(SUBCATEGORY_SELECT)
      .eq("category_id", category.id)
      .eq("is_active", true)
      .order("sort_order"),
    db
      .from("products")
      .select(PRODUCT_CARD_SELECT)
      .eq("category_id", category.id)
      .eq("is_active", true)
      .neq("kind", "component")
      .order("sort_order"),
  ]);

  return {
    category: category as CategoryRow,
    subcategories: (subRes.data ?? []) as SubcategoryRow[],
    products: cards(productRes.data),
  };
}

export async function fetchSubcategoryPage(categorySlug: string, subcategorySlug: string) {
  const db = createPublicServerClient();
  const { data: category } = await db
    .from("categories")
    .select(CATEGORY_SELECT)
    .eq("slug", categorySlug)
    .eq("is_active", true)
    .maybeSingle();

  if (!category) return null;

  const { data: subcategory } = await db
    .from("subcategories")
    .select(SUBCATEGORY_SELECT)
    .eq("category_id", category.id)
    .eq("slug", subcategorySlug)
    .eq("is_active", true)
    .maybeSingle();

  if (!subcategory) return null;

  const [subsRes, productRes] = await Promise.all([
    db
      .from("subcategories")
      .select(SUBCATEGORY_SELECT)
      .eq("category_id", category.id)
      .eq("is_active", true)
      .order("sort_order"),
    db
      .from("products")
      .select(PRODUCT_CARD_SELECT)
      .eq("subcategory_id", subcategory.id)
      .eq("is_active", true)
      .neq("kind", "component")
      .order("sort_order"),
  ]);

  return {
    category: category as CategoryRow,
    subcategory: subcategory as SubcategoryRow,
    subcategories: (subsRes.data ?? []) as SubcategoryRow[],
    products: cards(productRes.data),
  };
}

export type ComboContentItem = {
  id: string;
  itemId: string;
  /** Component product's own SKU — catalogue rows for variant-less items use it. */
  itemSku: string | null;
  quantity: number;
  isFree: boolean;
  nameBn: string;
  nameEn: string;
  image: string | null;
  variants: Array<{
    id: string;
    groupNameBn: string;
    groupNameEn: string;
    valueBn: string;
    valueEn: string;
    sku: string | null;
  }>;
};

async function fetchComboContents(
  db: ReturnType<typeof createPublicServerClient>,
  comboId: string,
): Promise<ComboContentItem[]> {
  const { data } = await db
    .from("combo_items")
    .select(
      `id, quantity, is_free, sort_order, label_bn, label_en,
       products!combo_items_item_id_fkey(
         id, name_bn, name_en, sku,
         product_images(url, sort_order),
          product_variants(id, group_name_bn, group_name_en, value_bn, value_en, sku, is_active, sort_order)
       )`,
    )
    .eq("combo_id", comboId)
    .order("sort_order");

  return (data ?? []).map((row) => {
    const item = row.products as unknown as {
      id: string;
      name_bn: string;
      name_en: string;
      sku: string | null;
      product_images: Array<{ url: string; sort_order: number }> | null;
      product_variants: Array<{
        id: string;
        group_name_bn: string;
        group_name_en: string;
        value_bn: string;
        value_en: string;
        sku: string | null;
        is_active: boolean;
        sort_order: number;
      }> | null;
    } | null;
    const image = [...(item?.product_images ?? [])].sort(
      (a, b) => a.sort_order - b.sort_order,
    )[0];
    return {
      id: row.id,
      itemId: item?.id ?? "",
      itemSku: item?.sku ?? null,
      quantity: row.quantity,
      isFree: row.is_free,
      nameBn: row.label_bn || item?.name_bn || "",
      nameEn: row.label_en || item?.name_en || item?.name_bn || "",
      image: image?.url ?? null,
      variants: [...(item?.product_variants ?? [])]
        .filter((v) => v.is_active)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((v) => ({
          id: v.id,
          groupNameBn: v.group_name_bn,
          groupNameEn: v.group_name_en,
          valueBn: v.value_bn,
          valueEn: v.value_en,
          sku: v.sku,
        })),
    };
  });
}

/**
 * Default combo selections for a product: EVERY child item of the combo, with
 * the first available variant preselected. Items without variants are still
 * included (variantId null) so the full package list always travels with the
 * cart line, no matter which page added it.
 */
export async function fetchComboSelections(productId: string) {
  const db = createPublicServerClient();
  const items = await fetchComboContents(db, productId);
  return items.map((item) => {
    const variant = item.variants[0];
    return {
      itemId: item.itemId,
      itemNameBn: item.nameBn,
      itemNameEn: item.nameEn,
      quantity: item.quantity,
      variantId: variant?.id ?? null,
      variantLabelBn: variant ? `${variant.groupNameBn}: ${variant.valueBn}` : null,
      variantLabelEn: variant ? `${variant.groupNameEn}: ${variant.valueEn}` : null,
      sku: variant?.sku ?? null,
    };
  });
}

export async function fetchProduct(slug: string) {
  const db = createPublicServerClient();
  const { data: product } = await db
    .from("products")
    .select(
      `id, slug, kind, name_bn, name_en, short_description_bn, short_description_en,
       description_bn, description_en, specs, faq, price, compare_at_price, stock, sku, brand,
       badge_bn, badge_en, rating, review_count, meta_title, meta_description, og_image_url,
       category_id, subcategory_id,
       product_images(id, url, alt_bn, alt_en, sort_order),
       product_variants(id, group_name_bn, group_name_en, value_bn, value_en, sku, price_delta, stock, sort_order, is_active)`,
    )
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  // Combo sub-items never get a public product page.
  if (!product || product.kind === "component") return null;

  const [catRes, subRes, relatedRes, landingRes, comboItems] = await Promise.all([
    db.from("categories").select(CATEGORY_SELECT).eq("id", product.category_id).maybeSingle(),
    product.subcategory_id
      ? db
          .from("subcategories")
          .select(SUBCATEGORY_SELECT)
          .eq("id", product.subcategory_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    db
      .from("products")
      .select(PRODUCT_CARD_SELECT)
      .eq("category_id", product.category_id)
      .eq("is_active", true)
      .neq("kind", "component")
      .neq("id", product.id)
      .order("sort_order")
      .limit(4),
    db
      .from("landing_pages")
      .select("slug")
      .eq("product_id", product.id)
      .eq("is_active", true)
      .maybeSingle(),
    product.kind === "combo"
      ? fetchComboContents(db, product.id)
      : Promise.resolve([] as ComboContentItem[]),
  ]);

  // Same-category picks first; top up with other products so suggestions are never empty.
  let relatedRows = [...(relatedRes.data ?? [])];
  if (relatedRows.length < 4) {
    const exclude = [product.id, ...relatedRows.map((r: any) => r.id)];
    const { data: fillers } = await db
      .from("products")
      .select(PRODUCT_CARD_SELECT)
      .eq("is_active", true)
      .neq("kind", "component")
      .not("id", "in", `(${exclude.join(",")})`)
      .order("sort_order")
      .limit(4 - relatedRows.length);
    relatedRows = [...relatedRows, ...(fillers ?? [])];
  }

  const images = [...(product.product_images ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  const variants = [...(product.product_variants ?? [])]
    .filter((v) => v.is_active)
    .sort((a, b) => a.sort_order - b.sort_order);

  return {
    product: {
      id: product.id,
      slug: product.slug,
      kind: product.kind,
      nameBn: product.name_bn,
      nameEn: product.name_en,
      shortBn: product.short_description_bn,
      shortEn: product.short_description_en,
      descriptionBn: product.description_bn,
      descriptionEn: product.description_en,
      specs: (product.specs ?? []) as Array<Record<string, string>>,
      faq: (product.faq ?? []) as Array<Record<string, string>>,
      price: Number(product.price),
      compareAtPrice: product.compare_at_price == null ? null : Number(product.compare_at_price),
      stock: product.stock,
      sku: product.sku,
      brand: product.brand,
      badgeBn: product.badge_bn,
      badgeEn: product.badge_en,
      rating: Number(product.rating),
      reviewCount: product.review_count,
      metaTitle: product.meta_title,
      metaDescription: product.meta_description,
      ogImageUrl: product.og_image_url ?? images[0]?.url ?? null,
    },
    images,
    variants,
    comboItems,
    category: (catRes.data ?? null) as CategoryRow | null,
    subcategory: (subRes.data ?? null) as SubcategoryRow | null,
    related: cards(relatedRows),
    landingSlug: landingRes.data?.slug ?? null,
  };
}

export async function fetchPromotion(slug: string) {
  const db = createPublicServerClient();
  const { data: promotion } = await db
    .from("promotions")
    .select(
      `id, slug, title_bn, title_en, subtitle_bn, subtitle_en, banner_url, meta_title, meta_description,
       promotion_products(sort_order, products(${PRODUCT_CARD_SELECT}))`,
    )
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  if (!promotion) return null;

  const links = (promotion.promotion_products ?? []) as Array<{
    sort_order: number;
    products: RawProductCard | null;
  }>;

  return {
    promotion: {
      id: promotion.id,
      slug: promotion.slug,
      titleBn: promotion.title_bn,
      titleEn: promotion.title_en,
      subtitleBn: promotion.subtitle_bn,
      subtitleEn: promotion.subtitle_en,
      bannerUrl: promotion.banner_url,
      metaTitle: promotion.meta_title,
      metaDescription: promotion.meta_description,
    },
    products: links
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((l) => l.products)
      .filter((x): x is RawProductCard => Boolean(x))
      .map(toProductCard),
  };
}

export async function fetchPromotionList() {
  const db = createPublicServerClient();
  const { data } = await db
    .from("promotions")
    .select("id, slug, title_bn, title_en, subtitle_bn, subtitle_en, banner_url")
    .eq("is_active", true)
    .order("sort_order");
  return data ?? [];
}

export async function fetchFaqs() {
  const db = createPublicServerClient();
  const [faqRes, seoRes] = await Promise.all([
    db
      .from("faqs")
      .select("id, question_bn, question_en, answer_bn, answer_en")
      .eq("is_active", true)
      .order("sort_order"),
    db.from("site_settings").select("value").eq("key", "faq_seo").maybeSingle(),
  ]);
  const seoRaw = (seoRes.data?.value ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : "");
  return {
    items: faqRes.data ?? [],
    seo: {
      metaTitle: str(seoRaw["meta_title"]),
      metaDescription: str(seoRaw["meta_description"]),
      ogImage: str(seoRaw["og_image"]),
    },
  };
}


export async function fetchSearch(query: string) {
  const term = query.trim();
  if (!term) return { query: term, products: [] as ProductCard[] };

  const db = createPublicServerClient();
  const escaped = term.replace(/[%_,()]/g, " ").trim();
  if (!escaped) return { query: term, products: [] as ProductCard[] };

  const { data } = await db
    .from("products")
    .select(PRODUCT_CARD_SELECT)
    .eq("is_active", true)
    .neq("kind", "component")
    .or(
      `name_bn.ilike.%${escaped}%,name_en.ilike.%${escaped}%,brand.ilike.%${escaped}%,sku.ilike.%${escaped}%`,
    )
    .order("sort_order")
    .limit(40);

  return { query: term, products: cards(data) };
}

export async function fetchPopularProducts(limit = 4) {
  const db = createPublicServerClient();
  const { data } = await db
    .from("products")
    .select(PRODUCT_CARD_SELECT)
    .eq("is_active", true)
    .neq("kind", "component")
    .order("review_count", { ascending: false })
    .limit(limit);
  return cards(data);
}

export async function fetchSitemapData() {
  const db = createPublicServerClient();
  const [cats, subs, prods, landings, promos, faqCount] = await Promise.all([
    db.from("categories").select("slug, updated_at").eq("is_active", true),
    db.from("subcategories").select("slug, updated_at, categories(slug)").eq("is_active", true),
    db
      .from("products")
      .select("slug, updated_at")
      .eq("is_active", true)
      .neq("kind", "component"),
    db.from("landing_pages").select("slug, updated_at").eq("is_active", true),
    db
      .from("promotions")
      .select("slug, updated_at, promotion_products(product_id)")
      .eq("is_active", true),
    db.from("faqs").select("id", { count: "exact", head: true }).eq("is_active", true),
  ]);
  const promotions = ((promos.data ?? []) as Array<{
    slug: string;
    updated_at: string;
    promotion_products: Array<{ product_id: string }> | null;
  }>)
    // An offer page with no products is a thin page — keep it out of the sitemap.
    .filter((p) => (p.promotion_products?.length ?? 0) > 0)
    .map((p) => ({ slug: p.slug, updated_at: p.updated_at }));
  return {
    categories: cats.data ?? [],
    subcategories: (subs.data ?? []) as Array<{
      slug: string;
      updated_at: string;
      categories: { slug: string } | null;
    }>,
    products: prods.data ?? [],
    landings: landings.data ?? [],
    promotions,
    faqCount: faqCount.count ?? 0,
  };
}


export { fetchCatalogFeed } from "./catalog-feed.server";


export type { CategoryRow, SubcategoryRow, SettingsMap, SettingValue };

export async function fetchLandingPage(slug: string) {
  const db = createPublicServerClient();
  const { data: landing } = await db
    .from("landing_pages")
    .select(
      "id, slug, product_id, headline_bn, headline_en, subheadline_bn, subheadline_en, content, meta_title, meta_description, og_image_url",
    )
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  if (!landing) return null;

  const { data: product } = await db
    .from("products")
    .select(
      `id, slug, name_bn, name_en, short_description_bn, short_description_en,
       kind, description_bn, description_en, specs, faq, price, compare_at_price, stock, sku, brand,
       rating, review_count,
       product_images(id, url, alt_bn, alt_en, sort_order),
       product_variants(id, group_name_bn, group_name_en, value_bn, value_en, sku, price_delta, stock, sort_order, is_active)`,
    )
    .eq("id", landing.product_id)
    .eq("is_active", true)
    .maybeSingle();

  if (!product) return null;

  const comboItems = product.kind === "combo"
    ? await fetchComboContents(db, product.id)
    : [];

  const images = [...(product.product_images ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  const variants = [...(product.product_variants ?? [])]
    .filter((v) => v.is_active)
    .sort((a, b) => a.sort_order - b.sort_order);

  const content = (landing.content ?? {}) as Record<string, unknown>;
  const blocks = Array.isArray(content["bullets"])
    ? content["bullets"].flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const bullet = item as Record<string, unknown>;
        const bn = typeof bullet["bn"] === "string" ? bullet["bn"] : "";
        const en = typeof bullet["en"] === "string" ? bullet["en"] : "";
        return bn || en ? [{ text_bn: bn || en, text_en: en || bn }] : [];
      })
    : Array.isArray(content["blocks"])
      ? (content["blocks"] as Array<Record<string, string>>)
      : [];
  const rawSeo = (content["seo"] ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const seo = {
    ogTitle: str(rawSeo["ogTitle"]),
    ogDescription: str(rawSeo["ogDescription"]),
    canonicalUrl: str(rawSeo["canonicalUrl"]),
    productJsonLd: rawSeo["productJsonLd"] !== false,
    noindex: rawSeo["noindex"] === true,
  };

  return {
    landing: {
      slug: landing.slug,
      headlineBn: landing.headline_bn,
      headlineEn: landing.headline_en,
      subheadlineBn: landing.subheadline_bn,
      subheadlineEn: landing.subheadline_en,
      metaTitle: landing.meta_title,
      metaDescription: landing.meta_description,
      ogImageUrl: landing.og_image_url,
      seo,
      blocks,
    },

    product: {
      id: product.id,
      slug: product.slug,
      nameBn: product.name_bn,
      nameEn: product.name_en,
      shortBn: product.short_description_bn,
      shortEn: product.short_description_en,
      descriptionBn: product.description_bn,
      descriptionEn: product.description_en,
      specs: (product.specs ?? []) as Array<Record<string, string>>,
      faq: (product.faq ?? []) as Array<Record<string, string>>,
      price: Number(product.price),
      compareAtPrice: product.compare_at_price == null ? null : Number(product.compare_at_price),
      stock: product.stock,
      sku: product.sku,
      brand: product.brand,
      rating: Number(product.rating),
      reviewCount: product.review_count,
    },
    images,
    variants,
    comboItems,
  };
}
