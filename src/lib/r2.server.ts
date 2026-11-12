import { AwsClient } from "aws4fetch";

import { getIntegrationValues } from "./integration-secrets.server";

export type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl: string;
};

/**
 * Admins usually paste the CDN host without a scheme ("cdn.example.com"),
 * which would produce relative, unloadable image URLs. Always store and return
 * an absolute https:// base.
 */
export function normalizePublicBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) return trimmed;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed.replace(/^\/+/, "")}`;
}

/** Reads R2 settings from the admin panel, falling back to environment vars. */
export async function readR2Config(): Promise<R2Config | null> {
  const v = await getIntegrationValues();
  const accountId = v["R2_ACCOUNT_ID"];
  const accessKeyId = v["R2_ACCESS_KEY_ID"];
  const secretAccessKey = v["R2_SECRET_ACCESS_KEY"];
  const bucket = v["R2_BUCKET"];
  const publicBaseUrl = v["R2_PUBLIC_BASE_URL"];
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicBaseUrl) return null;
  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    publicBaseUrl: normalizePublicBaseUrl(publicBaseUrl),
  };
}


function client(cfg: R2Config) {
  return new AwsClient({
    accessKeyId: cfg.accessKeyId,
    secretAccessKey: cfg.secretAccessKey,
    service: "s3",
    region: "auto",
  });
}

function objectUrl(cfg: R2Config, key: string) {
  return `https://${cfg.accountId}.r2.cloudflarestorage.com/${cfg.bucket}/${key
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}

export function publicUrlFor(cfg: R2Config, key: string) {
  return `${cfg.publicBaseUrl}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

const FOLDERS = [
  "products",
  "sub-products",
  "categories",
  "promotions",
  "landing",
  "site",
  "popup",
  "hero",
  "invoices",
] as const;
export type MediaFolder = (typeof FOLDERS)[number];

export function isMediaFolder(value: string): value is MediaFolder {
  return (FOLDERS as readonly string[]).includes(value);
}

export function buildKey(folder: MediaFolder, fileName: string): string {
  const safe =
    fileName
      .toLowerCase()
      .replace(/[^a-z0-9.]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "file";
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${folder}/${stamp}-${rand}-${safe}`;
}

/** Presigned PUT URL the browser uploads the compressed blob to directly. */
export async function signUploadUrl(
  cfg: R2Config,
  key: string,
  contentType: string,
  expiresInSeconds = 600,
): Promise<string> {
  const url = new URL(objectUrl(cfg, key));
  url.searchParams.set("X-Amz-Expires", String(expiresInSeconds));
  const signed = await client(cfg).sign(
    new Request(url, { method: "PUT", headers: { "content-type": contentType } }),
    { aws: { signQuery: true, allHeaders: false } },
  );
  return signed.url;
}

export async function deleteObject(cfg: R2Config, key: string): Promise<void> {
  const res = await client(cfg).fetch(objectUrl(cfg, key), { method: "DELETE" });
  if (!res.ok && res.status !== 404) {
    throw new Error(`R2 delete failed (${res.status})`);
  }
}

/** Server-side upload, used for generated files such as invoice PDFs. */
export async function putObject(
  cfg: R2Config,
  key: string,
  body: ArrayBuffer | Uint8Array | string,
  contentType: string,
): Promise<string> {
  const res = await client(cfg).fetch(objectUrl(cfg, key), {
    method: "PUT",
    body: body as BodyInit,
    headers: { "content-type": contentType },
  });
  if (!res.ok) throw new Error(`R2 upload failed (${res.status})`);
  return publicUrlFor(cfg, key);
}

export type R2Probe = {
  ok: boolean;
  message: string;
  bucket: string;
  publicBaseUrl: string;
  objects: number | null;
  truncated: boolean;
  totalBytes: number | null;
};

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2)} ${units[i]}`;
}

/** Live bucket check — lists objects with the stored credentials and sums their size. */
export async function probeR2(cfg: R2Config): Promise<R2Probe> {
  const base: Omit<R2Probe, "ok" | "message"> = {
    bucket: cfg.bucket,
    publicBaseUrl: cfg.publicBaseUrl,
    objects: null,
    truncated: false,
    totalBytes: null,
  };
  try {
    let token: string | null = null;
    let count = 0;
    let bytes = 0;
    let truncated = false;
    for (let page = 0; page < 20; page += 1) {
      const url = new URL(`https://${cfg.accountId}.r2.cloudflarestorage.com/${cfg.bucket}`);
      url.searchParams.set("list-type", "2");
      url.searchParams.set("max-keys", "1000");
      if (token) url.searchParams.set("continuation-token", token);
      const res = await client(cfg).fetch(url.toString(), { method: "GET" });
      const text = await res.text();
      if (!res.ok) {
        const msg = /<Message>([^<]+)<\/Message>/.exec(text)?.[1];
        return { ...base, ok: false, message: msg ?? `Bucket request failed (${res.status})` };
      }
      count += [...text.matchAll(/<Key>([^<]+)<\/Key>/g)].length;
      for (const m of text.matchAll(/<Size>(\d+)<\/Size>/g)) bytes += Number(m[1] ?? 0);
      const isTruncated = /<IsTruncated>true<\/IsTruncated>/.test(text);
      token = isTruncated
        ? (/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/.exec(text)?.[1] ?? null)
        : null;
      if (!token) break;
      if (page === 19) truncated = true;
    }
    return {
      ...base,
      ok: true,
      message: "Bucket reachable",
      objects: count,
      truncated,
      totalBytes: bytes,
    };
  } catch (err) {
    return { ...base, ok: false, message: err instanceof Error ? err.message : "Unknown error" };
  }
}

/* ------------------------------------------------------------------ */
/* Bucket migration helpers                                            */
/* ------------------------------------------------------------------ */

function decodeXml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export type R2ListPage = { keys: string[]; nextToken: string | null };

/** One page of object keys, oldest-listed first, with a continuation token. */
export async function listObjectsPage(
  cfg: R2Config,
  token: string | null,
  maxKeys = 200,
): Promise<R2ListPage> {
  const url = new URL(`https://${cfg.accountId}.r2.cloudflarestorage.com/${cfg.bucket}`);
  url.searchParams.set("list-type", "2");
  url.searchParams.set("max-keys", String(maxKeys));
  if (token) url.searchParams.set("continuation-token", token);
  const res = await client(cfg).fetch(url.toString(), { method: "GET" });
  const text = await res.text();
  if (!res.ok) {
    const msg = /<Message>([^<]+)<\/Message>/.exec(text)?.[1];
    throw new Error(msg ?? `Listing failed (${res.status})`);
  }
  const keys = [...text.matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) => decodeXml(m[1] ?? ""));
  const next = /<NextContinuationToken>([^<]+)<\/NextContinuationToken>/.exec(text)?.[1];
  return { keys: keys.filter(Boolean), nextToken: next ? decodeXml(next) : null };
}

/** True when the object already exists in the bucket. */
export async function objectExists(cfg: R2Config, key: string): Promise<boolean> {
  const res = await client(cfg).fetch(objectUrl(cfg, key), { method: "HEAD" });
  return res.ok;
}

/** Quick read permission check for a single key. */
export async function probeObjectRead(
  cfg: R2Config,
  key: string,
): Promise<{ ok: boolean; status: number; message: string }> {
  const res = await client(cfg).fetch(objectUrl(cfg, key), { method: "HEAD" });
  if (res.ok) return { ok: true, status: res.status, message: "Readable" };
  const text = await res.text().catch(() => "");
  const msg = /<Message>([^<]+)<\/Message>/.exec(text)?.[1];
  return {
    ok: false,
    status: res.status,
    message: msg ?? `Read failed (${res.status})`,
  };
}

/** Streams one object from the source bucket into the destination bucket. */
export async function copyObjectAcross(
  from: R2Config,
  to: R2Config,
  key: string,
): Promise<void> {
  const res = await client(from).fetch(objectUrl(from, key), { method: "GET" });
  if (!res.ok) throw new Error(`read failed (${res.status})`);
  const contentType = res.headers.get("content-type") ?? "application/octet-stream";
  const body = await res.arrayBuffer();
  await putObject(to, key, body, contentType);
}
