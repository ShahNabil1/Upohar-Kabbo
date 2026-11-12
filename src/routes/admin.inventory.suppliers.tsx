import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Boxes, Pencil, Plus, Truck, X } from "lucide-react";

import {
  inventoryPackaging,
  inventorySuppliers,
  savePackaging,
  saveSupplier,
} from "@/lib/inventory.functions";
import type { PackagingInput, SupplierInput } from "@/lib/inventory.shared";
import { EmptyState, Panel, TipTitle, ToggleField } from "@/components/admin/kit";
import { ModuleHero } from "@/components/admin/module-hero";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/admin/inventory/suppliers")({
  component: SuppliersAndPackaging,
});

const fieldClass =
  "rounded-xl border-border/80 bg-background/70 transition-all duration-200 focus-visible:border-primary/60 focus-visible:ring-primary/25";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

const emptySupplier = (): SupplierInput => ({
  name: "",
  phone: "",
  address: "",
  note: "",
  is_active: true,
});

const emptyPackaging = (): PackagingInput => ({
  name: "",
  sku: "",
  unit: "pcs",
  consumption: "per_order",
  reorder_point: 0,
  note: "",
  is_active: true,
});

function SuppliersAndPackaging() {
  const qc = useQueryClient();
  const [supplier, setSupplier] = useState<SupplierInput | null>(null);
  const [pack, setPack] = useState<PackagingInput | null>(null);

  const { data: suppliers = [] } = useQuery({
    queryKey: ["admin", "inventory", "suppliers"],
    queryFn: () => inventorySuppliers(),
    staleTime: 5 * 60 * 1000,
  });
  const { data: packaging = [] } = useQuery({
    queryKey: ["admin", "inventory", "packaging"],
    queryFn: () => inventoryPackaging(),
    staleTime: 5 * 60 * 1000,
  });

  const saveS = useMutation({
    mutationFn: () => saveSupplier({ data: supplier! }),
    onSuccess: async () => {
      toast.success("Supplier saved");
      setSupplier(null);
      await qc.invalidateQueries({ queryKey: ["admin", "inventory", "suppliers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveP = useMutation({
    mutationFn: () => savePackaging({ data: pack! }),
    onSuccess: async () => {
      toast.success("Packaging item saved");
      setPack(null);
      await qc.invalidateQueries({ queryKey: ["admin", "inventory"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-5">
      <ModuleHero
        eyebrow="Inventory · Partners"
        icon={Truck}
        accent="teal"
        title="Suppliers & packaging"
        description="Who you buy from and what packaging you use — both here."
        backTo="/admin/inventory"
        backLabel="Inventory"
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Suppliers */}
        <Panel className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <TipTitle
              title="Suppliers"
              icon={<Truck className="size-4 text-primary" />}
              tip="Adding suppliers lets you track where each shipment came from and makes comparing costs easier."
            />
            <Button
              size="sm"
              variant="outline"
              className="rounded-xl transition-transform duration-200 hover:scale-[1.03]"
              onClick={() => setSupplier(emptySupplier())}
            >
              <Plus className="size-4" />
              New
            </Button>
          </div>

          {supplier ? (
            <div className="admin-rise space-y-3 rounded-xl border border-primary/30 bg-background/60 p-3">
              <Row label="Name">
                <Input
                  value={supplier.name}
                  onChange={(e) => setSupplier({ ...supplier, name: e.target.value })}
                  className={fieldClass}
                />
              </Row>
              <div className="grid gap-3 sm:grid-cols-2">
                <Row label="Phone">
                  <Input
                    value={supplier.phone ?? ""}
                    onChange={(e) => setSupplier({ ...supplier, phone: e.target.value })}
                    className={fieldClass}
                  />
                </Row>
                <Row label="Address">
                  <Input
                    value={supplier.address ?? ""}
                    onChange={(e) => setSupplier({ ...supplier, address: e.target.value })}
                    className={fieldClass}
                  />
                </Row>
              </div>
              <ToggleField
                label="Active"
                checked={supplier.is_active}
                onChange={(v) => setSupplier({ ...supplier, is_active: v })}
              />
              <div className="flex gap-2">
                <Button
                  className="ig-gradient rounded-xl transition-transform duration-300 hover:scale-[1.02]"
                  loading={saveS.isPending}
                  onClick={() => saveS.mutate()}
                >
                  Save supplier
                </Button>
                <Button variant="ghost" className="rounded-xl" onClick={() => setSupplier(null)}>
                  <X className="size-4" />
                </Button>
              </div>
            </div>
          ) : null}

          {suppliers.length === 0 ? (
            <EmptyState title="No supplier yet" hint="Add your first supplier." />
          ) : (
            <ul className="divide-y divide-border/70">
              {suppliers.map((s) => (
                <li key={s.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{s.name}</p>
                    <p className="font-en truncate text-[11px] text-muted-foreground">
                      {s.phone || "—"}
                      {s.is_active ? "" : " · inactive"}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="rounded-lg text-muted-foreground transition-colors hover:text-primary"
                    onClick={() =>
                      setSupplier({
                        id: s.id,
                        name: s.name,
                        phone: s.phone ?? "",
                        address: s.address ?? "",
                        note: s.note ?? "",
                        is_active: s.is_active,
                      })
                    }
                  >
                    <Pencil className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* Packaging */}
        <Panel className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <TipTitle
              title="Packaging materials"
              icon={<Boxes className="size-4 text-primary" />}
              tip="Boxes, bubble wrap, stickers, etc. These never appear on the website or catalog — used only for cost and stock tracking."
            />
            <Button
              size="sm"
              variant="outline"
              className="rounded-xl transition-transform duration-200 hover:scale-[1.03]"
              onClick={() => setPack(emptyPackaging())}
            >
              <Plus className="size-4" />
              New
            </Button>
          </div>

          {pack ? (
            <div className="admin-rise space-y-3 rounded-xl border border-primary/30 bg-background/60 p-3">
              <Row label="Name">
                <Input
                  value={pack.name}
                  onChange={(e) => setPack({ ...pack, name: e.target.value })}
                  className={fieldClass}
                />
              </Row>
              <div className="grid gap-3 sm:grid-cols-3">
                <Row label="SKU / barcode">
                  <Input
                    value={pack.sku ?? ""}
                    onChange={(e) => setPack({ ...pack, sku: e.target.value })}
                    className={fieldClass}
                  />
                </Row>
                <Row label="Unit">
                  <Input
                    value={pack.unit}
                    onChange={(e) => setPack({ ...pack, unit: e.target.value })}
                    className={fieldClass}
                  />
                </Row>
                <Row label="Reorder point">
                  <Input
                    type="number"
                    value={pack.reorder_point}
                    onChange={(e) => setPack({ ...pack, reorder_point: Number(e.target.value) })}
                    className={fieldClass}
                  />
                </Row>
              </div>
              <Row label="Consumption">
                <select
                  value={pack.consumption}
                  onChange={(e) =>
                    setPack({ ...pack, consumption: e.target.value as PackagingInput["consumption"] })
                  }
                  className="h-10 w-full rounded-xl border border-border/80 bg-background/70 px-3 text-sm transition-all duration-200 focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/25"
                >
                  <option value="per_order">Per order (one per parcel)</option>
                  <option value="per_unit">Per unit (one per product piece)</option>
                </select>
              </Row>
              <ToggleField
                label="Active"
                checked={pack.is_active}
                onChange={(v) => setPack({ ...pack, is_active: v })}
              />
              <div className="flex gap-2">
                <Button
                  className="ig-gradient rounded-xl transition-transform duration-300 hover:scale-[1.02]"
                  loading={saveP.isPending}
                  onClick={() => saveP.mutate()}
                >
                  Save packaging
                </Button>
                <Button variant="ghost" className="rounded-xl" onClick={() => setPack(null)}>
                  <X className="size-4" />
                </Button>
              </div>
            </div>
          ) : null}

          {packaging.length === 0 ? (
            <EmptyState title="No packaging item yet" hint="Adding boxes or wrapping will factor their cost into profit." />
          ) : (
            <ul className="divide-y divide-border/70">
              {packaging.map((p) => (
                <li key={p.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{p.name}</p>
                    <p className="font-en truncate text-[11px] text-muted-foreground">
                      {p.sku || "—"} · {p.consumption === "per_unit" ? "per unit" : "per order"}
                      {p.is_active ? "" : " · inactive"}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="rounded-lg text-muted-foreground transition-colors hover:text-primary"
                    onClick={() =>
                      setPack({
                        id: p.id,
                        name: p.name,
                        sku: p.sku ?? "",
                        unit: p.unit,
                        consumption: p.consumption as PackagingInput["consumption"],
                        reorder_point: p.reorder_point,
                        note: p.note ?? "",
                        is_active: p.is_active,
                      })
                    }
                  >
                    <Pencil className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
