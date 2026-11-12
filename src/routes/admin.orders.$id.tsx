import { CopyBadge } from "@/components/admin/copy-badge";
import { Link, createFileRoute, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, Copy, Download, ExternalLink, FileText, MessageSquare, ShieldAlert, UserRound, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { adminUpdateOrderStatus } from "@/lib/admin.functions";
import type { AttributionPayload } from "@/lib/attribution";
import { adminListDeliveryPartners } from "@/lib/delivery.functions";
import { providerLabels } from "@/lib/delivery-shared";
import {
  adminClaimOrder,
  adminHeartbeatOrder,
  adminReleaseOrder,
} from "@/lib/presence.functions";
import { useOrderPresence } from "@/lib/use-order-presence";
import { useIdleTimeout } from "@/lib/use-idle";
import { useOrderRealtime } from "@/lib/use-order-realtime";
import { useAuth } from "@/lib/auth-context";
import { adminOrderWorkspace } from "@/lib/order-admin.functions";
import { webOrderStatuses, type OrderStatus } from "@/lib/admin-schema";
import { adminListSmsTemplates } from "@/lib/sms-templates.functions";
import { renderSmsTemplate, orderSmsVars } from "@/lib/sms-template";

import { Panel, StatusPill, statusLabels } from "@/components/admin/kit";
import { BrandLoader } from "@/components/admin/brand-loader";
import { CourierReport } from "@/components/admin/courier-report";
import { ActivityLog } from "@/components/admin/order/activity-log";
import { CustomerCard } from "@/components/admin/order/customer-card";
import { DeliveryNoteCard, ItemsCard } from "@/components/admin/order/items-card";
import { CommunicationLog, SmsCard } from "@/components/admin/order/sms-card";
import {
  FulfillmentCard,
  InternalNotesCard,
  SecurityCard,
} from "@/components/admin/order/security-card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const updatableStatuses = [
  "no_response",
  "good_no_response",
  "hold",
  "pre_order",
  "scheduled_order",
  "cancelled",
] as const;
type PendingStatus = (typeof updatableStatuses)[number];

/** `date` input value for tomorrow, used as the schedule default. */
function defaultScheduleValue(): string {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const Route = createFileRoute("/admin/orders/$id")({
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    takeover?: number;
    from?: "list" | "search";
    tab?: string;
    q?: string;
    page?: number;
  } => ({
    ...(search["takeover"] ? { takeover: 1 as const } : {}),
    ...(search["from"] === "list" ? { from: "list" as const } : {}),
    ...(search["from"] === "search" ? { from: "search" as const } : {}),
    ...(typeof search["tab"] === "string" && search["tab"] ? { tab: search["tab"] } : {}),
    ...(typeof search["q"] === "string" && search["q"] ? { q: search["q"] } : {}),
    ...(Number(search["page"]) > 1 ? { page: Number(search["page"]) } : {}),
  }),

  component: AdminOrderDetail,
});


type OrderItemRow = {
  id: string;
  product_id: string | null;
  product_name: string;
  variant_label: string | null;
  sku: string | null;
  unit_price: number | string;
  quantity: number;
  image?: string | null;
  combo_selections?: Array<{
    item_id?: string;
    item_name_bn?: string;
    item_name_en?: string;
    quantity?: number;
    variant_id?: string;
    variant_label_bn?: string;
    variant_label_en?: string;
    sku?: string | null;
    image?: string | null;
  }>;

};

function AdminOrderDetail() {
  const { id: slug } = useParams({ from: "/admin/orders/$id" });
  const { takeover, from, tab, q, page } = useSearch({ from: "/admin/orders/$id" });
  /** Return to whichever board (and tab / search / page) the user came from. */
  const backTo =
    from === "list"
      ? "/admin/orders/list"
      : from === "search"
        ? "/admin/orders/search"
        : "/admin/orders";
  const backSearch = {
    ...(tab ? { tab } : {}),
    ...(q ? { q } : {}),
    ...(page && page > 1 ? { page } : {}),
  };

  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "order-workspace", slug],
    queryFn: () => adminOrderWorkspace({ data: { id: slug } }),
  });

  /** Real UUID of the order — resolved from the pretty slug in the URL. */
  const id = ((data?.order as { id?: string } | undefined)?.id ?? "") as string;

  // ---- Live presence: claim the order, heartbeat, release, react to takeovers ----
  useOrderRealtime(id || undefined);
  const presence = useOrderPresence(id ? [id] : []);
  const held = id ? presence[id] : undefined;
  const [blockedBy, setBlockedBy] = useState<string | null>(null);
  const [evictedBy, setEvictedBy] = useState<string | null>(null);
  const ownsRef = useRef(false);

  const claim = async (force: boolean) => {
    if (!id) return;
    try {
      const res = await adminClaimOrder({ data: { id, ...(force ? { force: true } : {}) } });
      if (res.ok) {
        ownsRef.current = true;
        setBlockedBy(null);
      } else {
        ownsRef.current = false;
        setBlockedBy(res.heldBy);
      }
    } catch {
      // Not signed in (or session expired) — presence simply stays unclaimed.
      ownsRef.current = false;
    }
  };


  useEffect(() => {
    if (!id) return;
    void claim(takeover === 1);
    const beat = setInterval(() => {
      // Presence is best-effort: after sign-out these calls 401, which must
      // not surface as an unhandled rejection (blank screen).
      if (ownsRef.current) void adminHeartbeatOrder({ data: { id } }).catch(() => {});
    }, 25_000);
    return () => {
      clearInterval(beat);
      if (ownsRef.current) void adminReleaseOrder({ data: { id } }).catch(() => {});
      ownsRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);


  // Idle guard: 5 minutes without any activity releases the order and sends
  // the staff member back to the board, so nobody blocks an order by walking
  // away from the desk.
  useIdleTimeout(
    5 * 60_000,
    () => {
      if (ownsRef.current) {
        void adminReleaseOrder({ data: { id } }).catch(() => {});
        ownsRef.current = false;
      }
      toast.info("৫ মিনিট নিষ্ক্রিয় থাকায় অর্ডার থেকে বের করে দেওয়া হয়েছে");
      void navigate({ to: backTo, search: backSearch });
    },
    Boolean(id) && !evictedBy,
  );

  // Someone else claimed the order while we were inside it.
  useEffect(() => {
    if (!user || !held || !ownsRef.current) return;
    if (held.user_id !== user.id) {
      ownsRef.current = false;
      setEvictedBy(held.actor_name);
    }
  }, [held, user]);


  const smsTemplates = useQuery({
    queryKey: ["admin", "sms-templates"],
    queryFn: () => adminListSmsTemplates(),
  });

  const partners = useQuery({
    queryKey: ["admin", "delivery-partners"],
    queryFn: () => adminListDeliveryPartners(),
  });
  const activePartners = (partners.data ?? []).filter((p) => p.enabled);
  const [courier, setCourier] = useState("");
  const defaultPartnerApplied = useRef(false);

  const savedPartner =
    (data?.order as { delivery_partner?: string | null } | undefined)?.delivery_partner ?? "";

  // Pre-select the order's saved courier, else the one marked default in Settings → Delivery.
  useEffect(() => {
    if (defaultPartnerApplied.current || courier) return;
    if (!data?.order) return; // wait for the order, else the default overrides the saved partner
    if (savedPartner) {
      defaultPartnerApplied.current = true;
      setCourier(savedPartner);
      return;
    }
    if (activePartners.length === 0) return;
    const fallback = activePartners.find((p) => p.is_default);
    if (!fallback) return;
    defaultPartnerApplied.current = true;
    setCourier(providerLabels[fallback.provider]);
  }, [activePartners, courier, savedPartner, data?.order]);


  const courierTemplate =
    activePartners.find((p) => providerLabels[p.provider] === courier)?.note_template ?? "";

  const [pending, setPending] = useState<PendingStatus | "">("");
  const [reason, setReason] = useState("");
  /** `datetime-local` value used when moving the order to Scheduled Order. */
  const [scheduleAt, setScheduleAt] = useState(defaultScheduleValue);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [silent, setSilent] = useState(false);

  const update = useMutation({
    mutationFn: (input: {
      status: OrderStatus;
      reason?: string;
      skipSms?: boolean;
      deliveryPartner?: string;
      scheduledFor?: string | null;
    }) =>
      adminUpdateOrderStatus({
        data: {
          id,
          status: input.status,
          ...(input.reason ? { reason: input.reason } : {}),
          ...(input.skipSms ? { skipSms: true } : {}),
          ...(input.deliveryPartner ? { deliveryPartner: input.deliveryPartner } : {}),
          ...(input.scheduledFor ? { scheduledFor: input.scheduledFor } : {}),
        },
      }),
    onSuccess: async () => {
      toast.success(silent ? "Order confirmed (no SMS sent)" : "Status updated");
      setConfirmOpen(false);
      setPending("");
      setReason("");
      await qc.invalidateQueries({ queryKey: ["admin"] });
      // Leave the order workspace right away and return to the board (and the
      // exact status tab) the user came from.
      if (ownsRef.current) {
        void adminReleaseOrder({ data: { id } }).catch(() => {});
        ownsRef.current = false;
      }
      void navigate({ to: backTo, search: backSearch });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <BrandLoader size="md" className="py-8" />;
  if (!data) {
    return (
      <Panel className="space-y-3 text-center">
        <p className="text-sm font-bold">Order not found</p>
        <Button asChild variant="outline">
          <Link to={backTo} search={backSearch}>Back to orders</Link>
        </Button>
      </Panel>
    );
  }

  const order = data.order as unknown as {
    id: string;
    order_number: string;
    status: string;
    created_at: string;
    customer_name: string;
    customer_phone: string;
    alt_phone: string | null;
    division: string | null;
    district: string | null;
    upazila: string | null;
    address_line: string;
    customer_ip: string | null;
    device_fingerprint: string | null;
    customer_ip_location?: Record<string, unknown> | null;
    delivery_note: string | null;
    note: string | null;
    delivery_partner: string | null;
    delivery_charge: number | string;
    discount: number | string;
    total?: number | string | null;
    advance_amount?: number | string | null;
    advance_method?: string | null;
    fulfillment_status: string;
    scheduled_for?: string | null;
    courier_status?: string | null;
    courier_consignment_id?: string | null;
    courier_tracking_code?: string | null;
    courier_sent_at?: string | null;
    auto_sms_status: string;
    source: string;
    attribution?: unknown;
    coupon?: { code: string; name: string; amount: number } | null;
    order_items: OrderItemRow[];
    order_activity?: Array<{
      id: string;
      kind: string;
      message: string | null;
      meta?: unknown;
      created_at: string;
    }>;
  };

  const confirmTemplate = (smsTemplates.data?.templates ?? []).find(
    (t) => t.key === "order_confirm",
  );
  const autoSmsEnabled = confirmTemplate?.enabled !== false;
  const confirmSms = renderSmsTemplate(confirmTemplate?.body ?? "", orderSmsVars(order));



  const isWeb = (webOrderStatuses as readonly string[]).includes(order.status);
  const isDanger = pending === "hold" || pending === "cancelled";
  /** Once dispatched to a courier the shipment data is frozen. */
  /** Cancelled by/after courier entry — the order is final, a new entry is required. */
  const courierCancelled =
    order.status === "cancelled" &&
    Boolean(order.courier_consignment_id || order.courier_sent_at);

  const dispatchLocked =
    courierCancelled ||
    [
      "rts",
      "shipped",
      "courier_hold",
      "partial_delivered",
      "exchange",
      "delivered",
      "awaiting_return",
      "returned",
      "lost_damaged",
    ].includes(order.status);


  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <Button asChild variant="outline" size="sm" className="rounded-xl">
          <Link to={backTo} search={backSearch}>
            <ArrowLeft className="size-4" />
            Back to orders
          </Link>
        </Button>
        {held && user && held.user_id === user.id ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200">
            <UserRound className="size-3.5" />
            You are handling this order
          </span>
        ) : null}
      </div>

      {/* Header: order number + status + status controls */}
      <Panel className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <CopyBadge
              value={order.order_number}
              className="bg-transparent px-0 py-0 font-mono text-xl font-bold tracking-tight text-foreground hover:bg-transparent"
            />

            <p className="mt-1 text-xs text-muted-foreground">
              {new Date(order.created_at).toLocaleString("en-US", {
                timeZone: "Asia/Dhaka",
                day: "numeric",
                month: "short",
                year: "numeric",
                hour: "numeric",
                minute: "2-digit",
                hour12: true,
              })}
            </p>
            {order.status === "scheduled_order" && order.scheduled_for ? (
              <p className="mt-1 text-xs font-bold text-cyan-700">
                Scheduled for{" "}
                {new Date(order.scheduled_for).toLocaleString("en-US", {
                  timeZone: "Asia/Dhaka",
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                  hour12: true,
                })}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={order.status} />
            {courierCancelled ? (
              <span className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-800">
                <X className="size-3.5" />
                Cancelled at courier — locked. Create a new order to reship.
              </span>
            ) : (
            <Select
              {...(pending ? { value: pending } : {})}
              onValueChange={(v) => {
                setPending(v as PendingStatus);
                setReason("");
              }}
            >
              <SelectTrigger className="h-9 w-[190px] rounded-xl border-border bg-background text-sm font-semibold">
                <SelectValue placeholder="Update Status" />
              </SelectTrigger>
              <SelectContent>
                {(order.status === "rts"
                  ? (["cancelled"] as const satisfies readonly PendingStatus[])
                  : updatableStatuses
                ).map((s) => (
                  <SelectItem key={s} value={s} disabled={s === order.status}>
                    {statusLabels[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            )}
            {pending ? (
              <button
                aria-label="Clear"
                className="transition-transform active:scale-90"
                onClick={() => {
                  setPending("");
                  setReason("");
                }}
              >
                <X className="size-4 text-muted-foreground" />
              </button>
            ) : null}
            <Button
              size="sm"
              onClick={() => setInvoiceOpen(true)}
              className="border-0 bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 text-white shadow-md shadow-indigo-500/20 transition-all hover:brightness-110 hover:shadow-lg hover:shadow-indigo-500/30 active:scale-95"
            >
              <FileText className="size-4" />
              Invoice
            </Button>
            <InvoiceActionsDialog
              open={invoiceOpen}
              onOpenChange={setInvoiceOpen}
              orderNumber={order.order_number}
              phone={order.customer_phone}
            />
          </div>
        </div>

        {isDanger ? (
          <div
            className={
              pending === "hold"
                ? "ml-auto max-w-md space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-3"
                : "ml-auto max-w-md space-y-2 rounded-xl border border-rose-300 bg-rose-50 p-3"
            }
          >
            <p
              className={
                pending === "hold"
                  ? "text-[11px] font-bold uppercase tracking-[0.08em] text-amber-800"
                  : "text-[11px] font-bold uppercase tracking-[0.08em] text-rose-800"
              }
            >
              {pending === "hold" ? "Reason for hold" : "Reason for cancel"}
            </p>
            <Textarea
              rows={2}
              maxLength={500}
              autoFocus
              className="rounded-lg border-border/70 bg-white/80 text-sm"
              placeholder={
                pending === "hold"
                  ? "e.g. Customer asked to pause, awaiting stock…"
                  : "e.g. Customer requested cancellation, duplicate…"
              }
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">{reason.length}/500</span>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" onClick={() => setPending("")}>
                  Back
                </Button>
                <Button
                  size="sm"
                  variant={pending === "hold" ? "outline" : "destructive"}
                  className={
                    pending === "hold"
                      ? "border-amber-500/30 bg-amber-500 text-white hover:bg-amber-600 hover:text-white"
                      : undefined
                  }
                  loading={update.isPending}
                  disabled={reason.trim().length === 0}
                  onClick={() => update.mutate({ status: pending, reason: reason.trim() })}
                >
                  {pending === "hold" ? "Confirm Hold" : "Confirm Cancel"}
                </Button>
              </div>
            </div>
          </div>
        ) : pending === "scheduled_order" ? (
          <div className="ml-auto max-w-md space-y-2 rounded-xl border border-cyan-300 bg-cyan-50 p-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-cyan-800">
              Schedule this order
            </p>
            <input
              type="date"
              min={new Date().toISOString().slice(0, 10)}
              className="w-full rounded-lg border border-border/70 bg-white/80 px-3 py-2 text-sm outline-none focus:border-primary"
              value={scheduleAt}
              onChange={(e) => setScheduleAt(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              The order stays in Scheduled Order and moves to Processing automatically on this date.
            </p>
            <div className="flex items-center justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setPending("")}>
                Back
              </Button>
              <Button
                size="sm"
                loading={update.isPending}
                disabled={!scheduleAt}
                onClick={() =>
                  update.mutate({
                    status: "scheduled_order",
                    scheduledFor: new Date(`${scheduleAt}T00:00:00`).toISOString(),
                  })
                }
              >
                Schedule order
              </Button>
            </div>
          </div>
        ) : pending ? (
          <div className="flex justify-end">
            <Button
              size="sm"
              loading={update.isPending}
              onClick={() => update.mutate({ status: pending })}
            >
              Confirm change to {statusLabels[pending]}
            </Button>
          </div>
        ) : null}

        {isWeb && !courierCancelled ? (
          <>
            <Button
              size="lg"
              onClick={() => setConfirmOpen(true)}
              className="w-full bg-[hsl(143,85%,32%)] text-white hover:bg-[hsl(143,85%,27%)] focus-visible:ring-[hsl(143,85%,32%)]"
            >
              <CheckCircle2 className="size-5" />
              Confirm Order
            </Button>

            <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-base">
                    <MessageSquare className="size-4 text-[hsl(143,85%,32%)]" />
                    Confirm order {order.order_number}
                  </DialogTitle>
                  <DialogDescription>
                    {autoSmsEnabled
                      ? "This SMS will be sent to the customer and the order moves to Pending."
                      : "Auto SMS is turned off in Settings → SMS Templates. The order will move to Pending without any SMS."}
                  </DialogDescription>
                </DialogHeader>

                <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/40 px-3 py-2">
                  <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                    Delivery partner
                  </p>
                  <p className="text-sm font-bold">
                    {courier || "Not selected — pick it in Customer & Delivery"}
                  </p>
                </div>


                {autoSmsEnabled ? (
                  <div className="rounded-xl border border-border bg-muted/40 p-3">
                    <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                      SMS preview
                    </p>
                    <p className="mt-2 whitespace-pre-wrap rounded-lg border border-border/70 bg-background p-3 text-sm leading-relaxed">
                      {confirmSms}
                    </p>
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      To {order.customer_phone} · {confirmSms.length} chars ·{" "}
                      {order.auto_sms_status === "sent"
                        ? "Already sent for this order"
                        : "Variables rendered with live order data"}
                    </p>
                  </div>
                ) : null}

                <DialogFooter className="gap-2 sm:gap-2">
                  <Button
                    variant="destructive"
                    onClick={() => setConfirmOpen(false)}
                    disabled={update.isPending}
                  >
                    <X className="size-4" />
                    Cancel
                  </Button>
                  <Button
                    variant="outline"
                    loading={update.isPending && silent}
                    disabled={update.isPending || !courier}
                    onClick={() => {
                      setSilent(true);
                      update.mutate({ status: "pending", skipSms: true, deliveryPartner: courier });
                    }}
                  >
                    <CheckCircle2 className="size-4" />
                    Confirm only
                  </Button>
                  {autoSmsEnabled ? (
                    <Button
                      loading={update.isPending && !silent}
                      disabled={update.isPending || !courier}
                      onClick={() => {
                        setSilent(false);
                        update.mutate({ status: "pending", deliveryPartner: courier });
                      }}
                      className="bg-[hsl(143,85%,32%)] text-white hover:bg-[hsl(143,85%,27%)] focus-visible:ring-[hsl(143,85%,32%)]"
                    >
                      <CheckCircle2 className="size-4" />
                      Send SMS & Confirm
                    </Button>
                  ) : null}
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        ) : null}

      </Panel>

      {/* Fraud checker directly under the order title */}
      <CourierReport phone={order.customer_phone} />

      <CustomerCard
        order={order}
        locked={dispatchLocked}
        courierOptions={activePartners.map((p) => providerLabels[p.provider])}
        courier={courier || order.delivery_partner || ""}
        onCourierChange={setCourier}
      />

      <DeliveryNoteCard
        orderId={order.id}
        initial={order.delivery_note ?? ""}
        partner={courier || order.delivery_partner}
        template={courierTemplate}
        locked={dispatchLocked}
      />

      <SmsCard orderId={order.id} phone={order.customer_phone} vars={orderSmsVars(order)} />

      <ItemsCard
        orderId={order.id}
        locked={dispatchLocked}
        deliveryCharge={Number(order.delivery_charge ?? 0)}
        discount={Number(order.discount ?? 0)}
        couponCode={order.coupon?.code ?? null}
        advanceAmount={Number(order.advance_amount ?? 0)}
        advanceMethod={order.advance_method ?? null}
        initialItems={(order.order_items ?? []).map((i) => ({
          productId: i.product_id,
          productName: i.product_name,
          variantLabel: i.variant_label,
          sku: i.sku,
          unitPrice: Number(i.unit_price),
          quantity: i.quantity,
          image: i.image ?? null,
          comboSelections: (i.combo_selections ?? []).flatMap((selection) =>
            selection.item_id
              ? [{
                  itemId: selection.item_id,
                  itemNameBn: selection.item_name_bn ?? "",
                  itemNameEn: selection.item_name_en ?? selection.item_name_bn ?? "",
                  quantity: Number(selection.quantity ?? 1),
                  variantId: selection.variant_id ?? null,
                  variantLabelBn: selection.variant_label_bn ?? "",
                  variantLabelEn: selection.variant_label_en ?? selection.variant_label_bn ?? "",
                  sku: selection.sku ?? null,
                  image: selection.image ?? null,
                }]
              : [],
          ),

        }))}

      />

      <FulfillmentCard
        orderId={order.id}
        status={order.fulfillment_status}
        source={order.source}
        attribution={(order.attribution ?? null) as AttributionPayload | null}
        orderStatus={order.status}
        partner={order.delivery_partner}
        courierStatus={order.courier_status ?? null}
        courierStatusRaw={(() => {
          // The courier's own wording ("Assigned for Pickup"), so the badge shows
          // the real provider state instead of our coarse internal bucket.
          const rows = (
            order as unknown as {
              order_consignments?: Array<{ status_message?: string | null }>;
            }
          ).order_consignments;
          return rows?.map((r) => r.status_message).find((x) => !!x) ?? null;
        })()}
        consignmentId={order.courier_consignment_id ?? null}
        trackingCode={order.courier_tracking_code ?? null}
        sentAt={order.courier_sent_at ?? null}
        customerPhone={order.customer_phone ?? null}
        collectedAmount={(() => {
          const rows = (
            order as unknown as {
              order_consignments?: Array<{ collected_amount?: number | string | null }>;
            }
          ).order_consignments;
          const v = rows
            ?.map((r) => r.collected_amount)
            .find((x) => x !== null && x !== undefined);
          return v === null || v === undefined ? null : Number(v);
        })()}
        returnConsignmentId={(() => {
          const rows = (
            order as unknown as {
              order_consignments?: Array<{ return_consignment_id?: string | null }>;
            }
          ).order_consignments;
          return rows?.map((r) => r.return_consignment_id).find((x) => !!x) ?? null;
        })()}
        orderTotal={order.total != null ? Number(order.total) : null}
        paidAt={(() => {
          const rows = (
            order as unknown as { order_consignments?: Array<{ paid_at?: string | null }> }
          ).order_consignments;
          return rows?.map((r) => r.paid_at).find((x) => !!x) ?? null;
        })()}
        paymentInvoiceId={(() => {
          const rows = (
            order as unknown as {
              order_consignments?: Array<{ payment_invoice_id?: string | null }>;
            }
          ).order_consignments;
          return rows?.map((r) => r.payment_invoice_id).find((x) => !!x) ?? null;
        })()}
      />

      <SecurityCard
        orderId={order.id}
        blocked={data.blocked}
        ipLocation={order.customer_ip_location ?? null}
        identifiers={[
          { kind: "ip", value: order.customer_ip },
          { kind: "fingerprint", value: order.device_fingerprint },
          { kind: "phone", value: order.customer_phone },
        ]}
      />

      <InternalNotesCard orderId={order.id} notes={data.notes as never[]} />

      <CommunicationLog logs={data.sms as never[]} autoStatus={order.auto_sms_status} />

      <ActivityLog entries={order.order_activity ?? []} />

      {/* Another staff member already holds this order */}
      <Dialog open={!!blockedBy} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <ShieldAlert className="size-4 text-rose-600" />
              Order already open
            </DialogTitle>
            <DialogDescription>
              <span className="font-semibold text-foreground">{blockedBy}</span> is handling this
              order right now. Taking over will remove them from this workspace immediately and log
              the takeover.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => void navigate({ to: backTo, search: backSearch })}>
              <ArrowLeft className="size-4" />
              Back to orders
            </Button>
            <Button variant="destructive" onClick={() => void claim(true)}>
              <ShieldAlert className="size-4" />
              Takeover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* We were taken over by someone else */}
      <Dialog open={!!evictedBy} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <ShieldAlert className="size-4 text-rose-600" />
              You were taken over
            </DialogTitle>
            <DialogDescription>
              <span className="font-semibold text-foreground">{evictedBy}</span> has taken over this
              order. You no longer have it open.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => void navigate({ to: backTo, search: backSearch })}>
              <ArrowLeft className="size-4" />
              Back to orders
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setEvictedBy(null);
                void claim(true);
              }}
            >
              <ShieldAlert className="size-4" />
              Takeover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


function InvoiceActionsDialog({
  open,
  onOpenChange,
  orderNumber,
  phone,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  orderNumber: string;
  phone: string;
}) {
  const path = `/inv/${encodeURIComponent(orderNumber)}?p=${phone.replace(/\D/g, "").slice(-4)}`;
  const url = typeof window === "undefined" ? path : `${window.location.origin}${path}`;

  const actions = [
    {
      key: "copy",
      label: "Copy link",
      hint: "ইনভয়েসের লিংক কপি হবে",
      icon: Copy,
      className:
        "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-slate-100",
      run: async () => {
        try {
          await navigator.clipboard.writeText(url);
          toast.success("ইনভয়েস লিংক কপি হয়েছে");
        } catch {
          toast.error("কপি করা যায়নি");
        }
        onOpenChange(false);
      },
    },
    {
      key: "download",
      label: "Download PDF",
      hint: "প্রিন্ট ডায়ালগ থেকে PDF সেভ করুন",
      icon: Download,
      className:
        "border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-100",
      run: () => {
        window.open(`${path}&print=1`, "_blank", "noopener,noreferrer");
        onOpenChange(false);
      },
    },
    {
      key: "visit",
      label: "Visit invoice",
      hint: "নতুন ট্যাবে ইনভয়েস খুলবে",
      icon: ExternalLink,
      className:
        "border-indigo-200 bg-indigo-50 text-indigo-700 hover:border-indigo-300 hover:bg-indigo-100",
      run: () => {
        window.open(path, "_blank", "noopener,noreferrer");
        onOpenChange(false);
      },
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <FileText className="size-4 text-indigo-500" />
            <span className="font-en">Invoice — {orderNumber}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-2">
          {actions.map((action) => (
            <button
              key={action.key}
              type="button"
              onClick={action.run}
              className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all active:scale-[0.98] disabled:opacity-70 ${action.className}`}
            >
              <action.icon className="size-4 shrink-0" />
              <span className="flex-1">
                <span className="block text-sm font-semibold">{action.label}</span>
                <span className="block text-xs opacity-75">{action.hint}</span>
              </span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
