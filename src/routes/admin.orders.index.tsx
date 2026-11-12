import { createFileRoute } from "@tanstack/react-router";

import { webOrderStatuses } from "@/lib/admin-schema";
import { OrdersBoard } from "@/components/admin/orders-board";

export const Route = createFileRoute("/admin/orders/")({
  validateSearch: (search: Record<string, unknown>): { tab?: string; q?: string; page?: number } => ({
    ...(typeof search["tab"] === "string" && search["tab"] ? { tab: search["tab"] } : {}),
    ...(typeof search["q"] === "string" && search["q"] ? { q: search["q"] } : {}),
    ...(Number(search["page"]) > 1 ? { page: Number(search["page"]) } : {}),
  }),
  component: AdminWebOrdersPage,
});

function AdminWebOrdersPage() {
  return (
    <OrdersBoard
      bucket="web"
      statuses={webOrderStatuses}
      emptyTitle="No web orders yet"
    />
  );
}
