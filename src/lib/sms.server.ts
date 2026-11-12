import type { Db } from "./admin.server";
import { getIntegrationValues } from "./integration-secrets.server";

/**
 * BulkSMSBD gateway helper.
 * Docs: POST http://bulksmsbd.net/api/smsapi  { api_key, senderid, number, message }
 * Balance: GET  http://bulksmsbd.net/api/getBalanceApi?api_key=...
 */

const SMS_API_URL = "http://bulksmsbd.net/api/smsapi";
const BALANCE_API_URL = "http://bulksmsbd.net/api/getBalanceApi";

/** Official BulkSMSBD response code meanings. */
export const smsCodeMeanings: Record<number, string> = {
  202: "SMS Submitted Successfully",
  1001: "Invalid Number",
  1002: "Sender ID not correct / Sender ID is disabled",
  1003: "Please required all fields / Contact your system administrator",
  1005: "Internal Error",
  1006: "Balance Validity Not Available",
  1007: "Balance Insufficient",
  1011: "User ID not found",
  1012: "Masking SMS must be sent in Bengali",
  1013: "Sender ID has not found Gateway by API key",
  1014: "Sender Type Name not found using this sender by API key",
  1015: "Sender ID has not found any valid Gateway by API key",
  1016: "Sender Type Name active price info not found by this sender ID",
  1017: "Sender Type Name price info not found by this sender ID",
  1018: "The owner of this account is disabled",
  1019: "The sender type price of this account is disabled",
  1020: "The parent of this account is not found",
  1021: "The parent active sender type price of this account is not found",
  1031: "Your account is not verified, please contact administrator",
  1032: "IP not whitelisted",
};

export function smsCodeMessage(code: number | null): string {
  if (code === null) return "Unknown gateway response";
  return smsCodeMeanings[code] ?? `Unknown response code ${code}`;
}

/** Bangla text needs UCS-2 segmentation (70 chars/part vs 160 for GSM-7). */
export function smsSegments(message: string): number {
  const isUnicode = /[^\u0000-\u007F]/.test(message);
  const single = isUnicode ? 70 : 160;
  const multi = isUnicode ? 67 : 153;
  if (message.length <= single) return 1;
  return Math.ceil(message.length / multi);
}

/** Normalises a Bangladeshi number to the 8801XXXXXXXXX form the gateway expects. */
export function normalizeBdPhone(input: string): string {
  const digits = input.replace(/\D/g, "");
  if (digits.startsWith("880")) return digits;
  if (digits.startsWith("0")) return `88${digits}`;
  if (digits.startsWith("1")) return `880${digits}`;
  return digits;
}

export type SmsResult = {
  ok: boolean;
  code: number | null;
  message: string;
  raw: string;
  segments: number;
};

function parseCode(raw: string): number | null {
  try {
    const json = JSON.parse(raw) as { response_code?: unknown };
    const c = Number(json.response_code);
    if (Number.isFinite(c)) return c;
  } catch {
    /* fall through to text parsing */
  }
  const m = raw.match(/\b(202|1\d{3})\b/);
  return m ? Number(m[1]) : null;
}

/** Sends one SMS through BulkSMSBD and maps the provider code to a human message. */
export async function sendBulkSms(phone: string, message: string): Promise<SmsResult> {
  const segments = smsSegments(message);
  const creds = await getIntegrationValues();
  const apiKey = creds["BULKSMSBD_API_KEY"];
  const senderId = creds["BULKSMSBD_SENDER_ID"];

  if (!apiKey || !senderId) {
    return {
      ok: false,
      code: null,
      message: "BulkSMSBD credentials are not configured",
      raw: "",
      segments,
    };
  }

  const number = normalizeBdPhone(phone);
  if (!/^8801\d{9}$/.test(number)) {
    return { ok: false, code: 1001, message: smsCodeMessage(1001), raw: "", segments };
  }

  try {
    const res = await fetch(SMS_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: apiKey, senderid: senderId, number, message }),
    });
    const raw = (await res.text()).trim();
    const code = parseCode(raw);
    return {
      ok: code === 202,
      code,
      message: smsCodeMessage(code),
      raw: raw.slice(0, 500),
      segments,
    };
  } catch (err) {
    return {
      ok: false,
      code: null,
      message: `Network error: ${err instanceof Error ? err.message : "unknown"}`,
      raw: "",
      segments,
    };
  }
}

/** Reads the remaining SMS credit balance. */
export async function getSmsBalance(): Promise<{ ok: boolean; balance: number | null; message: string }> {
  const apiKey = (await getIntegrationValues())["BULKSMSBD_API_KEY"];
  if (!apiKey) return { ok: false, balance: null, message: "BulkSMSBD credentials are not configured" };
  try {
    const res = await fetch(`${BALANCE_API_URL}?api_key=${encodeURIComponent(apiKey)}`);
    const raw = (await res.text()).trim();
    try {
      const json = JSON.parse(raw) as { balance?: unknown; response_code?: unknown };
      const bal = Number(json.balance);
      if (Number.isFinite(bal)) return { ok: true, balance: bal, message: "OK" };
      const code = Number(json.response_code);
      return { ok: false, balance: null, message: smsCodeMessage(Number.isFinite(code) ? code : null) };
    } catch {
      const bal = Number(raw);
      if (Number.isFinite(bal)) return { ok: true, balance: bal, message: "OK" };
      return { ok: false, balance: null, message: raw.slice(0, 200) || "Unknown response" };
    }
  } catch (err) {
    return {
      ok: false,
      balance: null,
      message: `Network error: ${err instanceof Error ? err.message : "unknown"}`,
    };
  }
}

export { renderSmsTemplate, orderSmsVars } from "./sms-template";


/** Sends an SMS and records the attempt in `sms_logs`. Returns the gateway result. */
export async function deliverSms(
  db: Db,
  input: {
    orderId: string | null;
    phone: string;
    message: string;
    isManual: boolean;
    sentBy?: string | null;
    sentByName?: string | null;
  },
): Promise<SmsResult> {
  const result = await sendBulkSms(input.phone, input.message);
  await db.from("sms_logs").insert({
    order_id: input.orderId,
    phone: input.phone,
    message: input.message,
    status: result.ok ? "sent" : "failed",
    provider_code: result.code === null ? null : String(result.code),
    provider_response: result.raw ? `${result.message} — ${result.raw}` : result.message,
    segments: result.segments,
    is_manual: input.isManual,
    sent_by: input.sentBy ?? null,
    sent_by_name: input.sentByName ?? (input.isManual ? "Staff" : "System"),
  } as never);
  return result;
}
