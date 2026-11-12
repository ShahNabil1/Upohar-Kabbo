import { createFileRoute } from "@tanstack/react-router";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { GripVertical, HelpCircle, Pencil, Search, Trash2, X } from "lucide-react";

import {
  adminDeleteFaq,
  adminListFaqs,
  adminListSettings,
  adminReorderFaqs,
  adminSaveFaq,
  adminSaveSetting,
} from "@/lib/admin.functions";
import type { FaqInput } from "@/lib/admin-schema";
import {
  AdminHeading,
  AreaField,
  EmptyState,
  Panel,
  TextField,
  ToggleField,
} from "@/components/admin/kit";
import { ImageField } from "@/components/admin/image-upload";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/admin/faqs")({
  component: FaqsAdmin,
});

type FaqSeo = { meta_title: string; meta_description: string; og_image: string };

const EMPTY_SEO: FaqSeo = { meta_title: "", meta_description: "", og_image: "" };

function FaqSeoPanel() {
  const qc = useQueryClient();
  const { data: settings } = useQuery({
    queryKey: ["admin", "settings"],
    queryFn: () => adminListSettings(),
  });
  const [seo, setSeo] = useState<FaqSeo>(EMPTY_SEO);

  useEffect(() => {
    const row = (settings ?? []).find((s: { key: string }) => s.key === "faq_seo");
    const v = (row?.value ?? {}) as Partial<FaqSeo>;
    setSeo({
      meta_title: v.meta_title ?? "",
      meta_description: v.meta_description ?? "",
      og_image: v.og_image ?? "",
    });
  }, [settings]);

  const save = useMutation({
    mutationFn: () => adminSaveSetting({ data: { key: "faq_seo", value: seo } }),
    onSuccess: async () => {
      toast.success("FAQ SEO saved");
      await qc.invalidateQueries({ queryKey: ["admin", "settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Panel className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <Search className="size-4 text-primary" />
          FAQ page SEO
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Meta title, description and social share image for the public /faq page. Leave blank to
          use the built-in defaults.
        </p>
      </div>
      <TextField
        label="Meta title"
        value={seo.meta_title}
        onChange={(v) => setSeo({ ...seo, meta_title: v })}
        maxLength={60}
        hint="সর্বোচ্চ ৬০ ক্যারেক্টার"
      />
      <AreaField
        label="Meta description"
        rows={3}
        value={seo.meta_description}
        onChange={(v) => setSeo({ ...seo, meta_description: v })}
        maxLength={160}
        hint="সর্বোচ্চ ১৬০ ক্যারেক্টার"
      />
      <ImageField
        label="OG image"
        folder="site"
        value={seo.og_image || null}
        onChange={(url) => setSeo({ ...seo, og_image: url ?? "" })}
        cropPreset="og"
        hint="বেস্ট সাইজ: ১২০০×৬৩০ px (১.৯১:১), JPG/WebP, ৩০০ KB-এর কম। ছবি আপলোডের পর Crop চাপলে এই অনুপাতে নিখুঁতভাবে অ্যাডজাস্ট করা যাবে।"
      />
      <Button
        loading={save.isPending}
        onClick={() => save.mutate()}
        className="ig-gradient transition-transform duration-300 hover:scale-[1.02]"
      >
        Save SEO
      </Button>
    </Panel>
  );
}


function emptyFaq(): FaqInput {
  return {
    question_bn: "",
    question_en: "",
    answer_bn: "",
    answer_en: "",
    sort_order: 0,
    is_active: true,
  };
}

function toFaqDraft(f: any): FaqInput {
  return {
    ...f,
    question_bn: f.question_bn || f.question_en || "",
    question_en: f.question_bn || f.question_en || "",
    answer_bn: f.answer_bn || f.answer_en || "",
    answer_en: f.answer_bn || f.answer_en || "",
  };
}

function FaqsAdmin() {
  const qc = useQueryClient();
  const confirmDialog = useConfirm();
  const [draft, setDraft] = useState<FaqInput>(emptyFaq());
  const [openId, setOpenId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [order, setOrder] = useState<string[]>([]);
  const { data } = useQuery({ queryKey: ["admin", "faqs"], queryFn: () => adminListFaqs() });

  useEffect(() => {
    setOrder((data ?? []).map((faq) => faq.id));
  }, [data]);

  const save = useMutation({
    mutationFn: (input: FaqInput) => adminSaveFaq({ data: input }),
    onSuccess: async () => {
      toast.success("FAQ saved");
      setDraft(emptyFaq());
      await qc.invalidateQueries({ queryKey: ["admin", "faqs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => adminDeleteFaq({ data: { id } }),
    onSuccess: async () => {
      toast.success("Deleted");
      await qc.invalidateQueries({ queryKey: ["admin", "faqs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const reorder = useMutation({
    mutationFn: (ids: string[]) => adminReorderFaqs({ data: { ids } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin", "faqs"] });
    },
    onError: (e: Error) => {
      toast.error(e.message);
      setOrder((data ?? []).map((faq) => faq.id));
    },
  });

  const orderedFaqs = (data ?? []).slice().sort((a, b) => {
    const aIndex = order.indexOf(a.id);
    const bIndex = order.indexOf(b.id);
    return (aIndex < 0 ? Number.MAX_SAFE_INTEGER : aIndex) -
      (bIndex < 0 ? Number.MAX_SAFE_INTEGER : bIndex);
  });

  const dropOn = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const next = order.slice();
    const from = next.indexOf(dragId);
    const to = next.indexOf(targetId);
    if (from < 0 || to < 0) return;
    next.splice(from, 1);
    next.splice(to, 0, dragId);
    setOrder(next);
    setDragId(null);
    reorder.mutate(next);
  };

  return (
    <div className="space-y-6 pb-16">
      <AdminHeading title="FAQ" description="Questions and answers shown on the homepage and FAQ page." />

      <FaqSeoPanel />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">

        <Panel className="space-y-4">
          <h2 className="flex items-center gap-2 text-sm font-bold">
            <HelpCircle className="size-4 text-primary" />
            {draft.id ? "Edit FAQ" : "New FAQ"}
          </h2>
          <TextField
            label="Question"
            value={draft.question_bn}
            onChange={(v) => setDraft({ ...draft, question_bn: v, question_en: v })}
          />
          <AreaField
            label="Answer"
            rows={5}
            value={draft.answer_bn}
            onChange={(v) => setDraft({ ...draft, answer_bn: v, answer_en: v })}
          />
          <div>
            <ToggleField
              label="Active"
              checked={draft.is_active}
              onChange={(v) => setDraft({ ...draft, is_active: v })}
            />
          </div>
          <div className="flex gap-2 pt-1">
            <Button
              loading={save.isPending}
              onClick={() => save.mutate(draft)}
              className="ig-gradient transition-transform duration-300 hover:scale-[1.02]"
            >
              Save
            </Button>
            {draft.id ? (
              <Button variant="outline" onClick={() => setDraft(emptyFaq())}>
                <X className="mr-1 size-4" />
                Cancel
              </Button>
            ) : null}
          </div>
        </Panel>

        <Panel className="p-0">
          <div className="flex items-center justify-between gap-3 border-b border-border p-4">
            <h2 className="text-sm font-bold">All questions</h2>
            <span className="text-xs text-muted-foreground">ড্র্যাগ করে সাজান</span>
          </div>
          {(data ?? []).length === 0 ? (
            <div className="p-4">
              <EmptyState title="No FAQs yet" hint="Add your first question on the left." />
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {orderedFaqs.map((f, i) => {
                const isOpen = openId === f.id;
                return (
                  <li
                    key={f.id}
                     draggable
                     onDragStart={() => setDragId(f.id)}
                     onDragOver={(event) => event.preventDefault()}
                     onDrop={() => dropOn(f.id)}
                     onDragEnd={() => setDragId(null)}
                     className={`admin-rise transition-colors duration-300 ${dragId === f.id ? "opacity-50" : ""}`}
                    style={{ animationDelay: `${i * 30}ms` }}
                  >
                    <button
                      type="button"
                      onClick={() => setOpenId(isOpen ? null : f.id)}
                      className="group flex w-full items-center gap-2 px-4 py-3 text-left text-sm transition-colors duration-200 hover:bg-primary/5"
                    >
                      <GripVertical className="size-4 shrink-0 cursor-grab text-muted-foreground active:cursor-grabbing" />
                      <p className="min-w-0 flex-1 truncate font-medium">
                        {f.question_bn || f.question_en}
                      </p>
                      <div className="flex items-center gap-1 opacity-70 transition-opacity duration-200 group-hover:opacity-100">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDraft(toFaqDraft(f));
                          }}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            void confirmDialog({
                              title: "Delete this FAQ?",
                              description: "This question will be removed from the website.",
                            }).then((ok) => ok && remove.mutate(f.id));
                          }}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </button>
                    <div
                      className="grid overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
                      style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
                    >
                      <div className="overflow-hidden">
                        <p className="px-4 pb-4 text-sm text-muted-foreground">
                          {f.answer_bn || f.answer_en}
                        </p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
