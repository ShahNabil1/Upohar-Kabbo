import { toast } from "sonner";

import { cn } from "@/lib/utils";

/** Order/invoice number chip — click to copy. */
export function CopyBadge({
  value,
  className,
  label = "অর্ডার নাম্বার কপি হয়েছে",
}: {
  value: string;
  className?: string;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        void navigator.clipboard.writeText(value);
        toast.success(label, { description: value });
      }}
      title="Click to copy"
      className={cn(
        "rounded-md bg-emerald-100 px-1.5 py-0.5 font-mono text-xs text-emerald-700 transition-colors hover:bg-emerald-200 hover:text-emerald-800 active:scale-[0.98] dark:bg-emerald-900/60 dark:text-emerald-100 dark:hover:bg-emerald-800/60",
        className,
      )}
    >
      {value}
    </button>
  );
}
