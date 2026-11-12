import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { MessageCircle, PackageX } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useCart, type CartItem, type NewCartItem } from "@/lib/cart-context";
import { useLang } from "@/lib/language-context";
import { formatNumber, pick, tr } from "@/lib/i18n";
import { ecommerce, pushEvent } from "@/lib/tracking";
import { cartTrackingItems } from "@/lib/tracking-items";
import { cn } from "@/lib/utils";

export function QuantityStepper({
  value,
  onChange,
  max,
  className,
}: {
  value: number;
  onChange: (next: number) => void;
  max: number;
  className?: string;
}) {
  const limit = max > 0 ? max : 99;
  return (
    <div
      className={cn(
        "inline-flex h-10 items-center overflow-hidden rounded-sm border border-border",
        className,
      )}
    >
      <button
        type="button"
        aria-label="-"
        onClick={() => onChange(Math.max(1, value - 1))}
        className="flex h-full w-10 items-center justify-center text-base leading-none text-foreground transition-all duration-150 hover:bg-secondary active:scale-95 disabled:opacity-40"
        disabled={value <= 1}
      >
        −
      </button>
      <span className="font-en flex h-full w-12 items-center justify-center text-center text-sm font-semibold tabular-nums transition-all duration-150">
        {formatNumber("en", value)}
      </span>
      <button
        type="button"
        aria-label="+"
        onClick={() => onChange(Math.min(limit, value + 1))}
        className="flex h-full w-10 items-center justify-center text-base leading-none text-foreground transition-all duration-150 hover:bg-secondary active:scale-95 disabled:opacity-40"
        disabled={value >= limit}
      >
        +
      </button>
    </div>
  );
}

export function AddToCartBar({
  item,
  stock,
  className,
}: {
  item: Omit<NewCartItem, "quantity">;
  stock: number;
  className?: string;
}) {
  const { lang } = useLang();
  const { add, openCart } = useCart();
  const navigate = useNavigate();
  const [qty, setQty] = useState(1);
  const soldOut = stock <= 0;
  const productUrl = `https://upoharkabbo.com/p/${item.slug}`;
  const productName = pick(lang, item.nameBn, item.nameEn);
  const whatsappText = encodeURIComponent(
    soldOut
      ? `Hello Upoharkabbo, this product is out of stock. Please let me know when it is available or suggest an alternative:\n\n${productName}\n${productUrl}`
      : `Hello Upoharkabbo, I want to order this product:\n\n${productName}\n${productUrl}\n\nQuantity: ${qty}`,
  );
  const whatsappHref = `https://wa.me/8801772588538?text=${whatsappText}`;

  const addItem = async (openDrawer = true) => {
    const line = { ...item, quantity: qty };
    if (!(await add(line))) return false;
    pushEvent("add_to_cart", ecommerce(cartTrackingItems([{ ...line, key: "" } as CartItem])));
    toast.success(tr(lang, "added"), {
      description: pick(lang, item.nameBn, item.nameEn),
    });
    if (openDrawer) openCart("cart");
    return true;
  };

  if (soldOut) {
    return (
      <div
        className={cn(
          "overflow-hidden rounded-sm border border-destructive/35 bg-destructive/5",
          className,
        )}
      >
        <div className="flex items-center gap-3 px-4 py-3.5 text-left">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <PackageX className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-destructive">{tr(lang, "outOfStock")}</p>
            <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
              {lang === "bn"
                ? "WhatsApp-এ যোগাযোগ করে স্টক আপডেট বা বিকল্প সাইজ জেনে নিন।"
                : "Ask on WhatsApp for a restock update or an alternative size."}
            </p>
          </div>
        </div>
        <Button asChild className="h-11 w-full rounded-none text-sm font-bold">
          <a href={whatsappHref} target="_blank" rel="noopener noreferrer">
            <MessageCircle className="size-4" aria-hidden />
            {lang === "bn" ? "WhatsApp-এ কথা বলুন" : "Chat on WhatsApp"}
          </a>
        </Button>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-wrap items-center gap-3">
        <QuantityStepper value={qty} onChange={setQty} max={stock} />
        <button
          type="button"
          onClick={() => void addItem()}
          className="font-en min-w-36 flex-1 rounded-sm border border-primary px-5 py-3 text-sm font-semibold text-primary transition-colors hover:bg-primary/5"
        >
          {tr(lang, "addToCart")}
        </button>
        <button
          type="button"
          onClick={() => {
            void addItem(false).then((added) => {
              if (added) void navigate({ to: "/checkout" });
            });
          }}
          className="font-en min-w-36 flex-1 rounded-sm bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {tr(lang, "buyNow")}
        </button>
      </div>

      <a
        href={whatsappHref}
        target="_blank"
        rel="noopener noreferrer"
        className="font-en flex w-full items-center justify-center gap-2 rounded-sm px-5 py-3 text-sm font-semibold text-white transition-colors hover:opacity-90"
        style={{ backgroundColor: "#25D366" }}
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden>
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.29.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.13 1.558 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
        </svg>
        Order On Whatsapp
      </a>
    </div>
  );
}
