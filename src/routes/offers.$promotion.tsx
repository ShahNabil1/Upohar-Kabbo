import { SmartImage } from "@/components/site/smart-image";
import { createFileRoute, notFound } from "@tanstack/react-router";

import { getPromotionPage } from "@/lib/catalog.functions";
import type { PromotionPageData } from "@/lib/types";
import { useLang } from "@/lib/language-context";
import { pick, tr } from "@/lib/i18n";
import { ProductGrid } from "@/components/site/product-card";
import { NotFoundView } from "@/components/site/not-found-view";
import { Breadcrumbs, Section } from "@/components/site/ui";
import { absoluteUrl, pageTitle } from "@/lib/site";
import { useViewItemList } from "@/lib/tracking-items";

export const Route = createFileRoute("/offers/$promotion")({
  loader: async ({ params }): Promise<PromotionPageData> => {
    const data = await getPromotionPage({ data: { slug: params.promotion } });
    if (!data) throw notFound();
    return data;
  },
  head: ({ params, loaderData }) => {
    if (!loaderData) {
      return { meta: [{ title: "অফারটি পাওয়া যায়নি" }, { name: "robots", content: "noindex" }] };
    }
    const p = loaderData.promotion;
    const title = p.metaTitle || pageTitle(p.titleBn);
    const description = p.metaDescription || p.subtitleBn || `${p.titleBn} — সীমিত সময়ের অফার।`;
    const url = absoluteUrl(`/offers/${params.promotion}`);
    const empty = (loaderData.products ?? []).length === 0;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: url },
        { property: "og:type", content: "website" },
        ...(p.bannerUrl ? [{ property: "og:image", content: p.bannerUrl }] : []),
        ...(p.bannerUrl ? [{ name: "twitter:image", content: p.bannerUrl }] : []),
        // An offer with no products is a thin page — don't index it yet.
        ...(empty ? [{ name: "robots", content: "noindex, follow" }] : []),
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },

  notFoundComponent: () => <NotFoundView />,
  component: PromotionPage,
});

function PromotionPage() {
  const { lang } = useLang();
  const { promotion, products } = Route.useLoaderData() as PromotionPageData;
  const title = pick(lang, promotion.titleBn, promotion.titleEn);
  const subtitle = pick(lang, promotion.subtitleBn, promotion.subtitleEn);
  useViewItemList(promotion.titleEn, products);

  return (
    <Section>
      <Breadcrumbs
        items={[
          { label: tr(lang, "home"), to: "/" },
          { label: tr(lang, "offers"), to: "/offers" },
          { label: title },
        ]}
      />
      <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
      {subtitle ? <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p> : null}

      {promotion.bannerUrl ? (
        <SmartImage
          src={promotion.bannerUrl}
          alt={title}
          baseWidth={1200}
          className="mt-5 aspect-16/6 w-full rounded-lg border border-border object-cover"
        />
      ) : null}

      <div className="mt-8">
        <ProductGrid products={products} />
      </div>
    </Section>
  );
}
