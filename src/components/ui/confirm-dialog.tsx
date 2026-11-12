import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, LogOut, Trash2 } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

export type ConfirmOptions = {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** `danger` = destructive red action, `brand` = primary brand action. */
  tone?: "danger" | "brand";
  /** Icon shown in the header badge. Defaults to trash (danger) / warning (brand). */
  icon?: "trash" | "warning" | "logout";
};

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * Site-wide confirmation dialog. Replaces window.confirm everywhere:
 *   const confirm = useConfirm();
 *   if (await confirm({ title: "Delete this FAQ?", tone: "danger" })) remove();
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((opts) => {
    setOptions(opts);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = useCallback((value: boolean) => {
    setOpen(false);
    resolver.current?.(value);
    resolver.current = null;
  }, []);

  const tone = options?.tone ?? "danger";
  const isDanger = tone === "danger";
  const iconKind = options?.icon ?? (isDanger ? "trash" : "warning");
  const Icon = iconKind === "logout" ? LogOut : iconKind === "warning" ? AlertTriangle : Trash2;

  const value = useMemo(() => confirm, [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <AlertDialog open={open} onOpenChange={(next) => (next ? setOpen(true) : settle(false))}>
        <AlertDialogContent className="max-w-sm overflow-hidden rounded-2xl border-border/60 p-0 shadow-2xl">
          <div className="p-6 pb-5">
            <AlertDialogHeader className="flex-col items-center gap-0 space-y-0 text-center">
              <span
                className={cn(
                  "grid size-12 place-items-center rounded-full ring-8",
                  isDanger
                    ? "bg-destructive/10 text-destructive ring-destructive/5"
                    : "bg-primary/10 text-primary ring-primary/5",
                )}
              >
                <Icon className="size-5" strokeWidth={2.25} />
              </span>
              <AlertDialogTitle className="mt-4 text-lg font-semibold tracking-tight">
                {options?.title}
              </AlertDialogTitle>
              {options?.description ? (
                <AlertDialogDescription className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {options.description}
                </AlertDialogDescription>
              ) : null}
            </AlertDialogHeader>
          </div>

          <AlertDialogFooter className="grid grid-cols-2 gap-0 border-t border-border/60 sm:grid-cols-2">
            <AlertDialogCancel
              onClick={() => settle(false)}
              className="m-0 h-12 rounded-none border-0 border-r border-border/60 bg-transparent text-sm font-medium text-foreground shadow-none hover:bg-muted/60 hover:text-foreground"
            >
              {options?.cancelLabel ?? "Cancel"}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => settle(true)}
              className={cn(
                "m-0 h-12 rounded-none text-sm font-semibold shadow-none",
                isDanger
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : "bg-primary text-primary-foreground hover:bg-primary/90",
              )}
            >
              {options?.confirmLabel ?? (isDanger ? "Delete" : "Confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used inside <ConfirmProvider>");
  return ctx;
}
