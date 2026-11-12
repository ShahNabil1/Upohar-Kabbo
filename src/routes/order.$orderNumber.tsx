import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { useLang } from "@/lib/language-context";
import { formatNumber, formatPrice, tr } from "@/lib/i18n";
import { getOrderSummary } from "@/lib/order.functions";
import { Section } from "@/components/site/ui";
import { pageTitle } from "@/lib/site";

const searchSchema = z.object({ phone: z.string().catch("") });

export const Route = createFileRoute("/order/$orderNumber")({
  validateSearch: searchSchema,
  component: OrderReceipt,
  head: ({ params }) => ({
    meta: [
      { title: pageTitle(`অর্ডার ${params.orderNumber}`) },
      { name: "description", content: "আপনার অর্ডারের বিস্তারিত ও স্ট্যাটাস দেখুন।" },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "অর্ডার কনফার্মেশন | উপহারকাব্য" },
      { property: "og:description", content: "আপনার অর্ডারের বিস্তারিত ও স্ট্যাটাস।" },
    ],
  }),
});

function OrderReceipt() {
  const { orderNumber } = Route.useParams();
  const { phone } = Route.useSearch();
  const { lang } = useLang();
  const fetchSummary = useServerFn(getOrderSummary);

  const { data, isPending } = useQuery({
    queryKey: ["order", orderNumber, phone],
    queryFn: () => fetchSummary({ data: { orderNumber, phone } }),
    enabled: Boolean(phone),
    retry: false,
  });

  return (
    <Section>
      <div className="mx-auto max-w-2xl">
        <div className="rounded-sm border border-primary/30 bg-primary/5 p-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary text-2xl text-primary-foreground">
            ✓
          </div>
          <h1 className="mt-4 text-2xl font-bold">{tr(lang, "orderPlaced")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{tr(lang, "orderPlacedBody")}</p>
          <p className="mt-4 text-sm">
            <span className="text-muted-foreground">{tr(lang, "orderNumber")}: </span>
            <span className="font-en font-bold tracking-wide text-primary">{orderNumber}</span>
          </p>
        </div>

        {isPending && phone ? (
          <div className="mt-6 h-40 animate-pulse rounded-sm bg-secondary" />
        ) : data ? (
          <div className="mt-6 rounded-sm border border-border bg-card p-5">
            <h2 className="text-base font-bold">{tr(lang, "orderSummary")}</h2>
            <ul className="mt-3 grid gap-2 text-sm">
              {data.items.map((item, index) => (
                <li key={index} className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    {item.name}
                    {item.variantLabel ? (
                      <span className="text-muted-foreground"> · {item.variantLabel}</span>
                    ) : null}
                    <span className="text-muted-foreground">
                      {" "}
                      × {formatNumber(lang, item.quantity)}
                    </span>
                    {item.comboSelections.length > 0 ? (
                      <ul className="mt-1 space-y-0.5 pl-3 text-xs text-muted-foreground">
                        {item.comboSelections.map((selection, selectionIndex) => (
                          <li key={selectionIndex}>{selection.itemNameBn}{selection.variantLabelBn ? ` · ${selection.variantLabelBn}` : ""}</li>
                        ))}
                      </ul>
                    ) : null}
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums">
                    {formatPrice(lang, item.lineTotal)}
                  </span>
                </li>
              ))}
            </ul>
            <dl className="mt-3 grid gap-1.5 border-t border-border pt-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{tr(lang, "subtotal")}</dt>
                <dd className="tabular-nums">{formatPrice(lang, data.subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{tr(lang, "deliveryCharge")}</dt>
                <dd className="tabular-nums">
                  {data.deliveryCharge === 0
                    ? tr(lang, "free")
                    : formatPrice(lang, data.deliveryCharge)}
                </dd>
              </div>
              <div className="flex justify-between border-t border-border pt-2 text-base">
                <dt className="font-bold">{tr(lang, "total")}</dt>
                <dd className="font-bold tabular-nums text-primary">
                  {formatPrice(lang, data.total)}
                </dd>
              </div>
            </dl>
            <div className="mt-4 border-t border-border pt-3 text-sm text-muted-foreground">
              <p className="font-semibold text-foreground">{data.customerName}</p>
              <p className="font-en">{data.customerPhone}</p>
              <p>
                {data.addressLine}, {data.city}
              </p>
            </div>
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {data ? (
            <Link
              to="/inv/$orderNumber"
              params={{ orderNumber }}
              search={{ p: phone.replace(/\D/g, "").slice(-4) }}
              className="inline-block rounded-sm bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              {tr(lang, "downloadInvoice")}
            </Link>
          ) : null}
          <Link
            to="/"
            className="inline-block rounded-sm border border-border px-5 py-2.5 text-sm font-semibold transition-colors hover:border-primary hover:text-primary"
          >
            {tr(lang, "continueShopping")}
          </Link>
        </div>
      </div>
    </Section>
  );
}
