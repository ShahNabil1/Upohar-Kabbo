import { useMutation, useQueryClient } from "@tanstack/react-query";
import { DownloadCloud } from "lucide-react";
import { toast } from "sonner";

import { importCatalogStock } from "@/lib/inventory.functions";
import { Button } from "@/components/ui/button";

/**
 * One-click onboarding: registers every catalog SKU (products, variants,
 * packaging) in the inventory ledger and posts opening-stock movements for
 * items that already carry a catalog stock number.
 */
export function ImportCatalogStockButton({
  variant = "outline",
}: {
  variant?: "outline" | "default";
}) {
  const qc = useQueryClient();

  const run = useMutation({
    mutationFn: () => importCatalogStock(),
    onSuccess: async (r) => {
      toast.success(
        r.created === 0
          ? "Everything is already tracked in inventory"
          : `${r.created} SKUs tracked · ${r.opened} opening entries · ${r.units} units`,
      );
      await qc.invalidateQueries({ queryKey: ["admin", "inventory"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Button
      variant={variant}
      className="rounded-xl transition-transform duration-200 hover:scale-[1.03]"
      loading={run.isPending}
      onClick={() => run.mutate()}
    >
      <DownloadCloud className="size-4" />
      Sync products from database
    </Button>
  );
}
