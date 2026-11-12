import { useQuery } from "@tanstack/react-query";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Search, Trash2 } from "lucide-react";

import { NumberField, Panel } from "@/components/admin/kit";
import { SaveButton, isDirty } from "@/components/admin/save-button";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import { adminSearchProducts } from "@/lib/admin.functions";
import {
  normalizeDeliveryConfig,
  serializeDeliveryConfig,
  type DeliveryConfig,
  type ProductDeliveryMode,
  type ProductDeliveryRule,
} from "@/lib/delivery-rates";

function Collapse({ open, children }: { open: boolean; children: ReactNode }) {
  const innerRef = useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = useState(0);

  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const measure = () => setHeight(el.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const ease = "cubic-bezier(0.22, 0.61, 0.24, 1)";

  return (
    <div
      aria-hidden={!open}
      style={{
        height: open ? height : 0,
        opacity: open ? 1 : 0,
        filter: open ? "blur(0px)" : "blur(3px)",
        overflow: "hidden",
        transition: `height 760ms ${ease}, opacity 620ms ${ease}, filter 620ms ${ease}`,
        willChange: "height, opacity",
      }}
      className="motion-reduce:!transition-none"
    >
      <div
        ref={innerRef}
        style={{
          transform: open ? "translateY(0px) scale(1)" : "translateY(-6px) scale(0.985)",
          transformOrigin: "top center",
          transition: `transform 760ms ${ease}`,
          willChange: "transform",
        }}
        className={cn("motion-reduce:!transition-none", !open && "pointer-events-none")}
      >
        {children}
      </div>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  title,
  description,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  title: string;
  description: string;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-border/70 bg-background/40 px-3 py-2.5 transition-colors hover:border-primary/30">
      <span className="min-w-0">
        <span className="ig-text block text-sm font-bold">{title}</span>
        <span className="block text-xs text-muted-foreground">{description}</span>
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span className="relative inline-flex h-6 w-11 shrink-0 touch-manipulation items-center rounded-full bg-muted shadow-sm transition-[background-color,box-shadow,transform] duration-300 ease-out peer-active:scale-95 peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring/40 motion-reduce:transition-none">
        <span
          className={`absolute left-0.5 size-5 rounded-full bg-background shadow-md transition-transform duration-300 ease-out motion-reduce:transition-none ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </span>
    </label>
  );
}

function ModeTabs({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (next: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="grid w-full grid-cols-2 gap-1.5 rounded-xl border border-border bg-muted/40 p-1.5 shadow-sm sm:w-fit">
      {options.map((opt, index) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition-all duration-200",
            value === opt.value
              ? index === 0
                ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-md shadow-amber-500/30 ring-1 ring-amber-400/50"
                : "bg-gradient-to-r from-emerald-500 to-green-600 text-white shadow-md shadow-emerald-500/30 ring-1 ring-emerald-400/50"
              : index === 0
                ? "text-amber-700 hover:bg-amber-500/10 dark:text-amber-400"
                : "text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400",
          )}
        >
          <span
            className={cn(
              "size-1.5 rounded-full",
              value === opt.value
                ? "bg-white"
                : index === 0
                  ? "bg-amber-500"
                  : "bg-emerald-500",
            )}
          />
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function DeliverySettingsPanel({
  value,
  saving,
  onSave,
}: {
  value: unknown;
  saving: boolean;
  onSave: (value: Record<string, unknown>) => void;
}) {
  const confirm = useConfirm();
  const [config, setConfig] = useState<DeliveryConfig>(() => normalizeDeliveryConfig(value));
  const [query, setQuery] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    setConfig(normalizeDeliveryConfig(value));
  }, [value]);

  const patch = (next: Partial<DeliveryConfig>) => setConfig((prev) => ({ ...prev, ...next }));
  const patchRule = (productId: string, next: Partial<ProductDeliveryRule>) =>
    setConfig((prev) => ({
      ...prev,
      rules: prev.rules.map((r) => (r.productId === productId ? { ...r, ...next } : r)),
    }));

  const search = useQuery({
    queryKey: ["admin", "delivery-product-search", query],
    queryFn: () => adminSearchProducts({ data: { query } }),
    enabled: pickerOpen,
  });

  const existing = useMemo(() => new Set(config.rules.map((r) => r.productId)), [config.rules]);

  const addRule = (productId: string, label: string) => {
    if (existing.has(productId)) return;
    setConfig((prev) => ({
      ...prev,
      rules: [
        ...prev.rules,
        {
          productId,
          label,
          mode: "free" as ProductDeliveryMode,
          uniform: prev.uniform,
          inside_dhaka: prev.inside_dhaka,
          outside_dhaka: prev.outside_dhaka,
        },
      ],
    }));
    setPickerOpen(false);
    setQuery("");
  };

  const removeRule = async (rule: ProductDeliveryRule) => {
    const ok = await confirm({
      title: "Remove delivery rule?",
      description: `“${rule.label || "This product"}” will use the site-wide delivery charge again.`,
      confirmLabel: "Remove",
      tone: "danger",
    });
    if (!ok) return;
    setConfig((prev) => ({ ...prev, rules: prev.rules.filter((r) => r.productId !== rule.productId) }));
  };

  const disabled = config.freeAll;

  return (
    <Panel className="space-y-4">
      <h2 className="ig-text text-sm font-bold">Delivery charges</h2>

      <Toggle
        checked={config.freeAll}
        onChange={(next) => patch({ freeAll: next })}
        title="Free delivery for all orders"
        description="When on, every order ships free and checkout shows the charge as FREE."
      />

      <div className={`space-y-4 transition-opacity duration-200 ${disabled ? "pointer-events-none opacity-50" : ""}`}>
        <div className="space-y-2">
          <span className="block text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Site-wide rate
          </span>
          <ModeTabs
            value={config.mode}
            onChange={(next) => patch({ mode: next === "uniform" ? "uniform" : "zone" })}
            options={[
              { value: "zone", label: "Inside / Outside Dhaka" },
              { value: "uniform", label: "Universal (one rate)" },
            ]}
          />
        </div>

        <div className="grid items-start gap-3 sm:grid-cols-3">
          <div className="min-w-0 sm:col-span-2">
            <Collapse open={config.mode === "zone"}>
              <div className="grid gap-3 sm:grid-cols-2">
                <NumberField
                  label="Inside Dhaka (৳)"
                  value={config.inside_dhaka}
                  onChange={(v) => patch({ inside_dhaka: v })}
                />
                <NumberField
                  label="Outside Dhaka (৳)"
                  value={config.outside_dhaka}
                  onChange={(v) => patch({ outside_dhaka: v })}
                />
              </div>
            </Collapse>
            <Collapse open={config.mode === "uniform"}>
              <NumberField
                label="Universal rate (৳)"
                hint="Same charge anywhere in Bangladesh"
                value={config.uniform}
                onChange={(v) => patch({ uniform: v })}
              />
            </Collapse>
          </div>
          <NumberField
            label="Free delivery above (৳)"
            hint="0 = off"
            value={config.freeAbove}
            onChange={(v) => patch({ freeAbove: v })}
          />
        </div>

        <div className="space-y-3 rounded-xl border border-border/70 bg-background/40 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="min-w-0">
              <span className="ig-text block text-sm font-bold">Product / combo specific charges</span>
              <span className="block text-xs text-muted-foreground">
                Pick a product or combo and give it its own charge — free, one universal rate, or
                separate Dhaka rates. Mixed carts use the highest applicable charge.
              </span>
            </span>
            <Button variant="outline" onClick={() => setPickerOpen((o) => !o)}>
              {pickerOpen ? "Close" : "Add product"}
            </Button>
          </div>

          {pickerOpen ? (
            <div className="space-y-2 rounded-lg border border-border bg-card p-3">
              <div className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-2">
                <Search className="size-4 shrink-0 text-muted-foreground" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search product or combo by name / SKU"
                  className="w-full bg-transparent text-sm outline-none"
                />
              </div>
              <div className="max-h-64 space-y-1 overflow-y-auto">
                {search.isLoading ? (
                  <p className="p-2 text-xs text-muted-foreground">Loading…</p>
                ) : (search.data ?? []).length === 0 ? (
                  <p className="p-2 text-xs text-muted-foreground">No products found.</p>
                ) : (
                  (search.data ?? []).map((p) => {
                    const label = p.name_bn || p.name_en;
                    const added = existing.has(p.id);
                    const image = [...(p.product_images ?? [])].sort(
                      (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
                    )[0]?.url;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        disabled={added}
                        onClick={() => addRule(p.id, label)}
                        className="flex w-full items-center justify-between gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted disabled:opacity-50"
                      >
                        <span className="flex min-w-0 items-center gap-2.5">
                          {image ? (
                            <img
                              src={image}
                              alt=""
                              loading="lazy"
                              className="size-10 shrink-0 rounded-md border border-border/60 object-cover"
                            />
                          ) : (
                            <span className="grid size-10 shrink-0 place-items-center rounded-md border border-border/60 bg-muted text-[10px] font-bold uppercase text-muted-foreground">
                              {p.kind === "combo" ? "Cmb" : "Img"}
                            </span>
                          )}
                          <span className="min-w-0 truncate font-semibold">{label}</span>
                        </span>
                        <span className="shrink-0 text-[11px] font-bold uppercase text-muted-foreground">
                          {added ? "Added" : p.kind === "combo" ? "Combo" : "Product"}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          ) : null}

          {config.rules.length === 0 ? (
            <p className="text-xs text-muted-foreground">No product-specific rules yet.</p>
          ) : (
            <div className="space-y-2">
              {config.rules.map((rule) => (
                <div key={rule.productId} className="space-y-3 rounded-lg border border-border bg-card p-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 break-words text-sm font-bold">
                      {rule.label || rule.productId}
                    </span>
                    <button
                      type="button"
                      onClick={() => void removeRule(rule)}
                      className="shrink-0 rounded-lg p-1.5 text-destructive transition-colors hover:bg-destructive/10"
                      aria-label="Remove rule"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                  <ModeTabs
                    value={rule.mode}
                    onChange={(next) => patchRule(rule.productId, { mode: next as ProductDeliveryMode })}
                    options={[
                      { value: "free", label: "Free delivery" },
                      { value: "uniform", label: "Universal rate" },
                      { value: "zone", label: "Inside / Outside Dhaka" },
                    ]}
                  />
                  {rule.mode === "uniform" ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <NumberField
                        label="Universal rate (৳)"
                        value={rule.uniform}
                        onChange={(v) => patchRule(rule.productId, { uniform: v })}
                      />
                    </div>
                  ) : rule.mode === "zone" ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <NumberField
                        label="Inside Dhaka (৳)"
                        value={rule.inside_dhaka}
                        onChange={(v) => patchRule(rule.productId, { inside_dhaka: v })}
                      />
                      <NumberField
                        label="Outside Dhaka (৳)"
                        value={rule.outside_dhaka}
                        onChange={(v) => patchRule(rule.productId, { outside_dhaka: v })}
                      />
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <SaveButton
        dirty={isDirty(serializeDeliveryConfig(config), serializeDeliveryConfig(normalizeDeliveryConfig(value)))}
        loading={saving}
        onClick={() => onSave(serializeDeliveryConfig(config))}
      />
    </Panel>
  );
}
