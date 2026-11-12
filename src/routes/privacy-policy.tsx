import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/site/legal-page";
import { getLegalPage } from "@/lib/catalog.functions";
import { readLegalPage } from "@/lib/legal-content";
import { absoluteUrl } from "@/lib/site";

export const Route = createFileRoute("/privacy-policy")({
  loader: () => getLegalPage({ data: { key: "legal_privacy" } }),
  head: ({ loaderData }) => {
    const page = readLegalPage("legal_privacy", loaderData);
    return { meta: [{ title: page.metaTitle }, { name: "description", content: page.metaDescription }, { property: "og:title", content: page.metaTitle }, { property: "og:description", content: page.metaDescription }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }], links: [{ rel: "canonical", href: absoluteUrl("/privacy-policy") }] };
  },
  component: () => <LegalPage page={readLegalPage("legal_privacy", Route.useLoaderData())} pageKey="legal_privacy" />,
});