import { Link } from "@tanstack/react-router";

import { useLang } from "@/lib/language-context";
import { pick, tr } from "@/lib/i18n";
import { useSiteData } from "./site-header";

export function NotFoundView({ title, body }: { title?: string; body?: string }) {
  const { lang } = useLang();
  const { categories } = useSiteData();

  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center px-4 py-20 text-center">
      <span className="rounded-sm bg-secondary px-3 py-1 text-xs font-semibold tracking-widest text-muted-foreground">
        404
      </span>
      <h1 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">
        {title ?? tr(lang, "notFoundTitle")}
      </h1>
      <p className="mt-3 text-sm leading-7 text-muted-foreground">
        {body ?? tr(lang, "notFoundBody")}
      </p>

      <div className="mt-7 flex flex-wrap justify-center gap-2">
        <Link
          to="/"
          className="rounded-sm bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          {tr(lang, "backHome")}
        </Link>
        <Link
          to="/offers"
          className="rounded-sm border border-border bg-card px-5 py-2.5 text-sm font-semibold transition-colors hover:bg-secondary"
        >
          {tr(lang, "offers")}
        </Link>
      </div>

      {categories.length > 0 ? (
        <div className="mt-10 w-full">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {tr(lang, "allCategories")}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {categories.map((c) => (
              <Link
                key={c.id}
                to="/c/$category"
                params={{ category: c.slug }}
                className="rounded-sm border border-border bg-card px-3.5 py-2 text-sm transition-colors hover:border-primary hover:text-primary"
              >
                {pick(lang, c.name_bn, c.name_en)}
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
