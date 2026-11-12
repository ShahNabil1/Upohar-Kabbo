import { useQuery } from "@tanstack/react-query";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatusPill } from "@/components/admin/kit";
import { BrandLoader } from "@/components/admin/brand-loader";
import { CopyBadge } from "@/components/admin/copy-badge";
import { PhoneActions } from "@/components/admin/phone-actions";
import { adminCustomerOrders } from "@/lib/admin.functions";

function fmtDate(value: string) {
  return new Date(value).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  });
}

/** Popup listing every past order placed with the given phone number. */
export function CustomerOrdersDialog({
  phone,
  open,
  onOpenChange,
}: {
  phone: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "customer-orders", phone],
    queryFn: () => adminCustomerOrders({ data: { phone } }),
    enabled: open && /^01[3-9]\d{8}$/.test(phone),
  });

  const orders = data ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Previous Orders</DialogTitle>
          <DialogDescription>
            {isLoading
              ? "Loading customer history…"
              : `Showing ${orders.length} order(s) for ${phone}`}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-auto rounded-2xl border border-border">
          {isLoading ? (
            <BrandLoader size="sm" className="py-10" />
          ) : orders.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No previous orders found.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                <tr>
                  <th className="px-3 py-2.5 text-left">Invoice</th>
                  <th className="px-3 py-2.5 text-left">Date</th>
                  <th className="px-3 py-2.5 text-left">Customer</th>
                  <th className="px-3 py-2.5 text-left">Delivery</th>
                  <th className="px-3 py-2.5 text-left">Products</th>
                  <th className="px-3 py-2.5 text-right">Total</th>
                  <th className="px-3 py-2.5 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} className="border-t border-border/70 align-top">
                    <td className="px-3 py-3">
                      <CopyBadge value={o.order_number} label="ইনভয়েস কপি হয়েছে" />
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">
                      {fmtDate(o.created_at)}
                    </td>
                    <td className="px-3 py-3">
                      <p className="font-semibold text-foreground">{o.customer_name}</p>
                      <PhoneActions phone={o.customer_phone} size="sm" className="mt-1" />
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {o.delivery_partner || "—"}
                    </td>
                    <td className="px-3 py-3">
                      {(o.order_items ?? []).map((it, i) => (
                        <p key={i} className="text-foreground">
                          <span className="font-bold">{it.quantity}x</span> {it.product_name}
                          {it.variant_label ? (
                            <span className="text-muted-foreground"> ({it.variant_label})</span>
                          ) : null}
                        </p>
                      ))}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right font-bold tabular-nums text-primary">
                      ৳{Number(o.total).toLocaleString("en-US")}
                    </td>
                    <td className="px-3 py-3">
                      <StatusPill status={o.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
