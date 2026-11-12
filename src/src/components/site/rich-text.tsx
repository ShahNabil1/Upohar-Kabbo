import { cn } from "@/lib/utils";
import { isRichTextEmpty, toRichHtml } from "@/lib/rich-text";

/** Renders admin rich-text exactly as it was written (sanitized). */
export function RichText({
  html,
  className,
}: {
  html: string | null | undefined;
  className?: string;
}) {
  const clean = toRichHtml(html);
  if (!clean || isRichTextEmpty(clean)) return null;
  return (
    <div
      className={cn("rich-text text-[15px] leading-7 text-foreground/90", className)}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
