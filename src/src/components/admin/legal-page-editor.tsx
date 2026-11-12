import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { AdminHeading, AreaField, Panel, TextField } from "@/components/admin/kit";
import { SaveButton, isDirty } from "@/components/admin/save-button";
import { RichTextEditor } from "@/components/admin/rich-text-editor";
import { Button } from "@/components/ui/button";
import { adminListSettings, adminSaveSetting } from "@/lib/admin.functions";
import { readLegalPage, type LegalPageKey } from "@/lib/legal-content";

export function LegalPageEditor({ settingKey }: { settingKey: LegalPageKey }) {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["admin", "settings"], queryFn: () => adminListSettings() });
  const [draft, setDraft] = useState(() => readLegalPage(settingKey, undefined));

  useEffect(() => {
    if (!data) return;
    const raw = (data.find((row) => row.key === settingKey)?.value ?? {}) as Record<string, unknown>;
    setDraft(readLegalPage(settingKey, raw));
  }, [data, settingKey]);

  const saved = readLegalPage(
    settingKey,
    (data?.find((row) => row.key === settingKey)?.value ?? {}) as Record<string, unknown>,
  );

  const save = useMutation({
    mutationFn: () =>
      adminSaveSetting({
        data: {
          key: settingKey,
          value: {
            title: draft.title,
            meta_title: draft.metaTitle,
            meta_description: draft.metaDescription,
            content: draft.content,
          },
        },
      }),
    onSuccess: async () => {
      toast.success(`${draft.title} updated`);
      await qc.invalidateQueries({ queryKey: ["admin", "settings"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="min-w-0 space-y-6 pb-16">
      <AdminHeading title={draft.title} description={settingKey === "about" ? "Update the live About page shown in the storefront footer." : "Update the live policy page shown in the storefront footer."} backTo="/admin/settings" backLabel="Site Settings" />
      <Panel className="min-w-0 space-y-4 overflow-hidden">
        <TextField label="Page title" value={draft.title} onChange={(title) => setDraft({ ...draft, title })} maxLength={80} />
        <TextField label="Meta title" value={draft.metaTitle} onChange={(metaTitle) => setDraft({ ...draft, metaTitle })} maxLength={60} />
        <AreaField label="Meta description" value={draft.metaDescription} onChange={(metaDescription) => setDraft({ ...draft, metaDescription })} maxLength={160} rows={3} />
        <RichTextEditor label="Page content" value={draft.content} onChange={(content) => setDraft({ ...draft, content })} minHeight={420} hint="Formatting, spacing, links and text colors appear on the live page." />
        <SaveButton dirty={isDirty(draft, saved)} loading={save.isPending} onClick={() => save.mutate()} />
      </Panel>
    </div>
  );
}