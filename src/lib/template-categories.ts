export const TEMPLATE_CATEGORIES = [
  { value: "transactional", label: "Transactional", color: "bg-emerald-100 text-emerald-700" },
  { value: "receipt", label: "Receipt", color: "bg-blue-100 text-blue-700" },
  { value: "campaign", label: "Campaign", color: "bg-fuchsia-100 text-fuchsia-700" },
  { value: "reminder", label: "Reminder", color: "bg-orange-100 text-orange-700" },
  { value: "other", label: "Other", color: "bg-slate-100 text-slate-700" },
] as const;

export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number]["value"];

export function categoryMeta(value?: string | null) {
  return (
    TEMPLATE_CATEGORIES.find((c) => c.value === value) ?? {
      value: value || "other",
      label: value || "Other",
      color: "bg-slate-100 text-slate-700",
    }
  );
}
