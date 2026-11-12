export async function getRequestSecurityContext() {
  const { getRequestHeader, getRequestIP } = await import("@tanstack/react-start/server");
  let ip: string | null = null;
  let userAgent: string | null = null;
  let location: Record<string, string> = {};
  try {
    const cloudflareIp = getRequestHeader("cf-connecting-ip")?.trim();
    const forwardedIp = getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim();
    const realIp = getRequestHeader("x-real-ip")?.trim();
    ip = cloudflareIp || forwardedIp || realIp || getRequestIP({ xForwardedFor: true }) || null;
    userAgent = (getRequestHeader("user-agent") ?? "").slice(0, 500) || null;
    // Cloudflare headers first (current hosting), Vercel headers as fallback
    // so the same build keeps visitor location when served from Vercel.
    const headers: Array<[string, string, string]> = [
      ["country", "cf-ipcountry", "x-vercel-ip-country"],
      ["region", "cf-region", "x-vercel-ip-country-region"],
      ["city", "cf-ipcity", "x-vercel-ip-city"],
      ["postalCode", "cf-postal-code", "x-vercel-ip-postal-code"],
      ["timezone", "cf-timezone", "x-vercel-ip-timezone"],
      ["latitude", "cf-latitude", "x-vercel-ip-latitude"],
      ["longitude", "cf-longitude", "x-vercel-ip-longitude"],
    ];
    location = Object.fromEntries(headers.flatMap(([key, cfHeader, vercelHeader]) => {
      const value = getRequestHeader(cfHeader)?.trim() || decodeHeader(getRequestHeader(vercelHeader));
      return value ? [[key, value]] : [];
    }));
  } catch {
    // Local preview and prerender may not provide a request context.
  }
  return { ip, userAgent, location };
}

/** Vercel URL-encodes non-ASCII values such as city names. */
function decodeHeader(value: string | undefined): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return "";
  try {
    return decodeURIComponent(trimmed);
  } catch {
    return trimmed;
  }
}
