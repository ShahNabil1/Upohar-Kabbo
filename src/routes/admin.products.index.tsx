import { createFileRoute } from "@tanstack/react-router";

import { ProductList } from "@/components/admin/product-list";

export const Route = createFileRoute("/admin/products/")({
  component: () => (
    <ProductList
      kind="single"
      title="Products"
      description="সিংগেল প্রোডাক্ট ও কম্বো বক্স — ছবি, ভেরিয়েন্ট আর SEO।"
      newLabel="New product"
    />
  ),
});
