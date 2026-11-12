import { createFileRoute, useParams } from "@tanstack/react-router";

import { ProductEditor } from "@/components/admin/product-editor";

export const Route = createFileRoute("/admin/combos/$id")({
  component: ComboEditorRoute,
});

function ComboEditorRoute() {
  const { id } = useParams({ from: "/admin/combos/$id" });
  return <ProductEditor key={id} id={id} kind="combo" />;
}
