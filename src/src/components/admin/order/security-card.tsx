import { useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Ban, Banknote, Check, Copy, ExternalLink, Fingerprint, Globe, History, MapPin, NotebookPen, Phone, Shield, ShieldCheck, ShieldX, Truck, RefreshCw } from "lucide-react";

import type { BlockKind } from "@/lib/admin-schema";
import { adminAddOrderNote, adminSetBlocked } from "@/lib/order-admin.functions";
import {
  adminCancelCarrybeeConsignment,
  adminOrderWebhookEvents,
  adminPathaoDeliveryCost,
  adminRefreshCourierStatus,
  adminResolveCarrybeeAddress,
  adminSendOrderToCourier,
  CARRYBEE_CANCELLABLE,
} from "@/lib/dispatch.functions";
import {
  courierStatusLabels,
  courierStatusTone,
  type CourierStatus,
} from "@/lib/delivery-shared";
import { Panel } from "@/components/admin/kit";
import { CountryIdentity } from "@/components/admin/country-identity";
import { CourierBadge, CourierMark, CourierWatermark } from "@/components/admin/courier-logo";
import { OrderSourcePanel } from "@/components/admin/order/source-panel";
import type { AttributionPayload } from "@/lib/attribution";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip as TooltipRoot,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

function Tooltip({ children, ...props }: React.ComponentProps<typeof TooltipRoot>) {
  return (
    <TooltipProvider delayDuration={200}>
      <TooltipRoot {...props}>{children}</TooltipRoot>
    </TooltipProvider>
  );
}
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

function humaniseEvent(raw?: string | null) {
  if (!raw) return "Event";
  const cleaned = raw.replace(/[._-]+/g, " ").trim();
  if (!cleaned) return "Event";
  if (/\s/.test(cleaned) === false && /[A-Z]/.test(cleaned.slice(1))) {
    return cleaned.replace(/([a-z])([A-Z])/g, "$1 $2");
  }
  return cleaned
    .split(/\s+/)
    .map((w) => (w.length <= 2 ? w.toUpperCase() : w[0]!.toUpperCase() + w.slice(1)))
    .join(" ");
}


export type NoteRow = {
  id: string;
  body: string;
  author_name: string | null;
  created_at: string;
};

const dt = (value: string) =>
  new Date(value).toLocaleString("en-US", {
    timeZone: "Asia/Dhaka",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

/** Small copy-to-clipboard control that flips to a tick for a moment. */
function CopyButton({ value, accent }: { value: string; accent?: "pathao" | "steadfast" | undefined }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={copied ? "Copied" : "Copy consignment"}
      title={copied ? "Copied" : "Copy"}
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        });
      }}
      className={cn(
        "grid size-7 shrink-0 place-items-center rounded-md border transition active:scale-90",
        copied
          ? "border-emerald-300 bg-emerald-50 text-emerald-600"
          : accent === "pathao"
            ? "border-[#E32227]/30 text-[#E32227] hover:bg-[#E32227]/10"
            : accent === "steadfast"
              ? "border-[#37A184]/40 text-[#37A184] hover:bg-[#37A184]/10"
              : "border-border text-muted-foreground hover:bg-muted",
      )}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
    </button>
  );
}

function CopyTextButton({
  value,
  label,
  accent,
}: {
  value: string;
  label: string;
  accent?: "pathao" | "steadfast" | undefined;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        });
      }}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-semibold transition active:scale-95",
        copied
          ? "border-emerald-300 bg-emerald-50 text-emerald-700"
          : accent === "pathao"
            ? "border-[#E32227]/30 text-[#E32227] hover:bg-[#E32227]/10"
            : accent === "steadfast"
              ? "border-[#37A184]/40 text-[#37A184] hover:bg-[#37A184]/10"
              : "border-border text-muted-foreground hover:bg-muted",
      )}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {copied ? "Copied" : label}
    </button>
  );
}

const bdt = (n: number) =>
  `৳${Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

function CostOfDelivery({ orderId, partner }: { orderId: string; partner: "pathao" | "carrybee" }) {
  const cost = useQuery({
    queryKey: ["admin", "courier-cost", orderId],
    queryFn: () => adminPathaoDeliveryCost({ data: { orderId } }),
  });

  const shell =
    partner === "pathao" ? "border-[#E32227]/25" : "border-[#F5C518]/50";
  const negative = partner === "pathao" ? "text-[#E32227]" : "text-amber-700";

  if (cost.isLoading) {
    return (
      <div className={cn("rounded-lg border bg-white px-3 py-2.5 text-xs text-muted-foreground", shell)}>
        Loading cost of delivery…
      </div>
    );
  }
  if (!cost.data?.ok) return null;

  return (
    <div className={cn("rounded-lg border bg-white px-3 py-3", shell)}>
      <div className="flex items-center gap-2">
        <CourierMark partner={partner} className="size-6" />
        <p className="text-sm font-bold text-foreground">Cost of Delivery</p>

        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1",
            cost.data.paid
              ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
              : "bg-indigo-50 text-indigo-700 ring-indigo-200",
          )}
        >
          {cost.data.paid ? "Paid" : "Unpaid"}
        </span>
      </div>
      <dl className="mt-2 space-y-1.5">
        {cost.data.lines.map((line) => (
          <div key={line.label} className="flex items-center justify-between gap-3 text-xs">
            <dt className="font-bold text-foreground">{line.label}</dt>
            <dd
              className={cn(
                "font-semibold tabular-nums",
                line.negative ? negative : "text-foreground",
              )}
            >
              {line.negative ? "- " : ""}
              {bdt(line.amount)}
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-2.5 flex items-center justify-between border-t border-dashed border-border pt-2.5">
        <p className="text-sm font-bold text-foreground">Total Cost</p>
        <p className="text-sm font-bold tabular-nums text-foreground">{bdt(cost.data.total)}</p>
      </div>
    </div>
  );
}



/** Fulfillment placeholder — courier booking becomes functional in a later phase. */
export function FulfillmentCard({
  orderId,
  status,
  source,
  attribution,
  orderStatus,
  partner,
  courierStatus,
  courierStatusRaw,
  consignmentId,
  returnConsignmentId,
  trackingCode,
  sentAt,
  customerPhone,
  collectedAmount,
  orderTotal,
  paidAt,
  paymentInvoiceId,
}: {
  orderId: string;
  status: string;
  source: string;
  attribution?: AttributionPayload | null;
  orderStatus: string;
  partner: string | null;
  courierStatus: string | null;
  courierStatusRaw?: string | null;
  consignmentId: string | null;
  returnConsignmentId?: string | null;
  trackingCode: string | null;
  sentAt: string | null;
  customerPhone?: string | null;
  collectedAmount?: number | null;
  orderTotal?: number | null;
  paidAt?: string | null;
  paymentInvoiceId?: string | null;
}) {
  const qc = useQueryClient();
  const [historyOpen, setHistoryOpen] = useState(false);
  const send = useMutation({
    mutationFn: () => adminSendOrderToCourier({ data: { orderId } }),
    onSuccess: async (res) => {
      if (res.ok) toast.success(`Sent to courier · ${res.message}`);
      else toast.error(res.message);
      await qc.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const refresh = useMutation({
    mutationFn: () => adminRefreshCourierStatus({ data: { orderId } }),
    onSuccess: async (res) => {
      if (res.ok) toast.success(`Courier status: ${res.message}`);
      else toast.error(res.message);
      await qc.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const PAGE = 5;
  const events = useInfiniteQuery({
    queryKey: ["admin", "courier-webhook-events", orderId],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      adminOrderWebhookEvents({ data: { orderId, limit: PAGE, offset: pageParam as number } }),
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < PAGE ? undefined : allPages.length * PAGE,
    enabled: historyOpen,
  });
  const eventList = (events.data?.pages ?? []).flat();

  const normalised = (courierStatus ?? "unknown") as CourierStatus;
  const isPathao = (partner ?? "").toLowerCase() === "pathao";
  const isCarrybee = (partner ?? "").toLowerCase() === "carrybee";
  const isSteadfast = (partner ?? "").toLowerCase() === "steadfast";
  const canCancelCarrybee =
    isCarrybee &&
    !!consignmentId &&
    CARRYBEE_CANCELLABLE.includes(normalised as never) &&
    orderStatus !== "cancelled";

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  const cancelCarrybee = useMutation({
    mutationFn: () =>
      adminCancelCarrybeeConsignment({ data: { orderId, reason: cancelReason.trim() } }),
    onSuccess: async (res) => {
      if (res.ok) {
        toast.success(res.message);
        setCancelOpen(false);
        setCancelReason("");
      } else toast.error(res.message);
      await qc.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resolveAddress = useMutation({
    mutationFn: () => adminResolveCarrybeeAddress({ data: { orderId } }),
    onSuccess: (res) => {
      if (res.ok) toast.success(`CarryBee address resolved · ${res.message}`);
      else toast.error(res.message);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const consignmentUrl = !consignmentId
    ? null
    : isPathao
      ? `https://merchant.pathao.com/courier/orders/${consignmentId}`
      : isCarrybee
        ? `https://merchant.carrybee.com/businesses/20521/orders/${encodeURIComponent(consignmentId)}`
        : isSteadfast
          ? `https://steadfast.com.bd/user/consignment/${encodeURIComponent(consignmentId)}`
          : null;
  const publicTrackingUrl = !consignmentId
    ? null
    : isPathao
      ? `https://merchant.pathao.com/tracking?consignment_id=${encodeURIComponent(consignmentId)}${
          customerPhone ? `&phone=${encodeURIComponent(customerPhone)}` : ""
        }`
      : isCarrybee
        ? `https://merchant.carrybee.com/order-track/${encodeURIComponent(consignmentId)}`
        : isSteadfast
          ? `https://steadfast.com.bd/user/tracking/${encodeURIComponent(trackingCode ?? consignmentId)}`
          : null;




  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-2">
      <Panel className="min-w-0 space-y-3 overflow-hidden">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Fulfillment
          </h2>
          <div className="flex items-center gap-1.5">
            {consignmentId ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label="Refresh courier status"
                    disabled={refresh.isPending}
                    onClick={() => refresh.mutate()}
                    className="grid size-8 place-items-center rounded-full border border-border/70 text-muted-foreground transition hover:bg-muted hover:text-foreground active:scale-90 disabled:opacity-60"
                  >
                    <RefreshCw className={cn("size-4", refresh.isPending && "animate-spin")} />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Refresh courier status</TooltipContent>
              </Tooltip>
            ) : null}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="Webhook event history"
                  onClick={() => setHistoryOpen(true)}
                  className="grid size-8 place-items-center rounded-full border border-border/70 text-muted-foreground transition hover:bg-muted hover:text-foreground active:scale-90"
                >
                  <History className="size-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Webhook event history</TooltipContent>
            </Tooltip>
          </div>
        </div>

        <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
          <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col overflow-hidden">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <History className="size-4" />
                Webhook event history
              </DialogTitle>
              <DialogDescription>
                Every courier webhook received for this order, newest first.
              </DialogDescription>
            </DialogHeader>
            <div className="-mx-1 flex-1 overflow-y-auto px-1">
              {events.isLoading ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
              ) : eventList.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No webhook events received for this order yet.
                </p>
              ) : (
                <ol className="relative space-y-3 border-l border-border/70 pl-4">
                  {eventList.map((ev) => (
                    <li key={ev.id} className="relative">
                      <span className="absolute -left-[21px] top-2 size-2.5 rounded-full bg-primary ring-4 ring-background" />
                      <div className="rounded-xl border border-border/70 bg-background/60 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold uppercase">
                            {ev.provider}
                          </span>
                          <span className="text-xs font-semibold text-foreground">
                            {humaniseEvent(ev.event)}
                          </span>
                          {ev.status ? (
                            <span
                              className={cn(
                                "rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1",
                                courierStatusTone(ev.status as CourierStatus),
                              )}
                            >
                              {courierStatusLabels[ev.status as CourierStatus] ?? ev.status}
                            </span>
                          ) : null}
                          <span className="ml-auto text-[11px] text-muted-foreground">
                            {dt(ev.createdAt)}
                          </span>
                        </div>
                        {ev.message && humaniseEvent(ev.message) !== humaniseEvent(ev.event) ? (
                          <p className="mt-1.5 text-sm text-foreground">
                            {humaniseEvent(ev.message)}
                          </p>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
              {events.hasNextPage ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3 w-full"
                  disabled={events.isFetchingNextPage}
                  onClick={() => void events.fetchNextPage()}
                >
                  {events.isFetchingNextPage ? "Loading…" : "View more"}
                </Button>
              ) : null}
            </div>
          </DialogContent>
        </Dialog>


        <div
          className={cn(
            "relative isolate overflow-hidden rounded-xl border p-3",
            isPathao
              ? "border-[#E32227]/30 bg-gradient-to-br from-[#E32227]/[0.06] via-white to-white"
              : "border-border/70 bg-background/60",
          )}
        >
          <CourierWatermark partner={partner} className="-z-10" />
          <p className="relative text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Physical shipment
          </p>

          <div className="relative mt-2 flex flex-wrap items-center gap-2">
            {(() => {
              // A terminal order state (cancelled / returned / lost) overrides the
              // internal fulfillment flag, which stays "pending" when nothing shipped.
              const terminal = ["cancelled", "returned", "lost_damaged"].includes(orderStatus);
              const shown = terminal ? orderStatus.replace("_", " ") : status;
              return (
                <span
                  className={cn(
                    "inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1",
                    terminal
                      ? "bg-rose-50 text-rose-800 ring-rose-200"
                      : "bg-indigo-50 text-indigo-800 ring-indigo-200",
                  )}
                >
                  {shown === "pending" ? "Pending" : shown.toUpperCase()}
                </span>
              );
            })()}

            {partner ? <CourierBadge partner={partner} /> : null}

            {courierStatus || courierStatusRaw ? (
              <span
                className={cn(
                  "relative inline-flex max-w-full rounded-full px-3 py-1 text-xs font-bold ring-1",
                  isPathao
                    ? "bg-black text-white ring-black"
                    : normalised === "unknown"
                      ? "bg-background text-foreground ring-border"
                      : courierStatusTone(normalised),
                )}
              >
                {/* Show the courier's own wording; our internal bucket is coarse
                    and reads wrong ("Unknown" / "Pending") for Pathao events. */}
                {courierStatusRaw
                  ? humaniseEvent(courierStatusRaw)
                  : normalised !== "unknown"
                    ? (courierStatusLabels[normalised] ?? courierStatus)
                    : humaniseEvent(courierStatus)}
              </span>
            ) : null}
          </div>

          {consignmentId ? (
            <div className="mt-3 space-y-3">
              <div
                className={cn(
                  "rounded-lg border px-3 py-2.5",
                  isPathao
                    ? "border-[#E32227]/25 bg-white"
                    : isSteadfast
                      ? "border-[#37A184]/25 bg-[#37A184]/5"
                      : "border-border/70 bg-background",
                )}
              >
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Consignment
                </p>
                <div className="mt-1 flex items-center gap-2">
                  {consignmentUrl ? (
                    <a
                      href={consignmentUrl}
                      target="_blank"
                      rel="noreferrer"
                      title={
                        isPathao
                          ? "Open in Pathao merchant panel"
                          : isCarrybee
                            ? "Open in CarryBee merchant panel"
                            : "Open tracking"
                      }
                      className={cn(
                        "min-w-0 flex-1 truncate font-mono text-lg font-extrabold tracking-tight text-black underline-offset-4 transition hover:underline",
                        isPathao
                          ? "hover:text-[#E32227]"
                          : isSteadfast
                            ? "hover:text-[#37A184]"
                            : "hover:text-[#B8860B]",
                      )}
                    >
                      {consignmentId}
                    </a>
                  ) : (
                    <span className="min-w-0 flex-1 truncate font-mono text-lg font-extrabold tracking-tight text-foreground">
                      {consignmentId}
                    </span>
                  )}
                  <CopyButton
                    value={consignmentId}
                    accent={isPathao ? "pathao" : isSteadfast ? "steadfast" : undefined}
                  />
                </div>
                {publicTrackingUrl ? (
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    <a
                      href={publicTrackingUrl}
                      target="_blank"
                      rel="noreferrer"
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-semibold transition active:scale-95",
                        isPathao
                          ? "border-[#E32227]/30 bg-[#E32227]/5 text-[#E32227] hover:bg-[#E32227]/10"
                          : isSteadfast
                            ? "border-[#37A184]/40 bg-[#37A184]/10 text-[#37A184] hover:bg-[#37A184]/20"
                            : "border-[#F5C518]/60 bg-[#F5C518]/10 text-[#8a6d00] hover:bg-[#F5C518]/20",
                      )}
                    >
                      <ExternalLink className="size-3.5" />
                      Open tracking link
                    </a>
                    <CopyTextButton
                      value={publicTrackingUrl}
                      label="Copy tracking link"
                      accent={isPathao ? "pathao" : isSteadfast ? "steadfast" : undefined}
                    />
                  </div>
                ) : null}
              </div>

              {returnConsignmentId ? (
                <div
                  className={cn(
                    "rounded-lg border px-3 py-2.5",
                    isPathao
                      ? "border-orange-300/60 bg-orange-50/70"
                      : "border-border/70 bg-background",
                  )}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-orange-700">

                    Return ID
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    {isPathao ? (
                      <a
                        href={`https://merchant.pathao.com/courier/orders/${returnConsignmentId}`}
                        target="_blank"
                        rel="noreferrer"
                        title="Open return in Pathao merchant panel"
                        className="min-w-0 flex-1 truncate font-mono text-lg font-extrabold tracking-tight text-black underline-offset-4 transition hover:text-[#E32227] hover:underline"
                      >
                        {returnConsignmentId}
                      </a>
                    ) : (
                      <span className="min-w-0 flex-1 truncate font-mono text-lg font-extrabold tracking-tight text-foreground">
                        {returnConsignmentId}
                      </span>
                    )}
                    <CopyButton
                      value={returnConsignmentId}
                      accent={isPathao ? "pathao" : undefined}
                    />
                  </div>
                </div>
              ) : null}



              {collectedAmount != null ? (
                (() => {
                  const isPartial =
                    normalised === "partial_delivered" || orderStatus === "partial_delivered";
                  const shortfall =
                    orderTotal != null ? Math.max(0, orderTotal - collectedAmount) : null;
                  return (
                    <div
                      className={cn(
                        "rounded-lg border px-3 py-2.5",
                        isPartial
                          ? "border-orange-200 bg-orange-50/70"
                          : "border-emerald-200 bg-emerald-50/70",
                      )}
                    >
                      <div className="flex items-center gap-1.5">
                        <Banknote
                          className={cn(
                            "size-4",
                            isPartial ? "text-orange-700" : "text-emerald-700",
                          )}
                        />
                        <p
                          className={cn(
                            "text-[10px] font-semibold uppercase tracking-[0.12em]",
                            isPartial ? "text-orange-800" : "text-emerald-800",
                          )}
                        >
                          {isPartial ? "Partial delivery — collected" : "Collected amount"}
                        </p>
                      </div>
                      <p
                        className={cn(
                          "mt-1 text-xl font-extrabold tabular-nums",
                          isPartial ? "text-orange-900" : "text-emerald-900",
                        )}
                      >
                        {bdt(collectedAmount)}
                      </p>
                      {isPartial && orderTotal != null ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Order value {bdt(orderTotal)}
                          {shortfall ? ` · Not collected ${bdt(shortfall)}` : ""}
                        </p>
                      ) : null}
                    </div>
                  );
                })()
              ) : null}

              {paidAt ? (
                <div className="rounded-lg border border-green-200 bg-green-50/70 px-3 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <Banknote className="size-4 text-green-700" />
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-green-800">
                      Courier payout received
                    </p>
                  </div>
                  {paymentInvoiceId ? (
                    <p className="mt-1 font-mono text-sm font-bold text-green-900">
                      Invoice {paymentInvoiceId}
                    </p>
                  ) : null}
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {new Date(paidAt).toLocaleString("en-US", { timeZone: "Asia/Dhaka" })}
                  </p>
                </div>
              ) : null}

              {isPathao || isCarrybee ? (
                <CostOfDelivery orderId={orderId} partner={isPathao ? "pathao" : "carrybee"} />
              ) : null}



              <dl className="grid gap-1 text-xs text-muted-foreground">
                
                {sentAt ? (
                  <div className="flex gap-2">
                    <dt className="font-semibold">Sent</dt>
                    <dd>
                      {new Date(sentAt).toLocaleString("en-US", { timeZone: "Asia/Dhaka" })}
                    </dd>
                  </div>
                ) : null}
              </dl>

              {isCarrybee ? (
                <div className="flex flex-wrap items-center gap-2 border-t border-dashed border-border pt-2.5">
                  <Button
                    size="sm"
                    variant="outline"
                    loading={resolveAddress.isPending}
                    onClick={() => resolveAddress.mutate()}
                    className="active:scale-95"
                  >
                    <MapPin className="size-3.5" />
                    Resolve address
                  </Button>
                  {canCancelCarrybee ? (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => setCancelOpen(true)}
                      className="active:scale-95"
                    >
                      <Ban className="size-3.5" />
                      Cancel consignment
                    </Button>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">
                      Already picked up — CarryBee cancellation is closed.
                    </span>
                  )}
                </div>
              ) : null}
            </div>
          ) : orderStatus === "pending" ? (
            <div className="mt-3 space-y-2">
              <Button
                size="sm"
                loading={send.isPending}
                disabled={!partner}
                onClick={() => send.mutate()}
                className="active:scale-95"
              >
                <Truck className="size-4" />
                Send to {partner ?? "courier"}
              </Button>
              {isCarrybee ? (
                <Button
                  size="sm"
                  variant="outline"
                  loading={resolveAddress.isPending}
                  onClick={() => resolveAddress.mutate()}
                  className="ml-2 active:scale-95"
                >
                  <MapPin className="size-3.5" />
                  Resolve address
                </Button>
              ) : null}
              {!partner ? (
                <p className="text-xs text-muted-foreground">
                  Select a delivery partner on this order first.
                </p>
              ) : null}
            </div>
          ) : null}

          <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-base">
                  <Ban className="size-4 text-rose-600" />
                  Cancel CarryBee consignment
                </DialogTitle>
                <DialogDescription>
                  The parcel has not been picked up yet, so CarryBee can still cancel it. A reason
                  is required and is sent to CarryBee.
                </DialogDescription>
              </DialogHeader>
              <Textarea
                value={cancelReason}
                maxLength={199}
                onChange={(e) => setCancelReason(e.target.value.slice(0, 199))}
                placeholder="Reason for cancellation…"
                className="min-h-24"
              />
              <p className="text-right text-[11px] text-muted-foreground">
                {cancelReason.length}/199
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setCancelOpen(false)}>
                  Keep order
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  loading={cancelCarrybee.isPending}
                  disabled={cancelReason.trim().length < 3}
                  onClick={() => cancelCarrybee.mutate()}
                >
                  <Ban className="size-3.5" />
                  Cancel consignment
                </Button>
              </div>
            </DialogContent>
          </Dialog>

        </div>
      </Panel>

      <OrderSourcePanel source={source} attribution={attribution} />

    </div>
  );
}

const kindIcon = { ip: Globe, fingerprint: Fingerprint, phone: Phone } as const;
const kindLabel = { ip: "IP Address", fingerprint: "Fingerprint", phone: "Phone" } as const;

/** Block / unblock the customer's IP, device fingerprint and phone number. */
export function SecurityCard({
  orderId,
  identifiers,
  blocked,
  ipLocation,
}: {
  orderId: string;
  identifiers: Array<{ kind: BlockKind; value: string | null }>;
  blocked: Array<{ kind: string; value: string }>;
  ipLocation?: Record<string, unknown> | null;
}) {
  const qc = useQueryClient();
  const present = identifiers.filter(
    (i): i is { kind: BlockKind; value: string } => Boolean(i.value),
  );
  const [selected, setSelected] = useState<string[]>([]);

  const isBlocked = (kind: string, value: string) =>
    blocked.some((b) => b.kind === kind && b.value === value);

  const mutate = useMutation({
    mutationFn: (action: "block" | "unblock") =>
      adminSetBlocked({
        data: {
          orderId,
          action,
          targets: present.filter((p) => selected.includes(p.value)),
        },
      }),
    onSuccess: async (_r, action) => {
      toast.success(action === "block" ? "Identifiers blocked" : "Identifiers unblocked");
      setSelected([]);
      await qc.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Panel className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <Shield className="size-4 text-primary" />
          Device &amp; Security
        </h2>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setSelected(present.map((p) => p.value))}
          >
            Select all
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={selected.length === 0 || mutate.isPending}
            onClick={() => mutate.mutate("block")}
          >
            <ShieldX className="size-3.5" />
            Block
          </Button>
          <Button
            size="sm"
            disabled={selected.length === 0 || mutate.isPending}
            onClick={() => mutate.mutate("unblock")}
            className="bg-[hsl(143,85%,32%)] text-white hover:bg-[hsl(143,85%,27%)] focus-visible:ring-[hsl(143,85%,32%)]"
          >
            <ShieldCheck className="size-3.5" />
            Unblock
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {present.length === 0 ? (
          <p className="text-sm text-muted-foreground">No identifiers captured for this order.</p>
        ) : (
          present.map((item) => {
            const Icon = kindIcon[item.kind];
            const active = !isBlocked(item.kind, item.value);
            return (
              <div
                key={`${item.kind}-${item.value}`}
                className="space-y-2 rounded-xl border border-border/70 bg-background/60 p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    <Icon className="size-3.5" />
                    {kindLabel[item.kind]}
                  </span>
                  <Checkbox
                    checked={selected.includes(item.value)}
                    onCheckedChange={(v) =>
                      setSelected((s) =>
                        v ? [...s, item.value] : s.filter((x) => x !== item.value),
                      )
                    }
                  />
                </div>
                <p className="break-all font-mono text-xs text-foreground">{item.value}</p>
                <span
                  className={cn(
                    "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1",
                    active
                      ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
                      : "bg-rose-50 text-rose-800 ring-rose-200",
                  )}
                >
                  {active ? "Active" : "Blocked"}
                </span>
              </div>
            );
          })
        )}
      </div>

      {ipLocation && Object.keys(ipLocation).length > 0 ? (
        <div className="rounded-xl border border-border/70 bg-background/60 p-3">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase text-muted-foreground">
            <MapPin className="size-3.5" /> IP-based location
          </div>
          <CountryIdentity country={ipLocation["country"]} />
          <p className="mt-2 break-words text-sm font-semibold">
            {[ipLocation["city"], ipLocation["region"]]
              .filter((value): value is string => typeof value === "string" && value.length > 0)
              .join(", ")}
          </p>
          <p className="mt-1 break-words text-xs text-muted-foreground">
            {[ipLocation["postalCode"], ipLocation["timezone"]]
              .filter((value): value is string => typeof value === "string" && value.length > 0)
              .join(" · ")}
          </p>
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Select any combination and use Block or Unblock. Blocked identifiers cannot place new
        orders — enforced server-side at checkout.
      </p>
    </Panel>
  );
}

/** Staff-only notes. Never visible to the customer. */
export function InternalNotesCard({ orderId, notes }: { orderId: string; notes: NoteRow[] }) {
  const qc = useQueryClient();
  const [body, setBody] = useState("");

  const add = useMutation({
    mutationFn: () => adminAddOrderNote({ data: { orderId, body } }),
    onSuccess: async () => {
      setBody("");
      await qc.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Panel className="space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-bold">
        <NotebookPen className="size-4 text-primary" />
        Internal Notes (staff only)
      </h2>
      <div className="flex items-start gap-2">
        <Textarea
          rows={2}
          className="rounded-xl"
          placeholder="Only staff can see this…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <Button
          size="sm"
          loading={add.isPending}
          disabled={body.trim().length === 0}
          onClick={() => add.mutate()}
        >
          Add
        </Button>
      </div>

      {notes.length === 0 ? (
        <p className="text-xs text-muted-foreground">No internal notes yet.</p>
      ) : (
        <ul className="space-y-2">
          {notes.map((n) => (
            <li
              key={n.id}
              className="rounded-xl border border-border/70 bg-background/60 p-3"
            >
              <p className="whitespace-pre-wrap text-sm">{n.body}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {n.author_name ?? "Staff"} · {dt(n.created_at)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
