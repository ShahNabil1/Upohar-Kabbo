import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Boxes, Layers, PackagePlus, RefreshCw, Search, TriangleAlert } from "lucide-react";

import { comboAvailability, syncComboStock } from "@/lib/inventory.functions";
import { money } from "@/lib/inventory.shared";
import { EmptyState, Panel, StatCard, TipTitle } from "@/components/admin/kit";
import { ModuleHero } from "@/components/admin/module-hero";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/inventory/combos")({
  component: SmartCombos,
});

/** Sub-items worth restocking: the out-of-stock ones, else the bottlenecks. */
type ComboRow = Awaited<ReturnType<typeof comboAvailability>>[number];
function restockTargets(c: ComboRow): string[] {
  const empty = c.items.filter((i) => i.onHand <= 0);
  const pick = empty.length > 0 ? empty : c.items.filter((i) => i.bottleneck);
  return pick.map((i) => i.id);
}

function SmartCombos() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");

  const { data: combos = [], isLoading } = useQuery({
    queryKey: ["admin", "inventory", "combos"],
    queryFn: () => comboAvailability(),
    staleTime: 60 * 1000,
  });

  const sync = useMutation({
    mutationFn: () => syncComboStock(),
    onSuccess: async (r) => {
      toast.success(`${r.synced} combo stock updated`);
      await qc.invalidateQueries({ queryKey: ["admin", "inventory"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return combos;
    return combos.filter(
      (c) =>
        c.name.toLowerCase().includes(needle) ||
        (c.sku ?? "").toLowerCase().includes(needle) ||
        c.items.some(
          (i) =>
            i.name.toLowerCase().includes(needle) ||
            (i.sku ?? "").toLowerCase().includes(needle),
        ),
    );
  }, [combos, q]);

  const buildableTotal = combos.reduce((s, c) => s + c.buildable, 0);
  const blocked = combos.filter((c) => c.buildable === 0).length;

  return (
    <div className="space-y-5">
      <ModuleHero
        eyebrow="Inventory · Assembly"
        icon={Layers}
        accent="violet"
        title="Smart Inventory · Combos"
        description="Combo boxes have no stock of their own — the stock of the sub-products inside determines how many boxes can be built."
        backTo="/admin/inventory"
        backLabel="Inventory"
        action={
          <Button
            variant="outline"
            className="rounded-xl transition-transform duration-200 hover:scale-[1.03]"
            loading={sync.isPending}
            onClick={() => sync.mutate()}
          >
            <RefreshCw className="size-4" />
            Sync shop stock
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Combo boxes"
          value={String(combos.length)}
          icon={<Boxes className="size-3.5" />}
          tip="Total number of combo products."
        />
        <StatCard
          label="Buildable now"
          value={String(buildableTotal)}
          tone="good"
          icon={<Layers className="size-3.5" />}
          tip="Maximum number of boxes that can be packed right now across all combos (calculated individually)."
        />
        <StatCard
          label="Blocked combos"
          value={String(blocked)}
          tone={blocked > 0 ? "bad" : "good"}
          icon={<TriangleAlert className="size-3.5" />}
          tip="Combos where one of the inner items is out of stock, so none can be built."
        />
      </div>

      <Panel className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TipTitle
            title="Recipe & bottleneck"
            icon={<Layers className="size-4 text-primary" />}
            tip="See at a glance how many of each item go into a combo, their stock levels, and which is the bottleneck."
          />
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Combo or sub-item / SKU"
              className="rounded-xl border-border/80 bg-background/70 pl-9 transition-all duration-200 focus-visible:border-primary/60 focus-visible:ring-primary/25"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl bg-muted/60" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No combo found"
            hint="Create a combo from Products → Combos, then its availability will show here."
          />
        ) : (
          <div className="space-y-3">
            {filtered.map((c) => (
              <div
                key={c.id}
                className="admin-rise rounded-2xl border border-border bg-background/60 p-4 transition-all duration-300 hover:border-primary/30 hover:shadow-sm"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{c.name}</p>
                    <p className="font-en truncate text-[11px] text-muted-foreground">
                      {c.sku || "—"} · {money(c.price)}
                      {c.isActive ? "" : " · inactive"}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "font-en rounded-full px-3 py-1 text-xs font-bold tabular-nums ring-1",
                      c.buildable === 0
                        ? "bg-rose-100 text-rose-900 ring-rose-200"
                        : c.buildable < 5
                          ? "bg-amber-100 text-amber-900 ring-amber-200"
                          : "bg-emerald-100 text-emerald-900 ring-emerald-200",
                    )}
                  >
                    {c.buildable} buildable
                  </span>
                  <Button
                    asChild
                    size="sm"
                    variant={c.buildable === 0 ? "default" : "outline"}
                    className="rounded-xl"
                  >
                    <Link
                      to="/admin/inventory/receive"
                      search={{ items: restockTargets(c).join(",") || undefined }}
                    >
                      <PackagePlus className="size-4" />
                      Add stock
                    </Link>
                  </Button>
                </div>

                {c.buildable === 0 && c.items.length > 0 ? (
                  <p className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-[11px] text-rose-900">
                    Blocked by:{" "}
                    {c.items
                      .filter((i) => i.buildable === 0)
                      .map((i) => `${i.name} (${i.sku || "no SKU"})`)
                      .join(", ")}{" "}
                    — receive stock for these sub-items in Add inventory, then this combo becomes
                    buildable automatically.
                  </p>
                ) : null}


                {c.items.length === 0 ? (
                  <p className="mt-3 text-xs text-muted-foreground">
                    No sub-item has been added to this combo — stock can't be calculated without a recipe.
                  </p>
                ) : (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {c.items.map((i) => (
                      <div
                        key={i.id}
                        className={cn(
                          "rounded-xl border px-3 py-2 transition-colors duration-200",
                          i.bottleneck && c.buildable === 0
                            ? "border-rose-300/70 bg-rose-50/60"
                            : i.bottleneck
                              ? "border-amber-300/70 bg-amber-50/50"
                              : "border-border/70 bg-card",
                        )}
                      >
                        <p className="truncate text-xs font-semibold">{i.name}</p>
                        <p className="font-en mt-0.5 truncate text-[11px] tabular-nums text-muted-foreground">
                          {i.sku || "—"} · {i.perBox}/box · stock {i.onHand} → {i.buildable} box
                          {i.isFree ? " · free" : ""}
                        </p>
                        {i.variants.length > 0 ? (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {i.variants.map((v) => (
                              <span
                                key={v.id}
                                className="font-en rounded-md bg-muted/70 px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground"
                                title={v.label}
                              >
                                {v.sku || v.label} · {v.onHand}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
