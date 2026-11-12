import { createFileRoute } from "@tanstack/react-router";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Lock, MessageSquareText, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { VariableTextarea } from "@/components/admin/variable-textarea";

import {
  SMS_TEMPLATE_VARIABLES,
  AUTO_SMS_KEYS,
  adminDeleteSmsTemplate,
  adminListSmsTemplates,
  adminSetSmsTemplateEnabled,
  adminUpsertSmsTemplate,
  type SmsTemplateRow,
} from "@/lib/sms-templates.functions";
import { TEMPLATE_CATEGORIES, categoryMeta } from "@/lib/template-categories";
import { AdminHeading, Panel } from "@/components/admin/kit";
import { BrandLoader } from "@/components/admin/brand-loader";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/settings/sms-templates")({
  component: SmsTemplatesAdmin,
});

/** Templates that fire automatically and can therefore be switched off. */
const AUTO_KEYS = AUTO_SMS_KEYS;

function SmsTemplatesAdmin() {
  const qc = useQueryClient();
  const confirmDialog = useConfirm();
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "sms-templates"],
    queryFn: () => adminListSmsTemplates(),
  });
  const templates = useMemo<SmsTemplateRow[]>(() => data?.templates ?? [], [data]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [filter, setFilter] = useState("all");
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("other");
  const [saving, setSaving] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!selectedId && !isNew && templates.length) setSelectedId(templates[0]!.id);
  }, [templates, selectedId, isNew]);

  const selected = useMemo(
    () => templates.find((t) => t.id === selectedId) ?? null,
    [templates, selectedId],
  );

  useEffect(() => {
    if (!selected) return;
    setName(selected.name);
    setBody(selected.body);
    setCategory(selected.category);
    setIsNew(false);
    setIsEditing(false);
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(
    () => (filter === "all" ? templates : templates.filter((t) => t.category === filter)),
    [templates, filter],
  );

  const variables = selected?.variables?.length
    ? selected.variables
    : [...SMS_TEMPLATE_VARIABLES];

  async function save() {
    if (!name.trim() || !body.trim()) {
      toast.error("Name and body are required");
      return;
    }
    setSaving(true);
    try {
      const res = await adminUpsertSmsTemplate({
        data: {
          ...(selected?.id ? { id: selected.id } : {}),
          name: name.trim(),
          body,
          category,
        },
      });
      toast.success("Template saved");
      await qc.invalidateQueries({ queryKey: ["admin", "sms-templates"] });
      if (isNew && res.id) {
        setSelectedId(res.id);
        setIsNew(false);
      }
      setIsEditing(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  function createNew() {
    setSelectedId(null);
    setIsNew(true);
    setIsEditing(true);
    setName("New template");
    setBody("");
    setCategory("campaign");
    setTimeout(() => editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  function cancelEdit() {
    if (isNew) {
      setIsNew(false);
      if (templates[0]) setSelectedId(templates[0].id);
    } else if (selected) {
      setName(selected.name);
      setBody(selected.body);
      setCategory(selected.category);
    }
    setIsEditing(false);
  }

  async function remove() {
    if (!selected || selected.is_system) return;
    const ok = await confirmDialog({
      title: `Delete "${selected.name}"?`,
      description: "This SMS template will be permanently removed.",
    });
    if (!ok) return;
    try {
      await adminDeleteSmsTemplate({ data: { id: selected.id } });
      toast.success("Template deleted");
      setSelectedId(null);
      setIsEditing(false);
      await qc.invalidateQueries({ queryKey: ["admin", "sms-templates"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  }

  async function toggleEnabled(t: SmsTemplateRow, next: boolean) {
    try {
      await adminSetSmsTemplateEnabled({ data: { id: t.id, enabled: next } });
      toast.success(next ? "Auto-send enabled" : "Auto-send disabled");
      await qc.invalidateQueries({ queryKey: ["admin"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }


  const showEditor = Boolean(selected) || isNew;

  return (
    <div className="space-y-6 pb-16">
      <AdminHeading
        title="SMS Templates"
        description="Order confirmation, follow-ups and custom templates used across the admin panel."
        action={
          <Button onClick={createNew} className="transition-transform hover:-translate-y-0.5">
            <Plus className="size-4" />
            New template
          </Button>
        }
      />

      {isLoading ? (
        <BrandLoader size="md" className="py-10" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <Panel className="p-0">
            <div className="border-b border-border p-2">
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="h-10 w-full rounded-xl border border-border/80 bg-background/70 px-3 text-xs font-semibold"
              >
                <option value="all">All categories ({templates.length})</option>
                {TEMPLATE_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label} ({templates.filter((t) => t.category === c.value).length})
                  </option>
                ))}
              </select>
            </div>
            <ul className="divide-y divide-border">
              {filtered.map((t) => (
                <li key={t.id}>
                  <div
                    className={cn(
                      "flex items-center gap-2 px-3 py-2.5 text-sm transition-colors",
                      selectedId === t.id ? "bg-primary/5" : "hover:bg-muted/50",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(t.id);
                        setIsNew(false);
                      }}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="truncate font-semibold">{t.name}</p>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <span
                          className={cn(
                            "rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide",
                            categoryMeta(t.category).color,
                          )}
                        >
                          {categoryMeta(t.category).label}
                        </span>
                        {t.key ? (
                          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                            {t.key}
                          </span>
                        ) : null}
                      </div>
                    </button>
                    {t.key && AUTO_KEYS.has(t.key) ? (
                      <Switch
                        checked={t.enabled}
                        onCheckedChange={(v) => void toggleEnabled(t, v)}
                        title={t.enabled ? "Auto-send on" : "Auto-send off"}
                      />
                    ) : null}
                    {t.is_system ? (
                      <Lock className="size-3.5 shrink-0 text-muted-foreground" />
                    ) : null}
                  </div>
                </li>
              ))}
              {filtered.length === 0 ? (
                <li className="p-4 text-center text-sm text-muted-foreground">No templates</li>
              ) : null}
            </ul>
          </Panel>

          <Panel>
            <div ref={editorRef}>
              {!showEditor ? (
                <p className="text-sm text-muted-foreground">
                  Select a template or create a new one.
                </p>
              ) : (
                <>
                  <div className="mb-3 flex items-center justify-between">
                    {selected?.is_system ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                        <Lock className="size-3.5" /> System template
                      </span>
                    ) : (
                      <span className="text-xs font-semibold text-muted-foreground">
                        {isNew ? "New template" : "Custom template"}
                      </span>
                    )}
                    {!isEditing && !isNew ? (
                      <Button size="sm" variant="outline" onClick={() => setIsEditing(true)}>
                        <Pencil className="size-3.5" /> Edit
                      </Button>
                    ) : null}
                  </div>

                  {selected?.key && AUTO_KEYS.has(selected.key) ? (
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/40 p-3">
                      <div>
                        <p className="text-sm font-bold">Auto-send</p>
                        <p className="text-xs text-muted-foreground">
                          {selected.key === "order_confirm"
                            ? "When off, the “Send SMS & Confirm” button is hidden and no automatic SMS goes out."
                            : "When on, this SMS goes out automatically when the order reaches this status. When off, nothing is sent."}
                        </p>
                      </div>
                      <Switch
                        checked={selected.enabled}
                        onCheckedChange={(v) => void toggleEnabled(selected, v)}
                      />
                    </div>
                  ) : null}

                  <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Template name
                  </label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={!isEditing || selected?.is_system}
                    className="mt-1 h-10 w-full rounded-xl border border-border/80 bg-background/70 px-3 text-sm disabled:opacity-70"
                  />

                  <label className="mt-3 block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Category
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    disabled={!isEditing}
                    className="mt-1 h-10 w-full rounded-xl border border-border/80 bg-background/70 px-3 text-sm disabled:opacity-70"
                  >
                    {TEMPLATE_CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>

                  <div className="mt-4">
                    <VariableTextarea
                      value={body}
                      onChange={setBody}
                      variables={variables}
                      disabled={!isEditing}
                      rows={8}
                      maxLength={1000}
                      placeholder="প্রিয় {{name}}, ... (ভেরিয়েবলের জন্য / টাইপ করুন)"
                      className="font-mono"
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Bangla text is sent as unicode (70 chars per SMS part). Length: {body.length}
                    /1000
                  </p>

                  {isEditing ? (
                    <div className="mt-4 flex items-center justify-between gap-2">
                      <div>
                        {selected && !selected.is_system ? (
                          <Button variant="outline" onClick={() => void remove()}>
                            <Trash2 className="size-3.5 text-destructive" /> Delete
                          </Button>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" onClick={cancelEdit} disabled={saving}>
                          <X className="size-3.5" /> Cancel
                        </Button>
                        <Button onClick={() => void save()} disabled={saving}>
                          {saving ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <Save className="size-3.5" />
                          )}
                          {saving ? "Saving…" : "Save template"}
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </Panel>
        </div>
      )}

      <Panel className="flex items-start gap-3">
        <MessageSquareText className="mt-0.5 size-4 shrink-0 text-primary" />
        <p className="text-xs text-muted-foreground">
          These templates power the order workspace SMS composer and the automatic order
          confirmation SMS. Variables are replaced with live order data before sending.
        </p>
      </Panel>
    </div>
  );
}
