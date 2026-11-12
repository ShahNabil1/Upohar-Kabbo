import { createFileRoute } from "@tanstack/react-router";

import { ProductList } from "@/components/admin/product-list";

export const Route = createFileRoute("/admin/sub-products/")({
  component: () => (
    <ProductList
      kind="component"
      title="Sub-Products"
      description="কম্বো বক্সের আইটেম লাইব্রেরি — এদের আলাদা প্রোডাক্ট পেইজ নেই।"
      newLabel="New sub-product"
    />
  ),
});
