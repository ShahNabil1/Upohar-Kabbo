import { createFileRoute } from "@tanstack/react-router";
import { LegalPageEditor } from "@/components/admin/legal-page-editor";

export const Route = createFileRoute("/admin/settings/privacy-policy")({
  head: () => ({ meta: [{ title: "Edit Privacy Policy — Upoharkabbo Admin" }, { name: "description", content: "Edit the Upoharkabbo privacy policy." }, { property: "og:title", content: "Edit Privacy Policy — Upoharkabbo Admin" }, { property: "og:description", content: "Edit the Upoharkabbo privacy policy." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: () => <LegalPageEditor settingKey="legal_privacy" />,
});