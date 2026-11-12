const r2Asset = { url: "https://cdn.upoharkabbo.com/brand-logos/cloudflare-r2.png" };
const bulksmsbdAsset = { url: "https://cdn.upoharkabbo.com/brand-logos/bulksmsbd.png" };
const bdCourierAsset = { url: "https://cdn.upoharkabbo.com/brand-logos/bd-courier.png" };
const metaAsset = { url: "https://cdn.upoharkabbo.com/brand-logos/meta.png" };
const gtmAsset = { url: "https://cdn.upoharkabbo.com/brand-logos/gtm.png" };
const ga4Asset = { url: "https://cdn.upoharkabbo.com/brand-logos/ga4.png" };
const tiktokAsset = { url: "https://cdn.upoharkabbo.com/brand-logos/tiktok-ads.jpg" };

import { cn } from "@/lib/utils";
import type { IntegrationGroup } from "@/lib/integrations-shared";

const MARKS: Record<
  IntegrationGroup,
  { label: string; src: string; ring: string; imgClass: string }
> = {
  r2: {
    label: "Cloudflare R2",
    src: r2Asset.url,
    ring: "ring-[#F6821F]/30 bg-[#F6821F]",
    imgClass: "size-full object-cover",
  },
  meta: {
    label: "Meta Marketing API",
    src: metaAsset.url,
    ring: "ring-[#0866FF]/25 bg-white",
    imgClass: "w-[88%] object-contain",
  },
  bulksmsbd: {
    label: "BulkSMSBD",
    src: bulksmsbdAsset.url,
    ring: "ring-[#1F3B99]/25 bg-white",
    imgClass: "w-[86%] object-contain",
  },
  bdcourier: {
    label: "BD Courier",
    src: bdCourierAsset.url,
    ring: "ring-[#E0218A]/25 bg-white",
    imgClass: "w-[88%] object-contain",
  },
  gtm: {
    label: "Google Tag Manager",
    src: gtmAsset.url,
    ring: "ring-[#4285F4]/25 bg-white",
    imgClass: "w-[86%] object-contain",
  },
  metacapi: {
    label: "Meta Conversions API",
    src: metaAsset.url,
    ring: "ring-[#0866FF]/25 bg-white",
    imgClass: "w-[88%] object-contain",
  },
  tiktok: {
    label: "TikTok Events API",
    src: tiktokAsset.url,
    ring: "ring-[#FE2C55]/25 bg-white",
    imgClass: "size-full object-cover",
  },
  ga4: {
    label: "Google Analytics 4",
    src: ga4Asset.url,
    ring: "ring-[#F9AB00]/25 bg-white",
    imgClass: "w-[80%] object-contain",
  },
};


export function IntegrationMark({
  group,
  className,
}: {
  group: IntegrationGroup;
  className?: string;
}) {
  const m = MARKS[group];
  if (!m) return null;
  return (
    <span
      className={cn(
        "grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl ring-1",
        m.ring,
        className,
      )}
    >
      <img src={m.src} alt={`${m.label} logo`} className={m.imgClass} />
    </span>
  );
}
