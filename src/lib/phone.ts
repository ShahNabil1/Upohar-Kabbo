/**
 * Phone input helpers.
 * - Converts Bangla (০-৯) and Arabic-Indic (٠-٩) digits to English digits.
 * - Strips any symbol/letter so only digits remain.
 */

const DIGIT_MAP: Record<string, string> = {
  "০": "0", "১": "1", "২": "2", "৩": "3", "৪": "4",
  "৫": "5", "৬": "6", "৭": "7", "৮": "8", "৯": "9",
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
  "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
};

/** Convert any non-English digit characters to English digits. */
export function toEnglishDigits(value: string): string {
  return value.replace(/[০-৯٠-٩]/g, (d) => DIGIT_MAP[d] ?? d);
}

/**
 * Normalize a customer phone field: English digits only, no symbols,
 * capped at 11 characters (Bangladeshi mobile format 01XXXXXXXXX).
 */
export function normalizePhoneInput(value: string, maxLength = 11): string {
  return toEnglishDigits(value).replace(/\D/g, "").slice(0, maxLength);
}

/**
 * Looser normalization for display/contact numbers: allows a leading +,
 * digits, spaces and dashes, but no other symbols and no Bangla digits.
 */
export function normalizeContactPhoneInput(value: string): string {
  const converted = toEnglishDigits(value);
  const plus = converted.trimStart().startsWith("+") ? "+" : "";
  return plus + converted.replace(/[^\d\s-]/g, "").slice(0, 24);
}
