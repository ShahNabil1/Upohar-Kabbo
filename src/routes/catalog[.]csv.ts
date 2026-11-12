import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

import { fetchCatalogFeed } from "@/lib/catalog-feed.server";

const cell = (v: string | number | null) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const HEADER = [
  "id",
  "item_group_id",
  "title",
  "description",
  "availability",
  "condition",
  "price",
  "sale_price",
  "sale_price_effective_date",
  "link",
  "mobile_link",
  "image_link",
  "additional_image_link",
  "brand",
  "mpn",
  "identifier_exists",
  "google_product_category",
  "fb_product_category",
  "product_type",
  "quantity_to_sell_on_facebook",
  "inventory",
  "shipping",
  "shipping_label",
  "product_rating",
  "number_of_ratings",
  "offer_disclaimer",
  "offer_disclaimer_url",
  "custom_label_0",
  "custom_label_1",
  "custom_label_2",
  "custom_label_3",
  "custom_label_4",
  "product_category_link",
];

/** Same rows as /catalog.xml in the CSV shape TikTok & Google also accept. */
export const Route = createFileRoute("/catalog.csv")({
  server: {
    handlers: {
      GET: async () => {
        const items = await fetchCatalogFeed();
        const lines = [HEADER.join(",")];

        for (const p of items) {
          lines.push(
            [
              p.id,
              p.itemGroupId,
              p.title,
              p.description,
              p.availability,
              p.condition,
              `${p.price.toFixed(2)} BDT`,
              p.salePrice !== null ? `${p.salePrice.toFixed(2)} BDT` : "",
              p.salePriceEffectiveDate ?? "",
              p.link,
              p.mobileLink ?? "",
              p.imageLink ?? "",
              p.additionalImages.join(","),
              p.brand,
              p.mpn,
              "no",
              p.googleProductCategory,
              p.fbProductCategory,
              p.productType,
              p.quantity,
              p.quantity,
              p.shipping,
              p.shippingLabel,
              p.ratingAverage ?? "",
              p.ratingCount || "",
              p.offerDisclaimer ?? "",
              p.offerDisclaimerUrl ?? "",
              p.variantLabel ?? "",
              p.kind,
              p.categorySlug ?? "",
              p.promotionSlugs.join("|"),
              p.subcategorySlug ?? "",
              p.categoryLink ?? "",
            ]
              .map(cell)
              .join(","),
          );
        }

        return new Response(`\uFEFF${lines.join("\n")}`, {
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
