const STORAGE_KEY = "upoharkabbo_device_id_v1";

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function getBrowserFingerprint(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  try {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;
    const screenInfo = `${window.screen.width}x${window.screen.height}x${window.screen.colorDepth}`;
    const signals = [
      navigator.userAgent,
      navigator.language,
      navigator.languages.join(","),
      navigator.platform,
      String(navigator.hardwareConcurrency ?? ""),
      String(navigator.maxTouchPoints ?? ""),
      screenInfo,
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    ].join("|");
    const fingerprint = await sha256(signals);
    window.localStorage.setItem(STORAGE_KEY, fingerprint);
    return fingerprint;
  } catch {
    return null;
  }
}