import { createFileRoute, useParams } from "@tanstack/react-router";

import { ProductEditor } from "@/components/admin/product-editor";

export const Route = createFileRoute("/admin/sub-products/$id")({
  component: SubProductEditorRoute,
});

function SubProductEditorRoute() {
  const { id } = useParams({ from: "/admin/sub-products/$id" });
  return <ProductEditor key={id} id={id} kind="component" />;
}
