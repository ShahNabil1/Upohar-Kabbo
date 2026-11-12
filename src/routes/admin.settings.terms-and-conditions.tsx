import { createFileRoute } from "@tanstack/react-router";
import { LegalPageEditor } from "@/components/admin/legal-page-editor";

export const Route = createFileRoute("/admin/settings/terms-and-conditions")({
  head: () => ({ meta: [{ title: "Edit Terms & Conditions — Upoharkabbo Admin" }, { name: "description", content: "Edit the Upoharkabbo terms and conditions." }, { property: "og:title", content: "Edit Terms & Conditions — Upoharkabbo Admin" }, { property: "og:description", content: "Edit the Upoharkabbo terms and conditions." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: () => <LegalPageEditor settingKey="legal_terms" />,
});