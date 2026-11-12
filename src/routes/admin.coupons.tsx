import { createFileRoute } from "@tanstack/react-router";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import {
  BadgePercent,
  CalendarDays,
  Check,
  Loader2,
  Package,
  Pencil,
  Percent,
  Plus,
  RotateCcw,
  Search,
  Ticket,
  Trash2,
  Users,
  X,
} from "lucide-react";

import {
  adminDeleteCoupon,
  adminListCoupons,
  adminRestoreCoupon,
  adminSaveCoupon,
  adminToggleCoupon,
} from "@/lib/coupons.functions";
import {
  COUPON_CODE_RE,
  maskCouponCode,
  type CouponAppliesTo,
  type CouponDiscountType,
  type CouponRow,
} from "@/lib/coupons.shared";

import { adminListProducts, adminTaxonomy } from "@/lib/admin.functions";
import { AdminHeading, EmptyState, Panel } from "@/components/admin/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/coupons")({
  head: () => ({
    meta: [
      { title: "Coupons — Upoharkabbo Admin" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: CouponsPage,
});

type Draft = {
  id?: string;
  code: string;
  name: string;
  description: string;
  discount_type: CouponDiscountType;
  discount_value: string;
  cap_amount: string;
  min_spend: string;
  max_uses_total: string;
  max_uses_per_customer: string;
  applies_to: CouponAppliesTo;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
  exclude_shipping: boolean;
  targets: Array<{ target_type: "product" | "category"; target_id: string }>;
};

const emptyDraft = (): Draft => ({
  code: "",
  name: "",
  description: "",
  discount_type: "percent",
  discount_value: "10",
  cap_amount: "",
  min_spend: "0",
  max_uses_total: "",
  max_uses_per_customer: "",
  applies_to: "all",
  starts_at: "",
  ends_at: "",
  is_active: true,
  exclude_shipping: true,
  targets: [],
});

const bdt = (n: number) => `৳${Number(n).toLocaleString("en-US")}`;

const inputClass =
  "w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary";

function CouponsPage() {
  const qc = useQueryClient();
  const confirmDialog = useConfirm();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "inactive" | "deleted">("all");
  const [editing, setEditing] = useState<Draft | null>(null);

  const coupons = useQuery({
    queryKey: ["admin", "coupons"],
    queryFn: () => adminListCoupons(),
  });

  const reload = () => qc.invalidateQueries({ queryKey: ["admin", "coupons"] });

  const toggle = useMutation({
    mutationFn: (row: CouponRow) =>
      adminToggleCoupon({ data: { id: row.id, is_active: !row.is_active } }),
    onSuccess: async (_d, row) => {
      toast.success(row.is_active ? "Coupon deactivated" : "Coupon activated");
      await reload();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => adminDeleteCoupon({ data: { id } }),
    onSuccess: async () => {
      toast.success("Coupon deleted");
      await reload();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const restore = useMutation({
    mutationFn: (id: string) => adminRestoreCoupon({ data: { id } }),
    onSuccess: async () => {
      toast.success("Coupon restored");
      await reload();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = coupons.data ?? [];
  const filtered = useMemo(() => {
    const now = Date.now();
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (needle && !`${r.code} ${r.name}`.toLowerCase().includes(needle)) return false;
      if (filter === "deleted") return Boolean(r.deleted_at);
      if (r.deleted_at) return false;
      const expired = Boolean(r.ends_at && new Date(r.ends_at).getTime() < now);
      if (filter === "active") return r.is_active && !expired;
      if (filter === "inactive") return !r.is_active || expired;
      return true;
    });
  }, [rows, q, filter]);

  function beginEdit(row?: CouponRow) {
    if (!row) return setEditing(emptyDraft());
    setEditing({
      id: row.id,
      code: row.code,
      name: row.name,
      description: row.description ?? "",
      discount_type: row.discount_type,
      discount_value: String(row.discount_value),
      cap_amount: row.cap_amount != null ? String(row.cap_amount) : "",
      min_spend: String(row.min_spend ?? 0),
      max_uses_total: row.max_uses_total != null ? String(row.max_uses_total) : "",
      max_uses_per_customer:
        row.max_uses_per_customer != null ? String(row.max_uses_per_customer) : "",
      applies_to: row.applies_to,
      starts_at: row.starts_at ? row.starts_at.slice(0, 16) : "",
      ends_at: row.ends_at ? row.ends_at.slice(0, 16) : "",
      is_active: row.is_active,
      exclude_shipping: row.exclude_shipping,
      targets: row.targets ?? [],
    });
  }

  return (
    <div className="space-y-5">
      <AdminHeading
        title="Shop Coupons"
        description="Create, target and manage promo codes used at checkout and on landing pages."
        action={
          <Button onClick={() => beginEdit()} className="gap-1.5 active:scale-[0.97]">
            <Plus className="size-4" /> New Coupon
          </Button>
        }
      />

      <Panel className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="rounded-xl pl-9"
            placeholder="Search code or name…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        {(["all", "active", "inactive", "deleted"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-semibold capitalize transition-all duration-200 active:scale-95",
              filter === k
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border hover:border-primary/30 hover:bg-accent",
            )}
          >
            {k}
          </button>
        ))}
      </Panel>

      <Panel className="p-0 sm:p-0">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="p-3 text-left">Code</th>
                <th className="p-3 text-left">Discount</th>
                <th className="p-3 text-left">Applies to</th>
                <th className="p-3 text-left">Uses</th>
                <th className="p-3 text-left">Validity</th>
                <th className="p-3 text-left">Status</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {coupons.isLoading ? (
                <tr>
                  <td colSpan={7} className="p-10 text-center">
                    <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
                  </td>
                </tr>
              ) : null}
              {!coupons.isLoading && filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-0">
                    <EmptyState
                      title="No coupons here"
                      hint="Click “New Coupon” to create your first promo code."
                    />
                  </td>
                </tr>
              ) : null}
              {filtered.map((r) => {
                const expired = Boolean(r.ends_at && new Date(r.ends_at).getTime() < Date.now());
                const label = r.deleted_at
                  ? "Deleted"
                  : expired
                    ? "Expired"
                    : r.is_active
                      ? "Active"
                      : "Inactive";
                const cls = r.deleted_at
                  ? "bg-rose-100 text-rose-700 ring-rose-200"
                  : expired
                    ? "bg-amber-100 text-amber-800 ring-amber-200"
                    : r.is_active
                      ? "bg-emerald-100 text-emerald-700 ring-emerald-200"
                      : "bg-slate-100 text-slate-600 ring-slate-200";
                return (
                  <tr key={r.id} className="border-t border-border transition-colors hover:bg-accent/40">
                    <td className="p-3">
                      <div className="font-mono text-sm font-bold tracking-wider">{r.code}</div>
                      <div className="text-xs text-muted-foreground">{r.name}</div>
                    </td>
                    <td className="p-3">
                      {r.discount_type === "percent"
                        ? `${r.discount_value}%${r.cap_amount ? ` (max ${bdt(r.cap_amount)})` : ""}`
                        : `${bdt(r.discount_value)} off`}
                      {r.min_spend > 0 ? (
                        <div className="text-[11px] text-muted-foreground">
                          Min spend {bdt(r.min_spend)}
                        </div>
                      ) : null}
                    </td>
                    <td className="p-3 text-xs capitalize">
                      {r.applies_to === "all"
                        ? "All products"
                        : `${r.applies_to} (${r.targets.length})`}
                    </td>
                    <td className="p-3 text-xs tabular-nums">
                      {r.uses_count}
                      {r.max_uses_total ? ` / ${r.max_uses_total}` : ""}
                      {r.max_uses_per_customer ? (
                        <div className="text-[11px] text-muted-foreground">
                          {r.max_uses_per_customer}/customer
                        </div>
                      ) : null}
                    </td>
                    <td className="p-3 text-xs">
                      {r.starts_at || r.ends_at ? (
                        <>
                          <div>
                            {r.starts_at ? new Date(r.starts_at).toLocaleDateString() : "—"}
                          </div>
                          <div className="text-muted-foreground">
                            → {r.ends_at ? new Date(r.ends_at).toLocaleDateString() : "∞"}
                          </div>
                        </>
                      ) : (
                        "No limit"
                      )}
                    </td>
                    <td className="p-3">
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold ring-1",
                          cls,
                        )}
                      >
                        {label}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center justify-end gap-1">
                        {r.deleted_at ? (
                          <IconAction
                            title="Restore"
                            onClick={() => restore.mutate(r.id)}
                            busy={restore.isPending && restore.variables === r.id}
                            className="text-emerald-600 hover:bg-emerald-50"
                          >
                            <RotateCcw className="size-4" />
                          </IconAction>
                        ) : (
                          <>
                            <IconAction
                              title={r.is_active ? "Deactivate" : "Activate"}
                              onClick={() => toggle.mutate(r)}
                              busy={toggle.isPending && toggle.variables?.id === r.id}
                            >
                              {r.is_active ? <X className="size-4" /> : <Check className="size-4" />}
                            </IconAction>
                            <IconAction title="Edit" onClick={() => beginEdit(r)}>
                              <Pencil className="size-4" />
                            </IconAction>
                            <IconAction
                              title="Delete"
                              onClick={() => {
                                void confirmDialog({
                                  title: `Delete coupon ${r.code}?`,
                                  description: "It can be restored later from the Deleted filter.",
                                }).then((ok) => ok && remove.mutate(r.id));
                              }}
                              busy={remove.isPending && remove.variables === r.id}
                              className="text-destructive hover:bg-destructive/10 active:bg-destructive active:text-white"
                            >
                              <Trash2 className="size-4" />
                            </IconAction>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      {editing ? (
        <CouponDialog
          draft={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await reload();
          }}
        />
      ) : null}
    </div>
  );
}

function IconAction({
  title,
  onClick,
  busy,
  className,
  children,
}: {
  title: string;
  onClick: () => void;
  busy?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={busy}
      className={cn(
        "grid size-8 place-items-center rounded-lg border border-transparent transition-all duration-150 hover:border-border hover:bg-accent active:scale-90 disabled:opacity-60",
        className,
      )}
    >
      {busy ? <Loader2 className="size-4 animate-spin" /> : children}
    </button>
  );
}

// ---------------- Form dialog ----------------

function CouponDialog({
  draft,
  onClose,
  onSaved,
}: {
  draft: Draft;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [d, setD] = useState<Draft>(draft);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const body = document.body;
    const prevOverflow = body.style.overflow;
    const prevPad = body.style.paddingRight;
    const gap = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = "hidden";
    if (gap > 0) body.style.paddingRight = `${gap}px`;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      body.style.overflow = prevOverflow;
      body.style.paddingRight = prevPad;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);



  const products = useQuery({
    queryKey: ["admin", "products"],
    queryFn: () => adminListProducts(),
    enabled: d.applies_to === "products",
  });
  const taxonomy = useQuery({
    queryKey: ["admin", "taxonomy"],
    queryFn: () => adminTaxonomy(),
    enabled: d.applies_to === "categories",
  });

  const save = useMutation({
    mutationFn: () =>
      adminSaveCoupon({
        data: {
          id: d.id ?? null,
          code: d.code,
          name: d.name.trim(),
          description: d.description.trim() || null,
          discount_type: d.discount_type,
          discount_value: Number(d.discount_value),
          cap_amount: d.cap_amount ? Number(d.cap_amount) : null,
          min_spend: d.min_spend ? Number(d.min_spend) : 0,
          max_uses_total: d.max_uses_total ? Number(d.max_uses_total) : null,
          max_uses_per_customer: d.max_uses_per_customer
            ? Number(d.max_uses_per_customer)
            : null,
          applies_to: d.applies_to,
          starts_at: d.starts_at ? new Date(d.starts_at).toISOString() : null,
          ends_at: d.ends_at ? new Date(d.ends_at).toISOString() : null,
          is_active: d.is_active,
          exclude_shipping: d.exclude_shipping,
          targets: d.applies_to === "all" ? [] : d.targets,
        },
      }),
    onSuccess: async () => {
      toast.success(d.id ? "Coupon updated" : "Coupon created");
      await onSaved();
    },
    onError: (e: Error) => setError(e.message),
  });

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setD((prev) => ({ ...prev, [key]: value }));
  }

  function toggleTarget(type: "product" | "category", id: string) {
    setD((prev) => {
      const has = prev.targets.some((t) => t.target_type === type && t.target_id === id);
      return {
        ...prev,
        targets: has
          ? prev.targets.filter((t) => !(t.target_type === type && t.target_id === id))
          : [...prev.targets, { target_type: type, target_id: id }],
      };
    });
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!COUPON_CODE_RE.test(d.code)) {
      setError("Code must be 3-24 capital English letters or digits (A-Z, 0-9).");
      return;
    }
    if (!d.name.trim()) {
      setError("Give the coupon an internal name.");
      return;
    }
    if (!(Number(d.discount_value) > 0)) {
      setError("Discount value must be greater than 0.");
      return;
    }
    if (d.discount_type === "percent" && Number(d.discount_value) > 100) {
      setError("Percentage discount cannot exceed 100%.");
      return;
    }
    if (d.applies_to !== "all" && d.targets.length === 0) {
      setError("Select at least one target, or switch to “All products”.");
      return;
    }
    if (d.starts_at && d.ends_at && new Date(d.starts_at) >= new Date(d.ends_at)) {
      setError("“Valid until” must be after “Valid from”.");
      return;
    }
    save.mutate();
  }

  const categories = (taxonomy.data?.categories ?? []) as Array<{
    id: string;
    name_en: string;
    name_bn: string;
  }>;
  const productList = (products.data ?? []) as Array<{
    id: string;
    name_en: string;
    name_bn: string;
    price: number | string;
    product_images?: Array<{ url: string; sort_order: number }> | null;
  }>;

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-hidden overscroll-contain bg-black/60 p-3 backdrop-blur-sm sm:items-center">
      <form
        onSubmit={onSubmit}
        role="dialog"
        aria-modal="true"
        className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-background px-5 py-3">

          <div className="flex items-center gap-2">
            <div className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
              <Ticket className="size-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold leading-tight">
                {d.id ? "Edit coupon" : "New coupon"}
              </h2>
              <p className="text-[11px] text-muted-foreground">Shop coupon</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 transition-transform hover:bg-accent active:scale-90"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-5">
          <Section title="Basics" icon={BadgePercent}>
            <div className="grid gap-3 md:grid-cols-2">
              <FormField label="Code" required hint="Customers type this — e.g. WELCOME10">
                <input
                  className={cn(inputClass, "font-mono uppercase tracking-wider")}
                  value={d.code}
                  onChange={(e) =>
                    update("code", maskCouponCode(e.target.value))
                  }
                  onKeyDown={(e) => {
                    if (e.key.length === 1 && !/[A-Za-z0-9]/.test(e.key)) e.preventDefault();
                  }}
                  placeholder="WELCOME10"
                  inputMode="text"
                  autoCapitalize="characters"
                  required
                />
              </FormField>
              <FormField label="Name" required hint="Shown internally in reports">
                <input
                  className={inputClass}
                  value={d.name}
                  onChange={(e) => update("name", e.target.value)}
                  placeholder="Welcome discount"
                  maxLength={120}
                  required
                />
              </FormField>
              <FormField label="Description" className="md:col-span-2" hint="Optional internal note">
                <textarea
                  className={cn(inputClass, "min-h-16 resize-y")}
                  value={d.description}
                  onChange={(e) => update("description", e.target.value)}
                  maxLength={500}
                  placeholder="e.g. Eid campaign for returning customers"
                />
              </FormField>
            </div>
          </Section>

          <Section title="Discount" icon={Percent}>
            <div className="grid gap-3 md:grid-cols-2">
              <FormField label="Discount type" required>
                <select
                  className={inputClass}
                  value={d.discount_type}
                  onChange={(e) => update("discount_type", e.target.value as CouponDiscountType)}
                >
                  <option value="percent">Percentage (%)</option>
                  <option value="flat">Flat amount (৳)</option>
                </select>
              </FormField>
              <FormField
                label={d.discount_type === "percent" ? "Percentage" : "Flat amount"}
                required
              >
                <input
                  className={inputClass}
                  type="number"
                  min="0"
                  step="0.01"
                  value={d.discount_value}
                  onChange={(e) => update("discount_value", e.target.value)}
                  required
                />
              </FormField>
              {d.discount_type === "percent" ? (
                <FormField label="Cap (max discount ৳)" hint="e.g. 20% up to ৳300">
                  <input
                    className={inputClass}
                    type="number"
                    min="0"
                    step="0.01"
                    value={d.cap_amount}
                    onChange={(e) => update("cap_amount", e.target.value)}
                    placeholder="Leave empty for no cap"
                  />
                </FormField>
              ) : null}
              <FormField label="Minimum spend (৳)">
                <input
                  className={inputClass}
                  type="number"
                  min="0"
                  step="0.01"
                  value={d.min_spend}
                  onChange={(e) => update("min_spend", e.target.value)}
                />
              </FormField>
            </div>
          </Section>

          <Section title="Usage limits" icon={Users}>
            <div className="grid gap-3 md:grid-cols-2">
              <FormField label="Max total uses" hint="Blank = unlimited">
                <input
                  className={inputClass}
                  type="number"
                  min="1"
                  step="1"
                  value={d.max_uses_total}
                  onChange={(e) => update("max_uses_total", e.target.value)}
                />
              </FormField>
              <FormField label="Max uses per customer" hint="Counted by phone number">
                <input
                  className={inputClass}
                  type="number"
                  min="1"
                  step="1"
                  value={d.max_uses_per_customer}
                  onChange={(e) => update("max_uses_per_customer", e.target.value)}
                />
              </FormField>
            </div>
          </Section>

          <Section title="Validity" icon={CalendarDays}>
            <div className="grid gap-3 md:grid-cols-2">
              <FormField label="Valid from">
                <input
                  className={inputClass}
                  type="datetime-local"
                  value={d.starts_at}
                  onChange={(e) => update("starts_at", e.target.value)}
                />
              </FormField>
              <FormField label="Valid until">
                <input
                  className={inputClass}
                  type="datetime-local"
                  value={d.ends_at}
                  onChange={(e) => update("ends_at", e.target.value)}
                />
              </FormField>
            </div>
          </Section>

          <Section title="Applies to" icon={Package}>
            <FormField label="Applicability">
              <select
                className={inputClass}
                value={d.applies_to}
                onChange={(e) => update("applies_to", e.target.value as CouponAppliesTo)}
              >
                <option value="all">All products</option>
                <option value="products">Specific products</option>
                <option value="categories">Specific categories</option>
              </select>
            </FormField>

            {d.applies_to === "products" ? (
              <div className="mt-3">
                <Picker
                  label="Select products"
                  loading={products.isLoading}
                  items={productList.map((p) => ({
                    id: p.id,
                    name: p.name_en || p.name_bn,
                    meta: bdt(Number(p.price)),
                    image:
                      [...(p.product_images ?? [])].sort(
                        (a, b) => a.sort_order - b.sort_order,
                      )[0]?.url ?? null,
                  }))}
                  selected={d.targets
                    .filter((t) => t.target_type === "product")
                    .map((t) => t.target_id)}
                  onToggle={(id) => toggleTarget("product", id)}
                />
              </div>
            ) : null}

            {d.applies_to === "categories" ? (
              <div className="mt-3">
                <Picker
                  label="Select categories"
                  loading={taxonomy.isLoading}
                  items={categories.map((c) => ({
                    id: c.id,
                    name: c.name_en || c.name_bn,
                    meta: c.name_bn,
                    image: null,
                  }))}
                  selected={d.targets
                    .filter((t) => t.target_type === "category")
                    .map((t) => t.target_id)}
                  onToggle={(id) => toggleTarget("category", id)}
                />
              </div>
            ) : null}
          </Section>

          <div className="grid gap-2 rounded-2xl border border-border bg-muted/30 p-3 sm:grid-cols-2">
            <Checkbox
              label="Active"
              checked={d.is_active}
              onChange={(v) => update("is_active", v)}
            />
            <Checkbox
              label="Exclude shipping from discount"
              checked={d.exclude_shipping}
              onChange={(v) => update("exclude_shipping", v)}
            />
          </div>

          {error ? (
            <p className="rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm font-semibold text-destructive">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border bg-background px-5 py-3">
          <Button type="button" variant="outline" onClick={onClose} className="active:scale-95">
            Cancel
          </Button>
          <Button type="submit" disabled={save.isPending} className="gap-1.5 active:scale-[0.97]">
            {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            {d.id ? "Save changes" : "Create coupon"}
          </Button>
        </div>
      </form>
    </div>,
    document.body,
  );
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card/40 p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-bold">
        <Icon className="size-4 text-primary" />
        <span>{title}</span>
      </div>
      {children}
    </section>
  );
}

function FormField({
  label,
  hint,
  required,
  className,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </span>
      <div className="mt-1.5">{children}</div>
      {hint ? <span className="mt-1 block text-[11px] text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

function Checkbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-xl px-2 py-1.5 text-sm transition-colors hover:bg-accent/60">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 rounded border-border accent-primary"
      />
      <span className="font-semibold">{label}</span>
    </label>
  );
}

function Picker({
  label,
  items,
  selected,
  onToggle,
  loading,
}: {
  label: string;
  items: Array<{ id: string; name: string; meta?: string; image: string | null }>;
  selected: string[];
  onToggle: (id: string) => void;
  loading?: boolean;
}) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const filtered = needle
    ? items.filter((i) => `${i.name} ${i.meta ?? ""}`.toLowerCase().includes(needle))
    : items;
  const set = new Set(selected);
  const ordered = [...filtered].sort(
    (a, b) => Number(set.has(b.id)) - Number(set.has(a.id)),
  );

  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-xs font-semibold text-muted-foreground">
        <span>{label}</span>
        <span>{selected.length} selected</span>
      </div>
      <div className="rounded-2xl border border-border bg-background p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search…"
            className={cn(inputClass, "pl-8")}
          />
        </div>
        <div className="mt-2 max-h-72 space-y-1 overflow-y-auto">
          {loading ? (
            <div className="p-6 text-center">
              <Loader2 className="mx-auto size-4 animate-spin text-muted-foreground" />
            </div>
          ) : null}
          {!loading && ordered.length === 0 ? (
            <div className="p-4 text-center text-xs text-muted-foreground">Nothing found</div>
          ) : null}
          {ordered.map((i) => {
            const on = set.has(i.id);
            return (
              <button
                key={i.id}
                type="button"
                onClick={() => onToggle(i.id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-xl p-1.5 text-left transition-all duration-150 active:scale-[0.99]",
                  on ? "bg-primary/10 ring-1 ring-primary/40" : "hover:bg-accent",
                )}
              >
                {i.image ? (
                  <img src={i.image} alt="" className="size-9 rounded-lg object-cover" />
                ) : (
                  <div className="grid size-9 place-items-center rounded-lg bg-muted text-muted-foreground">
                    <Package className="size-4" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{i.name}</p>
                  {i.meta ? (
                    <p className="truncate text-[11px] text-muted-foreground">{i.meta}</p>
                  ) : null}
                </div>
                <span
                  className={cn(
                    "grid size-5 shrink-0 place-items-center rounded border",
                    on
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background",
                  )}
                >
                  {on ? <Check className="size-3.5" /> : null}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
