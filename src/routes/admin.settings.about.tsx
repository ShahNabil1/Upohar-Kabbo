import { createFileRoute } from "@tanstack/react-router";
import { LegalPageEditor } from "@/components/admin/legal-page-editor";

export const Route = createFileRoute("/admin/settings/about")({
  head: () => ({
    meta: [
      { title: "Edit About Page — Upoharkabbo Admin" },
      { name: "description", content: "Edit the Upoharkabbo About page." },
      { property: "og:title", content: "Edit About Page — Upoharkabbo Admin" },
      { property: "og:description", content: "Edit the Upoharkabbo About page." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <LegalPageEditor settingKey="about" />,
});