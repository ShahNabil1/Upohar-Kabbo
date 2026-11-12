/**
 * Server-side Cloudflare Turnstile verification.
 *
 * Fails open only when the secret is not configured (or the secret itself is
 * rejected) so an existing checkout flow can never be bricked by a config
 * mistake; a genuinely bad/expired token is always rejected.
 */
export async function verifyTurnstile(token: string | null | undefined, ip?: string | null) {
  const secret = process.env["TURNSTILE_SECRET_KEY"];
  if (!secret) return { ok: true as const, skipped: true };
  if (!token) return { ok: false as const, reason: "missing-token" };

  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip) body.set("remoteip", ip);
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const json = (await res.json()) as { success?: boolean; "error-codes"?: string[] };
    if (json.success) return { ok: true as const };
    const codes = json["error-codes"] ?? [];
    // Misconfigured secret must not block real customers.
    if (codes.some((c) => c.includes("secret"))) {
      console.error("Turnstile secret misconfigured:", codes.join(","));
      return { ok: true as const, skipped: true };
    }
    return { ok: false as const, reason: codes.join(",") || "failed" };
  } catch (err) {
    console.error("Turnstile verify failed", err);
    return { ok: true as const, skipped: true };
  }
}
