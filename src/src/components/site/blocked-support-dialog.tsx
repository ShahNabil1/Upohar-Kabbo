import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { MessageCircle, Phone, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type BlockedDialogContextValue = { showBlockedDialog: () => void };
const BlockedDialogContext = createContext<BlockedDialogContextValue | null>(null);

export function BlockedSupportProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const showBlockedDialog = useCallback(() => setOpen(true), []);
  const value = useMemo(() => ({ showBlockedDialog }), [showBlockedDialog]);

  return (
    <BlockedDialogContext.Provider value={value}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md overflow-hidden rounded-lg border-border/70 p-0">
          <div className="h-1 bg-primary" />
          <div className="p-6">
            <DialogHeader className="items-center text-center">
              <span className="grid size-12 place-items-center rounded-full bg-primary/10 text-primary-dark">
                <ShieldAlert className="size-6" />
              </span>
              <DialogTitle className="pt-2">অর্ডারটি এখন নেওয়া যাচ্ছে না</DialogTitle>
              <DialogDescription className="leading-6">
                সহায়তার জন্য উপহারকাব্য-এর সঙ্গে WhatsApp অথবা ফোনে যোগাযোগ করুন।
              </DialogDescription>
            </DialogHeader>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <Button asChild>
                <a href="https://wa.me/8801772588538" target="_blank" rel="noreferrer">
                  <MessageCircle /> WhatsApp
                </a>
              </Button>
              <Button asChild variant="outline">
                <a href="tel:+8801772588538"><Phone /> 01772-588538</a>
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </BlockedDialogContext.Provider>
  );
}

export function useBlockedSupport() {
  const context = useContext(BlockedDialogContext);
  if (!context) throw new Error("useBlockedSupport must be used inside BlockedSupportProvider");
  return context;
}