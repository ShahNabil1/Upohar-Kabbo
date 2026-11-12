import { createFileRoute } from "@tanstack/react-router";

const content = `# Upoharkabbo

Upoharkabbo is a Bangladesh-based online gift shop for curated gift combos and premium gift items. The storefront supports Bengali and English content, nationwide delivery, and cash on delivery.

## Primary pages

- [Homepage](https://upoharkabbo.com/): Featured collections and current products
- [Product categories](https://upoharkabbo.com/categories): Browse the active catalog by category
- [Current offers](https://upoharkabbo.com/offers): Active promotions and discounted products
- [Frequently asked questions](https://upoharkabbo.com/faq): Ordering, payment, and delivery information
- [About Upoharkabbo](https://upoharkabbo.com/about): Store information
- [Contact](https://upoharkabbo.com/contact): Customer support details

## Policies

- [Return policy](https://upoharkabbo.com/return-policy)
- [Privacy policy](https://upoharkabbo.com/privacy-policy)
- [Terms and conditions](https://upoharkabbo.com/terms-and-conditions)

## Machine-readable resources

- [XML sitemap](https://upoharkabbo.com/sitemap.xml): Current public and indexable pages
- [Product catalog](https://upoharkabbo.com/catalog.xml): Current product listings

Private administration pages are not public resources and must not be indexed.
`;

export const Route = createFileRoute("/llms.txt")({
  server: {
    handlers: {
      GET: async () =>
        new Response(content, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "public, max-age=3600, s-maxage=3600",
            "X-Content-Type-Options": "nosniff",
          },
        }),
    },
  },
});