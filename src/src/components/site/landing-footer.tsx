import { useLang } from "@/lib/language-context";
import logoMark from "@/assets/upoharkabbo-logo.png";
import { cn } from "@/lib/utils";
import { SOCIAL_LINKS } from "./social-links";

export function LandingFooter({ brand }: { brand: string }) {
  const { lang } = useLang();
  const year = new Date().getFullYear();

  return (
    <footer className="mt-5 border-t border-border bg-footer">
      <div className="mx-auto flex max-w-4xl flex-col items-center px-4 py-6 text-center">
        <img
          src={logoMark}
          alt={brand}
          loading="lazy"
          width={1040}
          height={375}
          className="h-16 w-auto object-contain sm:h-20"
        />

        <p className="mt-5 max-w-md text-[15px] font-medium leading-relaxed text-foreground">
          {lang === "bn"
            ? "কোনো কিছু জানতে/কাস্টমাইজ করতে সরাসরি যোগাযোগ করুন"
            : "Contact us directly to know more or customize"}
        </p>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-5">
          {SOCIAL_LINKS.map(({ key, href, label, icon: Icon, colorClass }) => (
            <a
              key={key}
              href={href}
              target={href.startsWith("http") ? "_blank" : undefined}
              rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
              aria-label={label}
              className={cn(
                "flex items-center justify-center p-1 transition-transform hover:scale-110",
                colorClass,
              )}
            >
              <Icon className="h-7 w-7" />
            </a>
          ))}
        </div>
      </div>

      <div className="border-t border-border">
        <p className="mx-auto max-w-6xl px-4 py-4 text-center text-xs text-muted-foreground">
          © {year} {brand}. {lang === "bn" ? "সর্বস্বত্ব সংরক্ষিত।" : "All rights reserved."}
        </p>
      </div>
    </footer>
  );
}
