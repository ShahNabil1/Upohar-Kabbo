import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

import { fetchSitemapData } from "@/lib/catalog.server";


import { SITE_URL as BASE_URL } from "@/lib/site";

type Entry = { path: string; changefreq?: string; priority?: string; lastmod?: string | undefined };

const iso = (v?: string | null) => {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
};

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const data = await fetchSitemapData();

        const entries: Entry[] = [
          { path: "/", changefreq: "daily", priority: "1.0" },
          { path: "/categories", changefreq: "weekly", priority: "0.7" },
          // Thin pages stay out of the sitemap until they have content.
          ...(data.promotions.length > 0
            ? [{ path: "/offers", changefreq: "daily", priority: "0.8" }]
            : []),
          ...(data.faqCount > 0
            ? [{ path: "/faq", changefreq: "monthly", priority: "0.6" }]
            : []),
          { path: "/about", changefreq: "yearly", priority: "0.4" },
          { path: "/contact", changefreq: "yearly", priority: "0.4" },
          { path: "/privacy-policy", changefreq: "yearly", priority: "0.4" },
          { path: "/terms-and-conditions", changefreq: "yearly", priority: "0.4" },
          { path: "/return-policy", changefreq: "yearly", priority: "0.4" },
        ];


        for (const c of data.categories) {
          entries.push({
            path: `/c/${c.slug}`,
            changefreq: "weekly",
            priority: "0.8",
            lastmod: iso(c.updated_at),
          });
        }
        for (const s of data.subcategories) {
          if (!s.categories?.slug) continue;
          entries.push({
            path: `/c/${s.categories.slug}/${s.slug}`,
            changefreq: "weekly",
            priority: "0.7",
            lastmod: iso(s.updated_at),
          });
        }
        for (const p of data.products) {
          entries.push({
            path: `/p/${p.slug}`,
            changefreq: "weekly",
            priority: "0.9",
            lastmod: iso(p.updated_at),
          });
        }
        for (const p of data.promotions) {
          entries.push({
            path: `/offers/${p.slug}`,
            changefreq: "daily",
            priority: "0.7",
            lastmod: iso(p.updated_at),
          });
        }
        for (const l of data.landings) {
          entries.push({
            path: `/lp/${l.slug}`,
            changefreq: "weekly",
            priority: "0.6",
            lastmod: iso(l.updated_at),
          });
        }

        const urls = entries.map((e) =>
          [
            "  <url>",
            `    <loc>${BASE_URL}${e.path}</loc>`,
            e.lastmod ? `    <lastmod>${e.lastmod}</lastmod>` : null,
            e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
            e.priority ? `    <priority>${e.priority}</priority>` : null,
            "  </url>",
          ]
            .filter(Boolean)
            .join("\n"),
        );

        const xml = [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
          ...urls,
          "</urlset>",
        ].join("\n");

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml",
            "Cache-Control": "public, max-age=300, s-maxage=300",
          },
        });
      },
    },
  },
});
