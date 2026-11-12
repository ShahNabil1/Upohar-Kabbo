import { Link, createFileRoute, notFound, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";

import { getProductPage } from "@/lib/catalog.functions";
import type { ProductPageData } from "@/lib/types";
import { useLang } from "@/lib/language-context";
import { badgeLabel, discountPercent, formatPrice, pick, tr, formatNumber, toBnDigits } from "@/lib/i18n";
import { ProductGrid, ProductThumb } from "@/components/site/product-card";
import { NotFoundView } from "@/components/site/not-found-view";
import { absoluteUrl, pageTitle } from "@/lib/site";
import { Breadcrumbs, Section } from "@/components/site/ui";
import { AddToCartBar } from "@/components/site/add-to-cart";
import { ComboContents } from "@/components/site/combo-contents";
import { comboItemIdBySku, comboSelectionBySku, variantSelectionBySku } from "@/lib/sku-preselect";
import { cn } from "@/lib/utils";
import { ecommerce, useTrackOnce } from "@/lib/tracking";
import { catalogId } from "@/lib/tracking-items";
import { ImageLightbox, useLightbox } from "@/components/site/image-lightbox";
import { RichText } from "@/components/site/rich-text";
import { richTextToPlain } from "@/lib/rich-text";

export const Route = createFileRoute("/p/$product")({
  loader: async ({ params }): Promise<ProductPageData> => {
    const data = await getProductPage({ data: { slug: params.product } });
    if (!data) throw notFound();
    return data;
  },
  head: ({ params, loaderData }) => {
    if (!loaderData) {
      return { meta: [{ title: "পণ্যটি পাওয়া যায়নি" }, { name: "robots", content: "noindex" }] };
    }
    const p = loaderData.product;
    const image = p.ogImageUrl ?? loaderData.images[0]?.url ?? null;
    const title = p.metaTitle || pageTitle(p.nameBn);
    const description =
      p.metaDescription ||
      richTextToPlain(p.shortBn).slice(0, 300) ||
      `${p.nameBn} — ${formatPrice("bn", p.price)}. সারা দেশে ক্যাশ অন ডেলিভারি।`;
    const url = `/p/${params.product}`;

    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "product" },
        { property: "og:url", content: url },
        ...(image ? [{ property: "og:image", content: image }] : []),
        ...(image ? [{ name: "twitter:image", content: image }] : []),
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Product",
            name: p.nameBn,
            alternateName: p.nameEn,
            description,
            sku: p.sku ?? undefined,
            brand: p.brand ? { "@type": "Brand", name: p.brand } : undefined,
            image: image ? [image] : undefined,
            aggregateRating:
              p.reviewCount > 0
                ? {
                    "@type": "AggregateRating",
                    ratingValue: p.rating,
                    reviewCount: p.reviewCount,
                  }
                : undefined,
            offers: {
              "@type": "Offer",
              price: p.price,
              priceCurrency: "BDT",
              availability:
                p.stock > 0
                  ? "https://schema.org/InStock"
                  : "https://schema.org/OutOfStock",
              url: absoluteUrl(url),
              priceValidUntil: new Date(Date.now() + 1000 * 60 * 60 * 24 * 90)
                .toISOString()
                .slice(0, 10),
              itemCondition: "https://schema.org/NewCondition",
              seller: { "@type": "Organization", name: "Upoharkabbo" },
              shippingDetails: {
                "@type": "OfferShippingDetails",
                shippingDestination: {
                  "@type": "DefinedRegion",
                  addressCountry: "BD",
                },
              },
            },
          }),
        },
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "হোম", item: absoluteUrl("/") },
              ...(loaderData.category
                ? [
                    {
                      "@type": "ListItem",
                      position: 2,
                      name: loaderData.category.name_bn,
                      item: absoluteUrl(`/c/${loaderData.category.slug}`),
                    },
                  ]
                : []),
              {
                "@type": "ListItem",
                position: loaderData.category ? 3 : 2,
                name: p.nameBn,
                item: absoluteUrl(url),
              },
            ],
          }),
        },
        ...(Array.isArray(p.faq) && p.faq.length > 0
          ? [
              {
                type: "application/ld+json",
                children: JSON.stringify({
                  "@context": "https://schema.org",
                  "@type": "FAQPage",
                  mainEntity: p.faq.map((f) => ({
                    "@type": "Question",
                    name: f["question_bn"] ?? f["question"] ?? "",
                    acceptedAnswer: {
                      "@type": "Answer",
                      text: f["answer_bn"] ?? f["answer"] ?? "",
                    },
                  })),
                }),
              },
            ]
          : []),
      ],
    };
  },
  notFoundComponent: () => <NotFoundView />,
  component: ProductPage,
});

function ProductPage() {
  const { lang } = useLang();
  const { product, images, variants, comboItems, category, subcategory, related } =
    Route.useLoaderData() as ProductPageData;
  // Catalogue ads deep-link with ?sku=… so the advertised variant is preselected.
  const search = useSearch({ strict: false }) as { sku?: string };
  const skuParam = typeof search.sku === "string" ? search.sku : undefined;
  const [active, setActive] = useState(0);
  const [selected, setSelected] = useState<Record<string, string>>(() =>
    variantSelectionBySku(skuParam, variants),
  );
  const [comboSelected, setComboSelected] = useState<Record<string, string>>(() =>
    comboSelectionBySku(skuParam, comboItems),
  );
  const highlightedComboId = comboItemIdBySku(skuParam, comboItems);
  // Navigating between catalogue links reuses the component, so re-sync on ?sku= change.
  useEffect(() => {
    setSelected((prev) => ({ ...prev, ...variantSelectionBySku(skuParam, variants) }));
    setComboSelected(comboSelectionBySku(skuParam, comboItems));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skuParam, product.id]);
  const lightbox = useLightbox();
  const galleryImages = images
    .filter((img) => Boolean(img.url))
    .map((img) => ({
    src: img.url,
    alt: pick(lang, img.alt_bn, img.alt_en) || pick(lang, product.nameBn, product.nameEn),
  }));

  const name = pick(lang, product.nameBn, product.nameEn);
  const off = discountPercent(product.price, product.compareAtPrice);
  const short = pick(lang, product.shortBn, product.shortEn);
  const badge = badgeLabel(product.badgeBn, product.badgeEn);

  const groups = new Map<string, typeof variants>();
  for (const v of variants) {
    const key = pick(lang, v.group_name_bn, v.group_name_en);
    const list = groups.get(key) ?? [];
    list.push(v);
    groups.set(key, list);
  }

  const selectedIds = Object.values(selected);
  const activeVariant =
    variants.find((v) => selectedIds.includes(v.id)) ??
    (groups.size === 1 ? (variants.find((variant) => variant.stock > 0) ?? variants[0] ?? null) : null);
  const unitPrice = product.price + Number(activeVariant?.price_delta ?? 0);
  // Catalogue id: variant SKU when a variant is picked, else the product SKU.
  const activeSku = activeVariant?.sku ?? product.sku;
  const categoryName = category?.name_en ?? undefined;

  const viewItem = useMemo(
    () =>
      ecommerce([
        {
          id: catalogId(activeSku, product.slug, product.id),
          name: product.nameEn || product.nameBn,
          category: categoryName,
          variant: activeVariant
            ? `${activeVariant.group_name_en}: ${activeVariant.value_en}`
            : undefined,
          item_group_id: product.slug,
          quantity: 1,
          price: unitPrice,
        },
      ]),
    [activeSku, product, categoryName, activeVariant, unitPrice],
  );
  useTrackOnce("view_item", viewItem);





  return (
    <>
      <Section>
        <Breadcrumbs
          items={[
            { label: tr(lang, "home"), to: "/" },
            ...(category
              ? [
                  {
                    label: pick(lang, category.name_bn, category.name_en),
                    to: "/c/$category",
                    params: { category: category.slug },
                  },
                ]
              : []),
            ...(category && subcategory
              ? [
                  {
                    label: pick(lang, subcategory.name_bn, subcategory.name_en),
                    to: "/c/$category/$subcategory",
                    params: { category: category.slug, subcategory: subcategory.slug },
                  },
                ]
              : []),
            { label: name },
          ]}
        />

        <div className="mt-5 grid gap-8 lg:grid-cols-2">
          <div className="min-w-0">
            <div className="aspect-4/5 overflow-hidden rounded-lg border border-border bg-card">
              <ProductThumb
                src={images[active]?.url ?? null}
                alt={pick(lang, images[active]?.alt_bn, images[active]?.alt_en) || name}
                label={name}
                onClick={
                  images[active]?.url
                    ? () => lightbox.open(galleryImages, active)
                    : undefined
                }
              />
            </div>
            {images.length > 1 ? (
              <div className="mt-3 flex gap-2 overflow-x-auto">
                {images.map((img, i) => (
                  <button
                    key={img.id}
                    type="button"
                    onClick={() => setActive(i)}
                    onMouseEnter={() => setActive(i)}
                    aria-label={`${name} ${i + 1}`}
                    className={cn(
                      "h-16 w-16 shrink-0 cursor-pointer overflow-hidden rounded-sm border",
                      i === active ? "border-primary" : "border-border",
                    )}
                  >
                    <ProductThumb src={img.url} alt="" label={name} />
                  </button>
                ))}

              </div>
            ) : null}
            <ImageLightbox
              images={galleryImages}
              startIndex={lightbox.startIndex}
              isOpen={lightbox.isOpen}
              onClose={lightbox.close}
            />
          </div>

          <div className="min-w-0">
            {badge ? (
              <span className="inline-block rounded-sm bg-primary/10 px-2.5 py-1 text-xs font-semibold uppercase text-primary">
                {badge}
              </span>
            ) : null}
            <h1 className="mt-2 text-2xl font-bold leading-snug tracking-tight sm:text-3xl">
              {name}
            </h1>

            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {product.reviewCount > 0 ? (
                <span>
                  ★ {lang === "bn" ? toBnDigits(product.rating.toFixed(1)) : product.rating.toFixed(1)} ·{" "}
                  {formatNumber(lang, product.reviewCount)} {tr(lang, "reviews")}
                </span>
              ) : null}
              {product.brand ? (
                <span className="font-en">Brand: {product.brand}</span>
              ) : null}
              {product.sku ? (
                <span className="font-en">SKU: {product.sku}</span>
              ) : null}
            </div>

            <RichText html={short} className="mt-4" />

            {product.specs.length > 0 ? (
              <dl className="mt-4 divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
                {product.specs.map((spec, i) => {
                  const label = pick(lang, spec["label_bn"], spec["label_en"]) || spec["label"] || "";
                  const value = pick(lang, spec["value_bn"], spec["value_en"]) || spec["value"] || "";
                  return (
                    <div
                      key={i}
                      className={cn(
                        "gap-2 px-4 py-2.5 text-sm",
                        label ? "grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)]" : "block",
                      )}
                    >
                      {label ? (
                        <dt className="min-w-0 font-semibold text-muted-foreground">{label} :</dt>
                      ) : null}
                      <dd className="min-w-0 font-medium">{value}</dd>
                    </div>
                  );
                })}
              </dl>
            ) : null}

            <div className="mt-5 flex flex-wrap items-baseline gap-3">
              <span className="text-3xl font-bold text-primary">
                {formatPrice(lang, product.price)}
              </span>
              {off > 0 ? (
                <>
                  <span className="text-lg text-muted-foreground line-through">
                    {formatPrice(lang, product.compareAtPrice)}
                  </span>
                  <span className="rounded-full bg-primary px-3 py-1 text-sm font-bold text-primary-foreground shadow-sm">
                    {formatNumber(lang, off)}% {tr(lang, "off")}
                  </span>
                </>
              ) : null}
            </div>

            <p
              className={cn(
                "mt-2 font-en text-sm font-medium",
                product.stock > 0 ? "text-success" : "text-destructive",
              )}
            >
              {product.stock > 0 ? "In Stock" : "Out of Stock"}
            </p>

            {groups.size > 0 ? (
              <div className="mt-6 space-y-4">
                {[...groups.entries()].map(([group, options]) => (
                  <div key={group}>
                    <p className="mb-2 text-sm font-semibold">{group}</p>
                    <div className="flex flex-wrap gap-2">
                      {options.map((opt) => {
                        const label = pick(lang, opt.value_bn, opt.value_en);
                        const isOn = selected[group] === opt.id;
                        const isOutOfStock = opt.stock <= 0;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            disabled={isOutOfStock}
                            aria-pressed={isOn}
                            aria-label={`${label}${isOutOfStock ? " — Out of stock" : ""}`}
                            onClick={() => {
                              if (isOutOfStock) return;
                              setSelected((prev) => ({ ...prev, [group]: opt.id }));
                            }}
                            className={cn(
                              "relative isolate overflow-hidden rounded-sm border px-3.5 py-2 text-sm transition-[color,background-color,border-color,box-shadow,transform] duration-200 ease-out motion-reduce:transition-none",
                              !isOutOfStock && "cursor-pointer hover:-translate-y-0.5 hover:shadow-sm active:translate-y-0 active:scale-[0.97]",
                              isOn
                                ? "border-primary bg-primary text-primary-foreground shadow-sm"
                                : "border-border bg-card hover:border-primary hover:bg-primary/5",
                              isOutOfStock &&
                                "cursor-not-allowed border-border bg-muted text-muted-foreground opacity-65 after:absolute after:left-[-12%] after:top-1/2 after:h-px after:w-[124%] after:-rotate-[22deg] after:bg-destructive after:content-['']",
                            )}
                          >
                            <span className="relative z-10">{label}</span>
                            {Number(opt.price_delta) !== 0 ? (
                              <span className="ml-1 text-xs text-muted-foreground">
                                {Number(opt.price_delta) > 0 ? "+" : ""}
                                {formatPrice(lang, opt.price_delta)}
                              </span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            <AddToCartBar
              className="mt-6"
              stock={activeVariant ? activeVariant.stock : product.stock}
              item={{
                productId: product.id,
                slug: product.slug,
                nameBn: product.nameBn,
                nameEn: product.nameEn,
                image: images[0]?.url ?? null,
                price: unitPrice,
                stock: activeVariant ? activeVariant.stock : product.stock,
                sku: activeSku,
                category: categoryName ?? null,
                variantId: activeVariant?.id ?? null,
                variantLabelBn: activeVariant
                  ? `${activeVariant.group_name_bn}: ${activeVariant.value_bn}`
                  : null,
                variantLabelEn: activeVariant
                  ? `${activeVariant.group_name_en}: ${activeVariant.value_en}`
                  : null,
                // Every child of the combo travels with the cart line, even the
                // ones the customer never picks a variant for.
                comboSelections: comboItems.map((comboItem) => {
                  const variant =
                    comboItem.variants.find((option) => option.id === comboSelected[comboItem.id]) ??
                    comboItem.variants[0];
                  return {
                    itemId: comboItem.itemId,
                    itemNameBn: comboItem.nameBn,
                    itemNameEn: comboItem.nameEn,
                    quantity: comboItem.quantity,
                    variantId: variant?.id ?? null,
                    variantLabelBn: variant ? `${variant.groupNameBn}: ${variant.valueBn}` : null,
                    variantLabelEn: variant ? `${variant.groupNameEn}: ${variant.valueEn}` : null,
                    sku: variant?.sku ?? null,
                  };
                }),
              }}
            />

            <div className="mt-7 rounded-lg border border-border bg-surface p-4">
              <p className="text-sm font-semibold">{tr(lang, "cod")}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {lang === "bn"
                  ? "পণ্য হাতে পেয়ে টাকা পরিশোধ করুন। ঢাকার ভেতরে ১-২ দিন, বাইরে ২-৩ দিন।"
                  : "Pay when the parcel reaches you. 1-2 days inside Dhaka, 2-3 days elsewhere."}
              </p>
            </div>
          </div>
        </div>

        <ComboContents items={comboItems} selected={comboSelected} highlightId={highlightedComboId} onSelect={(itemId, variantId) =>
          setComboSelected((current) => ({ ...current, [itemId]: variantId }))
        } />




      </Section>

      {related.length > 0 ? (
        <Section title="Related products">
          <ProductGrid products={related} />
        </Section>
      ) : null}

      {category ? (
        <div className="mx-auto max-w-6xl px-4 pb-10">
          <Link
            to="/c/$category"
            params={{ category: category.slug }}
            className="group flex items-center justify-between gap-4 rounded-2xl bg-primary px-5 py-4 text-primary-foreground shadow-lg shadow-primary/25 transition-transform hover:scale-[1.02] active:scale-[0.98] sm:px-6"
          >
            <span className="font-solaiman text-lg font-bold leading-snug sm:text-xl">
              আরও গিফট কম্বো দেখতে
            </span>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-foreground/20 backdrop-blur-sm transition-transform group-hover:translate-x-1 sm:h-11 sm:w-11">
              <ArrowRight className="h-5 w-5 text-primary-foreground sm:h-6 sm:w-6" />
            </span>
          </Link>
        </div>
      ) : null}
    </>
  );
}
