import { createFileRoute } from "@tanstack/react-router";

import { listOrderStatuses } from "@/lib/admin-schema";
import { OrdersBoard } from "@/components/admin/orders-board";

export const Route = createFileRoute("/admin/orders/list")({
  validateSearch: (search: Record<string, unknown>): { tab?: string; q?: string; page?: number } => ({
    ...(typeof search["tab"] === "string" && search["tab"] ? { tab: search["tab"] } : {}),
    ...(typeof search["q"] === "string" && search["q"] ? { q: search["q"] } : {}),
    ...(Number(search["page"]) > 1 ? { page: Number(search["page"]) } : {}),
  }),
  component: AdminOrderListPage,
});

function AdminOrderListPage() {
  return (
    <OrdersBoard
      bucket="list"
      statuses={listOrderStatuses}
      emptyTitle="No confirmed orders yet"
    />
  );
}
