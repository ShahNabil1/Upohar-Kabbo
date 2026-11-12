import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/cart")({
  head: () => ({ meta: [{ title: "Your Cart — Upoharkabbo" }, { name: "description", content: "Review the gifts in your Upoharkabbo cart before checkout." }, { property: "og:title", content: "Your Cart — Upoharkabbo" }, { property: "og:description", content: "Review the gifts in your Upoharkabbo cart before checkout." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex, nofollow" }] }),
  // The cart now lives in a slide-over drawer; this URL just returns home.
  beforeLoad: () => {
    throw redirect({ to: "/" });
  },
  component: () => null,
});
