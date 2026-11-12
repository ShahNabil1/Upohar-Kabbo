import { createFileRoute } from "@tanstack/react-router";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  FolderTree,
  GripVertical,
  Layers,
  Pencil,
  Trash2,
  X,
} from "lucide-react";

import {
  adminDeleteCategory,
  adminDeleteSubcategory,
  adminReorderCategories,
  adminReorderSubcategories,
  adminSaveCategory,
  adminSaveSubcategory,
  adminTaxonomy,
  adminToggleCategoryActive,
} from "@/lib/admin.functions";
import type { CategoryInput, SubcategoryInput } from "@/lib/admin-schema";
import { AdminHeading, AreaField, EmptyState, Field, Panel, TextField, ToggleField } from "@/components/admin/kit";
import { RichTextEditor } from "@/components/admin/rich-text-editor";
import { BrandLoader } from "@/components/admin/brand-loader";
import { ImageField } from "@/components/admin/image-upload";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/admin/taxonomy")({ component: TaxonomyPage });

type TaxonomyRow = {
  id: string;
  slug: string;
  name_bn: string;
  name_en: string;
  category_id?: string;
  is_active: boolean;
  is_featured?: boolean;
  show_in_header?: boolean;
};

function slugify(input: string) {
  return input.toLowerCase().trim().replace(/[^a-z0-9\u0980-\u09FF]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

function emptyCategory(): CategoryInput {
  return {
    slug: "", name_bn: "", name_en: "", description_bn: null, description_en: null,
    image_url: null, meta_title: null, meta_description: null, sort_order: 0,
    is_active: true, is_featured: false, show_in_header: true,
  };
}

function toCategoryDraft(row: unknown): CategoryInput {
  const c = row as CategoryInput;
  return {
    ...c,
    name_bn: c.name_bn || c.name_en || "",
    name_en: c.name_bn || c.name_en || "",
    description_bn: c.description_bn ?? c.description_en ?? null,
    description_en: c.description_bn ?? c.description_en ?? null,
  };
}

function toSubcategoryDraft(row: unknown): SubcategoryInput {
  const s = row as SubcategoryInput;
  return {
    ...s,
    name_bn: s.name_bn || s.name_en || "",
    name_en: s.name_bn || s.name_en || "",
    description_bn: s.description_bn ?? s.description_en ?? null,
    description_en: s.description_bn ?? s.description_en ?? null,
  };
}

function moveId(ids: string[], id: string, targetId: string) {
  const from = ids.indexOf(id);
  const to = ids.indexOf(targetId);
  if (from < 0 || to < 0 || from === to) return ids;
  const next = ids.slice();
  next.splice(from, 1);
  next.splice(to, 0, id);
  return next;
}

function moveBy(ids: string[], id: string, amount: number) {
  const from = ids.indexOf(id);
  const to = from + amount;
  if (from < 0 || to < 0 || to >= ids.length) return ids;
  return moveId(ids, id, ids[to] as string);
}

function SortControls({ id, ids, onMove }: { id: string; ids: string[]; onMove: (next: string[]) => void }) {
  const index = ids.indexOf(id);
  return (
    <div className="flex shrink-0 items-center gap-1 sm:hidden">
      <Button size="icon" variant="ghost" title="Move up" disabled={index <= 0} onClick={() => onMove(moveBy(ids, id, -1))}>
        <ArrowUp className="size-4" />
      </Button>
      <Button size="icon" variant="ghost" title="Move down" disabled={index < 0 || index >= ids.length - 1} onClick={() => onMove(moveBy(ids, id, 1))}>
        <ArrowDown className="size-4" />
      </Button>
    </div>
  );
}

function TaxonomyPage() {
  const qc = useQueryClient();
  const confirmDialog = useConfirm();
  const { data, isLoading } = useQuery({ queryKey: ["admin", "taxonomy"], queryFn: () => adminTaxonomy() });
  const [cat, setCat] = useState<CategoryInput>(emptyCategory());
  const [sub, setSub] = useState<SubcategoryInput>({ ...emptyCategory(), category_id: "" });
  const [categoryOrder, setCategoryOrder] = useState<string[]>([]);
  const [subcategoryOrder, setSubcategoryOrder] = useState<string[]>([]);
  const dragId = useRef<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const categories = (data?.categories ?? []) as TaxonomyRow[];
  const subcategories = (data?.subcategories ?? []) as TaxonomyRow[];
  useEffect(() => setCategoryOrder(categories.map((row) => row.id)), [data?.categories]);
  useEffect(() => setSubcategoryOrder(subcategories.map((row) => row.id)), [data?.subcategories]);

  const orderedCategories = categoryOrder.map((id) => categories.find((row) => row.id === id)).filter((row): row is TaxonomyRow => Boolean(row));
  const orderedSubcategories = subcategoryOrder.map((id) => subcategories.find((row) => row.id === id)).filter((row): row is TaxonomyRow => Boolean(row));
  const featuredCount = categories.filter((row) => row.is_featured).length;
  const isCurrentFeatured = Boolean(cat.id && categories.find((row) => row.id === cat.id)?.is_featured);
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin"] });

  const saveCat = useMutation({
    mutationFn: (input: CategoryInput) => adminSaveCategory({ data: input }),
    onSuccess: async () => { toast.success("Category saved"); setCat(emptyCategory()); await refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const saveSub = useMutation({
    mutationFn: (input: SubcategoryInput) => adminSaveSubcategory({ data: input }),
    onSuccess: async () => { toast.success("Subcategory saved"); setSub({ ...emptyCategory(), category_id: sub.category_id }); await refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const delCat = useMutation({ mutationFn: (id: string) => adminDeleteCategory({ data: { id } }), onSuccess: async () => { toast.success("Deleted"); await refresh(); }, onError: (e: Error) => toast.error(e.message) });
  const delSub = useMutation({ mutationFn: (id: string) => adminDeleteSubcategory({ data: { id } }), onSuccess: async () => { toast.success("Deleted"); await refresh(); }, onError: (e: Error) => toast.error(e.message) });
  const toggleCat = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) => adminToggleCategoryActive({ data: { id, is_active } }),
    onSuccess: async (_, variables) => { toast.success(variables.is_active ? "Category page visible" : "Category page hidden"); await refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const reorderCats = useMutation({
    mutationFn: (ids: string[]) => adminReorderCategories({ data: { ids } }),
    onSuccess: async () => { toast.success("Category order saved"); await refresh(); },
    onError: async (e: Error) => { toast.error(e.message); await refresh(); },
  });
  const reorderSubs = useMutation({
    mutationFn: (ids: string[]) => adminReorderSubcategories({ data: { ids } }),
    onSuccess: async () => { toast.success("Subcategory order saved"); await refresh(); },
    onError: async (e: Error) => { toast.error(e.message); await refresh(); },
  });

  function commitCategoryOrder(next: string[]) { setCategoryOrder(next); reorderCats.mutate(next); }
  function commitSubcategoryOrder(next: string[]) { setSubcategoryOrder(next); reorderSubs.mutate(next); }

  return (
    <div className="min-w-0 space-y-6 pb-16">
      <AdminHeading title="Categories & Subcategories" description="Manage the store's navigation structure." />

      <div className="grid min-w-0 gap-5 xl:grid-cols-2">
        <Panel className="min-w-0 space-y-4 overflow-hidden">
          <h2 className="flex items-center gap-2 text-sm font-bold"><FolderTree className="size-4 text-primary" />{cat.id ? "Edit category" : "New category"}</h2>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            <TextField label="Name" value={cat.name_bn} onChange={(value) => setCat({ ...cat, name_bn: value, name_en: value, slug: cat.slug || slugify(value) })} />
            <TextField label="Slug" value={cat.slug} onChange={(value) => setCat({ ...cat, slug: slugify(value) })} />
            <TextField label="Meta title" value={cat.meta_title ?? ""} onChange={(value) => setCat({ ...cat, meta_title: value || null })} maxLength={60} hint="সর্বোচ্চ ৬০ ক্যারেক্টার" />
            <ImageField cropPreset="card" label="Category image" folder="categories" value={cat.image_url} onChange={(value) => setCat({ ...cat, image_url: value })} hint="আপলোড বা Crop চাপলে অ্যাডভান্স ক্রপ টুল খুলবে।" />
          </div>
          <RichTextEditor label="Description" value={cat.description_bn ?? ""} minHeight={150} onChange={(value) => setCat({ ...cat, description_bn: value || null, description_en: value || null })} />
          <AreaField label="Meta description" rows={3} value={cat.meta_description ?? ""} onChange={(value) => setCat({ ...cat, meta_description: value || null })} maxLength={160} hint="সর্বোচ্চ ১৬০ ক্যারেক্টার" />
          <div className="grid gap-2 sm:grid-cols-3">
            <ToggleField label="Active" checked={cat.is_active} onChange={(value) => setCat({ ...cat, is_active: value })} />
            <ToggleField label={`Featured (${featuredCount}/4)`} checked={cat.is_featured} onChange={(value) => { if (value && featuredCount >= 4 && !isCurrentFeatured) { toast.error("Maximum 4 featured categories allowed"); return; } setCat({ ...cat, is_featured: value }); }} />
            <ToggleField label="Show on hero section" checked={cat.show_in_header} onChange={(value) => setCat({ ...cat, show_in_header: value })} />
          </div>
          <div className="grid grid-cols-2 gap-2 pt-1 sm:flex">
            <Button loading={saveCat.isPending} onClick={() => saveCat.mutate(cat)} className="ig-gradient">Save</Button>
            {cat.id ? <Button variant="outline" onClick={() => setCat(emptyCategory())}><X className="mr-1 size-4" />Cancel</Button> : null}
          </div>
        </Panel>

        <Panel className="min-w-0 overflow-hidden p-0">
          <div className="border-b border-border p-4"><h2 className="text-sm font-bold">Categories</h2></div>
          {isLoading ? <BrandLoader size="md" className="py-6" /> : orderedCategories.length === 0 ? <div className="p-4"><EmptyState title="No categories yet" /></div> : (
            <ul className="divide-y divide-border">
              {orderedCategories.map((row) => (
                <li key={row.id} draggable onDragStart={() => { dragId.current = row.id; setOverId(row.id); }} onDragOver={(event) => { event.preventDefault(); setOverId(row.id); }} onDragEnd={() => { dragId.current = null; setOverId(null); }} onDrop={(event) => { event.preventDefault(); const from = dragId.current; if (from) commitCategoryOrder(moveId(categoryOrder, from, row.id)); dragId.current = null; setOverId(null); }} className={cn("grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-3 py-3 text-sm transition-colors hover:bg-primary/5 sm:px-4", overId === row.id && dragId.current !== row.id && "bg-primary/10", !row.is_active && "bg-muted/40 text-muted-foreground")}>
                  <GripVertical className="hidden size-4 cursor-grab text-muted-foreground sm:block" />
                  <div className="min-w-0"><p className="truncate font-semibold">{row.name_bn || row.name_en}</p><p className="truncate text-xs text-muted-foreground">/c/{row.slug}</p><div className="mt-1 flex flex-wrap gap-1"><span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase", row.is_active ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700")}>{row.is_active ? "Visible" : "Hidden"}</span>{row.is_featured ? <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-primary">Featured</span> : null}{row.show_in_header ? <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-sky-700">Hero</span> : null}</div></div>
                  <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center"><SortControls id={row.id} ids={categoryOrder} onMove={commitCategoryOrder} /><div className="flex gap-1"><Button size="icon" variant="outline" title={row.is_active ? "Hide page" : "Show page"} loading={toggleCat.isPending && toggleCat.variables?.id === row.id} onClick={() => toggleCat.mutate({ id: row.id, is_active: !row.is_active })}>{row.is_active ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}</Button><Button size="icon" variant="outline" title="Edit" onClick={() => setCat(toCategoryDraft(row))}><Pencil className="size-3.5" /></Button><Button size="icon" variant="ghost" title="Delete" onClick={() => { void confirmDialog({ title: "Delete this category?", description: "Products under it will lose this category." }).then((ok) => ok && delCat.mutate(row.id)); }}><Trash2 className="size-3.5" /></Button></div></div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid min-w-0 gap-5 xl:grid-cols-2">
        <Panel className="min-w-0 space-y-4 overflow-hidden">
          <h2 className="flex items-center gap-2 text-sm font-bold"><Layers className="size-4 text-primary" />{sub.id ? "Edit subcategory" : "New subcategory"}</h2>
          <Field label="Parent category"><Select value={sub.category_id || "none"} onValueChange={(value) => setSub({ ...sub, category_id: value === "none" ? "" : value })}><SelectTrigger className="w-full"><SelectValue placeholder="Select" /></SelectTrigger><SelectContent><SelectItem value="none">Select</SelectItem>{categories.map((row) => <SelectItem key={row.id} value={row.id}>{row.name_bn || row.name_en}</SelectItem>)}</SelectContent></Select></Field>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            <TextField label="Name" value={sub.name_bn} onChange={(value) => setSub({ ...sub, name_bn: value, name_en: value, slug: sub.slug || slugify(value) })} />
            <TextField label="Slug" value={sub.slug} onChange={(value) => setSub({ ...sub, slug: slugify(value) })} />
            <TextField label="Meta title" value={sub.meta_title ?? ""} onChange={(value) => setSub({ ...sub, meta_title: value || null })} maxLength={60} hint="সর্বোচ্চ ৬০ ক্যারেক্টার" />
            <ImageField cropPreset="card" label="Subcategory image (used as OG preview)" folder="categories" value={sub.image_url} onChange={(value) => setSub({ ...sub, image_url: value })} />
          </div>
          <RichTextEditor label="Description" value={sub.description_bn ?? ""} minHeight={150} onChange={(value) => setSub({ ...sub, description_bn: value || null, description_en: value || null })} />
          <AreaField label="Meta description" rows={3} value={sub.meta_description ?? ""} onChange={(value) => setSub({ ...sub, meta_description: value || null })} maxLength={160} hint="সর্বোচ্চ ১৬০ ক্যারেক্টার" />
          <ToggleField label="Active" checked={sub.is_active} onChange={(value) => setSub({ ...sub, is_active: value })} />
          <div className="grid grid-cols-2 gap-2 pt-1 sm:flex"><Button loading={saveSub.isPending} onClick={() => saveSub.mutate(sub)} className="ig-gradient">Save</Button>{sub.id ? <Button variant="outline" onClick={() => setSub({ ...emptyCategory(), category_id: sub.category_id })}><X className="mr-1 size-4" />Cancel</Button> : null}</div>
        </Panel>

        <Panel className="min-w-0 overflow-hidden p-0">
          <div className="border-b border-border p-4"><h2 className="text-sm font-bold">Subcategories</h2></div>
          {orderedSubcategories.length === 0 ? <div className="p-4"><EmptyState title="No subcategories yet" /></div> : (
            <ul className="divide-y divide-border">
              {orderedSubcategories.map((row) => {
                const parent = categories.find((category) => category.id === row.category_id);
                return <li key={row.id} draggable onDragStart={() => { dragId.current = row.id; setOverId(row.id); }} onDragOver={(event) => { event.preventDefault(); setOverId(row.id); }} onDragEnd={() => { dragId.current = null; setOverId(null); }} onDrop={(event) => { event.preventDefault(); const from = dragId.current; if (from) commitSubcategoryOrder(moveId(subcategoryOrder, from, row.id)); dragId.current = null; setOverId(null); }} className={cn("grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-3 py-3 text-sm transition-colors hover:bg-primary/5 sm:px-4", overId === row.id && dragId.current !== row.id && "bg-primary/10")}>
                  <GripVertical className="hidden size-4 cursor-grab text-muted-foreground sm:block" />
                  <div className="min-w-0"><p className="truncate font-semibold">{row.name_bn || row.name_en}</p><p className="truncate text-xs text-muted-foreground">/c/{parent?.slug ?? "?"}/{row.slug}</p></div>
                  <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center"><SortControls id={row.id} ids={subcategoryOrder} onMove={commitSubcategoryOrder} /><div className="flex gap-1"><Button size="icon" variant="outline" title="Edit" onClick={() => setSub(toSubcategoryDraft(row))}><Pencil className="size-3.5" /></Button><Button size="icon" variant="ghost" title="Delete" onClick={() => { void confirmDialog({ title: "Delete this subcategory?", description: "Products under it will lose this subcategory." }).then((ok) => ok && delSub.mutate(row.id)); }}><Trash2 className="size-3.5" /></Button></div></div>
                </li>;
              })}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
