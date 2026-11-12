import { SmartImage } from "@/components/site/smart-image";
import { cn } from "@/lib/utils";

export type SpecItem = {
  label?: string;
  value?: string;
};

type Props = {
  heading: string;
  items: SpecItem[];
  imageUrl?: string | null;
  imageAlt: string;
  className?: string;
};

function Node({ item, side }: { item: SpecItem; side: "left" | "right" }) {
  return (
    <div className={cn("relative flex items-center", side === "left" ? "flex-row" : "flex-row-reverse")}>
      <div
        className={cn(
          "min-w-0 flex-1 rounded-xl border border-primary/25 bg-white px-3 py-2.5 shadow-[0_10px_24px_-22px_rgba(0,0,0,0.5)]",
          side === "left" ? "text-right" : "text-left",
        )}
      >
        {item.value ? (
          <p className="lp-fat-bn text-[13px] leading-[1.5] text-foreground sm:text-[15px]">{item.value}</p>
        ) : null}
      </div>

      {/* connector arm into the central spine */}
      <span aria-hidden className="flex shrink-0 items-center">
        <span className="h-[1.5px] w-4 bg-primary/60 sm:w-8" />
        <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
      </span>
    </div>
  );
}

export function SpecShowcase({ heading, items, imageUrl, imageAlt, className }: Props) {
  if (items.length === 0) return null;
  const half = Math.ceil(items.length / 2);
  const left = items.slice(0, half);
  const right = items.slice(half);

  return (
    <section className={cn("relative", className)}>
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-8 h-64 w-64 -translate-x-1/2 rounded-full bg-accent/[0.08] blur-3xl"
      />

      <div className="relative text-center">
        <h2 className="lp-headline text-[28px] leading-[1.2] sm:text-[42px] sm:leading-[1.15]">
          <span className="lp-slant text-gradient-lp inline-block">{heading}</span>
        </h2>
        <div aria-hidden className="mx-auto mt-3 flex items-center justify-center gap-2">
          <span className="h-px w-12 bg-linear-to-r from-transparent to-accent" />
          <span className="h-2 w-2 rotate-45 bg-linear-to-br from-primary to-accent" />
          <span className="h-px w-12 bg-linear-to-l from-transparent to-accent" />
        </div>
      </div>

      {/* product image in the middle, top of the diagram */}
      {imageUrl ? (
        <div className="relative mx-auto mt-6 w-fit">
          <div className="relative h-44 w-44 sm:h-60 sm:w-60">
            <span
              aria-hidden
              className="absolute inset-0 rounded-full bg-linear-to-br from-primary/10 via-transparent to-accent/15"
            />
            <span aria-hidden className="absolute inset-1.5 rounded-full border border-primary/15" />
            <SmartImage
              src={imageUrl}
              alt={imageAlt}
              baseWidth={320}
              className="relative h-full w-full rounded-full object-cover p-2.5"
            />
          </div>
          {/* stem down to the spine */}
          <span aria-hidden className="mx-auto block h-6 w-[1.5px] bg-primary/60" />
        </div>
      ) : null}

      {/* connected diagram: central spine with left / right nodes */}
      <div className="relative mt-0">
        <span
          aria-hidden
          className="absolute left-1/2 top-2 bottom-2 w-[1.5px] -translate-x-1/2 bg-primary/60"
        />

        <div className="relative grid grid-cols-2 gap-x-0">
          <div className="grid gap-3 pr-0">
            {left.map((item, i) => (
              <Node key={`l-${i}`} item={item} side="left" />
            ))}
          </div>
          <div className="grid translate-y-6 gap-3">
            {right.map((item, i) => (
              <Node key={`r-${i}`} item={item} side="right" />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
