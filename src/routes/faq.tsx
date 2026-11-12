import { createFileRoute } from "@tanstack/react-router";

import { getFaqPage } from "@/lib/catalog.functions";
import type { FaqData } from "@/lib/types";
import { useLang } from "@/lib/language-context";
import { tr } from "@/lib/i18n";
import { FaqList } from "@/components/site/faq-list";
import { Breadcrumbs, Section } from "@/components/site/ui";
import { absoluteUrl } from "@/lib/site";

const DEFAULT_TITLE = "সাধারণ প্রশ্নোত্তর | FAQ — উপহারকাব্য";
const DEFAULT_DESCRIPTION =
  "ডেলিভারি, পেমেন্ট, রিটার্ন ও পণ্যের মান নিয়ে সবচেয়ে বেশি জিজ্ঞাসিত প্রশ্নের উত্তর — উপহারকাব্য।";

export const Route = createFileRoute("/faq")({
  loader: async (): Promise<FaqData> => getFaqPage(),
  head: ({ loaderData }) => {
    const seo = loaderData?.seo;
    const items = loaderData?.items ?? [];
    const title = seo?.metaTitle || DEFAULT_TITLE;
    const description = seo?.metaDescription || DEFAULT_DESCRIPTION;
    const url = absoluteUrl("/faq");
    const image = seo?.ogImage;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: url },
        { property: "og:type", content: "website" },
        ...(image
          ? [
              { property: "og:image", content: image },
              { name: "twitter:image", content: image },
            ]
          : []),
        // Only ask Google to index the page once there is real content on it.
        ...(items.length === 0 ? [{ name: "robots", content: "noindex, follow" }] : []),
      ],
      links: [{ rel: "canonical", href: url }],
      scripts:
        items.length > 0
          ? [
              {
                type: "application/ld+json",
                children: JSON.stringify({
                  "@context": "https://schema.org",
                  "@type": "FAQPage",
                  "@id": `${url}#faq`,
                  url,
                  name: title,
                  inLanguage: "bn",
                  mainEntity: items.map((f) => ({
                    "@type": "Question",
                    name: f.question_bn,
                    acceptedAnswer: { "@type": "Answer", text: f.answer_bn },
                  })),
                }),
              },
            ]
          : [],
    };
  },
  component: FaqPage,
});

function FaqPage() {
  const { lang } = useLang();
  const { items } = Route.useLoaderData() as FaqData;

  return (
    <Section className="max-w-3xl">
      <Breadcrumbs items={[{ label: tr(lang, "home"), to: "/" }, { label: tr(lang, "faq") }]} />
      <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">{tr(lang, "faq")}</h1>
      <div className="mt-6">
        {items.length > 0 ? (
          <FaqList items={items} />
        ) : (
          <p className="rounded-lg border border-dashed border-border bg-surface px-4 py-10 text-center text-sm text-muted-foreground">
            {lang === "bn" ? "শীঘ্রই যুক্ত হবে।" : "Coming soon."}
          </p>
        )}
      </div>
    </Section>
  );
}
