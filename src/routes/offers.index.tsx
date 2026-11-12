import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";

import { getPromotions } from "@/lib/catalog.functions";
import type { PromotionListData } from "@/lib/types";
import { useLang } from "@/lib/language-context";
import { pick, tr } from "@/lib/i18n";
import { ProductThumb } from "@/components/site/product-card";
import { Breadcrumbs } from "@/components/site/ui";
import { absoluteUrl } from "@/lib/site";


export const Route = createFileRoute("/offers/")({
  loader: async (): Promise<PromotionListData> => getPromotions(),
  head: ({ loaderData }) => {
    const empty = (loaderData ?? []).length === 0;
    const url = absoluteUrl("/offers");
    return {
      meta: [
        { title: "অফার ও ক্যাম্পেইন | Offers — উপহারকাব্য" },
        {
          name: "description",
          content:
            "চলমান সব অফার, ফ্ল্যাশ সেল আর নতুন কালেকশন এক জায়গায়। ক্যাশ অন ডেলিভারি সারা দেশে।",
        },
        { property: "og:title", content: "অফার ও ক্যাম্পেইন | Offers — উপহারকাব্য" },
        { property: "og:description", content: "চলমান সব অফার আর নতুন কালেকশন এক জায়গায়।" },
        { property: "og:url", content: url },
        { property: "og:type", content: "website" },
        // No running offers = empty page; keep it out of the index until it has content.
        ...(empty ? [{ name: "robots", content: "noindex, follow" }] : []),
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },

  component: OffersPage,
});

function OffersPage() {
  const { lang } = useLang();
  const promotions = Route.useLoaderData() as PromotionListData;

  return (
    <div className="bg-surface">
      <div className="mx-auto w-full max-w-6xl px-4 pb-14 pt-5 sm:pb-20 sm:pt-7">
        <Breadcrumbs items={[{ label: tr(lang, "home"), to: "/" }, { label: tr(lang, "offers") }]} />

        <header className="mx-auto mb-8 mt-10 max-w-2xl text-center sm:mb-12 sm:mt-14">
          <div className="mb-3 inline-flex items-center text-xs font-bold uppercase text-primary-dark">
            <span>{lang === "bn" ? "এক্সক্লুসিভ কালেকশন" : "Exclusive selections"}</span>
          </div>
          <h1 className="text-4xl font-black uppercase leading-tight sm:text-5xl">
            {lang === "bn" ? "চলমান ক্যাম্পেইন" : "Seasonal campaigns"}
          </h1>
          <div className="mx-auto mt-5 h-1 w-20 rounded-full bg-primary" />
          <p className="mx-auto mt-5 max-w-xl text-sm leading-7 text-muted-foreground sm:text-base">
            {lang === "bn"
              ? "আপনার পছন্দের গিফটে চলমান বিশেষ মূল্য ও সীমিত সময়ের অফার দেখুন।"
              : "Discover special prices and limited-time offers on your favourite gifts."}
          </p>
        </header>

        {promotions.length === 0 ? (
          <div className="border border-dashed border-border bg-card px-5 py-16 text-center shadow-[var(--shadow-card)]">
            <h2 className="text-xl font-bold">
              {lang === "bn" ? "নতুন অফার আসছে" : "New offers are coming"}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {lang === "bn" ? "সামনের বিশেষ কালেকশনের জন্য চোখ রাখুন।" : "Stay tuned for our next special collection."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-12">
            {promotions.map((p, index) => {
              const title = pick(lang, p.title_bn, p.title_en);
              const subtitle = pick(lang, p.subtitle_bn, p.subtitle_en);
              return (
                <Link
                  key={p.id}
                  to="/offers/$promotion"
                  params={{ promotion: p.slug }}
                  className={`group relative isolate min-h-[370px] overflow-hidden rounded-lg bg-secondary shadow-[var(--shadow-card)] transition-[transform,box-shadow] duration-500 ease-out hover:-translate-y-1 hover:shadow-[var(--shadow-lift)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary sm:min-h-[440px] ${
                    index % 3 === 0 ? "md:col-span-7" : index % 3 === 1 ? "md:col-span-5" : "md:col-span-6"
                  }`}
                >
                  <ProductThumb
                    src={p.banner_url}
                    alt={title}
                    label={title}
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-secondary via-secondary/35 to-secondary/5 transition-opacity duration-500 group-hover:opacity-90" />
                  <div className="pointer-events-none absolute inset-4 rounded-sm border border-primary/35 transition-[inset,border-color] duration-500 group-hover:inset-3 group-hover:border-primary/60 sm:inset-5" />

                  <div className="absolute left-5 top-5 z-10 bg-primary px-3 py-1.5 text-xs font-bold uppercase text-primary-foreground shadow-sm sm:left-7 sm:top-7">
                    {lang === "bn" ? "সীমিত সময়" : "Limited time"}
                  </div>

                  <div className="absolute inset-x-0 bottom-0 z-10 p-7 text-secondary-foreground sm:p-9">
                    <p className="mb-2 text-sm font-semibold text-primary-dark">
                      {lang === "bn" ? `ক্যাম্পেইন ${String(index + 1).padStart(2, "0")}` : `Campaign ${String(index + 1).padStart(2, "0")}`}
                    </p>
                    <h2 className="max-w-xl text-3xl font-black leading-tight sm:text-4xl">{title}</h2>
                    {subtitle ? (
                      <p className="mt-3 max-w-lg text-sm leading-6 text-secondary-foreground/80 sm:text-base">
                        {subtitle}
                      </p>
                    ) : null}
                    <span className="mt-6 inline-flex items-center gap-2 border-b border-primary pb-1 text-sm font-bold">
                      {lang === "bn" ? "অফার দেখুন" : "Explore offer"}
                      <ArrowUpRight className="size-4 transition-transform duration-300 group-hover:translate-x-1 group-hover:-translate-y-1" aria-hidden="true" />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        <p className="mt-10 text-center text-xs font-semibold uppercase text-muted-foreground sm:mt-14">
          {lang === "bn" ? "অফারগুলো সীমিত সময়ের জন্য প্রযোজ্য" : "All offers are available for a limited time"}
        </p>
      </div>
    </div>
  );
}
