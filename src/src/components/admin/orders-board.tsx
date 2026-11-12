import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Search, Clock, Globe, Eye, ShieldAlert, UserRound, Truck, Loader2, Banknote } from "lucide-react";
import { toast } from "sonner";

import { adminListOrders } from "@/lib/admin.functions";
import { paymentFilters, type OrderBucket, type OrderStatus, type PaymentFilter } from "@/lib/admin-schema";
import { EmptyState, Panel, StatusPill, statusLabels } from "@/components/admin/kit";
import { BrandLoader } from "@/components/admin/brand-loader";
import { PhoneActions } from "@/components/admin/phone-actions";
import { CopyBadge } from "@/components/admin/copy-badge";
import { RatioBadge } from "@/components/admin/ratio-badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { courierCachedRatios } from "@/lib/courier.functions";
import { adminProcessRtsChunk, adminStartRtsJob } from "@/lib/dispatch.functions";
import {
  courierStatusLabels,
  courierStatusTone,
  type CourierStatus,
} from "@/lib/delivery-shared";
import { CourierStatusBar } from "@/components/admin/courier-status";
import { CourierApiStatusBar } from "@/components/admin/courier-api-status";
import { CourierBadge } from "@/components/admin/courier-logo";
import { cn } from "@/lib/utils";
import { Pagination } from "@/components/admin/pagination";
import { useOrderPresence } from "@/lib/use-order-presence";
import { useOrderRealtime } from "@/lib/use-order-realtime";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";



function adminPrice(value: number | string | null | undefined) {
  const n = Number(value ?? 0);
  return `৳ ${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

/**
 * Courier cost for this order: the full billed total (delivery + COD fee etc.)
 * when the courier has reported it, otherwise the base delivery fee.
 */
function courierFee(order: unknown): { amount: number; full: boolean } | null {
  const rows = (
    order as {
      order_consignments?: Array<{
        delivery_fee: number | string | null;
        total_cost?: number | string | null;
      }>;
    }
  ).order_consignments;
  if (!rows?.length) return null;
  const totals = rows.map((r) => r.total_cost).find((v) => v !== null && v !== undefined);
  if (totals !== null && totals !== undefined) return { amount: Number(totals), full: true };
  const fee = rows.map((r) => r.delivery_fee).find((v) => v !== null && v !== undefined);
  return fee === null || fee === undefined ? null : { amount: Number(fee), full: false };
}

/** Cash the rider actually handed back — reported by the courier on (partial) delivery. */
function collectedAmount(order: unknown): number | null {
  const rows = (
    order as {
      order_consignments?: Array<{ collected_amount?: number | string | null }>;
    }
  ).order_consignments;
  const v = rows?.map((r) => r.collected_amount).find((x) => x !== null && x !== undefined);
  return v === null || v === undefined ? null : Number(v);
}

/** Pathao, CarryBee and Steadfast all settle COD money back to us. */
function isPayoutCourier(order: unknown): boolean {
  const o = order as {
    delivery_partner?: string | null;
    order_consignments?: Array<{ provider?: string | null }>;
  };
  const providers = [
    o.delivery_partner,
    ...(o.order_consignments ?? []).map((c) => c.provider),
  ].filter(Boolean) as string[];
  return providers.some((p) => p === "pathao" || p === "carrybee" || p === "steadfast");
}

/** Money is only collectable once the parcel is delivered or partially delivered. */
function isPayable(order: unknown): boolean {
  const o = order as { status?: string | null; courier_status?: string | null };
  return (
    o.status === "delivered" ||
    o.status === "partial_delivered" ||
    o.courier_status === "delivered" ||
    o.courier_status === "partial_delivered"
  );
}

/** Courier payout (an `order.paid` invoice webhook) for this order, if received. */

function courierPayout(order: unknown): { invoice: string | null } | null {
  const rows = (
    order as {
      order_consignments?: Array<{
        paid_at?: string | null;
        payment_invoice_id?: string | null;
      }>;
    }
  ).order_consignments;
  const row = rows?.find((r) => Boolean(r.paid_at));
  return row ? { invoice: row.payment_invoice_id ?? null } : null;
}


function formatBdDateTime(value: string) {
  return new Date(value).toLocaleString("en-US", {
    timeZone: "Asia/Dhaka",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/** Shared order board used by both the Web Orders and Order List screens. */
export function OrdersBoard({
  bucket,
  statuses,
  emptyTitle = "No orders found",
}: {
  bucket: OrderBucket;
  statuses: readonly OrderStatus[];
  emptyTitle?: string;
}) {
  /**
   * Order List also exposes two payment views. They are not order statuses:
   * they slice delivered / partial-delivered parcels by whether Pathao has
   * already paid the money out (an `order.paid` invoice webhook arrived).
   */
  const isSearchBoard = bucket === "search";
  const tabs: readonly string[] =
    bucket === "list" ? [...statuses, ...paymentFilters] : statuses;
  /**
   * Board state lives in the URL so that returning from an order detail page
   * (back button or "Back to orders") restores the exact tab / search / page.
   */
  const boardRoute =
    bucket === "list"
      ? "/admin/orders/list"
      : bucket === "search"
        ? "/admin/orders/search"
        : "/admin/orders";
  const urlSearch = useSearch({ strict: false }) as {
    tab?: string;
    q?: string;
    page?: number;
  };
  const boardNavigate = useNavigate();
  const setBoardSearch = (patch: { tab?: string; q?: string; page?: number }) => {
    void boardNavigate({
      to: boardRoute,
      search: (prev: Record<string, unknown>) => {
        const next = { ...prev, ...patch } as Record<string, unknown>;
        if (!next["q"]) delete next["q"];
        if (!next["page"] || Number(next["page"]) <= 1) delete next["page"];
        return next;
      },
      replace: true,
    });
  };

  /**
   * The active tab is remembered per board so returning from an order detail
   * page always lands on the same status list, even if the URL lost its
   * `?tab=` (e.g. the browser back button or a link without search params).
   */
  const TAB_KEY = `admin.orders.tab.${bucket}`;
  const storedTab =
    typeof window !== "undefined" ? sessionStorage.getItem(TAB_KEY) : null;
  const status = isSearchBoard
    ? ""
    : urlSearch.tab && tabs.includes(urlSearch.tab)
      ? urlSearch.tab
      : storedTab && tabs.includes(storedTab)
        ? storedTab
        : tabs[0]!;
  useEffect(() => {
    if (isSearchBoard || !status) return;
    sessionStorage.setItem(TAB_KEY, status);
    // Keep the URL in sync so refresh / share keeps the same tab.
    if (urlSearch.tab !== status) setBoardSearch({ tab: status });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, urlSearch.tab]);
  const setStatus = (s: string) => setBoardSearch({ tab: s, page: 1 });
  const isPaymentView = (paymentFilters as readonly string[]).includes(status);
  const search = urlSearch.q ?? "";
  const setSearch = (q: string) => setBoardSearch({ q, page: 1 });
  /**
   * The input is local + debounced: typing stays instant while the URL and the
   * network request only update once the user pauses (300ms).
   */
  const [searchInput, setSearchInput] = useState(search);
  const [inputFocused, setInputFocused] = useState(false);
  useEffect(() => {
    if (!inputFocused) setSearchInput(search);
  }, [search, inputFocused]);
  useEffect(() => {
    if (searchInput === search) return;
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const page = Math.max(1, Number(urlSearch.page) || 1);
  const setPage = (next: number | ((prev: number) => number)) =>
    setBoardSearch({ page: typeof next === "function" ? next(page) : next });
  const PAGE_SIZE_KEY = "admin.orders.pageSize";
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    const saved = Number(localStorage.getItem(PAGE_SIZE_KEY));
    if (saved && saved !== pageSize) setPageSize(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    localStorage.setItem(PAGE_SIZE_KEY, String(pageSize));
  }, [pageSize]);

  const { data, isLoading, isFetching } = useQuery({
    enabled: !isSearchBoard || search.trim().length > 0,
    placeholderData: (prev) => prev,
    staleTime: 15 * 1000,
    queryKey: ["admin", "orders", bucket, status, search],

    queryFn: () =>
      adminListOrders({
        data: {
          bucket,
          ...(isPaymentView
            ? { payment: status as PaymentFilter }
            : status
              ? { status: status as OrderStatus }
              : {}),
          ...(search ? { search } : {}),
        },
      }),
  });

  const all = data ?? [];
  const total = all.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), totalPages);
  const rows = all.slice((current - 1) * pageSize, current * pageSize);

  const { user } = useAuth();
  const navigate = useNavigate();
  useOrderRealtime();
  const presence = useOrderPresence(rows.map((o) => o.id));
  const [takeover, setTakeover] = useState<{ id: string; name: string } | null>(null);

  const qc = useQueryClient();
  const bulkEnabled = bucket === "list" && status === "pending";
  const [selected, setSelected] = useState<string[]>([]);
  const [rtsOpen, setRtsOpen] = useState(false);
  const [rtsRunning, setRtsRunning] = useState(false);
  const [rtsProgress, setRtsProgress] = useState({ done: 0, total: 0, failed: 0 });

  useEffect(() => {
    setSelected([]);
  }, [status, bucket, search, current]);

  const toggleOne = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const allOnPage = rows.every((o) => selected.includes(o.id)) && rows.length > 0;
  const toggleAll = () =>
    setSelected((prev) =>
      allOnPage ? prev.filter((id) => !rows.some((o) => o.id === id)) : [
        ...new Set([...prev, ...rows.map((o) => o.id)]),
      ],
    );

  /** Sends the selected pending orders to their courier in small chunks. */
  const runRts = async () => {
    setRtsRunning(true);
    setRtsProgress({ done: 0, total: selected.length, failed: 0 });
    try {
      const job = await adminStartRtsJob({ data: { orderIds: selected } });
      let done = 0;
      let failed = 0;
      for (const chunk of job.chunks) {
        const res = await adminProcessRtsChunk({
          data: { jobId: job.jobId, orderIds: chunk },
        });
        done += chunk.length;
        failed += res.results.filter((r) => !r.ok).length;
        for (const r of res.results) {
          if (!r.ok) toast.error(`${r.orderNumber}: ${r.message}`);
        }
        setRtsProgress({ done, total: job.total, failed });
      }
      toast.success(`${done - failed} order(s) sent to courier${failed ? `, ${failed} failed` : ""}`);
      setSelected([]);
      setRtsOpen(false);
      await qc.invalidateQueries({ queryKey: ["admin", "orders"] });
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setRtsRunning(false);
    }
  };

  const phones = [...new Set(rows.map((o) => o.customer_phone))];
  const { data: ratios } = useQuery({
    queryKey: ["admin", "courier", "ratios", phones.join(",")],
    queryFn: () => courierCachedRatios({ data: { phones } }),
    enabled: phones.length > 0,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });


  return (
    <div className="space-y-5">
      {bucket === "list" ? (
        <CourierApiStatusBar />
      ) : bucket === "web" ? (
        <div className="flex justify-end">
          <CourierStatusBar />
        </div>
      ) : null}


      <div className="admin-rise flex flex-wrap items-center gap-3 rounded-2xl border border-border/70 bg-card p-3">
        <div className={cn("relative flex-1", isSearchBoard ? "min-w-[260px]" : "max-w-xs min-w-[200px]")}>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setSearch(searchInput.trim());
              if (e.key === "Escape") setSearchInput("");
            }}
            autoFocus={isSearchBoard}
            placeholder={
              isSearchBoard
                ? "Invoice, phone, customer name, courier tracking or consignment ID"
                : "Order number, name or phone"
            }
            className="rounded-xl border-border/80 bg-background/70 pl-9 pr-9"
          />
          {isFetching && searchInput ? (
            <Loader2 className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          ) : null}

        </div>
        <div className={cn("flex flex-wrap gap-1.5", isSearchBoard && "hidden")}>
          {tabs.map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-200 hover:-translate-y-0.5",
                status === s
                  ? "ig-gradient text-primary-foreground shadow-sm"
                  : (paymentFilters as readonly string[]).includes(s)
                    ? s === "paid"
                      ? "bg-emerald-100 text-emerald-900 hover:bg-emerald-200"
                      : "bg-rose-100 text-rose-900 hover:bg-rose-200"
                    : "bg-muted text-muted-foreground hover:bg-muted/70",
              )}
            >
              {statusLabels[s] ?? s}
            </button>
          ))}
        </div>

      </div>

      {bulkEnabled && total > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border/70 bg-card px-4 py-3">
          <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            <Checkbox checked={allOnPage} onCheckedChange={toggleAll} />
            Select all on this page
          </label>
          <span className="text-xs text-muted-foreground">{selected.length} selected</span>
          <Button
            size="sm"
            disabled={selected.length === 0}
            onClick={() => setRtsOpen(true)}
            className="ml-auto bg-sky-600 text-white hover:bg-sky-700 active:scale-95"
          >
            <Truck className="size-4" />
            Send To RTS
          </Button>
        </div>
      ) : null}

      <Panel className="p-0">
        {isSearchBoard && search.trim().length === 0 ? (
          <div className="p-4">
            <EmptyState title="Start typing to search every order" />
          </div>
        ) : isLoading ? (
          <BrandLoader size="md" className="py-8" />
        ) : total === 0 ? (
          <div className="p-4">
            <EmptyState title={emptyTitle} />
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((o, rowIndex) => (

              <li
                key={o.id}
                className="group flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 transition-colors duration-200 hover:bg-muted/40"
              >
                <span
                  className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-amber-500 text-xs font-bold tabular-nums text-primary-foreground shadow-md shadow-primary/20 ring-2 ring-white/80 transition-all duration-200 group-hover:scale-110 group-hover:shadow-lg group-hover:shadow-primary/30 dark:ring-white/20"
                  aria-label={`Serial number ${(current - 1) * pageSize + rowIndex + 1}`}
                  title="Serial number"
                >
                  {(current - 1) * pageSize + rowIndex + 1}
                </span>
                {bulkEnabled ? (
                  <Checkbox
                    checked={selected.includes(o.id)}
                    onCheckedChange={() => toggleOne(o.id)}
                    aria-label={`Select ${o.order_number}`}
                  />
                ) : null}

                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[15px] font-bold text-foreground">{o.customer_name}</span>
                    <StatusPill status={o.status} />
                    {(o as { created_by?: string | null; created_by_name?: string | null }).created_by ? (
                      <span
                        title="Created from the admin panel"
                        className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-800 ring-1 ring-sky-200"
                      >
                        <UserRound className="size-3" />
                        Manual · Created by {(o as { created_by_name?: string | null }).created_by_name || "Staff"}
                      </span>
                    ) : null}
                    <CopyBadge value={o.order_number} />
                    <PhoneActions phone={o.customer_phone} size="sm" />

                    {ratios?.[o.customer_phone] ? (
                      <RatioBadge data={ratios[o.customer_phone]!} />
                    ) : null}
                    {(o as { delivery_partner?: string | null }).delivery_partner ? (
                      <CourierBadge
                        partner={(o as { delivery_partner?: string | null }).delivery_partner ?? null}
                        className="py-1"
                      />
                    ) : null}
                    {(o as { courier_status?: string | null }).courier_status ? (
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-bold ring-1",
                          courierStatusTone(
                            (o as { courier_status?: string }).courier_status as CourierStatus,
                          ),
                        )}
                      >
                        {courierStatusLabels[
                          (o as { courier_status?: string }).courier_status as CourierStatus
                        ] ?? (o as { courier_status?: string }).courier_status}
                      </span>
                    ) : null}
                    {(() => {
                      const fee = courierFee(o);
                      if (fee === null) return null;
                      return (
                        <span
                          title={
                            fee.full
                              ? "Total courier cost (delivery + COD fee & charges)"
                              : "Base delivery fee — refresh courier status for the full billed cost"
                          }
                          className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-bold tabular-nums text-amber-900 ring-1 ring-amber-200"
                        >
                          <Truck className="size-3" />
                          {fee.full ? "Courier cost" : "Delivery"} {adminPrice(fee.amount)}
                        </span>
                      );
                    })()}
                    {(() => {
                      const collected = collectedAmount(o);
                      // Only Pathao / CarryBee report a collected amount, and it
                      // only means anything once the parcel is (partially) delivered.
                      if (collected === null || !isPayoutCourier(o) || !isPayable(o)) return null;
                      const partial =
                        (o as { courier_status?: string | null }).courier_status ===
                          "partial_delivered" || o.status === "partial_delivered";
                      return (
                        <span
                          title={
                            partial
                              ? "Partial delivery — amount the courier collected"
                              : "Amount the courier collected"
                          }
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ring-1",
                            partial
                              ? "bg-orange-50 text-orange-800 ring-orange-200"
                              : "bg-emerald-50 text-emerald-800 ring-emerald-200",
                          )}
                        >
                          <Banknote className="size-3" />
                          {partial ? "Partial collected" : "Collected"} {adminPrice(collected)}
                        </span>
                      );
                    })()}

                    {(() => {
                      // Every delivered / partial-delivered Pathao or CarryBee parcel
                      // carries a payout chip: red until the courier settles, green after.
                      if (!isPayoutCourier(o) || !isPayable(o)) return null;
                      const payout = courierPayout(o);
                      if (payout) {
                        return (
                          <span
                            title={`Courier payout received${payout.invoice ? ` · Invoice ${payout.invoice}` : ""}`}
                            className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-900 ring-1 ring-emerald-300"
                          >
                            <Banknote className="size-3" />
                            Courier paid{payout.invoice ? ` · ${payout.invoice}` : ""}
                          </span>
                        );
                      }
                      return (
                        <span
                          title="Courier has not paid this parcel out yet"
                          className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-900 ring-1 ring-rose-300"
                        >
                          <Banknote className="size-3" />
                          Courier unpaid
                        </span>
                      );
                    })()}

                  </div>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <Clock className="size-3.5" />
                      {formatBdDateTime(o.created_at)}
                    </span>
                    <span className="font-semibold tabular-nums text-primary">
                      {adminPrice(o.total)}
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-1.5 py-0.5 font-mono">
                      <Globe className="size-3" />
                      {(o as { customer_ip?: string | null }).customer_ip ?? "—"}
                    </span>
                  </div>
                </div>

                {(() => {
                  const held = presence[o.id];
                  const byOther = held && held.user_id !== user?.id;
                  if (!byOther) {
                    return (
                      <Link
                        to="/admin/orders/$id"
                        params={{ id: (o.order_number || o.id).toLowerCase() }}
                        search={{
                          ...(bucket === "list" ? { from: "list" as const } : {}),
                          ...(bucket === "search" ? { from: "search" as const } : {}),
                          ...(status ? { tab: status } : {}),
                          ...(search ? { q: search } : {}),
                          ...(current > 1 ? { page: current } : {}),
                        }}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-primary/40 hover:bg-accent active:scale-95"
                      >
                        <Eye className="size-3.5" />
                        View
                      </Link>
                    );
                  }
                  return (
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700 ring-1 ring-rose-200">
                        <UserRound className="size-3.5" />
                        {held.actor_name} is handling
                      </span>
                      <button
                        onClick={() => setTakeover({ id: o.id, name: held.actor_name })}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition-all hover:bg-rose-700 active:scale-95"
                      >
                        <ShieldAlert className="size-4" />
                        Takeover
                      </button>
                    </div>
                  );
                })()}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {total > 0 ? (
        <Pagination
          page={current}
          pageSize={pageSize}
          total={total}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      ) : null}

      <Dialog open={rtsOpen} onOpenChange={(open) => !rtsRunning && setRtsOpen(open)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Truck className="size-4 text-sky-600" />
              Send {selected.length} order(s) to RTS?
            </DialogTitle>
            <DialogDescription>
              Each order is booked with the delivery partner saved on it. Orders are processed in
              small batches, so large selections stay safe. Failed orders stay in Pending.
            </DialogDescription>
          </DialogHeader>
          {rtsRunning ? (
            <div className="space-y-2">
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-sky-600 transition-all"
                  style={{
                    width: `${rtsProgress.total ? (rtsProgress.done / rtsProgress.total) * 100 : 0}%`,
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {rtsProgress.done}/{rtsProgress.total} processed
                {rtsProgress.failed ? ` · ${rtsProgress.failed} failed` : ""}
              </p>
            </div>
          ) : null}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" disabled={rtsRunning} onClick={() => setRtsOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={rtsRunning}
              onClick={() => void runRts()}
              className="bg-sky-600 text-white hover:bg-sky-700 active:scale-95"
            >
              {rtsRunning ? <Loader2 className="size-4 animate-spin" /> : <Truck className="size-4" />}
              Confirm & Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!takeover} onOpenChange={(open) => !open && setTakeover(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <ShieldAlert className="size-4 text-rose-600" />
              Take over this order?
            </DialogTitle>
            <DialogDescription>
              <span className="font-semibold text-foreground">{takeover?.name}</span> is currently
              handling this order. If you confirm, they will be removed from the order workspace
              immediately and this takeover will be recorded in the activity log.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setTakeover(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                const id = takeover?.id;
                setTakeover(null);
                if (id)
                  void navigate({
                    to: "/admin/orders/$id",
                    params: { id },
                    search: {
                      takeover: 1 as const,
                      ...(bucket === "list" ? { from: "list" as const } : {}),
                      ...(bucket === "search" ? { from: "search" as const } : {}),
                    },
                  });
              }}
            >
              <ShieldAlert className="size-4" />
              Confirm takeover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>

  );
}
