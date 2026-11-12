import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, ClipboardCheck, Search, XCircle } from "lucide-react";

import {
  commitStockCount,
  startStockCount,
  stockCountDetail,
  stockCounts,
  updateCountLine,
  voidStockCount,
} from "@/lib/stock-count.functions";
import { countScopes, type CountScope } from "@/lib/stock-count.shared";
import { money } from "@/lib/inventory.shared";
import { AdminHeading, EmptyState, Panel, StatCard } from "@/components/admin/kit";
import { ModuleHero } from "@/components/admin/module-hero";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/admin/inventory/count")({
  component: StockCountPage,
});

const scopeLabels: Record<CountScope, string> = {
  all: "Everything",
  products: "Products only",
  packaging: "Packaging only",
  low: "Low stock only",
};

const statusTone: Record<string, string> = {
  open: "bg-amber-100 text-amber-900",
  posted: "bg-emerald-100 text-emerald-900",
  cancelled: "bg-muted text-muted-foreground",
};

function StockCountPage() {
  const qc = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);

  if (openId) return <CountSheet id={openId} onBack={() => setOpenId(null)} />;

  return <CountList onOpen={setOpenId} qc={qc} />;
}

function CountList({
  onOpen,
  qc,
}: {
  onOpen: (id: string) => void;
  qc: ReturnType<typeof useQueryClient>;
}) {
  const [name, setName] = useState("");
  const [scope, setScope] = useState<CountScope>("all");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["admin", "stock-counts"],
    queryFn: () => stockCounts(),
    staleTime: 30_000,
  });

  const start = useMutation({
    mutationFn: () =>
      startStockCount({
        data: { name: name.trim() || `Count ${new Date().toLocaleDateString("en-GB")}`, scope, note: "" },
      }),
    onSuccess: async (r) => {
      toast.success(`Count sheet ready · ${r.lines} items`);
      setName("");
      await qc.invalidateQueries({ queryKey: ["admin", "stock-counts"] });
      onOpen(r.id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-5">
      <ModuleHero
        eyebrow="Inventory · Audit"
        icon={ClipboardCheck}
        accent="amber"
        title="Stock audit"
        description="Open a physical count sheet, enter the counted numbers — posting sends the difference to the ledger as a correction."
      />

      <Panel className="space-y-3">
        <h3 className="text-sm font-semibold">Start a new count</h3>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Count name (e.g. August warehouse audit)"
            className="h-10 min-w-[240px] flex-1 rounded-xl"
          />
          <div className="flex flex-wrap gap-1.5">
            {countScopes.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setScope(s)}
                className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 hover:scale-[1.03] ${
                  scope === s
                    ? "ig-gradient-soft border-primary/40 text-foreground"
                    : "border-border bg-background/60 text-muted-foreground hover:border-primary/30"
                }`}
              >
                {scopeLabels[s]}
              </button>
            ))}
          </div>
          <Button className="h-10 rounded-xl" loading={start.isPending} onClick={() => start.mutate()}>
            <ClipboardCheck className="mr-1.5 size-4" /> Open sheet
          </Button>
        </div>
      </Panel>

      <Panel className="space-y-3">
        <h3 className="text-sm font-semibold">Count history</h3>
        {isLoading ? (
          <p className="py-10 text-center text-xs text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <EmptyState title="No stock count yet" hint="Start your first audit from the form above." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                  <th className="px-2 py-2 text-left font-semibold">Session</th>
                  <th className="px-2 py-2 text-left font-semibold">Status</th>
                  <th className="px-2 py-2 text-right font-semibold">Counted</th>
                  <th className="px-2 py-2 text-right font-semibold">Variance units</th>
                  <th className="px-2 py-2 text-right font-semibold">Variance value</th>
                  <th className="px-2 py-2 text-right font-semibold"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-border/60 hover:bg-accent/50">
                    <td className="px-2 py-2.5">
                      <p className="font-medium">{r.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {new Date(r.createdAt).toLocaleString("en-GB")} · {r.createdByName ?? "Staff"}
                      </p>
                    </td>
                    <td className="px-2 py-2.5">
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ${statusTone[r.status] ?? ""}`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="font-en px-2 py-2.5 text-right tabular-nums">
                      {r.countedCount}/{r.lineCount}
                    </td>
                    <td
                      className={`font-en px-2 py-2.5 text-right tabular-nums ${r.varianceUnits < 0 ? "text-rose-600" : r.varianceUnits > 0 ? "text-emerald-700" : ""}`}
                    >
                      {r.varianceUnits > 0 ? "+" : ""}
                      {r.varianceUnits}
                    </td>
                    <td className="font-en px-2 py-2.5 text-right tabular-nums">
                      {money(r.varianceValue)}
                    </td>
                    <td className="px-2 py-2.5 text-right">
                      <Button size="sm" variant="outline" className="rounded-lg" onClick={() => onOpen(r.id)}>
                        {r.status === "open" ? "Continue" : "View"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

function CountSheet({ id, onBack }: { id: string; onBack: () => void }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [onlyVariance, setOnlyVariance] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "stock-count", id],
    queryFn: () => stockCountDetail({ data: { id } }),
    staleTime: 10_000,
  });

  const invalidate = async () => {
    await qc.invalidateQueries({ queryKey: ["admin", "stock-count", id] });
    await qc.invalidateQueries({ queryKey: ["admin", "stock-counts"] });
  };

  const saveLine = useMutation({
    mutationFn: (v: { lineId: string; countedQty: number | null }) =>
      updateCountLine({ data: { lineId: v.lineId, countedQty: v.countedQty, note: "" } }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const post = useMutation({
    mutationFn: () => commitStockCount({ data: { id } }),
    onSuccess: async (r) => {
      toast.success(`Posted ${r.posted} correction(s) · ${money(r.varianceValue)}`);
      await invalidate();
      await qc.invalidateQueries({ queryKey: ["admin", "inventory"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancel = useMutation({
    mutationFn: () => voidStockCount({ data: { id } }),
    onSuccess: async () => {
      toast.success("Count cancelled");
      await invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const lines = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.lines ?? []).filter((l) => {
      if (onlyVariance && (l.countedQty == null || l.countedQty === l.systemQty)) return false;
      if (!q) return true;
      return l.itemName.toLowerCase().includes(q) || (l.sku ?? "").toLowerCase().includes(q);
    });
  }, [data, search, onlyVariance]);

  const head = data?.count;
  const isOpen = head?.status === "open";

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-primary"
      >
        <ArrowLeft className="size-3.5" /> All counts
      </button>

      <AdminHeading
        title={head?.name ?? "Count sheet"}
        description="Enter the counted quantity for each item — leaving it blank excludes that item from the post."
      />

      {head ? (
        <div className="grid gap-3 sm:grid-cols-4">
          <StatCard label="Items" value={`${head.countedCount}/${head.lineCount}`} tip="Number of lines with a counted quantity entered." />
          <StatCard
            label="Variance units"
            value={`${head.varianceUnits > 0 ? "+" : ""}${head.varianceUnits}`}
            tone={head.varianceUnits < 0 ? "bad" : head.varianceUnits > 0 ? "good" : "default"}
          />
          <StatCard label="Variance value" value={money(head.varianceValue)} />
          <StatCard label="Status" value={head.status} tone={head.status === "posted" ? "good" : "default"} />
        </div>
      ) : null}

      <Panel className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Scan barcode or search SKU / name…"
              className="rounded-xl pl-9"
            />
          </div>
          <button
            type="button"
            onClick={() => setOnlyVariance((v) => !v)}
            className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 ${
              onlyVariance
                ? "ig-gradient-soft border-primary/40 text-foreground"
                : "border-border bg-background/60 text-muted-foreground hover:border-primary/30"
            }`}
          >
            Variance only
          </button>
          {isOpen ? (
            <>
              <Button
                variant="outline"
                className="rounded-xl"
                loading={cancel.isPending}
                onClick={() => cancel.mutate()}
              >
                <XCircle className="mr-1.5 size-4" /> Cancel
              </Button>
              <Button className="rounded-xl" loading={post.isPending} onClick={() => post.mutate()}>
                <CheckCircle2 className="mr-1.5 size-4" /> Post corrections
              </Button>
            </>
          ) : null}
        </div>

        {isLoading ? (
          <p className="py-10 text-center text-xs text-muted-foreground">Loading sheet…</p>
        ) : lines.length === 0 ? (
          <EmptyState title="No line in this view" hint="Try changing the search or filter." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                  <th className="px-2 py-2 text-left font-semibold">Item</th>
                  <th className="px-2 py-2 text-left font-semibold">SKU</th>
                  <th className="px-2 py-2 text-right font-semibold">System</th>
                  <th className="px-2 py-2 text-right font-semibold">Counted</th>
                  <th className="px-2 py-2 text-right font-semibold">Diff</th>
                  <th className="px-2 py-2 text-right font-semibold">Value</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const diff = l.countedQty == null ? null : l.countedQty - l.systemQty;
                  return (
                    <tr key={l.id} className="border-b border-border/60 hover:bg-accent/50">
                      <td className="max-w-[280px] px-2 py-2">
                        <p className="truncate font-medium">{l.itemName}</p>
                        {l.kind === "packaging" ? (
                          <p className="text-[11px] text-muted-foreground">Packaging</p>
                        ) : null}
                      </td>
                      <td className="font-en px-2 py-2 text-xs text-muted-foreground">{l.sku ?? "—"}</td>
                      <td className="font-en px-2 py-2 text-right tabular-nums">{l.systemQty}</td>
                      <td className="px-2 py-2 text-right">
                        <Input
                          type="number"
                          min={0}
                          disabled={!isOpen}
                          defaultValue={l.countedQty ?? ""}
                          onBlur={(e) => {
                            const raw = e.target.value.trim();
                            const next = raw === "" ? null : Math.max(0, Number(raw));
                            if (next === l.countedQty) return;
                            saveLine.mutate({ lineId: l.id, countedQty: next });
                          }}
                          className="ml-auto h-8 w-24 rounded-lg text-right"
                        />
                      </td>
                      <td
                        className={`font-en px-2 py-2 text-right font-semibold tabular-nums ${
                          diff == null ? "text-muted-foreground" : diff < 0 ? "text-rose-600" : diff > 0 ? "text-emerald-700" : ""
                        }`}
                      >
                        {diff == null ? "—" : `${diff > 0 ? "+" : ""}${diff}`}
                      </td>
                      <td className="font-en px-2 py-2 text-right tabular-nums">
                        {diff == null ? "—" : money(diff * l.unitCost)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
