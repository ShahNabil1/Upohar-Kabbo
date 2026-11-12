import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";

import { ProductThumb } from "./product-card";
import { pick, type Lang } from "@/lib/i18n";
import type { CategoryWithSubs } from "@/lib/types";
import { cn } from "@/lib/utils";

export function CategoryCard({
  category,
  lang,
}: {
  category: CategoryWithSubs;
  lang: Lang;
}) {
  const name = pick(lang, category.name_bn, category.name_en);
  const subs = category.subcategories
    .filter((s) => s.is_active !== false)
    .slice(0, 4)
    .map((s) => pick(lang, s.name_bn, s.name_en))
    .join(" · ");

  return (
    <Link
      to="/c/$category"
      params={{ category: category.slug }}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card",
        "transition-all duration-300 ease-out will-change-transform",
        "hover:-translate-y-1.5 hover:border-primary/30 hover:shadow-[0_20px_44px_-18px_rgba(255,51,102,0.35)]",
      )}
    >
      <div className="relative aspect-[3/4] overflow-hidden bg-secondary sm:aspect-[4/5]">
        <ProductThumb
          src={category.image_url}
          alt=""
          label={name}
          fit="cover"
          sizes="(max-width: 639px) calc(50vw - 22px), (max-width: 1023px) calc(50vw - 30px), 272px"
          className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.07]"

        />

        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

        <div className="absolute right-3 top-3 grid size-9 place-items-center rounded-full bg-white/90 text-foreground opacity-0 shadow-sm backdrop-blur-sm transition-all duration-300 group-hover:opacity-100 group-hover:bg-primary group-hover:text-primary-foreground group-active:bg-primary group-active:text-primary-foreground active:bg-primary active:text-primary-foreground">
          <ArrowUpRight className="size-4" />
        </div>

        <div className="absolute bottom-0 left-0 right-0 p-4 text-white">
          <h3 className="text-lg font-bold leading-tight sm:text-xl">{name}</h3>
          {subs ? (
            <p className="mt-1 line-clamp-1 text-xs font-medium text-white/80">{subs}</p>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
