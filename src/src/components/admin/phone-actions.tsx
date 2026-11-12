import { Phone, PhoneCall } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";

function WhatsappIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.174.199-.347.223-.644.075-.297-.149-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.148-.669-1.611-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.29.173-1.414-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884a9.82 9.82 0 016.988 2.898 9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413" />
    </svg>
  );
}

export function waNumber(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("880")) return digits;
  if (digits.startsWith("0")) return `880${digits.slice(1)}`;
  return digits;
}

/** Phone chip: click to copy, plus WhatsApp and call shortcuts. */
export function PhoneActions({
  phone,
  size = "md",
  className,
}: {
  phone: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  const iconBtn =
    size === "sm"
      ? "inline-flex size-6 items-center justify-center rounded-full"
      : "inline-flex size-7 items-center justify-center rounded-full";
  const iconSize = size === "sm" ? "size-3" : "size-3.5";

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <button
        type="button"
        onClick={(e) => {
          stop(e);
          e.preventDefault();
          void navigator.clipboard.writeText(phone);
          toast.success("নাম্বার কপি হয়েছে", { description: phone });
        }}
        title="Copy number"
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md bg-indigo-50 px-2 py-1 font-mono font-semibold tracking-tight text-indigo-700 ring-1 ring-indigo-200 transition-colors hover:bg-indigo-100 hover:text-indigo-900 active:scale-[0.98]",
          size === "sm" ? "text-[11px]" : "text-xs",
        )}
      >
        <Phone className={iconSize} />
        {phone}
      </button>
      <a
        href={`https://wa.me/${waNumber(phone)}`}
        target="_blank"
        rel="noreferrer"
        onClick={stop}
        title="WhatsApp"
        className={cn(iconBtn, "bg-[#25D366]/15 text-[#128C7E] transition-colors hover:bg-[#25D366]/25")}
      >
        <WhatsappIcon className={iconSize} />
      </a>
      <a
        href={`tel:${phone}`}
        onClick={stop}
        title="Call"
        className={cn(iconBtn, "bg-primary/10 text-primary transition-colors hover:bg-primary/20")}
      >
        <PhoneCall className={iconSize} />
      </a>
    </span>
  );
}
