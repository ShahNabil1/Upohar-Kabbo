import { useState } from "react";

import { useLang } from "@/lib/language-context";
import { pick } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export type FaqItem = {
  id?: string;
  question_bn: string;
  question_en: string;
  answer_bn: string;
  answer_en: string;
};

export function FaqList({ items, className }: { items: FaqItem[]; className?: string }) {
  const { lang } = useLang();
  const [open, setOpen] = useState<number | null>(0);

  if (items.length === 0) return null;

  return (
    <div className={cn("flex flex-col gap-3 sm:gap-4", className)}>
      {items.map((item, i) => {
        const expanded = open === i;
        return (
          <div
            key={item.id ?? i}
            className={cn(
              "group relative overflow-hidden rounded-2xl bg-card transition-all duration-300 ease-out",
              expanded
                ? "shadow-[0_10px_30px_-12px_rgba(255,51,102,0.35)] ring-1 ring-primary/20"
                : "shadow-[0_2px_10px_-6px_rgba(15,23,42,0.25)] ring-1 ring-border hover:shadow-[0_8px_24px_-14px_rgba(15,23,42,0.35)]",
            )}
          >
            {/* left accent bar */}
            <span
              aria-hidden
              className={cn(
                "absolute left-0 top-0 h-full w-[5px] origin-center rounded-r-full bg-primary transition-transform duration-300 ease-out motion-reduce:transition-none",
                expanded ? "scale-y-100" : "scale-y-0",
              )}
            />
            <button
              type="button"
              onClick={() => setOpen(expanded ? null : i)}
              aria-expanded={expanded}
              className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-5 py-5 text-left sm:px-6"
            >
              <span className="lp-fat-bn min-w-0 text-[16px] font-bold leading-snug text-foreground sm:text-[17px]">
                {pick(lang, item.question_bn, item.question_en)}
              </span>
              <span
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-transform duration-300 ease-out group-hover:scale-105 active:scale-95 motion-reduce:transition-none",
                  expanded && "rotate-180",
                )}
              >
                <svg viewBox="0 0 24 24" aria-hidden className="size-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <line
                    x1="12"
                    y1="5"
                    x2="12"
                    y2="19"
                    className={cn(
                      "origin-center transition-transform duration-300 ease-out motion-reduce:transition-none",
                      expanded ? "scale-y-0" : "scale-y-100",
                    )}
                  />
                </svg>
              </span>
            </button>
            <div
              className="grid transition-[grid-template-rows,opacity] duration-350 ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none"
              style={{ gridTemplateRows: expanded ? "1fr" : "0fr", opacity: expanded ? 1 : 0 }}
            >
              <div className="overflow-hidden">
                <p className="lp-fat-bn px-5 pb-5 text-[15px] leading-7 text-muted-foreground sm:px-6">
                  {pick(lang, item.answer_bn, item.answer_en)}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

