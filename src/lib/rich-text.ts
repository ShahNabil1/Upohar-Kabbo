/**
 * Tiny allow-list sanitizer for the admin rich-text editor output.
 * Runs on both server (SSR) and client, no dependencies.
 */

const ALLOWED_TAGS = new Set([
  "p",
  "br",
  "hr",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "strike",
  "del",
  "ul",
  "ol",
  "li",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "blockquote",
  "code",
  "pre",
  "span",
  "mark",
  "sub",
  "sup",
  "a",
]);

const VOID_TAGS = new Set(["br", "hr"]);

const ALLOWED_STYLE_PROPS = new Set([
  "color",
  "background-color",
  "font-size",
  "font-family",
  "font-weight",
  "font-style",
  "text-align",
  "text-decoration",
  "line-height",
]);

function sanitizeStyle(value: string): string {
  return value
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const idx = part.indexOf(":");
      if (idx < 0) return "";
      const prop = part.slice(0, idx).trim().toLowerCase();
      const val = part.slice(idx + 1).trim();
      if (!ALLOWED_STYLE_PROPS.has(prop)) return "";
      if (/url\s*\(|expression|javascript:|@import/i.test(val)) return "";
      return `${prop}: ${val}`;
    })
    .filter(Boolean)
    .join("; ");
}

function sanitizeAttrs(tag: string, raw: string): string {
  const out: string[] = [];
  const attrRe = /([a-zA-Z-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let m: RegExpExecArray | null;
  while ((m = attrRe.exec(raw))) {
    const name = (m[1] ?? "").toLowerCase();
    const value = m[3] ?? m[4] ?? "";
    if (name === "style") {
      const style = sanitizeStyle(value);
      if (style) out.push(`style="${style}"`);
    } else if (name === "href" && tag === "a") {
      if (/^(https?:|mailto:|tel:|\/|#)/i.test(value.trim())) {
        out.push(`href="${value.trim().replace(/"/g, "&quot;")}"`);
        out.push(`target="_blank"`, `rel="noopener noreferrer nofollow"`);
      }
    }
  }
  return out.length ? ` ${out.join(" ")}` : "";
}

/** Strip every tag/attribute that is not explicitly allowed. */
export function sanitizeRichText(html: string): string {
  if (!html) return "";
  let clean = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\s*(script|style|iframe|object|embed|link|meta)[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|style|iframe|object|embed|link|meta)\b[^>]*\/?>/gi, "");

  clean = clean.replace(/<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (_all, slash, name, attrs) => {
    const tag = String(name).toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return "";
    if (slash) return `</${tag}>`;
    if (VOID_TAGS.has(tag)) return `<${tag} />`;
    return `<${tag}${sanitizeAttrs(tag, String(attrs))}>`;
  });

  return clean;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** True when the stored value already carries editor markup. */
export function isHtmlContent(value: string): boolean {
  return /<\/?[a-zA-Z][\s\S]*>/.test(value);
}

/** Legacy plain-text values become paragraphs so old products keep working. */
export function toRichHtml(value: string | null | undefined): string {
  const text = (value ?? "").trim();
  if (!text) return "";
  if (isHtmlContent(text)) return sanitizeRichText(text);
  return text
    .split(/\n{2,}/)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br />")}</p>`)
    .join("");
}

/** Plain-text preview (meta descriptions, cards, feeds). */
export function richTextToPlain(value: string | null | undefined): string {
  const html = (value ?? "").trim();
  if (!html) return "";
  if (!isHtmlContent(html)) return html;
  return html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*\/\s*(p|div|li|h[1-6]|blockquote)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** True when the html has no visible content (empty editor state). */
export function isRichTextEmpty(value: string | null | undefined): boolean {
  return richTextToPlain(value).length === 0 && !/<(img|hr)\b/i.test(value ?? "");
}
