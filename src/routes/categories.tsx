import { Link, createFileRoute } from "@tanstack/react-router";

import { getLayoutData } from "@/lib/catalog.functions";
import { useLang } from "@/lib/language-context";
import { pick, tr } from "@/lib/i18n";
import { ProductThumb } from "@/components/site/product-card";
import { Breadcrumbs, Section } from "@/components/site/ui";
import { SITE_URL, absoluteUrl, pageTitle } from "@/lib/site";
import type { CategoryWithSubs } from "@/lib/types";

const TITLE = pageTitle("সব ক্যাটাগরি");
const DESCRIPTION =
  "উপহারকাব্য-এর সব গিফট ক্যাটাগরি ও সাব-ক্যাটাগরি এক জায়গায় দেখুন। সারা বাংলাদেশে ক্যাশ অন ডেলিভারি।";

export const Route = createFileRoute("/categories")({
  loader: async () => {
    const data = await getLayoutData();
    return { categories: data.categories as CategoryWithSubs[] };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: `${SITE_URL}/categories` },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/categories` }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: TITLE,
          description: DESCRIPTION,
          url: absoluteUrl("/categories"),
          mainEntity: {
            "@type": "ItemList",
            numberOfItems: loaderData?.categories.length ?? 0,
            itemListElement: (loaderData?.categories ?? []).map((c, i) => ({
              "@type": "ListItem",
              position: i + 1,
              name: c.name_bn,
              url: absoluteUrl(`/c/${c.slug}`),
            })),
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
            { "@type": "ListItem", position: 2, name: "সব ক্যাটাগরি", item: absoluteUrl("/categories") },
          ],
        }),
      },
    ],
  }),
  component: AllCategoriesPage,
});

function AllCategoriesPage() {
  const { lang } = useLang();
  const { categories } = Route.useLoaderData() as { categories: CategoryWithSubs[] };

  return (
    <Section>
      <Breadcrumbs items={[{ label: tr(lang, "home"), to: "/" }, { label: tr(lang, "allCategories") }]} />
      <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
        {tr(lang, "allCategories")}
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        {lang === "bn"
          ? "উপহারকাব্যের সব ক্যাটাগরি ঘুরে দেখুন এবং পছন্দের উপহার বেছে নিন।"
          : "Browse every Upoharkabbo category and pick the perfect gift."}
      </p>

      <div className="mt-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {categories.map((c) => (
          <Link
            key={c.id}
            to="/c/$category"
            params={{ category: c.slug }}
            className="group overflow-hidden rounded-lg border border-border bg-card transition-shadow hover:shadow-[var(--shadow-card)]"
          >
            <div className="aspect-16/10 overflow-hidden bg-secondary">
              <ProductThumb
                src={c.image_url}
                alt={pick(lang, c.name_bn, c.name_en)}
                label={pick(lang, c.name_bn, c.name_en)}
                fit="cover"
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
            </div>
            <div className="p-3.5 text-center sm:text-left">
              <h2 className="text-[15px] font-semibold">{pick(lang, c.name_bn, c.name_en)}</h2>
              {c.subcategories.length > 0 ? (
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                  {c.subcategories.map((s) => pick(lang, s.name_bn, s.name_en)).join(" · ")}
                </p>
              ) : null}
            </div>
          </Link>
        ))}
      </div>
    </Section>
  );
}
