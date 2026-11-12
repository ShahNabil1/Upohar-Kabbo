import { createFileRoute } from "@tanstack/react-router";

import { ProductList } from "@/components/admin/product-list";

export const Route = createFileRoute("/admin/combos/")({
  component: () => (
    <ProductList
      kind="combo"
      title="Build Combo Box"
      description="কম্বো প্যাকেজ তৈরি করুন — ভিতরের আইটেম সাব-প্রোডাক্ট থেকে বেছে নিন।"
      newLabel="New combo box"
    />
  ),
});
