import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Layers,
  PackageSearch,
  RefreshCw,
  Radio,
  TriangleAlert,
  Users2,
} from "lucide-react";

import { marketingAudiences } from "@/lib/marketing.functions";
import type { AudienceRow } from "@/lib/marketing-shared";
import { AdminHeading, Panel } from "@/components/admin/kit";
import { BrandLoader } from "@/components/admin/brand-loader";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/marketing/audiences")({
  component: MarketingAudiencesPage,
});

const num = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: 0 });

const subtypeLabel: Record<string, string> = {
  CUSTOM: "Custom",
  WEBSITE: "Website visitors",
  LOOKALIKE: "Lookalike",
  ENGAGEMENT: "Engagement",
  APP: "App activity",
  OFFLINE_CONVERSION: "Offline",
  VIDEO: "Video viewers",
};

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Panel>
      <div className="mb-3">
        <h2 className="text-sm font-bold tracking-tight">{title}</h2>
        {description ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children}
    </Panel>
  );
}

function AudienceCard({ row }: { row: AudienceRow }) {
  return (
    <div className="rounded-xl border border-border/70 bg-card/60 p-4 transition-colors hover:border-primary/40">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{row.name}</p>
          <p className="mt-0.5 text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
            {subtypeLabel[(row.subtype ?? "").toUpperCase()] ?? row.subtype ?? "Audience"}
            {row.retentionDays ? ` · ${row.retentionDays}d retention` : ""}
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
            row.ready
              ? "bg-emerald-500/10 text-emerald-600"
              : "bg-amber-500/10 text-amber-600",
          )}
        >
          {row.ready ? "Ready" : "Too small"}
        </span>
      </div>

      <div className="mt-3 flex items-end justify-between gap-3">
        <div>
          <p className="text-2xl font-bold tabular-nums">{num(row.approximateCount)}</p>
          <p className="text-[11px] text-muted-foreground">approx. people</p>
        </div>
        <div className="text-right text-[11px] text-muted-foreground">
          <p>{row.deliveryStatus ?? row.operationStatus ?? "—"}</p>
          {row.updatedAt ? (
            <p>updated {new Date(row.updatedAt).toLocaleDateString("en-GB")}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function MarketingAudiencesPage() {
  const { data, isFetching, refetch } = useQuery({
    queryKey: ["marketing", "audiences"],
    queryFn: () => marketingAudiences({ data: {} }),
    staleTime: 60_000,
  });

  if (!data) {
    return (
      <div className="space-y-6">
        <AdminHeading title="Audiences & Catalog" description="Retargeting pools, catalog and pixel health" />
        <BrandLoader />
      </div>
    );
  }

  const pixel = data.pixel;
  const catalog = data.catalog;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <AdminHeading
          title="Audiences & Catalog"
          description="Retargeting pools, catalog and pixel health"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="gap-2"
        >
          <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {!data.connected ? (
        <Section title="Not connected">
          <div className="flex items-start gap-3 text-sm text-muted-foreground">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <p>{data.message ?? "Meta Marketing API is unavailable."}</p>
          </div>
        </Section>
      ) : (
        <>
          {data.recommendations.length ? (
            <Section title="What to fix next">
              <ul className="space-y-2">
                {data.recommendations.map((r, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm">
                    {r.tone === "good" ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    ) : (
                      <AlertTriangle
                        className={cn(
                          "mt-0.5 h-4 w-4 shrink-0",
                          r.tone === "critical" ? "text-rose-600" : "text-amber-600",
                        )}
                      />
                    )}
                    <span className="text-muted-foreground">{r.text}</span>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            <Section title="Pixel / dataset health">
              {pixel ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-full bg-primary/10 text-primary">
                      <Radio className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold">{pixel.name ?? pixel.id}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {pixel.lastFiredAt
                          ? `Last event ${pixel.hoursSinceLastEvent ?? 0}h ago`
                          : "No events recorded yet"}
                      </p>
                    </div>
                  </div>
                  {pixel.events.length ? (
                    <div className="space-y-1.5">
                      {pixel.events.map((e) => (
                        <div
                          key={e.name}
                          className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-1.5 text-xs"
                        >
                          <span className="font-medium">{e.name}</span>
                          <span className="tabular-nums text-muted-foreground">{num(e.count)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Event breakdown is not available for this dataset yet.
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Pixel data unavailable.</p>
              )}
            </Section>

            <Section title="Catalog health">
              {catalog.configured ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-full bg-primary/10 text-primary">
                      <PackageSearch className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold">{catalog.name ?? catalog.id}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {num(catalog.productCount)} products · {num(catalog.productSets)} product sets
                      </p>
                    </div>
                  </div>
                  {catalog.issues.length ? (
                    <ul className="space-y-1.5">
                      {catalog.issues.slice(0, 6).map((issue, i) => (
                        <li
                          key={i}
                          className="flex items-start justify-between gap-3 rounded-lg bg-muted/50 px-3 py-2 text-xs"
                        >
                          <span className="min-w-0">
                            <span
                              className={cn(
                                "mr-2 font-bold uppercase",
                                issue.severity === "critical" ? "text-rose-600" : "text-amber-600",
                              )}
                            >
                              {issue.severity}
                            </span>
                            {issue.title}
                          </span>
                          <span className="shrink-0 tabular-nums text-muted-foreground">
                            {num(issue.affectedCount)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="flex items-center gap-2 text-xs text-emerald-600">
                      <CheckCircle2 className="h-4 w-4" /> No catalog issues reported.
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Add a Catalog ID in API &amp; Integrations to monitor Dynamic Product Ads.
                </p>
              )}
            </Section>
          </div>

          <Section
            title="Custom audiences"
            description={`${data.audiences.length} audience(s) on this ad account`}
          >
            {data.audiences.length ? (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {data.audiences.map((row) => (
                  <AudienceCard key={row.id} row={row} />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <Users2 className="h-8 w-8 text-muted-foreground/60" />
                <p className="text-sm font-medium">No custom audiences yet</p>
                <p className="max-w-md text-xs text-muted-foreground">
                  Create a website-visitor audience and a purchaser list in Meta Ads Manager —
                  they power retargeting, exclusions and Lookalikes.
                </p>
              </div>
            )}
          </Section>

          <Section title="Playbook" description="How to use these pools">
            <div className="grid gap-3 text-sm md:grid-cols-3">
              {[
                {
                  icon: Layers,
                  title: "Exclude buyers",
                  text: "Add your 30-day purchaser audience as an exclusion on prospecting ad sets so cold budget never re-targets existing customers.",
                },
                {
                  icon: Users2,
                  title: "1% Lookalike",
                  text: "Seed a Lookalike from delivered purchasers (not all leads) — delivery-verified value gives Meta the cleanest signal.",
                },
                {
                  icon: PackageSearch,
                  title: "DPA retargeting",
                  text: "Point a catalog sales campaign at ViewContent + AddToCart in the last 14 days, excluding purchasers.",
                },
              ].map((c) => (
                <div key={c.title} className="rounded-xl border border-border/70 bg-card/60 p-4">
                  <c.icon className="h-4 w-4 text-primary" />
                  <p className="mt-2 text-sm font-semibold">{c.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{c.text}</p>
                </div>
              ))}
            </div>
          </Section>
        </>
      )}
    </div>
  );
}
