import type { LandingPageInput } from "@/lib/admin-schema";

export function emptyLanding(): LandingPageInput {
  return {
    product_id: "",
    slug: "",
    headline_bn: null,
    headline_en: null,
    subheadline_bn: null,
    subheadline_en: null,
    meta_title: null,
    meta_description: null,
    og_image_url: null,
    is_active: false,
    seo: {
      ogTitle: null,
      ogDescription: null,
      canonicalUrl: null,
      productJsonLd: true,
      noindex: false,
    },
    bullets: [],
  };
}

export function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u0980-\u09FF]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function validateLanding(
  draft: LandingPageInput,
  pages: Array<{ id: string; slug: string }>,
) {
  const errors: string[] = [];
  if (!draft.product_id) errors.push("একটি প্রোডাক্ট নির্বাচন করুন।");
  if (!draft.slug.trim()) errors.push("পেইজের URL দিন।");
  if (pages.some((page) => page.id !== draft.id && page.slug === draft.slug))
    errors.push("এই URL ইতোমধ্যে ব্যবহার হয়েছে। অন্য URL দিন।");
  for (const [label, value] of [
    ["Canonical URL", draft.seo.canonicalUrl],
    ["OG image", draft.og_image_url],
  ]) {
    if (!value) continue;
    try {
      if (new URL(value).protocol !== "https:") errors.push(`${label}: https:// লিংক দিন।`);
    } catch {
      errors.push(`${label}: সঠিক পূর্ণ লিংক দিন।`);
    }
  }
  if (draft.bullets.some((b) => !b.bn.trim() && !b.en.trim()))
    errors.push("খালি হাইলাইট পূরণ করুন অথবা সরিয়ে দিন।");
  return errors;
}

export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const next = list.slice();
  const [item] = next.splice(from, 1);
  if (item === undefined) return list;
  next.splice(to, 0, item);
  return next;
}
