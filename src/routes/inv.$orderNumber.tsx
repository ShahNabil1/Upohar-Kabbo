import { createFileRoute, Link, useLoaderData } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";

import logoMark from "@/assets/upoharkabbo-logo.png";
import { getOrderSummaryShort } from "@/lib/order.functions";
import { courierLabel, courierTrackingUrl, orderStatusLabel } from "@/lib/order-receipt";
import { formatPrice } from "@/lib/i18n";
import { pageTitle } from "@/lib/site";

function searchSchema(input: Record<string, unknown>): {
  p: string | number;
  print?: string | number;
} {
  const out: { p: string | number; print?: string | number } = {
    p: (input["p"] ?? "") as string | number,
  };
  if (input["print"] != null) out.print = input["print"] as string | number;
  return out;
}

export const Route = createFileRoute("/inv/$orderNumber")({
  validateSearch: searchSchema,
  head: ({ params }) => ({
    meta: [
      { title: pageTitle(`Invoice ${params.orderNumber}`, "Upoharkabbo") },
      { name: "description", content: "Your Upoharkabbo order invoice — print or save as PDF." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Invoice — Upoharkabbo" },
      { property: "og:description", content: "Your Upoharkabbo order invoice." },
    ],
  }),
  component: InvoicePage,
});

type SiteData = {
  brand: string;
  contact: { phone: string; email: string; address: string };
};

function InvoicePage() {
  const { orderNumber } = Route.useParams();
  const search = Route.useSearch();
  const p = String(search.p ?? "");
  const print = String(search.print ?? "");
  const site = useLoaderData({ from: "__root__" }) as SiteData;
  const fetchSummary = useServerFn(getOrderSummaryShort);

  const { data, isPending } = useQuery({
    queryKey: ["invoice-short", orderNumber, p],
    queryFn: () => fetchSummary({ data: { orderNumber, p } }),
    enabled: p.length >= 4,
    retry: false,
  });

  const printed = useRef(false);
  useEffect(() => {
    if (print !== "1" || !data || printed.current) return;
    printed.current = true;
    const timer = window.setTimeout(() => window.print(), 400);
    return () => window.clearTimeout(timer);
  }, [print, data]);

  if (p.length < 4 || (!isPending && !data)) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="text-xl font-bold">Invoice not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The invoice link looks incomplete or incorrect.
        </p>
        <Link
          to="/"
          className="mt-6 inline-block rounded-sm border border-border px-5 py-2.5 text-sm font-semibold"
        >
          Back to home
        </Link>
      </div>
    );
  }

  if (isPending || !data) {
    return <div className="mx-auto mt-10 h-64 max-w-2xl animate-pulse rounded-sm bg-secondary" />;
  }

  const trackingUrl = courierTrackingUrl(
    data.courierProvider,
    data.courierConsignmentId,
    data.courierTrackingCode,
    data.customerPhone,
  );

  return (
    <div className="print-sheet mx-auto max-w-[820px] px-3 py-5 sm:px-4 sm:py-8 print:px-0 print:py-0">
      <div className="mb-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:mb-5 print:hidden">
        <Link to="/" className="truncate text-sm font-semibold text-primary">
          ← {site.brand}
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className="shrink-0 rounded-sm bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground sm:px-5 sm:text-sm"
        >
          Print / Save PDF
        </button>
      </div>

      <article className="rounded-sm border border-border bg-card p-4 sm:p-8 print:border-0 print:p-0">
        <header className="invoice-branding grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 border-b-2 border-border pb-5">
          <div className="min-w-0">
            <img
              src={logoMark}
              alt={`${site.brand} logo`}
              className="h-14 w-auto object-contain sm:h-20"
            />
            {site.contact.address ? (
              <p className="mt-2 text-xs font-semibold text-foreground/80 sm:text-sm">{site.contact.address}</p>
            ) : null}
            {site.contact.phone ? (
              <p className="text-xs font-semibold text-foreground/80 font-en sm:text-sm">{site.contact.phone}</p>
            ) : null}
            {site.contact.email ? (
              <p className="break-all text-xs font-semibold text-foreground/80 font-en sm:text-sm">{site.contact.email}</p>
            ) : null}
          </div>
          <div className="shrink-0 font-en text-right">
            <p className="text-base font-bold uppercase tracking-wide">Invoice</p>
            <p className="mt-1 text-lg font-bold text-primary">{data.orderNumber}</p>
            <p className="text-xs font-medium text-foreground/70">
              {new Date(data.createdAt).toLocaleString("en-GB", {
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
            <p className="text-xs font-medium text-foreground/70">Payment: Cash on Delivery</p>
          </div>
        </header>

        <section className="mt-5 grid gap-4 font-en sm:grid-cols-2">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Customer
            </h2>
            <p className="mt-1 text-sm font-semibold">{data.customerName}</p>
            <p className="text-sm font-semibold">{data.customerPhone}</p>
            <p className="text-sm font-medium">
              {data.addressLine}, {data.city}
            </p>
            {[data.upazila, data.district, data.division].filter(Boolean).length ? (
              <p className="text-sm font-medium">
                {[data.upazila, data.district, data.division].filter(Boolean).join(", ")}
              </p>
            ) : null}
          </div>
          <div className="sm:text-right">
            <h2 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Status
            </h2>
            <p className="mt-1 text-base font-bold">{orderStatusLabel(data.status)}</p>
            {trackingUrl ? (
              <div className="mt-2">
                <p className="text-xs font-semibold text-foreground/70">
                  {courierLabel(data.courierProvider)} ·{" "}
                  {data.courierTrackingCode || data.courierConsignmentId}
                </p>
                <a
                  href={trackingUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-block rounded-sm border-2 border-primary px-3 py-1.5 text-xs font-bold text-primary transition-colors duration-200 ease-out hover:bg-primary hover:text-primary-foreground"
                >
                  Track parcel →
                </a>
              </div>
            ) : null}
          </div>
        </section>

        {data.note ? (
          <div className="mt-5 rounded-sm border-l-4 border-primary bg-primary/10 p-3">
            <p className="text-sm font-bold text-primary">Customer Note</p>
            <p className="mt-0.5 text-sm font-semibold text-foreground">{data.note}</p>
          </div>
        ) : null}

        {/* Mobile: stacked item cards */}
        <ul className="mt-5 space-y-3 font-en sm:hidden print:hidden">
          {data.items.map((item, index) => (
            <li key={index} className="rounded-sm border border-border p-3">
              <div className="flex items-start gap-3">
                {item.imageUrl ? (
                  <img
                    src={item.imageUrl}
                    alt={item.name}
                    loading="lazy"
                    className="size-14 shrink-0 rounded-sm border border-border object-cover"
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-extrabold leading-snug break-words">{item.name}</p>
                  {item.variantLabel ? (
                    <p className="text-xs font-bold text-foreground/70">{item.variantLabel}</p>
                  ) : null}
                  {item.comboSelections.length > 0 ? (
                    <ul className="mt-1 space-y-0.5 text-xs font-semibold text-foreground/70">
                      {item.comboSelections.map((selection, selectionIndex) => (
                        <li key={selectionIndex}>
                          {selection.itemNameEn}
                          {selection.variantLabelEn ? ` — ${selection.variantLabelEn}` : ""}
                          {selection.quantity > 1 ? ` × ${selection.quantity}` : ""}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2 border-t border-border/60 pt-2 text-xs font-bold tabular-nums text-foreground/80">
                <span>
                  {item.quantity} × {formatPrice("en", item.unitPrice)}
                </span>
                <span className="text-sm font-extrabold text-foreground">
                  {formatPrice("en", item.lineTotal)}
                </span>
              </div>
            </li>
          ))}
        </ul>

        {/* Desktop / print: table */}
        <table className="invoice-items mt-6 hidden w-full border-collapse font-en text-base sm:table print:table">
          <colgroup>
            <col className="invoice-item-column" />
            <col className="invoice-qty-column" />
            <col className="invoice-rate-column" />
            <col className="invoice-amount-column" />
          </colgroup>
          <thead>
            <tr className="border-y-2 border-border text-left">
              <th className="py-2.5 text-base font-extrabold">Item</th>
              <th className="py-2.5 text-center text-base font-extrabold">Qty</th>
              <th className="py-2.5 text-right text-base font-extrabold">Rate</th>
              <th className="py-2.5 text-right text-base font-extrabold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((item, index) => (
              <tr key={index} className="border-b border-border/60 align-top">
                <td className="py-3">
                  <div className="flex items-start gap-3">
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        loading="lazy"
                        className="h-16 w-16 shrink-0 rounded-sm border border-border object-cover"
                      />
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <p className="text-base font-extrabold leading-snug break-normal">{item.name}</p>
                      {item.variantLabel ? (
                        <p className="text-sm font-bold text-foreground/70">{item.variantLabel}</p>
                      ) : null}
                      {item.comboSelections.length > 0 ? (
                        <ul className="mt-1 space-y-0.5 text-sm font-semibold text-foreground/70">
                          {item.comboSelections.map((selection, selectionIndex) => (
                            <li key={selectionIndex}>
                              {selection.itemNameEn}
                              {selection.variantLabelEn ? ` — ${selection.variantLabelEn}` : ""}
                              {selection.quantity > 1 ? ` × ${selection.quantity}` : ""}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  </div>
                </td>
                <td className="py-3 text-center text-base font-extrabold tabular-nums">
                  {item.quantity}
                </td>
                <td className="py-3 text-right text-base font-bold tabular-nums">
                  {formatPrice("en", item.unitPrice)}
                </td>
                <td className="py-3 text-right text-base font-extrabold tabular-nums">
                  {formatPrice("en", item.lineTotal)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 flex justify-end font-en">
          <dl className="w-full space-y-1.5 text-sm font-bold sm:max-w-xs sm:text-base">
            <div className="flex justify-between">
              <dt className="text-foreground/70">Subtotal</dt>
              <dd className="tabular-nums">{formatPrice("en", data.subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-foreground/70">Delivery charge</dt>
              <dd className="tabular-nums">{formatPrice("en", data.deliveryCharge)}</dd>
            </div>
            {data.discount > 0 ? (
              <div className="flex justify-between">
                <dt className="text-foreground/70">
                  Discount
                  {data.couponCode ? (
                    <span className="ml-1.5 rounded border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                      {data.couponCode}
                    </span>
                  ) : null}
                </dt>
                <dd className="tabular-nums">− {formatPrice("en", data.discount)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between border-t-2 border-border pt-2 text-xl font-extrabold">
              <dt>Total</dt>
              <dd className="tabular-nums text-primary">{formatPrice("en", data.total)}</dd>
            </div>
          </dl>
        </div>
      </article>

    </div>
  );
}
