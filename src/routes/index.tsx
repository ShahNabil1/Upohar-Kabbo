import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowRight, Percent } from "lucide-react";

import { getHomeData } from "@/lib/catalog.functions";
import type { HomeData } from "@/lib/types";
import { useLang } from "@/lib/language-context";
import { pick, tr } from "@/lib/i18n";
import { ProductGrid } from "@/components/site/product-card";
import { CategoryCard } from "@/components/site/category-card";
import { FaqList } from "@/components/site/faq-list";
import { HeroSlider, readHeroSlides } from "@/components/site/hero-slider";
import { PromoPopup, readPromoPopup } from "@/components/site/promo-popup";
import { SITE_URL } from "@/lib/site";

import { Section } from "@/components/site/ui";

export const Route = createFileRoute("/")({
  loader: async (): Promise<HomeData> => getHomeData(),
  head: ({ loaderData }) => {
    const seo = loaderData?.settings?.["home_seo"];
    const titleValue = seo?.["meta_title"];
    const descriptionValue = seo?.["meta_description"];
    const imageValue = seo?.["og_image"];
    const title =
      typeof titleValue === "string" && titleValue.trim()
        ? titleValue.trim()
        : "উপহারকাব্য — গিফট কম্বো ও উপহার সামগ্রীর অনলাইন শপ";
    const description =
      typeof descriptionValue === "string" && descriptionValue.trim()
        ? descriptionValue.trim()
        : "জন্মদিন, বিবাহবার্ষিকী কিংবা কর্পোরেট — প্রতিটি উপলক্ষের জন্য সাজানো গিফট কম্বো ও উপহার সামগ্রী। সারা দেশে ক্যাশ অন ডেলিভারি।";
    const image =
      typeof imageValue === "string" && imageValue.trim().startsWith("https://")
        ? imageValue.trim()
        : null;

    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:url", content: `${SITE_URL}/` },
        { name: "twitter:card", content: "summary_large_image" },
        ...(image
          ? [
              { property: "og:image", content: image },
              { name: "twitter:image", content: image },
            ]
          : []),
      ],
      links: [{ rel: "canonical", href: `${SITE_URL}/` }],
    };
  },
  component: HomePage,
});

function HomePage() {
  const { lang } = useLang();
  const data = Route.useLoaderData() as HomeData;
  const slides = readHeroSlides(data.settings["hero"]);
  const popup = readPromoPopup(data.settings["popup"]);
  const featuredCategories = data.categories.filter((c) => c.is_featured).slice(0, 4);

  return (
    <>
      <PromoPopup config={popup} />
      <h1 className="sr-only">
        {lang === "bn"
          ? "উপহারকাব্য — গিফট কম্বো ও উপহার সামগ্রীর অনলাইন শপ"
          : "Upoharkabbo — Gift combos and premium gift items online shop"}
      </h1>
      {slides.length > 0 ? (
        <HeroSlider slides={slides} />
      ) : (
        <section className="border-b border-border bg-surface">
          <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-4 py-12 text-center sm:items-start sm:py-16 sm:text-left">
            <h2 className="text-2xl font-bold tracking-tight sm:text-4xl">
              {lang === "bn" ? (
                <>
                  উপহার হোক <span className="text-primary">একটা কবিতার মতো</span>
                </>
              ) : (
                <>
                  Let every gift read <span className="text-primary">like a poem</span>
                </>
              )}
            </h2>
            <div className="flex flex-wrap justify-center gap-3 sm:justify-start">
              {data.categories[0] ? (
                <Link
                  to="/c/$category"
                  params={{ category: data.categories[0].slug }}
                  className="group inline-flex items-center gap-2 rounded-full bg-primary px-7 py-3 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-card)] transition-all duration-200 hover:scale-105 hover:shadow-lg active:scale-95"
                >
                  {tr(lang, "shopNow")}
                  <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                </Link>
              ) : null}
              <Link
                to="/offers"
                className="group inline-flex items-center gap-2 rounded-full border border-border bg-card px-7 py-3 text-sm font-semibold transition-all duration-200 hover:scale-105 hover:border-primary hover:bg-primary/5 hover:text-primary hover:shadow-md active:scale-95"
              >
                {tr(lang, "offers")}
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
              </Link>
            </div>
          </div>
        </section>
      )}



      <Section
        title="OUR CATEGORY"
        action={
          <Link
            to="/categories"
            className="group inline-flex min-h-11 items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-all duration-200 hover:scale-105 hover:shadow-md active:scale-95"
          >
            View ALL Category
            <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
          </Link>
        }
      >
        {featuredCategories.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {featuredCategories.map((c) => (
              <CategoryCard key={c.id} category={c} lang={lang} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/50 px-6 py-10 text-center">
            <p className="text-base font-semibold text-foreground">
              {lang === "bn"
                ? "বিশেষ ক্যাটাগরির আপডেট আসার আগ পর্যন্ত সম্পূর্ণ ক্যাটালগ থেকে বেছে নিন।"
                : "Until our featured categories are updated, explore the full catalog."}
            </p>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              {lang === "bn"
                ? "সব ক্যাটাগরি ঘুরে দেখুন এবং পছন্দের উপহার বক্স বেছে নিন।"
                : "Browse all categories and pick your favorite gift box."}
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
              <Link
                to="/categories"
                className="group inline-flex min-h-11 items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-all duration-200 hover:scale-105 hover:shadow-md active:scale-95"
              >
                {lang === "bn" ? "সব ক্যাটাগরি দেখুন" : "Browse All Categories"}
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
              </Link>
              <Link
                to="/offers"
                className="group inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border bg-card px-5 py-2.5 text-sm font-semibold transition-all duration-200 hover:scale-105 hover:border-primary hover:text-accent-foreground hover:shadow-md active:scale-95"
              >
                <Percent className="h-4 w-4" />
                {lang === "bn" ? "অফার দেখুন" : "View Offers"}
              </Link>
            </div>
          </div>
        )}
      </Section>

      {data.promotions.map((promo) => (
        <Section
          key={promo.id}
          title={pick(lang, promo.titleBn, promo.titleEn)}
          description={pick(lang, promo.subtitleBn, promo.subtitleEn) || undefined}
          action={
            <Link
              to="/offers/$promotion"
              params={{ promotion: promo.slug }}
              className="group inline-flex min-h-11 items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-all duration-200 hover:scale-105 hover:shadow-md active:scale-95"
            >
              {tr(lang, "viewAll")}
              <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          }
        >
          <ProductGrid products={promo.products.slice(0, 4)} />
        </Section>
      ))}

      <Section title="POPULAR PRODUCTS">
        <ProductGrid products={data.featured.slice(0, 8)} />
      </Section>

      {data.faqs.length > 0 ? (
        <Section>
          <div className="mb-8 text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-accent-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              Help Center
            </span>
            <h2 className="mx-auto mt-3 max-w-full text-xl font-bold tracking-tight text-accent-foreground min-[380px]:text-2xl sm:text-3xl">
              Frequently asked questions
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-balance px-2 text-sm font-semibold leading-6 text-muted-foreground lg:max-w-none lg:whitespace-nowrap">
              Everything you need to know about shopping, delivery and payments on Upoharkabbo.
            </p>
          </div>
          <FaqList items={data.faqs} />
        </Section>
      ) : null}
    </>
  );
}
