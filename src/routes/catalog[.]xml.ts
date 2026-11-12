import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

import { fetchCatalogFeed } from "@/lib/catalog-feed.server";
import { SITE_URL } from "@/lib/site";

function esc(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Google Merchant / Meta Catalog / TikTok Catalog all read this RSS 2.0 feed.
 * One row per purchasable SKU — only products with their own page (singles and
 * combos) plus every active variant.
 */
export const Route = createFileRoute("/catalog.xml")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // Optional per-category feeds: /catalog.xml?category=<slug>[&subcategory=<slug>]
        const q = new URL(request.url).searchParams;
        const cat = q.get("category")?.trim().toLowerCase() || null;
        const sub = q.get("subcategory")?.trim().toLowerCase() || null;
        const items = (await fetchCatalogFeed()).filter(
          (p) =>
            (!cat || p.categorySlug?.toLowerCase() === cat) &&
            (!sub || p.subcategorySlug?.toLowerCase() === sub),
        );

        const entries = items.map((p) =>
          [
            "    <item>",
            `      <g:id>${esc(p.id)}</g:id>`,
            `      <g:item_group_id>${esc(p.itemGroupId)}</g:item_group_id>`,
            `      <g:title>${esc(p.title)}</g:title>`,
            `      <g:description>${esc(p.description)}</g:description>`,
            `      <g:link>${esc(p.link)}</g:link>`,
            p.mobileLink ? `      <g:mobile_link>${esc(p.mobileLink)}</g:mobile_link>` : null,
            p.imageLink ? `      <g:image_link>${esc(p.imageLink)}</g:image_link>` : null,
            ...p.additionalImages.map(
              (url) => `      <g:additional_image_link>${esc(url)}</g:additional_image_link>`,
            ),
            `      <g:availability>${p.availability}</g:availability>`,
            `      <g:inventory>${p.quantity}</g:inventory>`,
            `      <g:quantity_to_sell_on_facebook>${p.quantity}</g:quantity_to_sell_on_facebook>`,
            `      <g:price>${p.price.toFixed(2)} BDT</g:price>`,
            p.salePrice !== null
              ? `      <g:sale_price>${p.salePrice.toFixed(2)} BDT</g:sale_price>`
              : null,
            p.salePriceEffectiveDate
              ? `      <g:sale_price_effective_date>${esc(p.salePriceEffectiveDate)}</g:sale_price_effective_date>`
              : null,
            p.offerDisclaimer
              ? `      <g:offer_disclaimer>${esc(p.offerDisclaimer)}</g:offer_disclaimer>`
              : null,
            p.offerDisclaimerUrl
              ? `      <g:offer_disclaimer_url>${esc(p.offerDisclaimerUrl)}</g:offer_disclaimer_url>`
              : null,
            `      <g:condition>${p.condition}</g:condition>`,
            `      <g:brand>${esc(p.brand)}</g:brand>`,
            `      <g:mpn>${esc(p.mpn)}</g:mpn>`,
            `      <g:identifier_exists>no</g:identifier_exists>`,
            `      <g:google_product_category>${esc(p.googleProductCategory)}</g:google_product_category>`,
            `      <g:fb_product_category>${esc(p.fbProductCategory)}</g:fb_product_category>`,
            `      <g:product_type>${esc(p.productType)}</g:product_type>`,
            `      <g:shipping><g:country>BD</g:country><g:service>Home delivery</g:service><g:price>0.00 BDT</g:price></g:shipping>`,
            `      <g:shipping_label>${esc(p.shippingLabel)}</g:shipping_label>`,
            p.ratingAverage !== null
              ? `      <g:product_rating>${p.ratingAverage}</g:product_rating>`
              : null,
            p.ratingCount > 0 ? `      <g:number_of_ratings>${p.ratingCount}</g:number_of_ratings>` : null,
            p.categoryLink
              ? `      <g:product_detail><g:section_name>Category</g:section_name><g:attribute_name>Collection</g:attribute_name><g:attribute_value>${esc(p.productType)}</g:attribute_value></g:product_detail>`
              : null,
            p.comboContents
              ? `      <g:product_detail><g:section_name>Combo</g:section_name><g:attribute_name>যা যা থাকছে</g:attribute_name><g:attribute_value>${esc(p.comboContents)}</g:attribute_value></g:product_detail>`
              : null,
            p.variantLabel ? `      <g:custom_label_0>${esc(p.variantLabel)}</g:custom_label_0>` : null,
            `      <g:custom_label_1>${esc(p.kind)}</g:custom_label_1>`,
            p.categorySlug ? `      <g:custom_label_2>${esc(p.categorySlug)}</g:custom_label_2>` : null,
            p.promotionSlugs.length > 0
              ? `      <g:custom_label_3>${esc(p.promotionSlugs.join("|"))}</g:custom_label_3>`
              : null,
            p.subcategorySlug
              ? `      <g:custom_label_4>${esc(p.subcategorySlug)}</g:custom_label_4>`
              : null,
            p.categoryLink
              ? `      <g:product_category_link>${esc(p.categoryLink)}</g:product_category_link>`
              : null,
            "    </item>",
          ]
            .filter(Boolean)
            .join("\n"),
        );

        const xml = [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">',
          "  <channel>",
          "    <title>Upoharkabbo Product Catalogue</title>",
          `    <link>${SITE_URL}/</link>`,
          "    <description>Curated gift combos and gift boxes for every occasion.</description>",
          ...entries,
          "  </channel>",
          "</rss>",
        ].join("\n");

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml; charset=utf-8",
            "Cache-Control": "public, max-age=900, s-maxage=900",
          },
        });
      },
    },
  },
});
