import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type Crumb = {
  label: string;
  to?: string;
  params?: Record<string, string>;
};

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
        {items.map((item, i) => (
          <li key={`${item.label}-${i}`} className="flex min-w-0 items-center gap-1.5">
            {item.to ? (
              <Link
                to={item.to}
                {...(item.params ? { params: item.params } : {})}
                className="truncate transition-colors hover:text-primary"
              >
                {item.label}
              </Link>
            ) : (
              <span className="truncate text-foreground">{item.label}</span>
            )}
            {i < items.length - 1 ? <span aria-hidden>/</span> : null}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function Section({
  title,
  description,
  action,
  children,
  className,
  centerTitle,
  titleClassName,
}: {
  title?: string | undefined;
  description?: string | undefined;
  action?: ReactNode | undefined;
  children: ReactNode;
  className?: string | undefined;
  centerTitle?: boolean | undefined;
  titleClassName?: string | undefined;
}) {
  return (
    <section className={cn("mx-auto w-full max-w-6xl px-4 py-8 sm:py-10", className)}>
      {title ? (
        <div
          className={cn(
            "mb-5 grid grid-cols-1 items-end justify-items-center gap-3 text-center",
            !centerTitle &&
              "sm:grid-cols-[minmax(0,1fr)_auto] sm:justify-items-stretch sm:text-left",
          )}
        >
          <div className={cn("min-w-0 max-w-full", centerTitle && "mx-auto")}>
            <h2
              className={cn(
                "text-xl font-bold tracking-tight sm:text-2xl",
                titleClassName,
              )}
            >
              {title}
            </h2>
            {description ? (
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {action ? <div className="shrink-0 sm:justify-self-end">{action}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Prose({ text, className }: { text: string; className?: string }) {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  return (
    <div className={cn("space-y-3 text-[15px] leading-7 text-foreground/90", className)}>
      {paragraphs.map((p, i) => (
        <p key={i}>{p}</p>
      ))}
    </div>
  );
}
