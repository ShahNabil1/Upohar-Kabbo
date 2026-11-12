import { Link, createFileRoute, notFound } from "@tanstack/react-router";

import { getCategoryPage } from "@/lib/catalog.functions";
import type { CategoryPageData } from "@/lib/types";
import { useLang } from "@/lib/language-context";
import { pick, tr } from "@/lib/i18n";
import { ProductGrid } from "@/components/site/product-card";
import { NotFoundView } from "@/components/site/not-found-view";
import { Breadcrumbs, Section } from "@/components/site/ui";
import { RichText } from "@/components/site/rich-text";
import { richTextToPlain } from "@/lib/rich-text";
import { absoluteUrl, pageTitle } from "@/lib/site";
import { useViewItemList } from "@/lib/tracking-items";

export const Route = createFileRoute("/c/$category/")({
  loader: async ({ params }): Promise<CategoryPageData> => {
    const data = await getCategoryPage({ data: { category: params.category } });
    if (!data) throw notFound();
    return data;
  },
  head: ({ params, loaderData }) => {
    if (!loaderData) {
      return { meta: [{ title: "পাওয়া যায়নি" }, { name: "robots", content: "noindex" }] };
    }
    const c = loaderData.category;
    const title = c.meta_title || pageTitle(c.name_bn);
    const description =
      c.meta_description ||
      richTextToPlain(c.description_bn) ||
      `${c.name_bn} — সেরা দামে অনলাইনে অর্ডার করুন, সারা দেশে ক্যাশ অন ডেলিভারি।`;
    const url = `/c/${params.category}`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: url },
        ...(c.image_url ? [{ property: "og:image", content: c.image_url }] : []),
        ...(c.image_url ? [{ name: "twitter:image", content: c.image_url }] : []),
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: title,
            description,
            url: absoluteUrl(url),
            mainEntity: {
              "@type": "ItemList",
              numberOfItems: loaderData.products.length,
              itemListElement: loaderData.products.map((product, index) => ({
                "@type": "ListItem",
                position: index + 1,
                url: absoluteUrl(`/p/${product.slug}`),
                name: product.nameBn,
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
              { "@type": "ListItem", position: 2, name: c.name_bn, item: absoluteUrl(url) },
            ],
          }),
        },
      ],
    };
  },
  notFoundComponent: () => <NotFoundView />,
  component: CategoryPage,
});

function CategoryPage() {
  const { lang } = useLang();
  const { category, subcategories, products } = Route.useLoaderData() as CategoryPageData;
  const name = pick(lang, category.name_bn, category.name_en);
  const description = pick(lang, category.description_bn, category.description_en);
  useViewItemList(category.name_en, products, category.name_en);

  return (
    <Section>
      <Breadcrumbs items={[{ label: tr(lang, "home"), to: "/" }, { label: name }]} />
      <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">{name}</h1>
      {description ? <RichText html={description} className="mt-3 max-w-3xl" /> : null}

      {subcategories.length > 0 ? (
        <div className="mt-6 flex flex-wrap gap-2">
          {subcategories.map((s) => (
            <Link
              key={s.id}
              to="/c/$category/$subcategory"
              params={{ category: category.slug, subcategory: s.slug }}
              className="rounded-sm border border-border bg-card px-3.5 py-2 text-sm transition-colors hover:border-primary hover:text-primary"
            >
              {pick(lang, s.name_bn, s.name_en)}
            </Link>
          ))}
        </div>
      ) : null}

      <div className="mt-8">
        <ProductGrid products={products} />
      </div>
    </Section>
  );
}
