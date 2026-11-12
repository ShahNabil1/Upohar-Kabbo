import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  ExternalLink,
  FileText,
  Globe,
  ImageIcon,
  LayoutTemplate,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import {
  adminDeleteLandingPage,
  adminListLandingPages,
  adminListProducts,
  adminSaveLandingPage,
} from "@/lib/admin.functions";
import type { LandingPageInput } from "@/lib/admin-schema";
import { emptyLanding, moveItem, slugify, validateLanding } from "@/lib/landing-editor";
import { SITE_URL } from "@/lib/site";
import { cn } from "@/lib/utils";
import { SaveButton, isDirty } from "@/components/admin/save-button";
import { ImageField } from "@/components/admin/image-upload";
import { SmartImage } from "@/components/site/smart-image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useConfirm } from "@/components/ui/confirm-dialog";

export const Route = createFileRoute("/admin/landing")({
  head: () => ({
    meta: [
      { title: "Landing Page Builder — Upoharkabbo" },
      {
        name: "description",
        content: "Manage product landing pages, content and social previews for Upoharkabbo.",
      },
      { property: "og:title", content: "Landing Page Builder — Upoharkabbo" },
      { property: "og:description", content: "Manage Upoharkabbo product landing pages." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
  component: LandingPagesAdmin,
});

type PageRow = Awaited<ReturnType<typeof adminListLandingPages>>[number];
function readPage(page: PageRow): LandingPageInput {
  const content = (page.content ?? {}) as {
    bullets?: LandingPageInput["bullets"];
    seo?: Partial<LandingPageInput["seo"]>;
    blocks?: Array<{ text_bn?: string; text_en?: string }>;
  };
  return {
    id: page.id,
    product_id: page.product_id,
    slug: page.slug,
    headline_bn: page.headline_bn,
    headline_en: page.headline_en,
    subheadline_bn: page.subheadline_bn,
    subheadline_en: page.subheadline_en,
    meta_title: page.meta_title,
    meta_description: page.meta_description,
    og_image_url: page.og_image_url,
    is_active: page.is_active,
    bullets: Array.isArray(content.bullets)
      ? content.bullets
      : Array.isArray(content.blocks)
        ? content.blocks.map((b) => ({
            bn: b.text_bn ?? b.text_en ?? "",
            en: b.text_en ?? b.text_bn ?? "",
          }))
        : [],
    seo: { ...emptyLanding().seo, ...content.seo },
  };
}

function CopyField({
  label,
  value,
  onChange,
  max,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  max?: number;
  multiline?: boolean;
}) {
  const id = `landing-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-sm font-medium">
        {label}
      </Label>
      {multiline ? (
        <Textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={max}
          rows={3}
        />
      ) : (
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={max}
          className="min-h-11"
        />
      )}
      {max ? (
        <p className="text-right text-xs tabular-nums text-muted-foreground">
          {[...value].length} / {max}
        </p>
      ) : null}
    </div>
  );
}
function SettingSwitch({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex min-h-11 items-center justify-between gap-4 border-b border-border py-3 text-sm font-medium">
      {label}
      <Switch aria-label={label} checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

function LandingPagesAdmin() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [draft, setDraft] = useState<LandingPageInput>(emptyLanding);
  const [saved, setSaved] = useState<LandingPageInput>(emptyLanding);
  const [tab, setTab] = useState("content");
  const [librarySearch, setLibrarySearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [errors, setErrors] = useState<string[]>([]);
  const pages = useQuery({
    queryKey: ["admin", "landing"],
    queryFn: () => adminListLandingPages(),
  });
  const products = useQuery({
    queryKey: ["admin", "products"],
    queryFn: () => adminListProducts(),
  });
  const dirty = isDirty(draft, saved);
  const rows = pages.data ?? [];
  const product = (products.data ?? []).find((p) => p.id === draft.product_id);
  const primaryImage =
    product?.product_images?.slice().sort((a, b) => a.sort_order - b.sort_order)[0]?.url ?? null;
  const headline = draft.headline_bn || product?.name_bn || "পেইজের শিরোনাম";
  const url = `${SITE_URL}/lp/${draft.slug || "your-slug"}`;
  const visiblePages = rows.filter(
    (p) =>
      `${p.headline_bn ?? ""} ${p.slug}`.toLowerCase().includes(librarySearch.toLowerCase()) &&
      (filter === "all" || (filter === "active" ? p.is_active : !p.is_active)),
  );
  const chosenSaved = rows.find((p) => p.id === draft.id);
  const save = useMutation({
    mutationFn: (input: LandingPageInput) => adminSaveLandingPage({ data: input }),
    onSuccess: async (result, input) => {
      const next = { ...input, id: result.id };
      setDraft(next);
      setSaved(next);
      setErrors([]);
      toast.success(input.is_active ? "Landing page saved & active" : "Draft saved");
      await qc.invalidateQueries({ queryKey: ["admin", "landing"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => adminDeleteLandingPage({ data: { id } }),
    onSuccess: async (_result, id) => {
      if (draft.id === id) {
        setDraft(emptyLanding());
        setSaved(emptyLanding());
      }
      toast.success("Landing page deleted");
      await qc.invalidateQueries({ queryKey: ["admin", "landing"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  async function loadDraft(next: LandingPageInput, baseline = next) {
    if (save.isPending) return;
    if (
      dirty &&
      !(await confirm({
        title: "Unsaved changes",
        description: "সেভ না করা পরিবর্তন বাদ দিয়ে অন্য পেইজ খুলবেন?",
        confirmLabel: "Discard changes",
      }))
    )
      return;
    setDraft(next);
    setSaved(baseline);
    setErrors([]);
    setProductSearch("");
    setTab("content");
  }
  function submit() {
    const issues = validateLanding(draft, rows);
    if (draft.is_active && product && !product.is_active)
      issues.push("প্রোডাক্টটি নিষ্ক্রিয়। আগে প্রোডাক্ট সক্রিয় করুন অথবা পেইজটি ড্রাফট রাখুন।");
    setErrors(issues);
    if (issues.length) {
      toast.error(issues[0]);
      return;
    }
    save.mutate(draft);
  }
  async function copyUrl(slug: string) {
    try {
      await navigator.clipboard.writeText(`${SITE_URL}/lp/${slug}`);
      toast.success("Link copied");
    } catch {
      toast.error("লিংক কপি করা যায়নি।");
    }
  }
  const updateText = (key: "headline" | "subheadline", value: string) =>
    setDraft((d) => ({ ...d, [`${key}_bn`]: value || null, [`${key}_en`]: value || null }));

  return (
    <div className="space-y-6 pb-8">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-5">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-lg bg-secondary text-secondary-foreground">
            <LayoutTemplate className="size-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold">Landing Pages</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {rows.length} pages · {rows.filter((p) => p.is_active).length} active ·{" "}
              {rows.filter((p) => !p.is_active).length} drafts
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          className="min-h-11"
          disabled={save.isPending}
          onClick={() => void loadDraft(emptyLanding())}
        >
          <Plus className="size-4" />
          New page
        </Button>
      </header>
      <div className="grid items-start gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="min-w-0 space-y-4 xl:sticky xl:top-24" aria-label="Landing page library">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Page library</h2>
            <span className="text-xs text-muted-foreground">{visiblePages.length}</span>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-3.5 size-4 text-muted-foreground" />
            <Input
              aria-label="Search landing pages"
              value={librarySearch}
              onChange={(e) => setLibrarySearch(e.target.value)}
              placeholder="Search pages…"
              className="min-h-11 pl-9"
            />
          </div>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger aria-label="Filter landing pages" className="min-h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All pages</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="draft">Drafts</SelectItem>
            </SelectContent>
          </Select>
          {pages.isPending ? (
            <p role="status" className="py-6 text-sm text-muted-foreground">
              Loading pages…
            </p>
          ) : pages.isError ? (
            <div role="alert">
              <p className="text-sm text-destructive">পেইজ লোড হয়নি।</p>
              <Button variant="outline" onClick={() => void pages.refetch()}>
                Retry
              </Button>
            </div>
          ) : !visiblePages.length ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {rows.length ? "No matching pages" : "No landing pages yet"}
            </p>
          ) : (
            <ul className="max-h-[480px] space-y-2 overflow-y-auto overscroll-contain xl:max-h-[65vh]">
              {visiblePages.map((page) => (
                <li
                  key={page.id}
                  className={cn(
                    "rounded-lg border bg-card p-3",
                    draft.id === page.id
                      ? "border-primary ring-1 ring-primary/20"
                      : "border-border",
                  )}
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        "text-xs font-semibold",
                        page.is_active ? "text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {page.is_active ? "● Active" : "○ Draft"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {page.id === draft.id ? "Editing" : ""}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    className="h-auto min-h-11 w-full justify-start whitespace-normal px-0 py-1 text-left"
                    disabled={save.isPending}
                    onClick={() => void loadDraft(readPage(page))}
                  >
                    {page.headline_bn || page.slug}
                  </Button>
                  <p className="break-all text-xs text-muted-foreground">/lp/{page.slug}</p>
                  <div className="mt-2 flex items-center gap-1">
                    {page.is_active ? (
                      <Button
                        asChild
                        variant="ghost"
                        size="icon"
                        className="size-11"
                        title="Open saved page"
                      >
                        <Link
                          to="/lp/$slug"
                          params={{ slug: page.slug }}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Open ${page.slug}`}
                        >
                          <ExternalLink className="size-4" />
                        </Link>
                      </Button>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-11"
                      title="Copy link"
                      aria-label={`Copy link for ${page.slug}`}
                      onClick={() => void copyUrl(page.slug)}
                    >
                      <Copy className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-11"
                      title="Duplicate page"
                      aria-label={`Duplicate ${page.slug}`}
                      disabled={save.isPending}
                      onClick={() => {
                        const original = readPage(page);
                        let slug = `${original.slug.slice(0, 65)}-copy`;
                        let n = 2;
                        while (rows.some((p) => p.slug === slug)) {
                          slug = `${original.slug.slice(0, 65)}-copy-${n++}`;
                        }
                        const { id: _id, ...copy } = original;
                        void loadDraft({ ...copy, slug, is_active: false }, emptyLanding());
                      }}
                    >
                      <FileText className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="ml-auto size-11 text-destructive"
                      title="Delete page"
                      aria-label={`Delete ${page.slug}`}
                      disabled={remove.isPending || save.isPending}
                      onClick={() =>
                        void confirm({
                          title: "Delete landing page?",
                          description: `পেইজ /lp/${page.slug} আর খোলা যাবে না।`,
                          confirmLabel: "Delete",
                          tone: "danger",
                        }).then((ok) => {
                          if (ok) remove.mutate(page.id);
                        })
                      }
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </aside>
        <div className="min-w-0 border-t border-border pt-6 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-bold">
                <Pencil className="size-4 text-muted-foreground" />
                {draft.id ? "Edit landing page" : "New landing page"}
              </h2>
              <p className="mt-1 break-all text-xs text-muted-foreground">{url}</p>
            </div>
            <span role="status" className="text-xs font-medium text-muted-foreground">
              {dirty ? "Unsaved changes" : draft.id ? "All changes saved" : "New draft"}
            </span>
          </div>
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="mb-5 grid h-auto w-full grid-cols-3">
              <TabsTrigger value="content" className="min-h-11 gap-2">
                <FileText className="hidden size-4 sm:block" />
                Content
              </TabsTrigger>
              <TabsTrigger value="seo" className="min-h-11 gap-2">
                <Globe className="hidden size-4 sm:block" />
                SEO & Social
              </TabsTrigger>
              <TabsTrigger value="preview" className="min-h-11 gap-2">
                <ImageIcon className="hidden size-4 sm:block" />
                Preview
              </TabsTrigger>
            </TabsList>
            <fieldset disabled={save.isPending} className="min-w-0">
              <TabsContent value="content" className="space-y-6">
                <section className="space-y-4">
                  <h3 className="text-sm font-semibold">Product & page address</h3>
                  <Input
                    aria-label="Search products"
                    placeholder="Search product name or SKU…"
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    className="min-h-11"
                  />
                  <Select
                    value={draft.product_id || "none"}
                    onValueChange={(v) => {
                      const p = (products.data ?? []).find((x) => x.id === v);
                      setDraft((d) => ({
                        ...d,
                        product_id: v === "none" ? "" : v,
                        slug: d.slug || (p ? slugify(`${p.slug}-offer`) : ""),
                      }));
                    }}
                  >
                    <SelectTrigger aria-label="Product" className="min-h-11">
                      <SelectValue placeholder="Select a product" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Select a product</SelectItem>
                      {(products.data ?? [])
                        .filter(
                          (p) =>
                            p.kind !== "component" &&
                            (p.id === draft.product_id ||
                              `${p.name_bn} ${p.name_en} ${p.sku ?? ""}`
                                .toLowerCase()
                                .includes(productSearch.toLowerCase())),
                        )
                        .map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name_bn}
                            {!p.is_active ? " (inactive)" : ""}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  {products.isError ? (
                    <Button variant="outline" onClick={() => void products.refetch()}>
                      Retry products
                    </Button>
                  ) : null}
                  {product ? (
                    <div className="flex items-center gap-3 border-l-2 border-primary bg-muted/40 p-3">
                      {primaryImage ? (
                        <SmartImage
                          src={primaryImage}
                          alt={product.name_bn}
                          baseWidth={160}
                          sizes="64px"
                          className="size-16 rounded-md object-cover"
                        />
                      ) : null}
                      <div className="min-w-0">
                        <p className="break-words text-sm font-semibold">{product.name_bn}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          ৳{Number(product.price).toLocaleString("en-US")} ·{" "}
                          {product.product_variants.length} variants ·{" "}
                          {product.is_active ? "Active product" : "Inactive product"}
                        </p>
                        <Button asChild variant="link" className="h-auto px-0 py-1">
                          <Link
                            to="/admin/products/$id"
                            params={{ id: product.id }}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Edit product
                            <ExternalLink className="size-3" />
                          </Link>
                        </Button>
                      </div>
                    </div>
                  ) : null}
                  <CopyField
                    label="Page URL slug"
                    value={draft.slug}
                    onChange={(v) => setDraft((d) => ({ ...d, slug: slugify(v) }))}
                    max={80}
                  />
                </section>
                <section className="space-y-4 border-t border-border pt-5">
                  <h3 className="text-sm font-semibold">Page content</h3>
                  <CopyField
                    label="Headline"
                    value={draft.headline_bn ?? ""}
                    onChange={(v) => updateText("headline", v)}
                  />
                  <CopyField
                    label="Subheadline"
                    multiline
                    value={draft.subheadline_bn ?? ""}
                    onChange={(v) => updateText("subheadline", v)}
                  />
                </section>
                <section className="space-y-3 border-t border-border pt-5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Product highlights</h3>
                    <Button
                      variant="outline"
                      className="min-h-11"
                      onClick={() =>
                        setDraft((d) => ({ ...d, bullets: [...d.bullets, { bn: "", en: "" }] }))
                      }
                    >
                      <Plus className="size-4" />
                      Add highlight
                    </Button>
                  </div>
                  {!draft.bullets.length ? (
                    <p className="py-4 text-sm text-muted-foreground">No custom highlights</p>
                  ) : (
                    <ol className="space-y-3">
                      {draft.bullets.map((b, i) => (
                        <li
                          key={i}
                          className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3"
                        >
                          <span className="text-sm font-semibold text-muted-foreground">
                            {i + 1}.
                          </span>
                          <Input
                            aria-label={`Highlight ${i + 1}`}
                            value={b.bn}
                            maxLength={300}
                            className="min-h-11 min-w-0 flex-1 basis-40"
                            onChange={(e) =>
                              setDraft((d) => ({
                                ...d,
                                bullets: d.bullets.map((x, j) =>
                                  j === i ? { bn: e.target.value, en: e.target.value } : x,
                                ),
                              }))
                            }
                          />
                          <div className="ml-auto flex gap-1">
                            {[-1, 1].map((offset) => (
                              <Button
                                key={offset}
                                variant="ghost"
                                size="icon"
                                className="size-11"
                                aria-label={`Move highlight ${i + 1} ${offset < 0 ? "up" : "down"}`}
                                title={offset < 0 ? "Move up" : "Move down"}
                                disabled={i + offset < 0 || i + offset >= draft.bullets.length}
                                onClick={() =>
                                  setDraft((d) => ({
                                    ...d,
                                    bullets: moveItem(d.bullets, i, i + offset),
                                  }))
                                }
                              >
                                {offset < 0 ? (
                                  <ArrowUp className="size-4" />
                                ) : (
                                  <ArrowDown className="size-4" />
                                )}
                              </Button>
                            ))}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-11 text-destructive"
                              aria-label={`Remove highlight ${i + 1}`}
                              title="Remove highlight"
                              onClick={() =>
                                setDraft((d) => ({
                                  ...d,
                                  bullets: d.bullets.filter((_, j) => i !== j),
                                }))
                              }
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                </section>
              </TabsContent>
              <TabsContent value="seo" className="space-y-5">
                <CopyField
                  label="Meta title"
                  value={draft.meta_title ?? ""}
                  max={60}
                  onChange={(v) => setDraft((d) => ({ ...d, meta_title: v || null }))}
                />
                <CopyField
                  label="Meta description"
                  multiline
                  value={draft.meta_description ?? ""}
                  max={160}
                  onChange={(v) => setDraft((d) => ({ ...d, meta_description: v || null }))}
                />
                <ImageField
                  label="Social preview image"
                  folder="landing"
                  cropPreset="og"
                  hint="1200 × 630 px · 1.91:1 · JPG / WebP"
                  value={draft.og_image_url}
                  onChange={(v) => setDraft((d) => ({ ...d, og_image_url: v }))}
                />
                <div className="grid gap-5 sm:grid-cols-2">
                  <CopyField
                    label="OG title"
                    value={draft.seo.ogTitle ?? ""}
                    max={60}
                    onChange={(v) =>
                      setDraft((d) => ({ ...d, seo: { ...d.seo, ogTitle: v || null } }))
                    }
                  />
                  <CopyField
                    label="Canonical URL"
                    value={draft.seo.canonicalUrl ?? ""}
                    onChange={(v) =>
                      setDraft((d) => ({ ...d, seo: { ...d.seo, canonicalUrl: v || null } }))
                    }
                  />
                </div>
                <CopyField
                  label="OG description"
                  multiline
                  max={160}
                  value={draft.seo.ogDescription ?? ""}
                  onChange={(v) =>
                    setDraft((d) => ({ ...d, seo: { ...d.seo, ogDescription: v || null } }))
                  }
                />
                <SettingSwitch
                  label="Product structured data"
                  checked={draft.seo.productJsonLd}
                  onChange={(v) => setDraft((d) => ({ ...d, seo: { ...d.seo, productJsonLd: v } }))}
                />
                <SettingSwitch
                  label="Hide from search engines (noindex)"
                  checked={draft.seo.noindex}
                  onChange={(v) => setDraft((d) => ({ ...d, seo: { ...d.seo, noindex: v } }))}
                />
              </TabsContent>
            </fieldset>
            <TabsContent value="preview" className="space-y-7">
              <section aria-label="Content preview">
                <h3 className="mb-4 text-sm font-semibold">Content preview</h3>
                <div className="mx-auto max-w-2xl border-y border-border py-6 text-center">
                  <p className="text-sm font-bold text-foreground">Upoharkabbo</p>
                  <h4 className="mt-4 break-words text-2xl font-bold">{headline}</h4>
                  {draft.subheadline_bn ? (
                    <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-muted-foreground">
                      {draft.subheadline_bn}
                    </p>
                  ) : null}
                  {primaryImage ? (
                    <div className="mx-auto mt-5 aspect-4/5 max-w-xs overflow-hidden">
                      <SmartImage
                        src={primaryImage}
                        alt={product?.name_bn ?? headline}
                        baseWidth={480}
                        sizes="320px"
                        className="size-full object-contain"
                      />
                    </div>
                  ) : null}
                  {product ? (
                    <p className="mt-4 text-2xl font-bold text-primary-dark">
                      ৳{Number(product.price).toLocaleString("en-US")}
                    </p>
                  ) : null}
                  <ul className="mx-auto mt-5 max-w-md space-y-2 text-left">
                    {draft.bullets
                      .filter((b) => b.bn.trim())
                      .map((b, i) => (
                        <li key={i} className="flex gap-2 text-sm">
                          <Check className="mt-0.5 size-4 shrink-0 text-primary-dark" />
                          <span className="break-words">{b.bn}</span>
                        </li>
                      ))}
                  </ul>
                </div>
              </section>
              <section>
                <h3 className="mb-3 text-sm font-semibold">Google search preview</h3>
                <div className="space-y-2 border-l-2 border-border pl-4">
                  <p className="break-all text-xs text-muted-foreground">
                    {draft.seo.canonicalUrl || url}
                  </p>
                  <p className="break-words text-lg font-medium text-foreground">
                    {draft.meta_title || `${headline} — Upoharkabbo`}
                  </p>
                  <p className="break-words text-sm text-muted-foreground">
                    {draft.meta_description || draft.subheadline_bn || headline}
                  </p>
                </div>
              </section>
              <section>
                <h3 className="mb-3 text-sm font-semibold">Social share preview</h3>
                <div className="max-w-lg overflow-hidden rounded-lg border border-border">
                  {draft.og_image_url || primaryImage ? (
                    <SmartImage
                      src={draft.og_image_url || primaryImage || ""}
                      alt="Social preview"
                      baseWidth={640}
                      sizes="480px"
                      className="aspect-[1.91/1] w-full object-cover"
                    />
                  ) : (
                    <div className="grid aspect-[1.91/1] place-items-center bg-muted">
                      <ImageIcon className="size-8 text-muted-foreground" />
                    </div>
                  )}
                  <div className="space-y-2 bg-muted/40 p-4">
                    <p className="text-xs text-muted-foreground">upoharkabbo.com</p>
                    <p className="break-words font-semibold">
                      {draft.seo.ogTitle || draft.meta_title || headline}
                    </p>
                    <p className="break-words text-sm text-muted-foreground">
                      {draft.seo.ogDescription || draft.meta_description || draft.subheadline_bn}
                    </p>
                  </div>
                </div>
              </section>
            </TabsContent>
          </Tabs>
          {errors.length ? (
            <ul
              role="alert"
              className="mt-5 space-y-1 border-l-2 border-destructive bg-destructive/5 p-3 text-sm text-destructive"
            >
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          ) : null}
          <div className="sticky bottom-0 z-10 mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-background/95 py-4 backdrop-blur">
            <label className="flex min-h-11 items-center gap-3 text-sm font-semibold">
              <Switch
                aria-label="Page active"
                checked={draft.is_active}
                disabled={save.isPending}
                onCheckedChange={(v) => setDraft((d) => ({ ...d, is_active: v }))}
              />
              {draft.is_active ? "Active on save" : "Save as draft"}
            </label>
            <div className="flex flex-wrap items-center gap-2">
              {chosenSaved?.is_active ? (
                <Button asChild variant="outline" className="min-h-11">
                  <Link
                    to="/lp/$slug"
                    params={{ slug: chosenSaved.slug }}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="size-4" />
                    Saved page
                  </Link>
                </Button>
              ) : null}
              <SaveButton
                className="min-h-11"
                dirty={dirty}
                loading={save.isPending}
                disabled={
                  products.isPending || products.isError || pages.isPending || pages.isError
                }
                onClick={submit}
                saveLabel={
                  draft.id ? "Save changes" : draft.is_active ? "Save & activate" : "Save draft"
                }
                savedLabel={draft.id ? "Updated" : "Save draft"}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
