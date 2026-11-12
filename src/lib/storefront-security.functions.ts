import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const securityInput = z.object({
  fingerprint: z.string().trim().min(16).max(128).nullable().optional(),
  phone: z.string().trim().max(20).nullable().optional(),
});

export const checkStorefrontAccess = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => securityInput.parse(input))
  .handler(async ({ data }) => {
    const { getRequestSecurityContext } = await import("./request-security.server");
    const { ip } = await getRequestSecurityContext();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const candidates = [
      ip ? { kind: "ip", value: ip } : null,
      data.fingerprint ? { kind: "fingerprint", value: data.fingerprint } : null,
      data.phone ? { kind: "phone", value: data.phone } : null,
    ].filter((entry): entry is { kind: string; value: string } => Boolean(entry));
    if (!candidates.length) return { blocked: false };
    const values = [...new Set(candidates.map((entry) => entry.value))];
    const { data: matches, error } = await supabaseAdmin
      .from("blocked_identifiers")
      .select("kind, value")
      .in("value", values);
    if (error) throw new Error("SECURITY_CHECK_FAILED");
    const blocked = (matches ?? []).some((match) =>
      candidates.some((candidate) => candidate.kind === match.kind && candidate.value === match.value),
    );
    return { blocked };
  });