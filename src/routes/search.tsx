import { createFileRoute } from "@tanstack/react-router";

import { searchProducts } from "@/lib/catalog.functions";
import type { SearchData } from "@/lib/types";
import { useLang } from "@/lib/language-context";
import { formatNumber, tr } from "@/lib/i18n";
import { ProductGrid } from "@/components/site/product-card";
import { Breadcrumbs, Section } from "@/components/site/ui";
import { pageTitle } from "@/lib/site";
import { useViewItemList } from "@/lib/tracking-items";
import { pushEvent } from "@/lib/tracking";
import { useEffect } from "react";

export const Route = createFileRoute("/search")({
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search["q"] === "string" ? search["q"] : "",
  }),
  loaderDeps: ({ search }) => ({ q: search.q }),
  loader: async ({ deps }): Promise<SearchData> => searchProducts({ data: { q: deps.q } }),
  head: ({ loaderData }) => {
    const term = loaderData?.query ?? "";
    const title = term ? pageTitle(`“${term}” — খোঁজার ফলাফল`) : pageTitle("পণ্য খুঁজুন");
    const description = term
      ? `উপহারকাব্যের গিফট কম্বো ক্যাটালগে “${term}” খোঁজার ফলাফল দেখুন।`
      : "উপহারকাব্যের গিফট কম্বো ক্যাটালগে আপনার পছন্দের উপহার খুঁজুন।";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { name: "robots", content: "noindex, follow" },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: "/search" },
      ],
      links: [{ rel: "canonical", href: "/search" }],
    };
  },
  component: SearchPage,
});

function SearchPage() {
  const { lang } = useLang();
  const { query, products } = Route.useLoaderData() as SearchData;
  useViewItemList(query ? `Search: ${query}` : "Search", products);
  useEffect(() => {
    if (query) pushEvent("search", { search_term: query, results: products.length });
  }, [query, products.length]);

  return (
    <Section>
      <Breadcrumbs items={[{ label: tr(lang, "home"), to: "/" }, { label: tr(lang, "search") }]} />
      <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
        {query ? `“${query}”` : tr(lang, "search")}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {formatNumber(lang, products.length)} {tr(lang, "results")}
      </p>
      <div className="mt-8">
        <ProductGrid products={products} />
      </div>
    </Section>
  );
}
