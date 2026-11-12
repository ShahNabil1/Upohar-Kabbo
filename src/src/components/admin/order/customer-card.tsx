import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Lock, MapPin, Pencil, Save, Truck, X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { PhoneActions } from "@/components/admin/phone-actions";
import { CustomerOrdersDialog } from "@/components/admin/customer-orders-dialog";
import { adminLookupCustomer } from "@/lib/admin.functions";

import { BD_DIVISIONS } from "@/lib/bd-geo";
import { adminUpdateOrderCustomer } from "@/lib/order-admin.functions";
import { Panel } from "@/components/admin/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { normalizePhoneInput } from "@/lib/phone";

export type OrderCustomer = {
  id: string;
  customer_name: string;
  customer_phone: string;
  alt_phone: string | null;
  division: string | null;
  district: string | null;
  upazila: string | null;
  address_line: string;
  note?: string | null;
};

const labelClass =
  "text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground";
const controlClass =
  "h-10 w-full rounded-xl border border-border/80 bg-background/70 px-3 text-sm outline-none transition-colors focus:border-primary/60";

function Value({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className={labelClass}>{label}</p>
      <div className="text-sm font-semibold text-foreground">{children}</div>
    </div>
  );
}

function PhoneRow({ phone }: { phone: string }) {
  return <PhoneActions phone={phone} />;
}




export function CustomerCard({
  order,
  locked = false,
  courierOptions = [],
  courier = "",
  onCourierChange,
}: {
  order: OrderCustomer;
  locked?: boolean;
  /** Enabled delivery partner labels (Steadfast / Pathao / CarryBee …). */
  courierOptions?: string[];
  courier?: string;
  onCourierChange?: (value: string) => void;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const phoneForHistory = order.customer_phone.trim();
  const lookup = useQuery({
    queryKey: ["admin", "customer-lookup", phoneForHistory],
    queryFn: () => adminLookupCustomer({ data: { phone: phoneForHistory } }),
    enabled: /^01[3-9]\d{8}$/.test(phoneForHistory),
    staleTime: 60 * 1000,
  });
  /** The current order is included in the count, so subtract it. */
  const previousCount = Math.max(0, (lookup.data?.orderCount ?? 0) - 1);

  const baseline = {
    customerName: order.customer_name,
    customerPhone: order.customer_phone,
    altPhone: order.alt_phone ?? "",
    division: order.division ?? "",
    district: order.district ?? "",
    upazila: order.upazila ?? "",
    addressLine: order.address_line,
  };
  const [form, setForm] = useState(baseline);
  const isDirty = JSON.stringify(form) !== JSON.stringify(baseline);

  const division = BD_DIVISIONS.find((d) => d.bn === form.division || d.en === form.division);
  const district = division?.districts.find(
    (d) => d.bn === form.district || d.en === form.district,
  );

  const save = useMutation({
    mutationFn: () => adminUpdateOrderCustomer({ data: { id: order.id, ...form } }),
    onSuccess: async () => {
      toast.success("Customer details saved");
      setEditing(false);
      await qc.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Panel className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <MapPin className="size-4 text-primary" />
          Customer &amp; Delivery
        </h2>
        {locked ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground ring-1 ring-border">
            <Lock className="size-3" />
            Locked — sent to courier
          </span>
        ) : editing ? (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setForm(baseline);
                setEditing(false);
              }}
            >
              <X className="size-3.5" />
              Cancel
            </Button>
            <Button
              size="sm"
              loading={save.isPending}
              disabled={!isDirty || save.isPending}
              onClick={() => save.mutate()}
            >
              <Save className="size-3.5" />
              {isDirty ? "Save" : "Saved"}
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            <Pencil className="size-3.5" />
            Edit
          </Button>
        )}
      </div>

      {onCourierChange ? (
        <div className="rounded-2xl border border-primary/20 bg-primary/[0.04] p-3 sm:p-4">
          <div className="flex flex-wrap items-center gap-3 sm:flex-nowrap">
            <div className="flex min-w-0 items-center gap-2">
              <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Truck className="size-4" />
              </span>
              <div className="min-w-0">
                <p className={labelClass}>Delivery partner</p>
                <p className="text-xs text-muted-foreground">
                  {locked ? "Locked — already dispatched" : "Used when this order is sent to courier"}
                </p>
              </div>
            </div>
            <div className="ms-auto w-full sm:w-64">
              {courierOptions.length === 0 ? (
                <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                  No delivery partner saved yet — add one in Settings → Delivery Settings.
                </p>
              ) : (
                <Select
                  value={courier}
                  onValueChange={onCourierChange}
                  disabled={locked}
                >
                  <SelectTrigger className="h-10 w-full rounded-xl border-primary/25 bg-background text-sm font-bold">
                    <SelectValue placeholder="Select delivery partner" />
                  </SelectTrigger>
                  <SelectContent>
                    {courierOptions.map((label) => (
                      <SelectItem key={label} value={label}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
        </div>
      ) : null}


      {editing && !locked ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className={labelClass}>Name *</Label>
            <Input
              className="rounded-xl"
              value={form.customerName}
              onChange={(e) => setForm({ ...form, customerName: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label className={labelClass}>Phone *</Label>
            <Input
              className="rounded-xl"
              value={form.customerPhone}
              onChange={(e) => setForm({ ...form, customerPhone: normalizePhoneInput(e.target.value) })}
              inputMode="numeric"
              maxLength={11}
            />
          </div>
          <div className="space-y-1.5">
            <Label className={labelClass}>Alternative phone</Label>
            <Input
              className="rounded-xl"
              placeholder="Optional"
              value={form.altPhone}
              onChange={(e) => setForm({ ...form, altPhone: normalizePhoneInput(e.target.value) })}
              inputMode="numeric"
              maxLength={11}
            />
          </div>
          <div className="space-y-1.5">
            <Label className={labelClass}>Division *</Label>
            <select
              className={controlClass}
              value={form.division}
              onChange={(e) =>
                setForm({ ...form, division: e.target.value, district: "", upazila: "" })
              }
            >
              <option value="">— Select —</option>
              {BD_DIVISIONS.map((d) => (
                <option key={d.id} value={d.bn}>
                  {d.bn} / {d.en}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className={labelClass}>District *</Label>
            <select
              className={controlClass}
              value={form.district}
              disabled={!division}
              onChange={(e) => setForm({ ...form, district: e.target.value, upazila: "" })}
            >
              <option value="">— Select —</option>
              {(division?.districts ?? []).map((d) => (
                <option key={d.id} value={d.bn}>
                  {d.bn} / {d.en}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className={labelClass}>Thana / Upazila *</Label>
            <select
              className={controlClass}
              value={form.upazila}
              disabled={!district}
              onChange={(e) => setForm({ ...form, upazila: e.target.value })}
            >
              <option value="">— Select —</option>
              {(district?.upazilas ?? []).map((u) => (
                <option key={u.en} value={u.bn}>
                  {u.bn} / {u.en}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label className={labelClass}>Address (village / area / house / road) *</Label>
            <Textarea
              className="rounded-xl"
              rows={3}
              value={form.addressLine}
              onChange={(e) => setForm({ ...form, addressLine: e.target.value })}
            />
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Value label="Name">{order.customer_name}</Value>
          <Value label="Phone">
            <PhoneRow phone={order.customer_phone} />
            {previousCount > 0 ? (
              <span className="mt-1 block text-xs font-semibold text-primary">
                Returning customer ·{" "}
                <button
                  type="button"
                  onClick={() => setHistoryOpen(true)}
                  className="underline decoration-dotted underline-offset-2 transition-opacity hover:opacity-80"
                >
                  {previousCount} previous order(s)
                </button>
              </span>
            ) : null}
          </Value>
          <Value label="Alternative phone">
            {order.alt_phone ? <PhoneRow phone={order.alt_phone} /> : "—"}
          </Value>


          <Value label="Division">{order.division || "—"}</Value>
          <Value label="District">{order.district || "—"}</Value>
          <Value label="Thana / Upazila">{order.upazila || "—"}</Value>
          <div className="sm:col-span-2">
            <Value label="Address (village / area / house / road)">{order.address_line}</Value>
          </div>
          {order.note && order.note.trim() ? (
            <div className="sm:col-span-2">
              <p className={labelClass}>Customer note (from checkout)</p>
              <p className="mt-1 whitespace-pre-wrap rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
                {order.note}
              </p>
            </div>
          ) : null}
        </div>
      )}

      <CustomerOrdersDialog
        phone={phoneForHistory}
        open={historyOpen}
        onOpenChange={setHistoryOpen}
      />
    </Panel>
  );
}
