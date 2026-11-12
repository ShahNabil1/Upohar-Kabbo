import { createFileRoute } from "@tanstack/react-router";

const catalog = {
  specVersion: "1.0",
  host: {
    displayName: "Upoharkabbo",
    identifier: "did:web:upoharkabbo.com",
    documentationUrl: "https://upoharkabbo.com/",
  },
  entries: [],
};

export const Route = createFileRoute("/.well-known/ai-catalog.json")({
  server: {
    handlers: {
      GET: async () =>
        Response.json(catalog, {
          headers: {
            "Cache-Control": "public, max-age=3600, s-maxage=3600",
            "X-Content-Type-Options": "nosniff",
          },
        }),
    },
  },
});