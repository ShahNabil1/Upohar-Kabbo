import { createFileRoute, redirect } from "@tanstack/react-router";

import { phoneLast4 } from "@/lib/order-receipt";

function searchSchema(input: Record<string, unknown>) {
  return {
    phone: input["phone"] == null ? "" : String(input["phone"]),
    print: input["print"] == null ? "" : String(input["print"]),
  };
}

/** Legacy invoice URL — permanently forwards to the short /inv link. */
export const Route = createFileRoute("/invoice/$orderNumber")({
  head: ({ params }) => ({ meta: [{ title: `Invoice ${params.orderNumber} — Upoharkabbo` }, { name: "description", content: `Order invoice ${params.orderNumber} from Upoharkabbo.` }, { property: "og:title", content: `Invoice ${params.orderNumber} — Upoharkabbo` }, { property: "og:description", content: `Order invoice ${params.orderNumber} from Upoharkabbo.` }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex, nofollow" }] }),
  validateSearch: searchSchema,
  beforeLoad: ({ params, search }) => {
    throw redirect({
      to: "/inv/$orderNumber",
      params: { orderNumber: params.orderNumber },
      search: search.print
        ? { p: phoneLast4(search.phone), print: search.print }
        : { p: phoneLast4(search.phone) },
      replace: true,
    });
  },
});
