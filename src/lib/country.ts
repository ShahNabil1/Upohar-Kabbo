import { countries } from "country-flag-icons";

const names = new Intl.DisplayNames(["en"], { type: "region" });
function countryName(code: string) {
  try { return names.of(code) ?? code; }
  catch { return code; }
}

export function resolveCountry(value: unknown): { code: string; name: string } | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const input = value.trim();
  const upper = input.toUpperCase();
  if (["XX", "T1"].includes(upper)) return null;
  const alias = upper === "UK" ? "GB" : upper;
  const code = countries.includes(alias)
    ? alias
    : countries.find((candidate) => countryName(candidate).toLowerCase() === input.toLowerCase());
  if (!code) return null;
  return { code, name: countryName(code) };
}