import { Link, createFileRoute, notFound } from "@tanstack/react-router";

import { getSubcategoryPage } from "@/lib/catalog.functions";
import type { SubcategoryPageData } from "@/lib/types";
import { useLang } from "@/lib/language-context";
import { pick, tr } from "@/lib/i18n";
import { ProductGrid } from "@/components/site/product-card";
import { NotFoundView } from "@/components/site/not-found-view";
import { absoluteUrl, pageTitle } from "@/lib/site";
import { Breadcrumbs, Section } from "@/components/site/ui";
import { RichText } from "@/components/site/rich-text";
import { richTextToPlain } from "@/lib/rich-text";
import { useViewItemList } from "@/lib/tracking-items";

export const Route = createFileRoute("/c/$category/$subcategory")({
  loader: async ({ params }): Promise<SubcategoryPageData> => {
    const data = await getSubcategoryPage({
      data: { category: params.category, subcategory: params.subcategory },
    });
    if (!data) throw notFound();
    return data;
  },
  head: ({ params, loaderData }) => {
    if (!loaderData) {
      return { meta: [{ title: "পাওয়া যায়নি" }, { name: "robots", content: "noindex" }] };
    }
    const s = loaderData.subcategory;
    const c = loaderData.category;
    const title = s.meta_title || pageTitle(`${s.name_bn} — ${c.name_bn}`);
    const description =
      s.meta_description ||
      richTextToPlain(s.description_bn) ||
      `${s.name_bn} — ${c.name_bn} ক্যাটাগরির পণ্য, সারা দেশে ক্যাশ অন ডেলিভারি।`;
    const url = `/c/${params.category}/${params.subcategory}`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: url },
        ...(s.image_url ? [{ property: "og:image", content: s.image_url }] : []),
        ...(s.image_url ? [{ name: "twitter:image", content: s.image_url }] : []),
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "হোম", item: absoluteUrl("/") },
              {
                "@type": "ListItem",
                position: 2,
                name: c.name_bn,
                item: absoluteUrl(`/c/${params.category}`),
              },
              { "@type": "ListItem", position: 3, name: s.name_bn, item: absoluteUrl(url) },
            ],
          }),
        },
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
      ],
    };
  },
  notFoundComponent: () => <NotFoundView />,
  component: SubcategoryPage,
});

function SubcategoryPage() {
  const { lang } = useLang();
  const { category, subcategory, subcategories, products } =
    Route.useLoaderData() as SubcategoryPageData;

  const catName = pick(lang, category.name_bn, category.name_en);
  const subName = pick(lang, subcategory.name_bn, subcategory.name_en);
  const description = pick(lang, subcategory.description_bn, subcategory.description_en);
  useViewItemList(`${category.name_en} / ${subcategory.name_en}`, products, subcategory.name_en);

  return (
    <Section>
      <Breadcrumbs
        items={[
          { label: tr(lang, "home"), to: "/" },
          { label: catName, to: "/c/$category", params: { category: category.slug } },
          { label: subName },
        ]}
      />
      <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">{subName}</h1>
      {description ? <RichText html={description} className="mt-3 max-w-3xl" /> : null}

      {subcategories.length > 1 ? (
        <div className="mt-6 flex flex-wrap gap-2">
          {subcategories.map((s) => (
            <Link
              key={s.id}
              to="/c/$category/$subcategory"
              params={{ category: category.slug, subcategory: s.slug }}
              activeProps={{ className: "border-primary text-primary" }}
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
