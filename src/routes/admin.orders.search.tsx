import { createFileRoute } from "@tanstack/react-router";

import { OrdersBoard } from "@/components/admin/orders-board";

export const Route = createFileRoute("/admin/orders/search")({
  validateSearch: (search: Record<string, unknown>): { q?: string; page?: number } => ({
    ...(typeof search["q"] === "string" && search["q"] ? { q: search["q"] } : {}),
    ...(Number(search["page"]) > 1 ? { page: Number(search["page"]) } : {}),
  }),
  component: AdminOrderSearchPage,
});

function AdminOrderSearchPage() {
  return (
    <OrdersBoard
      bucket="search"
      statuses={[]}
      emptyTitle="No orders matched this search"
    />
  );
}
