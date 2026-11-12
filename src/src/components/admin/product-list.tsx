import { Link } from "@tanstack/react-router";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Boxes, GripVertical, ImageOff, Pencil, Plus, Search, Trash2 } from "lucide-react";

import {
  adminBulkDeleteProducts,
  adminDeleteProduct,
  adminListProducts,
  adminReorderProducts,
} from "@/lib/admin.functions";
import { getAdminAccess } from "@/lib/staff.functions";
import type { ProductKind } from "@/lib/admin-schema";
import { AdminHeading, EmptyState, Panel } from "@/components/admin/kit";
import { BrandLoader } from "@/components/admin/brand-loader";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/i18n";

type Row = {
  id: string;
  slug: string;
  kind: ProductKind;
  name_bn: string;
  price: number;
  cost_price: number;
  sku: string | null;
  is_active: boolean;
  product_images: Array<{ url: string; sort_order: number }> | null;
  product_variants: Array<{ id: string }> | null;
};

function EditLink({ kind, id, children }: { kind: ProductKind; id: string; children: React.ReactNode }) {
  if (kind === "combo") {
    return (
      <Link to="/admin/combos/$id" params={{ id }}>
        {children}
      </Link>
    );
  }
  if (kind === "component") {
    return (
      <Link to="/admin/sub-products/$id" params={{ id }}>
        {children}
      </Link>
    );
  }
  return (
    <Link to="/admin/products/$id" params={{ id }}>
      {children}
    </Link>
  );
}

export function ProductList({
  kind,
  title,
  description,
  newLabel,
}: {
  kind: ProductKind;
  title: string;
  description: string;
  newLabel: string;
}) {
  const qc = useQueryClient();
  const confirmDialog = useConfirm();
  const [term, setTerm] = useState("");
  const [order, setOrder] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const dragId = useRef<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin", "products", kind],
    queryFn: () => adminListProducts({ data: { kind } }),
  });

  const accessQuery = useQuery({ queryKey: ["admin-access"], queryFn: () => getAdminAccess() });
  const canBulk = Boolean(accessQuery.data?.isAdmin || accessQuery.data?.fullAccess);

  const all = (data ?? []) as unknown as Row[];

  useEffect(() => {
    setOrder(all.map((p) => p.id));
    setSelected((s) => s.filter((id) => all.some((p) => p.id === id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const remove = useMutation({
    mutationFn: (id: string) => adminDeleteProduct({ data: { id } }),
    onSuccess: async () => {
      toast.success("Deleted");
      await qc.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bulkRemove = useMutation({
    mutationFn: (ids: string[]) => adminBulkDeleteProducts({ data: { ids } }),
    onSuccess: async (res) => {
      toast.success(
        res.skipped > 0
          ? `${res.deleted} টি ডিলিট হয়েছে, ${res.skipped} টি কম্বোতে ব্যবহৃত বলে বাদ গেছে`
          : `${res.deleted} টি ডিলিট হয়েছে`,
      );
      setSelected([]);
      await qc.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reorder = useMutation({
    mutationFn: (ids: string[]) => adminReorderProducts({ data: { ids } }),
    onSuccess: async () => {
      toast.success("অর্ডার সেভ হয়েছে");
      await qc.invalidateQueries({ queryKey: ["admin", "products", kind] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const searching = term.trim().length > 0;
  const byId = new Map(all.map((p) => [p.id, p]));
  const ordered = order.map((id) => byId.get(id)).filter(Boolean) as Row[];
  const rows = ordered.filter((p) =>
    `${p.name_bn} ${p.slug} ${p.sku ?? ""}`.toLowerCase().includes(term.trim().toLowerCase()),
  );

  const dropOn = (targetId: string) => {
    const from = dragId.current;
    setOverId(null);
    dragId.current = null;
    if (!from || from === targetId) return;
    const next = order.filter((id) => id !== from);
    const at = next.indexOf(targetId);
    next.splice(at < 0 ? next.length : at, 0, from);
    setOrder(next);
    reorder.mutate(next);
  };

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <div className="space-y-5">
      <AdminHeading
        title={title}
        description={description}
        action={
          <Button
            asChild
            size="sm"
            className="ig-gradient rounded-xl transition-transform duration-300 hover:scale-[1.03]"
          >
            <EditLink kind={kind} id="new">
              <span className="flex items-center">
                <Plus className="mr-1.5 size-4" /> {newLabel}
              </span>
            </EditLink>
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="rounded-xl pl-8"
            placeholder="নাম, স্লাগ বা SKU দিয়ে খুঁজুন…"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />
        </div>

        {canBulk && rows.length > 0 ? (
          <div className="flex items-center gap-2">
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-semibold">
              <Checkbox
                checked={selected.length > 0 && selected.length === rows.length}
                onCheckedChange={(v) => setSelected(v ? rows.map((p) => p.id) : [])}
              />
              সব সিলেক্ট
            </label>
            {selected.length > 0 ? (
              <Button
                size="sm"
                variant="destructive"
                className="rounded-xl"
                loading={bulkRemove.isPending}
                onClick={() => {
                  void confirmDialog({
                    title: `${selected.length} টি আইটেম ডিলিট করবেন?`,
                    description: "ডিলিট করলে এগুলো স্টোরফ্রন্ট থেকেও সরে যাবে। এটি ফেরানো যাবে না।",
                    confirmLabel: "Delete",
                    tone: "danger",
                  }).then((ok) => ok && bulkRemove.mutate(selected));
                }}
              >
                <Trash2 className="mr-1.5 size-4" /> Delete ({selected.length})
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      <Panel className="p-0">
        {isLoading ? (
          <BrandLoader size="md" className="py-8" />
        ) : isError ? (
          <div className="space-y-3 p-6 text-center">
            <p className="text-sm font-semibold text-destructive">Could not load</p>
            <p className="text-xs text-muted-foreground">
              {(error as Error)?.message || "Server request failed."}
            </p>
            <Button size="sm" variant="outline" onClick={() => refetch()}>
              Try again
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <div className="p-4">
            <EmptyState title="Nothing here yet" hint={`Use the ${newLabel} button above.`} />
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((p, idx) => {
              const image = [...(p.product_images ?? [])].sort(
                (a, b) => a.sort_order - b.sort_order,
              )[0];
              const variantCount = p.product_variants?.length ?? 0;
              return (
                <li
                  key={p.id}
                  draggable={!searching}
                  onDragStart={() => {
                    dragId.current = p.id;
                  }}
                  onDragOver={(e) => {
                    if (searching || !dragId.current) return;
                    e.preventDefault();
                    setOverId(p.id);
                  }}
                  onDragLeave={() => setOverId((o) => (o === p.id ? null : o))}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (!searching) dropOn(p.id);
                  }}
                  className={cn(
                    "admin-rise group flex items-center gap-3 px-4 py-3 transition-all duration-300 hover:-translate-y-0.5 hover:bg-muted/40",
                    overId === p.id && "border-t-2 border-primary bg-primary/5",
                    selected.includes(p.id) && "bg-primary/5",
                  )}
                  style={{ animationDelay: `${Math.min(idx, 8) * 40}ms` }}
                >
                  {canBulk ? (
                    <Checkbox
                      checked={selected.includes(p.id)}
                      onCheckedChange={() => toggle(p.id)}
                      aria-label="Select"
                    />
                  ) : null}

                  <span
                    title={searching ? "সার্চ খালি করলে ড্র্যাগ করা যাবে" : "ড্র্যাগ করে সাজান"}
                    className={cn(
                      "cursor-grab text-muted-foreground transition-colors hover:text-primary active:cursor-grabbing",
                      searching && "cursor-not-allowed opacity-30",
                    )}
                  >
                    <GripVertical className="size-4" />
                  </span>

                  <div className="size-14 shrink-0 overflow-hidden rounded-xl bg-muted transition-transform duration-300 group-hover:scale-105">
                    {image ? (
                      <img src={image.url} alt="" className="size-full object-cover" loading="lazy" />
                    ) : (
                      <div className="flex size-full items-center justify-center text-muted-foreground">
                        <ImageOff className="size-4" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{p.name_bn}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-2 truncate text-xs text-muted-foreground">
                      {p.kind === "component" ? (
                        <span>{p.sku ?? "No SKU"}</span>
                      ) : (
                        <span>/{p.slug}</span>
                      )}
                      {variantCount > 0 ? (
                        <>
                          <span aria-hidden>·</span>
                          <span className="inline-flex items-center gap-1">
                            <Boxes className="size-3" /> {variantCount}
                          </span>
                        </>
                      ) : null}
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1",
                          p.is_active
                            ? "bg-emerald-100 text-emerald-900 ring-emerald-200"
                            : "bg-stone-200 text-stone-800 ring-stone-300",
                        )}
                      >
                        {p.is_active ? "Active" : "Inactive"}
                      </span>
                    </p>
                  </div>
                  <span className="ig-text text-sm font-bold tabular-nums">
                    {formatPrice("bn", p.price)}
                  </span>
                  <div className="flex gap-1">
                    <Button asChild size="sm" variant="outline" className="rounded-xl">
                      <EditLink kind={p.kind} id={p.id}>
                        <span className="flex items-center">
                          <Pencil className="mr-1.5 size-3.5" /> Edit
                        </span>
                      </EditLink>
                    </Button>
                    {canBulk ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="rounded-xl text-muted-foreground hover:text-destructive"
                        loading={remove.isPending}
                        onClick={() => {
                          void confirmDialog({
                            title: "Delete this item?",
                            description: "It will be removed from the storefront.",
                            confirmLabel: "Delete",
                            tone: "danger",
                          }).then((ok) => ok && remove.mutate(p.id));
                        }}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
