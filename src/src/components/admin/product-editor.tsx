import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  Gift,
  ImagePlus,
  Link2,
  Plus,
  Search,
  Trash2,
  Upload,
} from "lucide-react";

import {
  adminGetProduct,
  adminSaveProduct,
  adminSubProductOptions,
  adminTaxonomy,
} from "@/lib/admin.functions";
import type { ProductInput, ProductKind } from "@/lib/admin-schema";
import {
  AdminHeading,
  AreaField,
  Field,
  NumberField,
  Panel,
  TextField,
  ToggleField,
} from "@/components/admin/kit";
import { RichTextEditor } from "@/components/admin/rich-text-editor";
import {
  CropExistingButton,
  ImageUploadButton,
  useImageRemover,
} from "@/components/admin/image-upload";


import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatPrice } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type Draft = ProductInput;

export function emptyDraft(kind: ProductKind): Draft {
  return {
    kind,
    slug: "",
    category_id: null,
    subcategory_id: null,
    name_bn: "",
    name_en: "",
    short_description_bn: null,
    short_description_en: null,
    description_bn: null,
    description_en: null,
    specs: [],
    faq: [],
    price: 0,
    compare_at_price: null,
    cost_price: 0,
    stock: 0,
    sku: null,
    brand: null,
    badge_bn: null,
    badge_en: null,
    meta_title: null,
    meta_description: null,
    og_image_url: null,
    is_active: true,
    is_featured: false,
    sort_order: 0,
    images: [],
    variants: [],
    combo_items: [],
  };
}

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u0980-\u09FF]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function slugifyInput(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\u0980-\u09FF-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+/, "")
    .slice(0, 80);
}

function pick(bn: string | null | undefined, en: string | null | undefined) {
  return (bn && bn.trim().length > 0 ? bn : en) ?? "";
}

function SectionHeading({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-2">
      <h2 className="text-sm font-bold tracking-tight">{title}</h2>
      {action}
    </div>
  );
}

type SubOption = {
  id: string;
  name_bn: string;
  name_en: string;
  sku: string | null;
  price: number | string;
  cost_price: number | string;
  product_images: Array<{ url: string; sort_order: number }> | null;
  product_variants: Array<{ id: string }> | null;
};

export function ProductEditor({ id, kind }: { id: string; kind: ProductKind }) {
  const isNew = id === "new";
  const isCombo = kind === "combo";
  const isComponent = kind === "component";
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Draft>(emptyDraft(kind));
  const { removeImage } = useImageRemover();


  const taxonomy = useQuery({
    queryKey: ["admin", "taxonomy"],
    queryFn: () => adminTaxonomy(),
    enabled: !isComponent,
  });
  const subOptions = useQuery({
    queryKey: ["admin", "sub-options"],
    queryFn: () => adminSubProductOptions(),
    enabled: isCombo,
  });
  const existing = useQuery({
    queryKey: ["admin", "product", id],
    queryFn: () => adminGetProduct({ data: { id } }),
    enabled: !isNew,
  });

  useEffect(() => {
    const p = existing.data as Record<string, unknown> | null | undefined;
    if (!p) return;
    const images = ((p["product_images"] as Array<Record<string, unknown>>) ?? []).sort(
      (a, b) => Number(a["sort_order"]) - Number(b["sort_order"]),
    );
    const variants = ((p["product_variants"] as Array<Record<string, unknown>>) ?? []).sort(
      (a, b) => Number(a["sort_order"]) - Number(b["sort_order"]),
    );
    const comboItems = ((p["combo_items"] as Array<Record<string, unknown>>) ?? []).sort(
      (a, b) => Number(a["sort_order"]) - Number(b["sort_order"]),
    );
    const name = pick(p["name_bn"] as string, p["name_en"] as string);
    const shortDesc = pick(p["short_description_bn"] as string, p["short_description_en"] as string);
    const desc = pick(p["description_bn"] as string, p["description_en"] as string);
    const badge = pick(p["badge_bn"] as string, p["badge_en"] as string);
    setDraft({
      ...emptyDraft(kind),
      ...(p as unknown as Draft),
      kind: ((p["kind"] as ProductKind) ?? kind) as ProductKind,
      name_bn: name,
      name_en: name,
      short_description_bn: shortDesc || null,
      short_description_en: shortDesc || null,
      description_bn: desc || null,
      description_en: desc || null,
      badge_bn: badge || null,
      badge_en: badge || null,
      price: Number(p["price"]),
      cost_price: Number(p["cost_price"] ?? 0),
      compare_at_price: p["compare_at_price"] == null ? null : Number(p["compare_at_price"]),
      specs: Array.isArray(p["specs"])
        ? (p["specs"] as Draft["specs"]).map((s) => {
            const label = pick(s.label_bn, s.label_en);
            const value = pick(s.value_bn, s.value_en);
            return { label_bn: label, label_en: label, value_bn: value, value_en: value };
          })
        : [],
      faq: Array.isArray(p["faq"])
        ? (p["faq"] as Draft["faq"]).map((f) => {
            const question = pick(f.question_bn, f.question_en);
            const answer = pick(f.answer_bn, f.answer_en);
            return {
              question_bn: question,
              question_en: question,
              answer_bn: answer,
              answer_en: answer,
            };
          })
        : [],
      images: images.map((img, i) => {
        const alt = pick(img["alt_bn"] as string, img["alt_en"] as string);
        return {
          url: String(img["url"] ?? ""),
          alt_bn: alt || null,
          alt_en: alt || null,
          sort_order: i,
        };
      }),
      variants: variants.map((v, i) => {
        const groupName = pick(v["group_name_bn"] as string, v["group_name_en"] as string);
        const value = pick(v["value_bn"] as string, v["value_en"] as string);
        return {
          group_name_bn: groupName,
          group_name_en: groupName,
          value_bn: value,
          value_en: value,
          sku: (v["sku"] as string | null) ?? null,
          price_delta: Number(v["price_delta"] ?? 0),
          cost_price: Number(v["cost_price"] ?? 0),
          stock: Number(v["stock"] ?? 0),
          sort_order: i,
          is_active: Boolean(v["is_active"]),
        };
      }),
      combo_items: comboItems.map((c, i) => ({
        item_id: String(c["item_id"] ?? ""),
        quantity: Number(c["quantity"] ?? 1),
        label_bn: (c["label_bn"] as string | null) ?? null,
        label_en: (c["label_en"] as string | null) ?? null,
        is_free: Boolean(c["is_free"]),
        sort_order: i,
      })),
    });
  }, [existing.data, kind]);

  const save = useMutation({
    mutationFn: (input: Draft) => adminSaveProduct({ data: input }),
    onSuccess: async (res) => {
      toast.success("Saved successfully");
      await qc.invalidateQueries({ queryKey: ["admin"] });
      if (isNew) {
        if (isCombo) await navigate({ to: "/admin/combos/$id", params: { id: res.id } });
        else if (isComponent)
          await navigate({ to: "/admin/sub-products/$id", params: { id: res.id } });
        else await navigate({ to: "/admin/products/$id", params: { id: res.id } });
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const subcategories = (taxonomy.data?.subcategories ?? []).filter(
    (s) => s.category_id === draft.category_id,
  );

  const options = (subOptions.data ?? []) as unknown as SubOption[];
  const optionMap = useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);
  const comboCost = draft.combo_items.reduce((sum, item) => {
    const opt = optionMap.get(item.item_id);
    return sum + Number(opt?.cost_price ?? 0) * item.quantity;
  }, 0);
  const totalUnits = draft.combo_items.reduce((s, i) => s + i.quantity, 0);

  const mediaFolder = isComponent ? "sub-products" : "products";

  const backTo = isCombo
    ? "/admin/combos"
    : isComponent
      ? "/admin/sub-products"
      : "/admin/products";
  const backLabel = isCombo ? "Combo boxes" : isComponent ? "Sub-products" : "Products";
  const heading = isNew
    ? isCombo
      ? "New combo box"
      : isComponent
        ? "New sub-product"
        : "New product"
    : draft.name_bn || "Edit";

  return (
    <div className="space-y-5 pb-28">
      <AdminHeading
        backTo={backTo}
        backLabel={backLabel}
        title={heading}
        description={
          isComponent
            ? "কম্বো বক্সের একটি সিংগেল আইটেম — নাম, SKU, দাম, ছবি আর ভেরিয়েন্ট।"
            : isCombo
              ? "কম্বো প্যাকেজ — ভিতরের আইটেমগুলো ড্রপডাউন থেকে যোগ করুন।"
              : "Name, pricing, images, variants and SEO details."
        }
      />

      <Panel className="admin-rise">
        <SectionHeading title="Basics" />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Name"
            value={draft.name_bn}
            onChange={(v) =>
              setDraft((d) => ({
                ...d,
                name_bn: v,
                name_en: v,
                slug: d.slug || slugify(v),
              }))
            }
          />
          {isComponent ? null : (
            <TextField
              label="Slug"
              value={draft.slug}
              onChange={(v) => set("slug", slugifyInput(v))}
              onBlur={() => set("slug", slugify(draft.slug))}
              hint="URL: /p/your-slug"
            />
          )}
          <TextField label="SKU" value={draft.sku ?? ""} onChange={(v) => set("sku", v || null)} />
          {isComponent ? null : (
            <TextField
              label="Brand"
              value={draft.brand ?? ""}
              onChange={(v) => set("brand", v || null)}
            />
          )}
          {isComponent ? null : (
            <>
              <Field label="Category">
                <Select
                  value={draft.category_id || "none"}
                  onValueChange={(v) => {
                    set("category_id", v === "none" ? null : v);
                    set("subcategory_id", null);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Select</SelectItem>
                    {(taxonomy.data?.categories ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name_bn}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Subcategory">
                <Select
                  value={draft.subcategory_id ?? "none"}
                  onValueChange={(v) => set("subcategory_id", v === "none" ? null : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {subcategories.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name_bn}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <TextField
                label="Badge"
                value={draft.badge_bn ?? ""}
                onChange={(v) =>
                  setDraft((d) => ({ ...d, badge_bn: v || null, badge_en: v || null }))
                }
              />
            </>
          )}
          <div className="flex gap-3">
            <ToggleField
              label="Active"
              checked={draft.is_active}
              onChange={(v) => set("is_active", v)}
            />
            {isComponent ? null : (
              <ToggleField
                label="Featured"
                checked={draft.is_featured}
                onChange={(v) => set("is_featured", v)}
              />
            )}
          </div>
        </div>

        {isComponent ? null : (
          <div className="mt-5">
            <RichTextEditor
              label="Short description"
              hint="যেভাবে লিখবেন — কালার, বোল্ড, লিস্ট, ইমোজি — ঠিক সেভাবেই প্রোডাক্ট পেজে দেখাবে।"
              value={draft.short_description_bn ?? ""}
              onChange={(v) =>
                setDraft((d) => ({
                  ...d,
                  short_description_bn: v || null,
                  short_description_en: v || null,
                }))
              }
            />
          </div>
        )}
      </Panel>

      <Panel className="admin-rise" style={{ animationDelay: "60ms" }}>
        <SectionHeading title="Pricing" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <NumberField
            label="Cost price (৳)"
            value={draft.cost_price}
            onChange={(v) => set("cost_price", v)}
          />
          <NumberField label="Selling price (৳)" value={draft.price} onChange={(v) => set("price", v)} />
          <NumberField
            label="Compare-at price (৳)"
            value={draft.compare_at_price ?? 0}
            onChange={(v) => set("compare_at_price", v > 0 ? v : null)}
          />
        </div>
      </Panel>

      {isCombo ? (
        <Panel className="admin-rise" style={{ animationDelay: "90ms" }}>
          <SectionHeading
            title="Combo items"
            action={
              <span className="text-xs text-muted-foreground">
                {totalUnits} টি আইটেম · কেনা দাম {formatPrice("bn", comboCost)}
              </span>
            }
          />
          <ComboItemPicker
            options={options}
            loading={subOptions.isLoading}
            onPick={(itemId) =>
              set("combo_items", [
                ...draft.combo_items,
                {
                  item_id: itemId,
                  quantity: 1,
                  label_bn: null,
                  label_en: null,
                  is_free: false,
                  sort_order: draft.combo_items.length,
                },
              ])
            }
          />

          {draft.combo_items.length === 0 ? (
            <p className="mt-3 rounded-xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
              <Gift className="mx-auto mb-2 size-5 opacity-60" />
              এখনো কোনো আইটেম যোগ করা হয়নি
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {draft.combo_items.map((item, i) => {
                const opt = optionMap.get(item.item_id);
                const image = [...(opt?.product_images ?? [])].sort(
                  (a, b) => a.sort_order - b.sort_order,
                )[0];
                return (
                  <li
                    key={`${item.item_id}-${i}`}
                    className="flex flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-background/50 p-2"
                  >
                    <span className="w-6 text-center text-xs font-bold text-muted-foreground">
                      {i + 1}
                    </span>
                    <div className="size-11 shrink-0 overflow-hidden rounded-lg bg-muted">
                      {image ? (
                        <img src={image.url} alt="" className="size-full object-cover" />
                      ) : null}
                    </div>
                    <div className="min-w-40 flex-1">
                      <p className="truncate text-sm font-semibold">
                        {opt?.name_bn ?? "Unknown item"}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {opt?.sku ? `${opt.sku} · ` : ""}
                        {formatPrice("bn", Number(opt?.price ?? 0))}
                      </p>
                    </div>
                    <Input
                      className="w-32 rounded-lg"
                      placeholder="Custom label"
                      value={item.label_bn ?? ""}
                      onChange={(e) =>
                        patchComboItem(i, {
                          label_bn: e.target.value || null,
                          label_en: e.target.value || null,
                        })
                      }
                    />
                    <Input
                      className="w-16 rounded-lg"
                      type="number"
                      min={1}
                      value={item.quantity}
                      onChange={(e) =>
                        patchComboItem(i, { quantity: Math.max(1, Number(e.target.value) || 1) })
                      }
                    />
                    <Button
                      size="sm"
                      variant={item.is_free ? "default" : "outline"}
                      className={cn("rounded-lg text-xs", item.is_free && "ig-gradient")}
                      onClick={() => patchComboItem(i, { is_free: !item.is_free })}
                    >
                      ফ্রি
                    </Button>
                    <div className="flex">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="rounded-lg"
                        onClick={() => moveComboItem(i, -1)}
                      >
                        <ArrowUp className="size-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="rounded-lg"
                        onClick={() => moveComboItem(i, 1)}
                      >
                        <ArrowDown className="size-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="rounded-lg text-muted-foreground hover:text-destructive"
                        onClick={() =>
                          set(
                            "combo_items",
                            draft.combo_items.filter((_, j) => j !== i),
                          )
                        }
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      ) : null}

      <Panel className="admin-rise" style={{ animationDelay: "120ms" }}>
        <SectionHeading
          title="Media"
          action={
            <div className="flex items-center gap-2">
              <ImageUploadButton
                folder={mediaFolder}
                multiple
                label="Upload images"
                onUploaded={(urls) =>
                  set("images", [
                    ...draft.images,
                    ...urls.map((url, k) => ({
                      url,
                      alt_bn: null,
                      alt_en: null,
                      sort_order: draft.images.length + k,
                    })),
                  ])
                }
              />
              <Button
                size="sm"
                variant="outline"
                className="rounded-xl"
                onClick={() =>
                  set("images", [
                    ...draft.images,
                    { url: "", alt_bn: null, alt_en: null, sort_order: draft.images.length },
                  ])
                }
              >
                <Link2 className="mr-1.5 size-3.5" /> Add by URL
              </Button>
            </div>
          }
        />
        <p className="mb-3 text-[11px] text-muted-foreground">
          আসল ছবি সরাসরি আপলোড হয়, সাইজ/ফরম্যাট এজ-এ অটো অপটিমাইজ হয়। ছবির উপর ক্লিক করে ক্রপ করা যায়। প্রথম ছবিটিই OG/সোশ্যাল প্রিভিউ
          হিসেবে যায়।
        </p>

        {draft.images.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border py-10 text-center">
            <ImagePlus className="size-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No images yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {draft.images.map((img, i) => (
              <div
                key={i}
                className="group flex flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-background/50 p-2 transition-all duration-300 hover:border-primary/30 hover:bg-background/80"
              >
                <div className="size-14 shrink-0 overflow-hidden rounded-lg bg-muted transition-transform duration-300 group-hover:scale-105">
                  {img.url ? (
                    <CropExistingButton
                      folder={mediaFolder}
                      url={img.url}
                      cropPreset={i === 0 && !isComponent ? "card" : "square"}
                      className="size-full"
                      onCropped={(u) =>
                        set(
                          "images",
                          draft.images.map((x, j) => (j === i ? { ...x, url: u } : x)),
                        )
                      }
                    >
                      <img src={img.url} alt="" className="size-full object-cover" />
                    </CropExistingButton>
                  ) : (
                    <div className="flex size-full items-center justify-center text-muted-foreground">
                      <Upload className="size-4" />
                    </div>
                  )}
                </div>
                <Input
                  className="min-w-56 flex-1 rounded-lg"
                  placeholder="Image URL"
                  value={img.url}
                  onChange={(e) =>
                    set(
                      "images",
                      draft.images.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)),
                    )
                  }
                />
                <Input
                  className="w-48 rounded-lg"
                  placeholder="Alt text"
                  value={img.alt_bn ?? ""}
                  onChange={(e) =>
                    set(
                      "images",
                      draft.images.map((x, j) =>
                        j === i
                          ? { ...x, alt_bn: e.target.value || null, alt_en: e.target.value || null }
                          : x,
                      ),
                    )
                  }
                />
                {img.url ? (
                  <CropExistingButton
                    folder={mediaFolder}
                    url={img.url}
                    cropPreset={i === 0 && !isComponent ? "card" : "square"}
                    onCropped={(u) =>
                      set(
                        "images",
                        draft.images.map((x, j) => (j === i ? { ...x, url: u } : x)),
                      )
                    }
                  />
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  className="rounded-lg text-muted-foreground hover:text-destructive"
                  onClick={() =>
                    void removeImage(img.url, () =>
                      set(
                        "images",
                        draft.images.filter((_, j) => j !== i),
                      ),
                    )
                  }
                >
                  <Trash2 className="size-4" />
                </Button>

              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel className="admin-rise" style={{ animationDelay: "180ms" }}>
        <SectionHeading
          title="Variants"
          action={
            <Button
              size="sm"
              variant="outline"
              className="rounded-xl"
              onClick={() =>
                set("variants", [
                  ...draft.variants,
                  {
                    group_name_bn: "Size",
                    group_name_en: "Size",
                    value_bn: "",
                    value_en: "",
                    sku: null,
                    price_delta: 0,
                    cost_price: 0,
                    stock: 0,
                    sort_order: draft.variants.length,
                    is_active: true,
                  },
                ])
              }
            >
              <Plus className="mr-1.5 size-3.5" /> Add variant
            </Button>
          }
        />
        <p className="mb-3 text-[11px] text-muted-foreground">
          কালার/সাইজের মতো অপশন — প্রতিটির আলাদা SKU, কেনা দাম আর দামের কম-বেশি (± ৳)।
        </p>
        {draft.variants.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
            No variants yet
          </p>
        ) : (
          <div className="space-y-2">
            {draft.variants.map((v, i) => (
              <div
                key={i}
                className="grid gap-2 rounded-xl border border-border/70 bg-background/50 p-3 transition-all duration-300 hover:border-primary/30 hover:bg-background/80 hover:shadow-sm sm:grid-cols-6"
              >
                <Input
                  className="rounded-lg"
                  placeholder="Group (Color/Size)"
                  value={v.group_name_bn}
                  onChange={(e) =>
                    patchVariant(i, {
                      group_name_bn: e.target.value,
                      group_name_en: e.target.value,
                    })
                  }
                />
                <Input
                  className="rounded-lg"
                  placeholder="Value"
                  value={v.value_bn}
                  onChange={(e) =>
                    patchVariant(i, { value_bn: e.target.value, value_en: e.target.value })
                  }
                />
                <Input
                  className="rounded-lg"
                  placeholder="SKU"
                  value={v.sku ?? ""}
                  onChange={(e) => patchVariant(i, { sku: e.target.value || null })}
                />
                <Input
                  className="rounded-lg"
                  type="number"
                  placeholder="Cost price"
                  value={v.cost_price}
                  onChange={(e) => patchVariant(i, { cost_price: Number(e.target.value) })}
                />
                <Input
                  className="rounded-lg"
                  type="number"
                  placeholder="Price ±"
                  value={v.price_delta}
                  onChange={(e) => patchVariant(i, { price_delta: Number(e.target.value) })}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  className="rounded-lg text-muted-foreground hover:text-destructive"
                  onClick={() =>
                    set(
                      "variants",
                      draft.variants.filter((_, j) => j !== i),
                    )
                  }
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {isComponent ? null : (
        <>
          <Panel className="admin-rise" style={{ animationDelay: "240ms" }}>
            <SectionHeading
              title="Specifications"
              action={
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-xl"
                  onClick={() =>
                    set("specs", [
                      ...draft.specs,
                      { label_bn: "", label_en: "", value_bn: "", value_en: "" },
                    ])
                  }
                >
                  <Plus className="mr-1.5 size-3.5" /> Add row
                </Button>
              }
            />
            <p className="mb-3 text-xs text-muted-foreground">
              Shown right under the short description on the product page, e.g. Brand : Swiss
              Beauty, Country : P.R.C, SKU : 890440…
            </p>
            {draft.specs.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
                No specifications yet
              </p>
            ) : (
              <div className="space-y-2">
                {draft.specs.map((s, i) => (
                  <div
                    key={i}
                    className="grid gap-2 rounded-xl border border-border/70 bg-background/50 p-2 transition-all duration-300 hover:border-primary/30 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto]"
                  >
                    <Input
                      className="rounded-lg"
                      placeholder="Label (Brand)"
                      list="spec-label-presets"
                      value={s.label_bn}
                      onChange={(e) =>
                        patchSpec(i, { label_bn: e.target.value, label_en: e.target.value })
                      }
                    />
                    <Input
                      className="rounded-lg"
                      placeholder="Value"
                      value={s.value_bn}
                      onChange={(e) =>
                        patchSpec(i, { value_bn: e.target.value, value_en: e.target.value })
                      }
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      className="justify-self-start rounded-lg text-muted-foreground hover:text-destructive"
                      onClick={() =>
                        set(
                          "specs",
                          draft.specs.filter((_, j) => j !== i),
                        )
                      }
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
                <datalist id="spec-label-presets">
                  {["Brand", "Category", "Country", "Stock", "Sold", "SKU", "Weight", "Warranty"].map(
                    (label) => (
                      <option key={label} value={label} />
                    ),
                  )}
                </datalist>
              </div>
            )}
          </Panel>


          <Panel className="admin-rise" style={{ animationDelay: "300ms" }}>
            <SectionHeading title="SEO" />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="Meta title"
                value={draft.meta_title ?? ""}
                onChange={(v) => set("meta_title", v || null)}
                maxLength={60}
                hint="সর্বোচ্চ ৬০ ক্যারেক্টার"
              />
              <AreaField
                label="Meta description"
                rows={3}
                value={draft.meta_description ?? ""}
                onChange={(v) => set("meta_description", v || null)}
                maxLength={160}
                hint="সর্বোচ্চ ১৬০ ক্যারেক্টার"
              />
            </div>
          </Panel>
        </>
      )}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border/70 bg-card/90 px-4 py-3 backdrop-blur-md lg:left-20">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-end gap-3 lg:px-10">


          <p className="mr-auto hidden text-xs text-muted-foreground sm:block">
            {isNew ? "Creating a new entry" : "Editing existing entry"}
          </p>
          <Button
            loading={save.isPending}
            className="ig-gradient rounded-xl px-6 transition-transform duration-300 hover:scale-[1.02]"
            onClick={() =>
              save.mutate({
                ...draft,
                kind,
                slug:
                  draft.slug ||
                  slugify(draft.name_en || draft.name_bn) ||
                  `item-${Date.now().toString(36)}`,
              })
            }
          >
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );

  function patchVariant(index: number, patch: Partial<Draft["variants"][number]>) {
    set(
      "variants",
      draft.variants.map((v, j) => (j === index ? { ...v, ...patch } : v)),
    );
  }

  function patchComboItem(index: number, patch: Partial<Draft["combo_items"][number]>) {
    set(
      "combo_items",
      draft.combo_items.map((c, j) => (j === index ? { ...c, ...patch } : c)),
    );
  }

  function moveComboItem(index: number, delta: number) {
    const next = [...draft.combo_items];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    const a = next[index]!;
    const b = next[target]!;
    next[index] = b;
    next[target] = a;
    set(
      "combo_items",
      next.map((c, i) => ({ ...c, sort_order: i })),
    );
  }

  function patchSpec(index: number, patch: Partial<Draft["specs"][number]>) {
    set(
      "specs",
      draft.specs.map((s, j) => (j === index ? { ...s, ...patch } : s)),
    );
  }

  function patchFaq(index: number, patch: Partial<Draft["faq"][number]>) {
    set(
      "faq",
      draft.faq.map((f, j) => (j === index ? { ...f, ...patch } : f)),
    );
  }
}

function ComboItemPicker({
  options,
  loading,
  onPick,
}: {
  options: SubOption[];
  loading: boolean;
  onPick: (id: string) => void;
}) {
  const [term, setTerm] = useState("");
  const filtered = options.filter((o) =>
    `${o.name_bn} ${o.name_en} ${o.sku ?? ""}`.toLowerCase().includes(term.trim().toLowerCase()),
  );

  return (
    <div className="rounded-xl border border-dashed border-border/80 bg-background/40 p-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="rounded-lg pl-8"
          placeholder="সাব-আইটেম খুঁজুন এবং যোগ করুন…"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        />
      </div>
      <div className="mt-2 max-h-52 space-y-1 overflow-y-auto">
        {loading ? (
          <p className="py-4 text-center text-xs text-muted-foreground">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">
            কোনো সাব-আইটেম নেই — আগে Sub-Products পেইজ থেকে আইটেম যোগ করুন।
          </p>
        ) : (
          filtered.slice(0, 40).map((o) => {
            const image = [...(o.product_images ?? [])].sort(
              (a, b) => a.sort_order - b.sort_order,
            )[0];
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => onPick(o.id)}
                className="group flex w-full items-center gap-2.5 rounded-xl border border-transparent bg-muted/25 px-2.5 py-2 text-left transition-all hover:-translate-y-px hover:border-primary/40 hover:bg-primary/10 hover:shadow-sm"
              >
                <div className="size-9 shrink-0 overflow-hidden rounded-lg bg-muted ring-1 ring-border/70 transition-all group-hover:ring-2 group-hover:ring-primary/50">
                  {image ? (
                    <img src={image.url} alt="" className="size-full object-cover" />
                  ) : null}
                </div>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                  {o.name_bn}
                </span>
                <span className="rounded-full bg-primary/12 px-2 py-0.5 text-[11px] font-bold text-primary">
                  {formatPrice("bn", Number(o.price))}
                </span>

                <Plus className="size-4 text-primary opacity-60 transition-opacity group-hover:opacity-100" />
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
