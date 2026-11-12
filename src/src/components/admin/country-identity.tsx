import { Globe } from "lucide-react";
import { resolveCountry } from "@/lib/country";

const FLAG_CDN = "https://cdn.upoharkabbo.com/country-flags";
const FLAG_CODES = new Set("AC AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BQ-BO BQ-SA BQ-SE BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ES-CT ET EU FI FJ FK FM FO FR GA GB GB-ENG GB-NIR GB-SCT GB-WLS GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU IC ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TA TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS XA XC XK XO YE YT ZA ZM ZW".split(" "));

export function CountryIdentity({ country }: { country: unknown }) {
  const resolved = resolveCountry(country);
  if (!resolved) {
    return <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
      <Globe aria-hidden="true" className="size-5" />
      <span>{typeof country === "string" && country.trim() && !["XX", "T1"].includes(country.trim().toUpperCase()) ? country : "Country unavailable"}</span>
    </div>;
  }
  const flag = FLAG_CODES.has(resolved.code) ? `${FLAG_CDN}/${resolved.code}.svg` : undefined;
  return <div className="mt-3 flex min-w-0 items-center gap-3">
    <span className="country-flag-frame relative inline-flex h-9 w-14 shrink-0 items-center justify-center">
      {flag ? <img src={flag} alt={`${resolved.name} flag`} width={54} height={36}
        className="country-flag h-full w-full rounded-sm border border-border object-contain" />
        : <Globe aria-hidden="true" className="size-6 text-muted-foreground" />}
    </span>
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="rounded-sm bg-secondary px-1.5 py-0.5 font-mono text-xs font-bold text-secondary-foreground">{resolved.code}</span>
        <span className="break-words text-sm font-semibold text-foreground">{resolved.name}</span>
      </div>
    </div>
  </div>;
}