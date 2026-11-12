import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdmin } from "@/lib/admin.server";

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

const uploadInput = z.object({
  folder: z.enum([
    "products",
    "sub-products",
    "categories",
    "promotions",
    "landing",
    "site",
    "popup",
    "hero",
  ]),
  fileName: z.string().min(1).max(120),
  contentType: z.enum(["image/webp", "image/jpeg", "image/png", "image/svg+xml", "image/gif"]),
  size: z.number().int().positive().max(MAX_UPLOAD_BYTES),
});

export type MediaUploadTicket = {
  uploadUrl: string;
  publicUrl: string;
  key: string;
};

/** Admin-only: returns a short-lived presigned PUT URL for a direct browser upload. */
export const createUploadTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => uploadInput.parse(data))
  .handler(async ({ data, context }): Promise<MediaUploadTicket> => {
    await requireAdmin(context.supabase, context.userId);
    const { readR2Config, buildKey, signUploadUrl, publicUrlFor } = await import("@/lib/r2.server");
    const cfg = await readR2Config();
    if (!cfg) throw new Error("R2 কনফিগার করা নেই। সেটিংসে R2 সিক্রেটগুলো যোগ করুন।");

    const key = buildKey(data.folder, data.fileName);
    return {
      uploadUrl: await signUploadUrl(cfg, key, data.contentType),
      publicUrl: publicUrlFor(cfg, key),
      key,
    };
  });

/** Admin-only: removes an object from the bucket. */
export const deleteUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ key: z.string().min(1) }).parse(data))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { readR2Config, deleteObject } = await import("@/lib/r2.server");
    const cfg = await readR2Config();
    if (!cfg) throw new Error("R2 কনফিগার করা নেই।");
    await deleteObject(cfg, data.key);
    return { ok: true };
  });

/**
 * Admin-only: permanently deletes an uploaded image from R2 using its public
 * URL. Foreign URLs (not on the configured public base) are skipped so the
 * caller can still drop the link from the database.
 */
export const deleteUploadByUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ url: z.string().min(1) }).parse(data))
  .handler(async ({ data, context }): Promise<{ deleted: boolean; reason?: string }> => {
    await requireAdmin(context.supabase, context.userId);
    const { readR2Config, deleteObject } = await import("@/lib/r2.server");
    const cfg = await readR2Config();
    if (!cfg) throw new Error("R2 কনফিগার করা নেই।");

    let key: string | null = null;
    try {
      const base = new URL(cfg.publicBaseUrl);
      const target = new URL(data.url, cfg.publicBaseUrl);
      if (target.host === base.host) {
        const basePath = base.pathname.replace(/\/+$/, "");
        const path = target.pathname.startsWith(`${basePath}/`)
          ? target.pathname.slice(basePath.length)
          : target.pathname;
        // Transformed delivery URLs (/cdn-cgi/image/…/key) still point at the original object.
        const cleaned = path.replace(/^\/cdn-cgi\/image\/[^/]+/, "");
        key = decodeURIComponent(cleaned.replace(/^\/+/, "")) || null;
      }
    } catch {
      key = null;
    }

    if (!key) return { deleted: false, reason: "not-an-r2-url" };
    await deleteObject(cfg, key);
    return { deleted: true };
  });


/** Admin-only: tells the UI whether media uploads are available yet. */
export const getMediaStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { readR2Config } = await import("@/lib/r2.server");
    return { configured: (await readR2Config()) !== null };
  });
