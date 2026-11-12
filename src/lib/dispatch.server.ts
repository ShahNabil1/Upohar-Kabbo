/**
 * Courier dispatch (server-only).
 * Turns a confirmed order into a courier consignment for the partner saved on
 * that order, then records the result on the order + `order_consignments`.
 */

import type { Db } from "./admin.server";
import { normaliseCourierStatus, type DeliveryProvider } from "./delivery-shared";
import { BD_DIVISIONS } from "./bd-geo";

export type DispatchResult = {
  ok: boolean;
  orderId: string;
  orderNumber: string;
  provider: DeliveryProvider | null;
  consignmentId: string | null;
  message: string;
};

type PartnerRow = {
  provider: string;
  enabled: boolean;
  credentials: Record<string, string>;
  config: Record<string, unknown>;
};

export async function loadPartner(db: Db, provider: DeliveryProvider): Promise<PartnerRow> {
  const { data, error } = await db
    .from("delivery_partners")
    .select("provider, enabled, credentials, config")
    .eq("provider", provider)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`${provider} is not configured in Delivery Settings`);
  if (!data.enabled) throw new Error(`${provider} is deactivated`);
  return {
    provider: data.provider,
    enabled: data.enabled,
    credentials: (data.credentials ?? {}) as Record<string, string>,
    config: (data.config ?? {}) as Record<string, unknown>,
  };
}

/** Maps the stored partner label ("Steadfast", "Pathao"…) to a provider key. */
export function providerKey(label: string | null): DeliveryProvider | null {
  const v = (label ?? "").toLowerCase().replace(/\s+/g, "");
  if (v === "steadfast") return "steadfast";
  if (v === "pathao") return "pathao";
  if (v === "carrybee") return "carrybee";
  return null;
}

type OrderRow = {
  id: string;
  order_number: string;
  customer_name: string;
  customer_phone: string;
  alt_phone: string | null;
  address_line: string;
  division: string | null;
  district: string | null;
  upazila: string | null;
  city: string | null;
  delivery_note: string | null;
  note: string | null;
  source: string | null;
  total: number | string;
  advance_amount: number | string;
  delivery_partner: string | null;
  courier_consignment_id: string | null;
};

async function loadOrder(db: Db, orderId: string) {
  const { data, error } = await db
    .from("orders")
    .select(
      "id, order_number, customer_name, customer_phone, alt_phone, address_line, division, district, upazila, city, delivery_note, note, source, total, advance_amount, delivery_partner, courier_consignment_id",
    )
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Order not found");
  return data as unknown as OrderRow;
}

async function loadItems(db: Db, orderId: string) {
  const { data } = await db
    .from("order_items")
    .select("product_name, variant_label, quantity, product_id")
    .eq("order_id", orderId);
  return (data ?? []) as Array<{
    product_name: string;
    variant_label: string | null;
    quantity: number;
    product_id: string | null;
  }>;
}

/** True when any line on the order is a combo gift box (heavier parcel). */
async function hasCombo(db: Db, items: Array<{ product_id: string | null }>) {
  const ids = items.map((i) => i.product_id).filter((v): v is string => !!v);
  if (!ids.length) return false;
  const { data } = await db.from("products").select("kind").in("id", ids);
  return (data ?? []).some((p) => (p as { kind?: string }).kind === "combo");
}

/** CarryBee auth headers come straight from the saved credentials. */
export function carrybeeCreds(partner: PartnerRow) {
  return {
    client_id: partner.credentials["client_id"]!,
    client_secret: partner.credentials["client_secret"]!,
    client_context: partner.credentials["client_context"]!,
  };
}

/**
 * Resolves a stored order's address to CarryBee city/zone/area ids.
 * `/api/v2/address-details` is tried first (CarryBee's own resolver); if it
 * cannot help we fall back to matching the district/upazila name lists.
 */
export async function resolveCarrybeeLocation(
  order: Pick<OrderRow, "address_line" | "division" | "district" | "upazila" | "city">,
  partner: PartnerRow,
): Promise<{
  cityId: number;
  zoneId: number;
  areaId?: number;
  cityName: string;
  zoneName: string;
  source: "address-details" | "name-match";
}> {
  const { carrybeeCities, carrybeeZones, carrybeeAreas, carrybeeAddressDetails } = await import(
    "./carrybee.server"
  );
  const creds = carrybeeCreds(partner);
  const address = fullAddress(order as OrderRow);

  // 1) CarryBee's own address resolver.
  if (address.trim().length >= 10) {
    try {
      const hit = await carrybeeAddressDetails(creds, address);
      if (hit.cityId && hit.zoneId) {
        return {
          cityId: hit.cityId,
          zoneId: hit.zoneId,
          ...(hit.areaId ? { areaId: hit.areaId } : {}),
          cityName: hit.cityName ?? String(hit.cityId),
          zoneName: hit.zoneName ?? String(hit.zoneId),
          source: "address-details",
        };
      }
    } catch {
      // fall through to name matching
    }
  }

  // 2) Name matching against the city / zone / area lists.
  const cities = await carrybeeCities(creds);
  const city =
    pickPlace(cities, "name", order.district, DISTRICT_EN) ??
    pickPlace(cities, "city_name", order.district, DISTRICT_EN) ??
    pickPlace(cities, "name", order.city, DISTRICT_EN);
  if (!city)
    throw new Error(
      `CarryBee city not found for "${order.district ?? order.city}" — check the district on this order`,
    );
  const cityId = Number(city["id"] ?? city["city_id"]);
  const cityName = String(city["name"] ?? city["city_name"] ?? cityId);

  const zones = await carrybeeZones(creds, cityId);
  const zone =
    pickPlace(zones, "name", order.upazila, UPAZILA_EN) ??
    pickPlace(zones, "zone_name", order.upazila, UPAZILA_EN) ??
    pickPlace(zones, "name", order.city, UPAZILA_EN) ??
    pickByName(zones, "name", `${cityName} Sadar`);
  if (!zone)
    throw new Error(`CarryBee zone not found for "${order.upazila ?? order.city}" under ${cityName}`);
  const zoneId = Number(zone["id"] ?? zone["zone_id"]);
  const zoneName = String(zone["name"] ?? zone["zone_name"] ?? zoneId);

  // Area is optional: match it against the free-text address when we can.
  let areaId: number | undefined;
  try {
    const areas = await carrybeeAreas(creds, cityId, zoneId);
    const area =
      pickByName(areas, "name", order.address_line) ??
      pickByName(areas, "name", order.upazila ?? "") ??
      areas[0];
    const id = area?.["id"] ?? area?.["area_id"];
    if (id != null) areaId = Number(id);
  } catch {
    areaId = undefined;
  }

  return { cityId, zoneId, ...(areaId ? { areaId } : {}), cityName, zoneName, source: "name-match" };
}

/**
 * Builds one CarryBee order payload from a stored order.
 * Shared by single dispatch and the bulk endpoint so both stay identical.
 */
export async function buildCarrybeePayload(
  db: Db,
  order: OrderRow,
  items: Array<{ product_name: string; variant_label: string | null; quantity: number; product_id: string | null }>,
  partner: PartnerRow,
) {
  const { carrybeeStores } = await import("./carrybee.server");
  const creds = carrybeeCreds(partner);

  const saved = (partner.config["stores"] ?? []) as Array<{ store_id: string | number }>;
  const storeId = saved[0]?.store_id ?? (await carrybeeStores(creds))[0]?.store_id;
  if (!storeId) throw new Error("No CarryBee store found for this merchant account");

  const place = await resolveCarrybeeLocation(order, partner);

  const combo = await hasCombo(db, items);
  const quantity = combo ? 1 : totalLot(items);
  // Single parcels ship at 400g, combo gift boxes at 1kg.
  const weight = combo ? 1000 : 400 * quantity;
  // CarryBee caps the special instruction at 255 characters.
  const instruction = (order.delivery_note ?? "").trim().slice(0, 255);

  return {
    store_id: storeId,
    merchant_order_id: order.order_number,
    delivery_type: 1 as const,
    product_type: 1 as const,
    recipient_name: order.customer_name,
    recipient_phone: order.customer_phone,
    ...(order.alt_phone ? { recipient_secendary_phone: order.alt_phone } : {}),
    recipient_address: fullAddress(order),
    city_id: place.cityId,
    zone_id: place.zoneId,
    ...(place.areaId ? { area_id: place.areaId } : {}),
    ...(instruction ? { special_instruction: instruction } : {}),
    product_description: itemSummary(items).slice(0, 255),
    item_weight: weight,
    item_quantity: quantity,
    collectable_amount: codAmount(order),
    // Gift parcels always ship closed — the customer pays before opening.
    is_closed_box: true,
    // Manual exchange orders go out flagged so CarryBee collects the old parcel.
    ...((order.source ?? "").toLowerCase() === "exchange" ? { is_exchange: true } : {}),
  };
}

/**
 * Bulk-dispatch many orders to CarryBee in one `orders-bulk` call.
 * Skips already-sent orders and exchange orders (those need a source consignment).
 * Returns per-order results in the same shape as dispatchOrder.
 */
export async function dispatchBulkOrdersToCarrybee(
  db: Db,
  orderIds: string[],
  actor: string,
): Promise<DispatchResult[]> {
  const { carrybeeCreateOrder, carrybeeCreateBulkOrders } = await import("./carrybee.server");
  const { logActivity } = await import("./admin.server");

  const orders: { row: OrderRow; items: Awaited<ReturnType<typeof loadItems>> }[] = [];
  const skipped: DispatchResult[] = [];

  for (const orderId of orderIds) {
    try {
      const order = await loadOrder(db, orderId);
      const base = { orderId, orderNumber: order.order_number };

      if (order.courier_consignment_id) {
        skipped.push({
          ...base,
          ok: true,
          provider: providerKey(order.delivery_partner),
          consignmentId: order.courier_consignment_id,
          message: "Already sent to courier",
        });
        continue;
      }

      const provider = providerKey(order.delivery_partner);
      if (provider !== "carrybee") {
        skipped.push({
          ...base,
          ok: false,
          provider,
          consignmentId: null,
          message: "Not a CarryBee order",
        });
        continue;
      }

      if ((order.source ?? "").toLowerCase() === "exchange") {
        skipped.push({
          ...base,
          ok: false,
          provider: "carrybee",
          consignmentId: null,
          message: "Exchange orders must be sent individually",
        });
        continue;
      }

      const items = await loadItems(db, orderId);
      orders.push({ row: order, items });
    } catch (error) {
      skipped.push({
        orderId,
        orderNumber: "—",
        ok: false,
        provider: "carrybee",
        consignmentId: null,
        message: (error as Error).message,
      });
    }
  }

  if (!orders.length) return skipped;

  const partner = await loadPartner(db, "carrybee");
  const creds = carrybeeCreds(partner);

  const payloads = await Promise.all(
    orders.map(({ row, items }) => buildCarrybeePayload(db, row, items, partner)),
  );

  // Multiple orders go out in one `orders-bulk` call. If CarryBee omits a
  // consignment id for some rows, those individual orders are retried through
  // the single-order endpoint so nothing silently fails.
  const created: Array<
    | { ok: true; res: import("./carrybee.server").CarrybeeOrderResult }
    | { ok: false; message: string }
  > = [];

  let bulk: import("./carrybee.server").CarrybeeOrderResult[] = [];
  let bulkError: string | null = null;
  try {
    bulk = (await carrybeeCreateBulkOrders(creds, payloads)).results;
  } catch (error) {
    bulkError = (error as Error).message;
  }

  for (let i = 0; i < payloads.length; i++) {
    const hit = bulk[i];
    if (hit?.consignmentId) {
      created.push({ ok: true, res: hit });
      continue;
    }
    try {
      const res = await carrybeeCreateOrder(creds, payloads[i]!);
      created.push({ ok: true, res });
    } catch (error) {
      created.push({ ok: false, message: bulkError ?? (error as Error).message });
    }
  }


  const out: DispatchResult[] = [];

  for (let i = 0; i < orders.length; i++) {
    const { row } = orders[i]!;
    const base = { orderId: row.id, orderNumber: row.order_number };
    const entry = created[i];

    if (!entry || !entry.ok) {
      const message = entry && !entry.ok ? entry.message : "No consignment returned";
      await logActivity(db, row.id, "courier", `Bulk CarryBee dispatch failed — ${message}`, {
        actor,
        meta: { provider: "carrybee" },
      });
      out.push({
        ...base,
        ok: false,
        provider: "carrybee",
        consignmentId: null,
        message,
      });
      continue;
    }

    const res = entry.res;


    const status = normaliseCourierStatus("carrybee", res.status);

    await db.from("order_consignments").delete().eq("order_id", row.id).eq("provider", "carrybee");
    const { error: consignmentError } = await db.from("order_consignments").insert({
      order_id: row.id,
      provider: "carrybee",
      consignment_id: res.consignmentId,
      tracking_code: null,
      merchant_order_id: row.order_number,
      status,
      status_message: res.status,
      delivery_fee: null,
      cod_amount: codAmount(row),
      raw: JSON.parse(JSON.stringify(res.raw)) as never,
    });
    if (consignmentError) {
      await logActivity(db, row.id, "courier", `Bulk CarryBee dispatch failed — ${consignmentError.message}`, {
        actor,
        meta: { provider: "carrybee" },
      });
      out.push({
        ...base,
        ok: false,
        provider: "carrybee",
        consignmentId: res.consignmentId,
        message: consignmentError.message,
      });
      continue;
    }

    await db
      .from("orders")
      .update({
        status: "rts",
        courier_provider: "carrybee",
        courier_consignment_id: res.consignmentId,
        courier_tracking_code: null,
        courier_status: status,
        courier_sent_at: new Date().toISOString(),
        fulfillment_status: "rts",
      })
      .eq("id", row.id);

    await logActivity(
      db,
      row.id,
      "courier",
      `${actor} sent the order to CarryBee (bulk) · consignment ${res.consignmentId}`,
      { actor, meta: { provider: "carrybee", consignmentId: res.consignmentId } },
    );

    out.push({
      ...base,
      ok: true,
      provider: "carrybee",
      consignmentId: res.consignmentId,
      message: `Consignment ${res.consignmentId}`,
    });
  }

  return [...skipped, ...out];
}

/**
 * Exchange orders must reference the customer's previous CarryBee parcel that
 * was actually delivered — CarryBee creates the exchange against it.
 */
export async function findExchangeSourceConsignment(
  db: Db,
  order: OrderRow,
): Promise<string | null> {
  const { data } = await db
    .from("orders")
    .select("id, courier_consignment_id, courier_provider, status, customer_phone, created_at")
    .eq("customer_phone", order.customer_phone)
    .eq("courier_provider", "carrybee")
    .eq("status", "delivered")
    .neq("id", order.id)
    .order("created_at", { ascending: false })
    .limit(1);
  const row = (data ?? [])[0] as { courier_consignment_id?: string | null } | undefined;
  return row?.courier_consignment_id ?? null;
}




function fullAddress(o: OrderRow) {
  return [o.address_line, o.upazila, o.district, o.division || o.city]
    .filter((x) => x && String(x).trim().length > 0)
    .join(", ");
}

function codAmount(o: OrderRow) {
  const due = Number(o.total ?? 0) - Number(o.advance_amount ?? 0);
  return Math.max(0, Math.round(due));
}

function itemSummary(items: Array<{ product_name: string; variant_label: string | null; quantity: number }>) {
  return items
    .map((i) => `${i.product_name}${i.variant_label ? ` (${i.variant_label})` : ""} x${i.quantity}`)
    .join(", ")
    .slice(0, 250);
}

function totalLot(items: Array<{ quantity: number }>) {
  return items.reduce((sum, i) => sum + Number(i.quantity ?? 0), 0) || 1;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\b(sadar|district|zila|upazila|thana|city)\b/g, "")
    .replace(/[^a-z0-9]/g, "");

const bnTrim = (s: string) => (s ?? "").replace(/\s+/g, " ").trim();

/** Bangla -> English name maps built from the local BD administrative dataset. */
const DISTRICT_EN = new Map<string, string>();
const UPAZILA_EN = new Map<string, string>();
for (const div of BD_DIVISIONS) {
  for (const d of div.districts) {
    DISTRICT_EN.set(bnTrim(d.bn), d.en);
    for (const u of d.upazilas) UPAZILA_EN.set(bnTrim(u.bn), u.en);
  }
}

/** Spelling variants Pathao/Steadfast use for the same place. */
const NAME_ALIASES: Record<string, string[]> = {
  bogra: ["Bogura"],
  bogura: ["Bogra"],
  comilla: ["Cumilla"],
  cumilla: ["Comilla"],
  barisal: ["Barishal"],
  barishal: ["Barisal"],
  jessore: ["Jashore"],
  jashore: ["Jessore"],
  chittagong: ["Chattogram", "Chattagram"],
  chattogram: ["Chittagong", "Chattagram"],
  chattagram: ["Chattogram", "Chittagong"],
  coxsbazar: ["Cox's Bazar", "Coxs Bazar", "Cox Bazar"],
  netrokona: ["Netrakona"],
  netrakona: ["Netrokona"],
  maulvibazar: ["Moulvibazar"],
  moulvibazar: ["Maulvibazar"],
  brahmanbaria: ["B. Baria", "Brahmanbaria"],
  chapainawabganj: ["Chapai Nawabganj", "Nawabganj"],
  munshiganj: ["Munshigonj"],
  gaibandha: ["Gaibandah"],
  narsingdi: ["Narshingdi"],
};

/** All name spellings worth trying for a stored (usually Bangla) place name. */
function nameCandidates(raw: string | null | undefined, map: Map<string, string>): string[] {
  const out: string[] = [];
  const push = (v: string) => {
    const t = bnTrim(v);
    if (t && !out.includes(t)) out.push(t);
  };
  const base = bnTrim(raw ?? "");
  if (!base) return out;
  push(base);
  const en = map.get(base);
  if (en) push(en);
  const noSadar = bnTrim(base.replace(/সদর$/u, ""));
  if (noSadar !== base) {
    push(noSadar);
    const en2 = map.get(noSadar);
    if (en2) push(en2);
  }
  for (const c of [...out]) {
    const alias = NAME_ALIASES[norm(c)];
    if (alias) alias.forEach(push);
  }
  return out;
}

/** Tries every spelling variant against the courier's list. */
function pickPlace<T extends Record<string, unknown>>(
  rows: T[],
  nameKey: string,
  raw: string | null | undefined,
  map: Map<string, string>,
): T | null {
  for (const candidate of nameCandidates(raw, map)) {
    const hit = pickByName(rows, nameKey, candidate);
    if (hit) return hit;
  }
  return null;
}

function pickByName<T extends Record<string, unknown>>(
  rows: T[],
  nameKey: string,
  wanted: string,
): T | null {
  const target = norm(wanted);
  if (!target) return null;
  return (
    rows.find((r) => norm(String(r[nameKey] ?? "")) === target) ??
    rows.find((r) => norm(String(r[nameKey] ?? "")).includes(target)) ??
    rows.find((r) => target.includes(norm(String(r[nameKey] ?? "")))) ??
    null
  );
}

/**
 * Creates the consignment with the courier and persists the outcome.
 * Never throws — failures come back as `{ ok: false, message }` so a bulk run
 * can continue with the remaining orders.
 */
export async function dispatchOrder(
  db: Db,
  orderId: string,
  actor: string,
): Promise<DispatchResult> {
  const { logActivity } = await import("./admin.server");
  let order: OrderRow;
  try {
    order = await loadOrder(db, orderId);
  } catch (error) {
    return {
      ok: false,
      orderId,
      orderNumber: "—",
      provider: null,
      consignmentId: null,
      message: (error as Error).message,
    };
  }

  const base = { orderId, orderNumber: order.order_number };

  if (order.courier_consignment_id) {
    return {
      ...base,
      ok: true,
      provider: providerKey(order.delivery_partner),
      consignmentId: order.courier_consignment_id,
      message: "Already sent to courier",
    };
  }

  const provider = providerKey(order.delivery_partner);
  if (!provider) {
    return {
      ...base,
      ok: false,
      provider: null,
      consignmentId: null,
      message: "No delivery partner selected on this order",
    };
  }

  try {
    const partner = await loadPartner(db, provider);
    const items = await loadItems(db, orderId);
    // Couriers only ever receive our own delivery note — never the
    // customer's checkout note.
    const note = (order.delivery_note ?? "").trim().slice(0, 250);
    const pathaoInstruction = note;

    let consignmentId: string | null = null;
    let trackingCode: string | null = null;
    let rawStatus = "pending";
    let deliveryFee: number | null = null;
    let raw: Record<string, unknown> = {};

    if (provider === "steadfast") {
      const { steadfastCreateOrder } = await import("./steadfast.server");
      const res = await steadfastCreateOrder(
        {
          api_key: partner.credentials["api_key"]!,
          secret_key: partner.credentials["secret_key"]!,
        },
        {
          invoice: order.order_number,
          recipient_name: order.customer_name,
          recipient_phone: order.customer_phone,
          recipient_address: fullAddress(order),
          cod_amount: codAmount(order),
          item_description: itemSummary(items),
          total_lot: totalLot(items),
          delivery_type: 0,
          ...(note ? { note } : {}),
          ...(order.alt_phone ? { alternative_phone: order.alt_phone } : {}),
        },
      );
      consignmentId = res.consignmentId;
      trackingCode = res.trackingCode;
      rawStatus = res.status;
      raw = res.raw;
    } else if (provider === "pathao") {
      const creds = {
        client_id: partner.credentials["client_id"]!,
        client_secret: partner.credentials["client_secret"]!,
        username: partner.credentials["username"]!,
        password: partner.credentials["password"]!,
      };
      const { pathaoToken, pathaoStores, pathaoCities, pathaoZones, pathaoCreateOrder } =
        await import("./pathao.server");
      const token = await pathaoToken(creds);

      const stores = (partner.config["stores"] ?? []) as Array<{ store_id: number }>;
      const storeId = stores[0]?.store_id ?? (await pathaoStores(creds, token))[0]?.store_id;
      if (!storeId) throw new Error("No Pathao store found for this merchant account");

      const cityBody = await pathaoCities(creds, token);
      const cityList = (((cityBody["data"] ?? {}) as Record<string, unknown>)["data"] ??
        []) as Array<Record<string, unknown>>;
      const city =
        pickPlace(cityList, "city_name", order.district, DISTRICT_EN) ??
        pickPlace(cityList, "city_name", order.city, DISTRICT_EN);
      if (!city)
        throw new Error(
          `Pathao city not found for "${order.district ?? order.city}" — check the district name on this order`,
        );
      const cityId = Number(city["city_id"]);

      const zoneBody = await pathaoZones(creds, token, cityId);
      const zoneList = (((zoneBody["data"] ?? {}) as Record<string, unknown>)["data"] ??
        []) as Array<Record<string, unknown>>;
      const zone =
        pickPlace(zoneList, "zone_name", order.upazila, UPAZILA_EN) ??
        pickPlace(zoneList, "zone_name", order.city, UPAZILA_EN) ??
        pickByName(zoneList, "zone_name", `${String(city["city_name"] ?? "")} Sadar`);
      if (!zone)
        throw new Error(
          `Pathao zone not found for "${order.upazila ?? order.city}" under ${String(city["city_name"] ?? "")}`,
        );

      const res = await pathaoCreateOrder(creds, token, {
        store_id: storeId,
        merchant_order_id: order.order_number,
        recipient_name: order.customer_name,
        recipient_phone: order.customer_phone,
        recipient_address: fullAddress(order),
        recipient_city: cityId,
        recipient_zone: Number(zone["zone_id"]),
        delivery_type: 48,
        item_type: 2,
        item_quantity: totalLot(items),
        item_weight: 0.5,
        amount_to_collect: codAmount(order),
        item_description: itemSummary(items),
        ...(pathaoInstruction ? { special_instruction: pathaoInstruction } : {}),
      });
      consignmentId = res.consignmentId;
      rawStatus = res.status;
      deliveryFee = res.deliveryFee;
      raw = res.raw;
    } else {
      const { carrybeeCreateOrder, carrybeeCreateExchange } = await import("./carrybee.server");
      const payload = await buildCarrybeePayload(db, order, items, partner);
      const isExchange = (order.source ?? "").toLowerCase() === "exchange";
      let res;
      if (isExchange) {
        const sourceCid = await findExchangeSourceConsignment(db, order);
        if (!sourceCid) {
          throw new Error(
            "CarryBee exchange needs an earlier CarryBee order for this phone that was delivered — none found",
          );
        }
        res = await carrybeeCreateExchange(carrybeeCreds(partner), sourceCid, payload);
      } else {
        res = await carrybeeCreateOrder(carrybeeCreds(partner), payload);
      }
      consignmentId = res.consignmentId;
      rawStatus = res.status;
      raw = res.raw;
    }



    const status = normaliseCourierStatus(provider, rawStatus);

    // Partial unique index (provider, consignment_id) cannot back a PostgREST
    // upsert, so replace the row for this order+provider explicitly.
    await db.from("order_consignments").delete().eq("order_id", orderId).eq("provider", provider);
    const { error: consignmentError } = await db.from("order_consignments").insert(
      {
        order_id: orderId,
        provider,
        consignment_id: consignmentId,
        tracking_code: trackingCode,
        merchant_order_id: order.order_number,
        status,
        status_message: rawStatus,
        delivery_fee: deliveryFee,
        cod_amount: codAmount(order),
        raw: JSON.parse(JSON.stringify(raw)) as never,
      },
    );
    if (consignmentError) throw new Error(consignmentError.message);

    await db
      .from("orders")
      .update({
        status: "rts",
        courier_provider: provider,
        courier_consignment_id: consignmentId,
        courier_tracking_code: trackingCode,
        courier_status: status,
        courier_sent_at: new Date().toISOString(),
        fulfillment_status: "rts",
      })
      .eq("id", orderId);

    await logActivity(
      db,
      orderId,
      "courier",
      `${actor} sent the order to ${order.delivery_partner} · consignment ${consignmentId ?? "—"}`,
      { actor, meta: { provider, consignmentId, trackingCode } },
    );

    return {
      ...base,
      ok: true,
      provider,
      consignmentId,
      message: `Consignment ${consignmentId ?? "created"}`,
    };
  } catch (error) {
    const message = (error as Error).message;
    await logActivity(db, orderId, "courier", `Courier dispatch failed — ${message}`, {
      actor,
      meta: { provider },
    });
    return { ...base, ok: false, provider, consignmentId: null, message };
  }
}

/**
 * Order-status progression guard — mirrors `courier_webhook_apply` in the DB.
 * Returns the order status to apply, or null to leave it untouched:
 *  - manual financial states (paid/unpaid/lost_damaged) are never overwritten
 *  - a late/out-of-order courier event can never move an order backwards
 */
const ORDER_RANK: Record<string, number> = {
  incomplete: 0,
  pending: 1,
  no_response: 1,
  good_no_response: 1,
  hold: 1,
  confirmed: 2,
  processing: 2,
  rts: 3,
  shipped: 4,
  courier_hold: 4,
  partial_delivered: 5,
  delivered: 5,
  awaiting_return: 5,
  exchange: 5,
  returned: 6,
  cancelled: 6,
  lost_damaged: 6,
};

export function nextOrderStatus(current: string | null, candidate: string | null): string | null {
  if (!candidate) return null;
  if (current && ["paid", "unpaid", "lost_damaged"].includes(current)) return null;
  const cur = ORDER_RANK[current ?? ""] ?? 0;
  const next = ORDER_RANK[candidate] ?? 0;
  return next < cur ? null : candidate;
}

/**
 * Total courier cost from a Pathao order-info payload:
 * delivery fee + COD fee + extra charges − discounts.
 */
export function pathaoFeeFromInfo(d: Record<string, unknown>): number | null {
  const num = (...keys: string[]) => {
    for (const k of keys) {
      const v = d[k];
      if (v != null && v !== "" && !Number.isNaN(Number(v))) return Number(v);
    }
    return 0;
  };
  if (d["delivery_fee"] == null) return null;
  return (
    num("delivery_fee") +
    num("cod_fee", "collection_fee") +
    num("additional_charge") +
    num("compensation_cost", "compensation") -
    num("discount") -
    num("promo_discount")
  );
}
