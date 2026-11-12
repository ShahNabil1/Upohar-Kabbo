import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { useConfirm } from "@/components/ui/confirm-dialog";


import { useCart, type CartItem } from "@/lib/cart-context";
import { useLang } from "@/lib/language-context";
import { formatNumber, formatPrice, pick, tr } from "@/lib/i18n";
import { captureIncompleteOrder, placeOrder } from "@/lib/order.functions";
import { Turnstile, type TurnstileHandle } from "@/components/turnstile";
import { getAttribution } from "@/lib/attribution";
import { validateCoupon } from "@/lib/coupons.functions";
import {
  COUPON_CODE_RE,
  couponReasonMessage,
  maskCouponCode,
  type CouponValidation,
} from "@/lib/coupons.shared";

import { BD_DIVISIONS } from "@/lib/bd-geo";
import { ProductThumb } from "@/components/site/product-card";
import { QuantityStepper } from "@/components/site/add-to-cart";
import { cn } from "@/lib/utils";
import { normalizePhoneInput } from "@/lib/phone";
import { deliveryChargeFor, type DeliveryConfig } from "@/lib/delivery-rates";
import { getBrowserFingerprint } from "@/lib/browser-fingerprint";
import { useBlockedSupport } from "@/components/site/blocked-support-dialog";
import { ecommerce, pushEvent, useTrackOnce } from "@/lib/tracking";
import { cartTrackingItems } from "@/lib/tracking-items";

export type DeliveryRates = DeliveryConfig;

const inputClass =
  "w-full rounded-sm border border-border bg-background px-3 py-2.5 text-[15px] outline-none transition-colors focus:border-primary";

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-foreground">
        {label}
        {hint ? <span className="ml-1 font-normal text-muted-foreground">{hint}</span> : null}
      </span>
      {children}
      {error ? <span className="mt-1 block text-xs text-destructive">{error}</span> : null}
    </label>
  );
}

export type CheckoutVariant = {
  id: string;
  value_bn: string;
  value_en: string;
  group_name_bn: string;
  group_name_en: string;
};

export function CheckoutForm({
  items,
  rates,
  source,
  onPlaced,
  compact,
  onSetQuantity,
  onRemove,
  allowAddMore,
  variants,
  variantId,
  onVariantChange,
}: {
  items: CartItem[];
  rates: DeliveryRates;
  source: "website" | "landing";
  onPlaced?: () => void;
  compact?: boolean;
  onSetQuantity?: (key: string, quantity: number) => void;
  onRemove?: (key: string) => void;
  allowAddMore?: boolean;
  variants?: CheckoutVariant[];
  variantId?: string | null;
  onVariantChange?: (id: string) => void;
}) {
  const { lang } = useLang();
  const confirmDialog = useConfirm();
  const { showBlockedDialog } = useBlockedSupport();

  const navigate = useNavigate();
  const submit = useServerFn(placeOrder);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const captchaRef = useRef<TurnstileHandle | null>(null);
  const { clear } = useCart();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [division, setDivision] = useState("");
  const [district, setDistrict] = useState("");
  const [upazila, setUpazila] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const placedRef = useRef(false);
  const capturedRef = useRef("");

  // Persist draft customer details in localStorage so returning visitors don't
  // have to retype. Each landing page keeps its own draft; the website cart
  // uses a shared key.
  const storageKey =
    typeof window !== "undefined"
      ? `upoharkabbo-checkout-draft:${source}:${window.location.pathname}`
      : null;

  useEffect(() => {
    if (!storageKey) return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const draft = JSON.parse(raw) as Record<string, string>;
      if (typeof draft["name"] === "string") setName(draft["name"]);
      if (typeof draft["phone"] === "string") setPhone(draft["phone"]);
      if (typeof draft["address"] === "string") setAddress(draft["address"]);
      if (typeof draft["division"] === "string") setDivision(draft["division"]);
      if (typeof draft["district"] === "string") setDistrict(draft["district"]);
      if (typeof draft["upazila"] === "string") setUpazila(draft["upazila"]);
      if (typeof draft["note"] === "string") setNote(draft["note"]);
    } catch {
      // Ignore corrupted draft data.
    }
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey) return;
    const draft = { name, phone, address, division, district, upazila, note };
    localStorage.setItem(storageKey, JSON.stringify(draft));
  }, [storageKey, name, phone, address, division, district, upazila, note]);

  // Abandoned checkout capture: a valid phone number with items in the cart is
  // reported to the admin panel when the visitor leaves without ordering.
  const snapshot = useRef({ name, phone, address, division, district, upazila, note, items, source });
  snapshot.current = { name, phone, address, division, district, upazila, note, items, source };

  const flushRef = useRef<() => void>(() => {});
  flushRef.current = () => {
    const s = snapshot.current;
    if (placedRef.current) return;
    if (!/^01[3-9]\d{8}$/.test(s.phone.trim())) return;
    if (!s.items.length) return;
    const key = `${s.phone.trim()}|${s.items.map((i) => `${i.productId}:${i.variantId ?? ""}:${i.comboSelections.map((selection) => selection.variantId).join("+")}:${i.quantity}`).join(",")}|${s.name}|${s.address}`;
    if (capturedRef.current === key) return;
    capturedRef.current = key;
    void getBrowserFingerprint().then((deviceFingerprint) => captureIncompleteOrder({
      data: {
        customerPhone: s.phone.trim(),
        customerName: s.name.trim(),
        addressLine: s.address.trim(),
        division: s.division,
        district: s.district,
        upazila: s.upazila,
        note: s.note.trim(),
        source: s.source,
        attribution: getAttribution(),
        deviceFingerprint,
        items: s.items.map((i) => ({
          productId: i.productId,
          variantId: i.variantId,
          quantity: i.quantity,
          // Only variant picks are sent; the server re-expands the full combo.
          comboSelections: i.comboSelections.flatMap((selection) =>
            selection.variantId
              ? [{
                  itemId: selection.itemId,
                  variantId: selection.variantId,
                  quantity: selection.quantity,
                }]
              : [],
          ),
        })),
      },
    })).catch(() => undefined);
  };

  // Requests fired during `pagehide` are usually killed with the document, so
  // the capture also runs proactively a few seconds after the visitor has
  // typed a valid phone number.
  useEffect(() => {
    if (!/^01[3-9]\d{8}$/.test(phone.trim())) return;
    if (!items.length) return;
    const timer = window.setTimeout(() => flushRef.current(), 2500);
    return () => window.clearTimeout(timer);
  }, [phone, items, name, address, division, district, upazila, note]);

  useEffect(() => {
    const flush = () => flushRef.current();
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);


  const divisionObj = useMemo(
    () => BD_DIVISIONS.find((d) => d.bn === division) ?? null,
    [division],
  );
  const districtObj = useMemo(
    () => divisionObj?.districts.find((d) => d.bn === district) ?? null,
    [divisionObj, district],
  );

  const area: "inside_dhaka" | "outside_dhaka" =
    district === "ঢাকা" ? "inside_dhaka" : "outside_dhaka";

  const subtotal = useMemo(
    () => items.reduce((sum, i) => sum + i.price * i.quantity, 0),
    [items],
  );
  const delivery = useMemo(
    () => deliveryChargeFor(rates, area, subtotal, items.map((i) => i.productId)),
    [rates, area, subtotal, items],
  );

  // Funnel: begin_checkout as soon as the form is on screen with items.
  const trackedItems = useMemo(() => cartTrackingItems(items), [items]);
  const checkoutPayload = useMemo(
    () => ({ ...ecommerce(trackedItems), page_type: source }),
    [trackedItems, source],
  );
  useTrackOnce("begin_checkout", checkoutPayload, items.length > 0);


  // ---- Coupon (validated on the server, re-checked again when ordering) ----
  const checkCoupon = useServerFn(validateCoupon);
  const [couponCode, setCouponCode] = useState("");
  const [couponOpen, setCouponOpen] = useState(false);
  const couponInputRef = useRef<HTMLInputElement | null>(null);
  const [coupon, setCoupon] = useState<CouponValidation | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponPending, setCouponPending] = useState(false);
  const lastCheckedCouponRef = useRef<string>("");

  useEffect(() => {
    if (couponOpen) couponInputRef.current?.focus();
  }, [couponOpen]);


  const productIds = useMemo(() => [...new Set(items.map((i) => i.productId))], [items]);
  const appliedCode = coupon?.ok ? coupon.code : null;

  // Any cart change invalidates a previously applied coupon amount.
  useEffect(() => {
    setCoupon(null);
    setCouponError(null);
  }, [subtotal, productIds.join(",")]);

  const applyCoupon = async (silentWhenEmpty = false) => {
    const code = maskCouponCode(couponCode);
    setCouponCode(code);
    if (!code && silentWhenEmpty) {
      setCoupon(null);
      setCouponError(null);
      lastCheckedCouponRef.current = "";
      return;
    }
    if (!COUPON_CODE_RE.test(code)) {
      setCoupon(null);
      setCouponError("This coupon is not valid");

      lastCheckedCouponRef.current = code;
      return;
    }

    setCouponPending(true);
    setCouponError(null);
    try {
      const result = await checkCoupon({
        data: {
          code,
          subtotal,
          productIds,
          phone: /^01[3-9]\d{8}$/.test(phone.trim()) ? phone.trim() : null,
        },
      });
      if (result.ok) {
        setCoupon(result);
      } else {
        setCoupon(null);
        setCouponError(couponReasonMessage(result.reason, result.minSpend));
      }
    } catch {
      setCoupon(null);
      setCouponError("Could not verify the coupon");
    } finally {
      setCouponPending(false);
      lastCheckedCouponRef.current = code;
    }
  };

  const handleCouponBlur = () => {
    const code = maskCouponCode(couponCode);
    if (!code) {
      setCouponError(null);
      lastCheckedCouponRef.current = "";
      return;
    }
    if (code === lastCheckedCouponRef.current) return;
    void applyCoupon(true);
  };

  const discount = coupon?.ok ? Math.min(Math.round(coupon.discount), subtotal) : 0;
  const total = Math.max(0, subtotal + delivery - discount);


  const validate = () => {
    const next: Record<string, string> = {};
    if (name.trim().length < 2) next["name"] = tr(lang, "invalidForm");
    if (!/^01[3-9]\d{8}$/.test(phone.trim()))
      next["phone"] = lang === "bn" ? "সঠিক ১১ ডিজিটের নম্বর দিন" : "Enter a valid 11-digit number";
    if (address.trim().length < 6) next["address"] = tr(lang, "invalidForm");
    if (!division) next["division"] = tr(lang, "selectDivision");
    if (!district) next["district"] = tr(lang, "selectDistrict");
    if (!upazila) next["upazila"] = tr(lang, "selectUpazila");
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFailed(false);
    if (!items.length || pending) return;
    if (!validate()) return;

    setPending(true);
    try {
      const deviceFingerprint = await getBrowserFingerprint();
      const result = await submit({
        data: {
          customerName: name.trim(),
          customerPhone: phone.trim(),
          addressLine: address.trim(),
          division,
          district,
          upazila,
          note: note.trim(),
          couponCode: appliedCode ?? "",
          source,
          attribution: getAttribution(),
          deviceFingerprint,
          captchaToken: captchaToken ?? "",

          items: items.map((i) => ({
            productId: i.productId,
            variantId: i.variantId,
            quantity: i.quantity,
            comboSelections: i.comboSelections.flatMap((selection) =>
              selection.variantId
                ? [{
                    itemId: selection.itemId,
                    variantId: selection.variantId,
                    quantity: selection.quantity,
                  }]
                : [],
            ),
          })),
        },
      });
      placedRef.current = true;
      // No browser `purchase` here — a placed order is still unconfirmed.
      // Purchase is sent server-side (CAPI/TikTok/GA4) when admin confirms it.

      onPlaced?.();
      clear();
      void navigate({
        to: "/order/$orderNumber",
        params: { orderNumber: result.orderNumber },
        search: { phone: phone.trim() },
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes("ORDER_BLOCKED")) {
        showBlockedDialog();
      } else {
        setFailed(true);
      }
      captchaRef.current?.reset();
    } finally {
      setPending(false);
    }
  };

  return (
    <form
      onSubmit={onSubmit}
      className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_18px_50px_-30px_rgba(0,0,0,0.45)]"
      noValidate
    >
      {/* Header */}
      <div className="rounded-b-2xl bg-foreground px-5 py-8 text-center text-background sm:px-8">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-background">
          <svg
            viewBox="0 0 24 24"
            aria-hidden
            className="h-8 w-8 text-primary"
            fill="currentColor"
          >
            <path d="M7 18a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm10 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM2.2 2h2.1a1 1 0 0 1 .97.76L5.8 5H21a1 1 0 0 1 .97 1.24l-1.8 7.2A2 2 0 0 1 18.23 15H8.1a2 2 0 0 1-1.95-1.55L4.02 4H2.2a1 1 0 0 1 0-2Z" />
          </svg>
        </span>
        <h2 className="font-display-bn mt-4 text-2xl sm:text-3xl">
          {pick(lang, "অর্ডার ফর্ম", "Order form")}
        </h2>
        <p className="mx-auto mt-2 max-w-md text-[15px] leading-7 text-background/80">
          {pick(
            lang,
            "আপনার অর্ডারটি প্লেস করতে, অনুগ্রহ করে নিচের তথ্য গুলো দিয়ে সহযোগীতা করুন।",
            "To place your order, please fill in the details below.",
          )}
        </p>
      </div>

      <div className={cn("grid gap-8 px-4 pt-7 sm:px-7", compact ? "pb-5" : "pb-7 sm:pb-9")}>
        {/* Your products */}
        <section>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-en text-lg font-extrabold tracking-tight sm:text-xl">Your Products</h3>
            {allowAddMore ? (
              <Link
                to="/"
                className="font-en group inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-primary to-foreground px-4 py-2 text-xs font-extrabold text-primary-foreground shadow-md transition-all duration-300 hover:scale-[1.03] hover:shadow-lg active:scale-95 sm:text-sm"
              >
                <Plus className="h-3.5 w-3.5 transition-transform duration-300 group-hover:rotate-90" />
                Add Product
              </Link>
            ) : null}
          </div>

          <div className="mt-4 overflow-hidden rounded-xl border border-border">
            <div className="font-en flex items-center justify-between gap-3 bg-secondary/60 px-3 py-2.5 text-xs font-extrabold uppercase tracking-wide text-foreground sm:px-4 sm:text-sm">
              <span>Product</span>
              <div className="flex items-center gap-4 sm:gap-5">
                <span className="text-center">Quantity</span>
                <span className="text-right">Price</span>
              </div>
            </div>

            {items.length === 0 ? (
              <div className="grid place-items-center gap-3 px-4 py-10 text-center">
                <p className="font-en text-sm font-bold text-muted-foreground">
                  No products in your order
                </p>
                <Link
                  to="/"
                  className="font-en group inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-primary to-foreground px-5 py-2.5 text-sm font-extrabold text-primary-foreground shadow-md transition-all duration-300 hover:scale-[1.03] hover:shadow-lg active:scale-95"
                >
                  <Plus className="h-4 w-4 transition-transform duration-300 group-hover:rotate-90" />
                  Add Product
                </Link>
              </div>
            ) : null}


            <ul className="divide-y divide-border">
              {items.map((i) => (
                <li key={i.key} className="px-3 py-4 sm:px-4">
                  {/* Product title always on top, full width */}
                  <p className="text-[15px] font-bold leading-snug">
                    {pick(lang, i.nameBn, i.nameEn)}
                  </p>
                  {i.variantLabelBn ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {pick(lang, i.variantLabelBn, i.variantLabelEn)}
                    </p>
                  ) : null}
                  {i.comboSelections.length > 0 ? (
                    <ul className="mt-2 grid gap-1.5 rounded-lg bg-secondary/50 px-3 py-2.5 text-sm">
                      {i.comboSelections.map((selection) => (
                        <li key={`${selection.itemId}-${selection.variantId ?? "base"}`} className="flex gap-1.5">
                          <span className="font-semibold text-foreground">{pick(lang, selection.itemNameBn, selection.itemNameEn)}:</span>
                          <span className="font-medium text-foreground/80">
                            {selection.variantLabelBn || selection.variantLabelEn
                              ? pick(lang, selection.variantLabelBn ?? "", selection.variantLabelEn ?? "")
                              : `Qty ${selection.quantity}`}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  <div className="mt-2.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md bg-secondary">
                        <ProductThumb
                          src={i.image}
                          alt={pick(lang, i.nameBn, i.nameEn)}
                          label={i.nameEn}
                        />
                      </div>
                      {onRemove ? (
                        <button
                          type="button"
                          onClick={() => {
                            void (async () => {
                              const ok = await confirmDialog({
                                title: "Remove this product?",
                                description: pick(lang, i.nameBn, i.nameEn),
                                confirmLabel: "Delete",
                                cancelLabel: "Cancel",
                                tone: "danger",
                              });
                              if (ok) onRemove(i.key);
                            })();
                          }}

                          aria-label={tr(lang, "remove")}
                          className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-full border border-border bg-card text-muted-foreground transition-all duration-200 hover:scale-110 hover:border-destructive hover:text-destructive hover:shadow-sm active:scale-95"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>

                    <div className="flex items-center gap-4 sm:gap-5">
                      {onSetQuantity ? (
                        <QuantityStepper
                          value={i.quantity}
                          max={i.stock}
                          onChange={(next) => onSetQuantity(i.key, next)}
                        />
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          × {formatNumber(lang, i.quantity)}
                        </span>
                      )}
                      <span className="text-sm font-bold tabular-nums">
                        {formatPrice(lang, i.price * i.quantity)}
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            {variants && variants.length > 0 ? (
              <div className="border-t border-border px-3 py-4 sm:px-4">
                <p className="mb-2 text-sm font-bold">
                  {pick(lang, variants[0]?.group_name_bn, variants[0]?.group_name_en)}
                </p>
                <div className="flex flex-wrap gap-2">
                  {variants.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => onVariantChange?.(v.id)}
                      className={cn(
                        "rounded-md border px-3.5 py-2 text-sm font-semibold transition-colors",
                        v.id === variantId
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-card hover:border-primary",
                      )}
                    >
                      {pick(lang, v.value_bn, v.value_en)}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </section>

        {/* Billing details — unchanged fields */}
        <section className="grid gap-4">
          <h3 className="text-lg font-extrabold text-primary">
            {pick(lang, "বিলিং তথ্য", "Billing details")}
          </h3>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={tr(lang, "fullName")} error={errors["name"]}>
              <input
                className={inputClass}
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                maxLength={80}
                required
              />
            </Field>
            <Field label={tr(lang, "phone")} error={errors["phone"]}>
              <input
                className={cn(inputClass, "font-en")}
                value={phone}
                onChange={(e) => setPhone(normalizePhoneInput(e.target.value))}
                inputMode="numeric"
                autoComplete="tel"
                placeholder="01XXXXXXXXX"
                maxLength={11}
                required
              />
            </Field>
          </div>

          <Field label={tr(lang, "address")} hint={tr(lang, "addressHint")} error={errors["address"]}>
            <textarea
              className={cn(inputClass, "min-h-20 resize-y")}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              autoComplete="street-address"
              maxLength={300}
              required
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={tr(lang, "division")} error={errors["division"]}>
              <select
                className={inputClass}
                value={division}
                onChange={(e) => {
                  setDivision(e.target.value);
                  setDistrict("");
                  setUpazila("");
                }}
                required
              >
                <option value="">{tr(lang, "selectDivision")}</option>
                {BD_DIVISIONS.map((d) => (
                  <option key={d.id} value={d.bn}>
                    {pick(lang, d.bn, d.en)}
                  </option>
                ))}
              </select>
            </Field>

            <Field label={tr(lang, "district")} error={errors["district"]}>
              <select
                className={cn(inputClass, !divisionObj && "opacity-60")}
                value={district}
                disabled={!divisionObj}
                onChange={(e) => {
                  setDistrict(e.target.value);
                  setUpazila("");
                }}
                required
              >
                <option value="">{tr(lang, "selectDistrict")}</option>
                {(divisionObj?.districts ?? []).map((d) => (
                  <option key={d.id} value={d.bn}>
                    {pick(lang, d.bn, d.en)}
                  </option>
                ))}
              </select>
            </Field>

            <Field label={tr(lang, "upazila")} error={errors["upazila"]}>
              <select
                className={cn(inputClass, !districtObj && "opacity-60")}
                value={upazila}
                disabled={!districtObj}
                onChange={(e) => setUpazila(e.target.value)}
                required
              >
                <option value="">{tr(lang, "selectUpazila")}</option>
                {(districtObj?.upazilas ?? []).map((u) => (
                  <option key={u.en} value={u.bn}>
                    {pick(lang, u.bn, u.en)}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label={tr(lang, "note")}>
            <textarea
              className={cn(inputClass, "min-h-16 resize-y")}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
            />
          </Field>
        </section>

        {/* Shipping */}
        <section>
          <h3 className="font-en text-lg font-extrabold sm:text-xl">Shipping</h3>
          <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border-2 border-primary bg-primary/5 px-4 py-3 text-sm shadow-sm">
            <span className="font-en font-bold text-primary">Delivery Charge</span>
            <span className="font-en text-base font-extrabold tabular-nums text-primary">
              {delivery === 0 ? "Free" : formatPrice(lang, delivery)}
            </span>
          </div>
        </section>

        {/* Your order */}
        <section>
          <h3 className="font-en text-lg font-extrabold text-primary sm:text-xl">Your Order</h3>

          <div className="mt-3 grid gap-2 border-b border-dashed border-border pb-3 text-xs font-extrabold uppercase tracking-wide text-foreground sm:text-sm">
            <div className="font-en flex justify-between">
              <span>Product</span>
              <span>Subtotal</span>
            </div>
          </div>


          <ul className="divide-y divide-dashed divide-border">
            {items.map((i) => (
              <li key={i.key} className="flex items-center gap-3 py-3 text-sm">
                <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md bg-secondary">
                  <ProductThumb src={i.image} alt={pick(lang, i.nameBn, i.nameEn)} label={i.nameEn} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{pick(lang, i.nameBn, i.nameEn)}</p>
                  {i.variantLabelBn || i.variantLabelEn ? (
                    <p className="text-xs text-muted-foreground">
                      {pick(lang, i.variantLabelBn, i.variantLabelEn)}
                    </p>
                  ) : null}
                </div>
                <span className="shrink-0 text-muted-foreground">
                  × {formatNumber(lang, i.quantity)}
                </span>
                <span className="shrink-0 font-bold tabular-nums">
                  {formatPrice(lang, i.price * i.quantity)}
                </span>
              </li>
            ))}
          </ul>

          {/* Coupon */}
          <div className="mt-5">
            <div className="relative overflow-hidden">
              <button
                type="button"
                onClick={() => setCouponOpen(true)}
                className={cn(
                  "group inline-flex items-center gap-2 rounded-full border border-dashed border-primary/40 bg-primary/5 px-3.5 py-1.5 text-[15px] font-black tracking-tight text-primary shadow-sm transition-all duration-300 ease-out hover:scale-[1.02] hover:border-primary/60 hover:bg-primary/10 hover:shadow-md active:scale-[0.98]",
                  lang === "bn" && "font-display-bn",
                  couponOpen
                    ? "pointer-events-none absolute left-0 top-0 h-0 py-0 opacity-0"
                    : "relative translate-x-0",
                )}
                aria-hidden={couponOpen}
                tabIndex={couponOpen ? -1 : 0}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4 shrink-0 text-primary transition-transform duration-300 group-hover:rotate-12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M2 9a3 3 0 0 1 0-6h20a3 3 0 0 1 0 6v6a3 3 0 0 1 0 6H2a3 3 0 0 1 0-6V9Z" />
                  <path d="M12 3v18" />
                  <path d="M7 3v6" />
                  <path d="M17 3v6" />
                </svg>
                <span>{lang === "bn" ? "কুপন আছে?" : "Have a coupon?"}</span>
              </button>

              <div
                className={cn(
                  "origin-left transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
                  couponOpen
                    ? "max-h-28 translate-x-0 scale-100 opacity-100"
                    : "pointer-events-none max-h-0 -translate-x-8 scale-95 opacity-0",
                )}
              >
                <div className="flex items-center gap-2 overflow-hidden rounded-lg border-2 border-dashed border-primary/35 bg-primary/[0.04] p-1 shadow-sm focus-within:border-solid focus-within:border-primary/60 focus-within:bg-background focus-within:ring-1 focus-within:ring-primary/20">
                  <input
                    ref={couponInputRef}
                    className={cn(
                      inputClass,
                      "flex-1 border-0 bg-transparent px-3 py-2 text-[15px] font-en font-bold uppercase tracking-[0.15em] text-foreground shadow-none focus:ring-0",
                    )}
                    value={couponCode}
                    onChange={(e) => {
                      setCouponCode(maskCouponCode(e.target.value));
                      setCouponError(null);
                    }}
                    onBlur={handleCouponBlur}
                    onKeyDown={(e) => {
                      if (e.key.length === 1 && !/[A-Za-z0-9]/.test(e.key)) e.preventDefault();
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void applyCoupon();
                      }
                    }}
                    placeholder={lang === "bn" ? "কুপন কোড" : "Coupon code"}
                    inputMode="text"
                    autoCapitalize="characters"
                    autoCorrect="off"
                    spellCheck={false}
                    autoComplete="off"
                    maxLength={24}
                    disabled={Boolean(appliedCode) || couponPending}
                  />
                  {appliedCode ? (
                    <button
                      type="button"
                      onClick={() => {
                        setCoupon(null);
                        setCouponCode("");
                        setCouponError(null);
                        lastCheckedCouponRef.current = "";
                      }}
                      className="mr-1 shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-muted-foreground underline-offset-4 transition-colors hover:bg-destructive/10 hover:text-destructive hover:underline"
                    >
                      {lang === "bn" ? "বাতিল" : "Remove"}
                    </button>
                  ) : couponPending ? (
                    <span className="mr-1 inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-extrabold text-emerald-700">
                      <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-emerald-300 border-t-emerald-600" />
                      Verifying...
                    </span>
                  ) : null}
                </div>
                {couponError ? (
                  <p className="mt-2 text-xs font-semibold text-destructive animate-fade-in">{couponError}</p>
                ) : null}
                {appliedCode ? (
                  <p className="mt-2 text-xs font-semibold text-emerald-600 animate-fade-in">
                    {`Coupon ${appliedCode} applied`}
                  </p>
                ) : null}

              </div>
            </div>
          </div>


          <dl className="mt-4 grid gap-2 border-t border-dashed border-border pt-3 text-sm">
            <div className="flex justify-between">
              <dt className="font-en font-bold text-foreground">Subtotal</dt>
              <dd className="font-en text-base font-extrabold tabular-nums">{formatPrice(lang, subtotal)}</dd>
            </div>
            <div className="flex items-center justify-between rounded-xl border-2 border-primary bg-primary/5 px-3 py-2 shadow-sm">
              <dt className="font-en font-bold text-primary">Delivery Charge</dt>
              <dd className="font-en text-base font-extrabold tabular-nums text-primary">
                {delivery === 0 ? "Free" : formatPrice(lang, delivery)}
              </dd>
            </div>
            {discount > 0 ? (
              <div className="flex justify-between text-emerald-600">
                <dt className="font-en font-bold">
                  Coupon Discount
                  {appliedCode ? <span className="font-en"> ({appliedCode})</span> : null}
                </dt>
                <dd className="font-en text-base font-extrabold tabular-nums">− {formatPrice(lang, discount)}</dd>
              </div>
            ) : null}
            <div className="flex items-center justify-between border-t border-border pt-2.5">
              <dt className="font-en text-base font-extrabold sm:text-lg">Total</dt>
              <dd className="font-en text-lg font-extrabold tabular-nums text-primary sm:text-xl">{formatPrice(lang, total)}</dd>
            </div>

          </dl>
        </section>

        {/* COD note */}
        <div className="rounded-xl bg-secondary/70 p-4">
          <p className="text-sm font-bold">{pick(lang, "ক্যাশ অন ডেলিভারি", "Cash on delivery")}</p>
          <p className="mt-3 rounded-md bg-background px-4 py-3 text-sm text-muted-foreground">
            {tr(lang, "codNote")}
          </p>
        </div>

        {failed ? (
          <p className="rounded-sm border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {tr(lang, "orderFailed")}
          </p>
        ) : null}

        <div className="flex justify-center">
          <Turnstile onToken={setCaptchaToken} handleRef={captchaRef} />
        </div>

        <button
          type="submit"
          disabled={pending || items.length === 0}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 py-4 text-base font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
        >
          <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4" fill="currentColor">
            <path d="M12 1a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2h-1V6a5 5 0 0 0-5-5Zm3 8H9V6a3 3 0 1 1 6 0v3Z" />
          </svg>
          {pending ? tr(lang, "placing") : tr(lang, "placeOrder")} {formatPrice(lang, total)}
        </button>
      </div>
    </form>
  );
}

