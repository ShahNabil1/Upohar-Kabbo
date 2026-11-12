/**
 * Steadfast payout reconciliation (server-only).
 *
 * Steadfast never pushes a "paid" webhook, so we poll its payments endpoints
 * (8. Get Payments + 9. Get Single Payment with Consignments) once a day and
 * mark matching consignments as paid — same Unpaid → Paid flow Pathao and
 * CarryBee get from their webhooks.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { steadfastPayment, steadfastPayments, type SteadfastCreds } from "./steadfast.server";

type Db = SupabaseClient<Database>;

const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null;

const num = (v: unknown): number | null =>
  v == null || v === "" || Number.isNaN(Number(v)) ? null : Number(v);

/** Reconciles the most recent Steadfast payment invoices. */
export async function syncSteadfastPayments(
  db: Db,
  creds: SteadfastCreds,
  opts: { pages?: number } = {},
) {
  const pages = opts.pages ?? 1;
  let matched = 0;
  let scanned = 0;

  for (let page = 1; page <= pages; page++) {
    const payments = await steadfastPayments(creds, page);
    if (!payments.length) break;

    for (const p of payments) {
      const paymentId = str(p["id"]) ?? str(p["payment_id"]) ?? str(p["invoice_id"]);
      if (!paymentId) continue;

      const { payment, consignments } = await steadfastPayment(creds, paymentId);
      const paidAt =
        str(payment["paid_at"]) ??
        str(payment["created_at"]) ??
        str(p["created_at"]) ??
        new Date().toISOString();
      const invoiceRef =
        str(payment["invoice_id"]) ?? str(payment["reference"]) ?? paymentId;

      for (const c of consignments) {
        scanned++;
        const consignmentId =
          str(c["consignment_id"]) ?? str(c["id"]) ?? str(c["tracking_code"]);
        if (!consignmentId) continue;

        const collected =
          num(c["cod_amount"]) ?? num(c["collected_amount"]) ?? num(c["amount"]);

        const { data: rows } = await db
          .from("order_consignments")
          .select("id, order_id, paid_at, collected_amount")
          .eq("provider", "steadfast")
          .or(
            `consignment_id.eq.${consignmentId},tracking_code.eq.${consignmentId}`,
          );

        const row = rows?.[0];
        if (!row || row.paid_at) continue;

        await db
          .from("order_consignments")
          .update({
            paid_at: new Date(paidAt).toISOString(),
            payment_invoice_id: invoiceRef,
            ...(collected !== null ? { collected_amount: collected } : {}),
          })
          .eq("id", row.id);

        await db.from("order_activity").insert({
          order_id: row.order_id,
          kind: "courier",
          message: `Steadfast payment received · Invoice ${invoiceRef}`,
          meta: { provider: "steadfast", invoice: invoiceRef, consignment_id: consignmentId, collected } as never,
        });

        matched++;
      }
    }
  }

  return { scanned, matched };
}
