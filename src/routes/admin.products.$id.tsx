import { createFileRoute, useParams } from "@tanstack/react-router";

import { ProductEditor } from "@/components/admin/product-editor";

export const Route = createFileRoute("/admin/products/$id")({
  component: ProductEditorRoute,
});

function ProductEditorRoute() {
  const { id } = useParams({ from: "/admin/products/$id" });
  return <ProductEditor key={id} id={id} kind="single" />;
}
