import { Copy, Megaphone } from "lucide-react";
import { toast } from "sonner";

import { Panel } from "@/components/admin/kit";
import { channelOf, type Attribution, type AttributionPayload } from "@/lib/attribution";
import { cn } from "@/lib/utils";

const CHANNEL_STYLE: Record<string, string> = {
  meta: "bg-[#0866FF]/10 text-[#0866FF] border-[#0866FF]/25",
  meta_organic: "bg-[#0866FF]/10 text-[#0866FF] border-[#0866FF]/25",
  google_ads: "bg-amber-500/10 text-amber-600 border-amber-500/25",
  google: "bg-amber-500/10 text-amber-600 border-amber-500/25",
  organic_search: "bg-emerald-500/10 text-emerald-600 border-emerald-500/25",
  tiktok: "bg-foreground/10 text-foreground border-border",
  direct: "bg-muted text-muted-foreground border-border",
};

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean | undefined }) {
  return (
    <div className="flex min-w-0 items-start justify-between gap-3 py-1">
      <dt className="shrink-0 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="flex min-w-0 flex-1 items-center justify-end gap-1.5">
        <span className={cn("min-w-0 flex-1 truncate text-right text-xs font-semibold", mono && "font-mono text-[11px]")}> 
          {value}
        </span>
        <button
          type="button"
          title="Copy"
          onClick={() => {
            void navigator.clipboard.writeText(value);
            toast.success(`${label} copied`);
          }}
          className="rounded p-0.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          <Copy className="size-3" />
        </button>
      </dd>
    </div>
  );
}

function Touch({ title, data }: { title: string; data: Attribution }) {
  const channel = data.channel ?? channelOf(data);
  const rows: Array<[string, string | undefined, boolean?]> = [
    ["Campaign", data.utm_campaign ?? data.campaign_name],
    ["Campaign ID", data.campaign_id, true],
    ["Ad set", data.adset_name],
    ["Ad set ID", data.adset_id, true],
    ["Ad", data.ad_name],
    ["Ad ID", data.ad_id, true],
    ["Placement", data.placement],
    ["Source", data.utm_source],
    ["Medium", data.utm_medium],
    ["Content", data.utm_content],
    ["Term", data.utm_term],
    ["fbclid", data.fbclid, true],
    ["_fbc", data.fbc, true],
    ["_fbp", data.fbp, true],
    ["gclid", data.gclid, true],
    ["ttclid", data.ttclid, true],
    ["Referrer", data.referrer],
    ["Landing page", data.landing_page],
  ];
  const present = rows.filter((r): r is [string, string, boolean?] => Boolean(r[1]));

  return (
    <div className="rounded-lg border border-border bg-card/50 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-bold text-foreground">{title}</p>
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
            CHANNEL_STYLE[channel] ?? "bg-muted text-muted-foreground border-border",
          )}
        >
          {channel.replace(/_/g, " ")}
        </span>
      </div>
      {present.length ? (
        <dl className="divide-y divide-dashed divide-border/70">
          {present.map(([label, value, mono]) => (
            <Row key={label} label={label} value={value} mono={mono} />
          ))}
        </dl>
      ) : (
        <p className="text-xs text-muted-foreground">No tracking parameters on this visit.</p>
      )}
    </div>
  );
}

/** Order source + full marketing attribution (UTM, fbclid/fbc/fbp, campaign ids). */
export function OrderSourcePanel({
  source,
  attribution,
}: {
  source: string;
  attribution?: AttributionPayload | null | undefined;
}) {
  const last = attribution?.last;
  const first = attribution?.first;
  const sameTouch =
    !!last && !!first && JSON.stringify({ ...first, captured_at: "" }) === JSON.stringify({ ...last, captured_at: "" });

  return (
    <Panel className="space-y-3">
      <div className="flex items-center gap-2">
        <Megaphone className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-bold">Order Source</h2>
      </div>
      <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-semibold text-foreground">
        {source}
      </span>

      {last ? (
        <div className="space-y-2.5">
          <Touch title={sameTouch ? "Attribution" : "Last touch (converting click)"} data={last} />
          {!sameTouch && first ? <Touch title="First touch (discovery)" data={first} /> : null}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          No campaign data captured for this order — the visitor arrived without tracking parameters,
          or the order was created before attribution tracking was enabled.
        </p>
      )}
    </Panel>
  );
}
