import { createFileRoute } from "@tanstack/react-router";
import { LegalPageEditor } from "@/components/admin/legal-page-editor";

export const Route = createFileRoute("/admin/settings/return-policy")({
  head: () => ({ meta: [{ title: "Edit Return Policy — Upoharkabbo Admin" }, { name: "description", content: "Edit the Upoharkabbo return policy." }, { property: "og:title", content: "Edit Return Policy — Upoharkabbo Admin" }, { property: "og:description", content: "Edit the Upoharkabbo return policy." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: () => <LegalPageEditor settingKey="legal_returns" />,
});