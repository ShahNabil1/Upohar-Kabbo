import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  BadgeDollarSign,
  Boxes,
  Clock,
  Layers,
  Megaphone,
  Package,
} from "lucide-react";

import { adminOverview } from "@/lib/admin.functions";
import { AdminHeading, EmptyState, Panel, StatusPill } from "@/components/admin/kit";
import { BrandLoader } from "@/components/admin/brand-loader";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/")({
  component: AdminOverviewPage,
});

function adminPrice(value: number | string | null | undefined) {
  const n = Number(value ?? 0);
  return `৳ ${n.toLocaleString("en-US")}`;
}

function AdminOverviewPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "overview"],
    queryFn: () => adminOverview(),
  });

  const stats = [
    { label: "Total revenue", value: adminPrice(data?.revenue ?? 0), icon: BadgeDollarSign },
    { label: "Total orders", value: String(data?.orderCount ?? 0), icon: Package },
    { label: "Pending orders", value: String(data?.pending ?? 0), icon: Clock },
    { label: "Products", value: String(data?.productCount ?? 0), icon: Boxes },
    { label: "Categories", value: String(data?.categoryCount ?? 0), icon: Layers },
    { label: "Promotions", value: String(data?.promotionCount ?? 0), icon: Megaphone },
  ];

  return (
    <div className="space-y-6">
      <AdminHeading title="Overview" description="Store summary and recent orders." />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map((s, i) => (
          <div
            key={s.label}
            className="admin-rise rounded-2xl border border-border bg-card p-4 transition-colors duration-200 hover:border-primary/25"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div
              className={cn(
                "inline-flex size-9 items-center justify-center rounded-xl bg-muted text-muted-foreground",
              )}
            >
              <s.icon className="size-4.5" strokeWidth={1.75} />
            </div>
            <p className="mt-3 text-xs font-medium text-muted-foreground">{s.label}</p>
            <p className="mt-1 text-lg font-bold tabular-nums text-foreground">
              {isLoading ? (
                <span className="admin-shimmer inline-block h-5 w-16 rounded-md bg-muted" />
              ) : (
                s.value
              )}
            </p>
          </div>
        ))}
      </div>


      <Panel>
        <h2 className="text-sm font-bold text-foreground">Recent orders</h2>
        <div className="mt-3 space-y-2">
          {isLoading ? (
            <BrandLoader size="sm" className="py-6" />
          ) : (data?.recent.length ?? 0) === 0 ? (
            <EmptyState title="No orders yet" />
          ) : (
            data?.recent.map((o) => (
              <Link
                key={o.id}
                to="/admin/orders/$id"
                params={{ id: (o.order_number || o.id).toLowerCase() }}
                className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 rounded-xl border border-border/70 px-3 py-2.5 text-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:bg-muted/60"
              >
                <span className="font-semibold">{o.order_number}</span>
                <span className="truncate text-muted-foreground">{o.customer_name}</span>
                <StatusPill status={o.status} />
                <span className="text-right font-semibold tabular-nums">{adminPrice(o.total)}</span>
              </Link>
            ))
          )}
        </div>
      </Panel>
    </div>
  );
}
