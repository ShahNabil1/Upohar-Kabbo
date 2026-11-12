import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Stable JSON so key order never makes an unchanged value look dirty. */
export function stableStringify(value: unknown): string {
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>)
          .filter(([, val]) => val !== undefined)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, val]) => [k, walk(val)]),
      );
    }
    return v;
  };
  return JSON.stringify(walk(value));
}

/** True when the edited draft differs from the last saved value. */
export function isDirty(draft: unknown, saved: unknown): boolean {
  return stableStringify(draft) !== stableStringify(saved);
}

/**
 * Save button that reflects the real state of a form:
 * - nothing changed -> disabled "Updated" (or "Save" when nothing is saved yet)
 * - changed -> enabled "Save changes"
 * The spinner only shows for the panel that is actually saving.
 */
export function SaveButton({
  dirty,
  loading = false,
  onClick,
  className,
  saveLabel = "Save changes",
  savedLabel = "Updated",
  disabled = false,
  size,
}: {
  dirty: boolean;
  loading?: boolean;
  onClick: () => void;
  className?: string;
  saveLabel?: string;
  savedLabel?: string;
  disabled?: boolean;
  size?: "sm" | "lg" | "default" | "icon";
}) {
  const inactive = !dirty && !loading;
  return (
    <Button
      type="button"
      size={size}
      loading={loading}
      disabled={disabled || inactive}
      variant={inactive ? "outline" : "default"}
      title={inactive ? "No changes to save" : undefined}
      onClick={() => {
        if (!dirty || loading) return;
        onClick();
      }}
      className={cn("transition-all duration-200", !inactive && "hover:-translate-y-0.5", className)}
    >
      {inactive ? (
        <>
          <Check className="size-4" />
          {savedLabel}
        </>
      ) : (
        saveLabel
      )}
    </Button>
  );
}
