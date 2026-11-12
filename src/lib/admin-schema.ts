import { z } from "zod";

export const orderStatuses = [
  "pending",
  "rts",
  "confirmed",
  "processing",
  "incomplete",
  "no_response",
  "good_no_response",
  "hold",
  "pre_order",
  "scheduled_order",
  "courier_hold",
  "shipped",
  "partial_delivered",
  "exchange",
  "delivered",
  "cancelled",
  "awaiting_return",
  "returned",
  "lost_damaged",
] as const;
export type OrderStatus = (typeof orderStatuses)[number];

/** Statuses shown on the Web Orders screen (incoming website / landing traffic). */
export const webOrderStatuses = [
  "processing",
  "incomplete",
  "no_response",
  "good_no_response",
  "hold",
  "pre_order",
  "scheduled_order",
  "cancelled",
] as const;

/** Statuses shown on the Order List screen (confirmed fulfilment pipeline). */
export const listOrderStatuses = [
  "pending",
  "rts",
  "shipped",
  "courier_hold",
  "partial_delivered",
  "exchange",
  "delivered",
  "cancelled",
  "awaiting_return",
  "returned",
  "lost_damaged",
] as const;

/**
 * Payment views are NOT order statuses. They slice the money-earning parcels
 * (delivered / partial delivered) by whether the courier has already paid us
 * out — i.e. whether an `order.paid` invoice webhook has arrived.
 */
export const paymentFilters = ["paid", "unpaid"] as const;
export type PaymentFilter = (typeof paymentFilters)[number];
/** Order statuses whose money is collectable from the courier. */
export const payableStatuses = ["delivered", "partial_delivered"] as const;


export const orderBuckets = ["web", "list", "search"] as const;
export type OrderBucket = (typeof orderBuckets)[number];


export const promotionTypes = ["offer", "featured", "flash", "new_arrival"] as const;
export const promotionDiscountTypes = ["none", "percent", "flat", "fixed_price"] as const;


const uuid = z.string().uuid();
const optText = z
  .string()
  .trim()
  .max(20000)
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

const metaTitle = z
  .string()
  .trim()
  .max(60)
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

const metaDescription = z
  .string()
  .trim()
  .max(160)
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

export const idSchema = z.object({ id: uuid });

export const orderStatusSchema = z.object({
  id: uuid,
  status: z.enum(orderStatuses),
  reason: z.string().trim().max(500).optional(),
  /** When true the automatic confirmation SMS is skipped. */
  skipSms: z.boolean().optional(),
  /** Courier chosen at confirmation time (Steadfast / Pathao / Carrybee). */
  deliveryPartner: z.string().trim().max(40).optional(),
  /**
   * ISO timestamp used with the `scheduled_order` status. A cron job flips the
   * order to `processing` once this moment passes.
   */
  scheduledFor: z.string().trim().min(1).max(40).nullable().optional(),
});

export const orderListSchema = z.object({
  status: z.enum(orderStatuses).optional(),
  /** Payment view: paid = courier payout invoice received, unpaid = not yet. */
  payment: z.enum(paymentFilters).optional(),
  bucket: z.enum(orderBuckets).optional(),
  search: z.string().trim().max(120).optional(),
});

/** Edit of an incomplete / web order captured before confirmation. */
export const adminEditOrderSchema = z.object({
  id: uuid,
  customerName: z.string().trim().min(2).max(80),
  customerPhone: z
    .string()
    .trim()
    .regex(/^01[3-9]\d{8}$/, "Invalid Bangladeshi mobile number"),
  addressLine: z.string().trim().min(4).max(300),
  note: z.string().trim().max(500).optional().default(""),
  discount: z.number().min(0).default(0),
  deliveryCharge: z.number().min(0).default(0),
});


export const orderSources = [
  "Facebook",
  "Instagram",
  "WhatsApp",
  "Website",
  "Direct",
  "Upsell",
  "Cross Sell",
  "Phone Call",
  "Exchange",

  "Other",
] as const;

export const advanceMethods = ["bKash", "Nagad", "Bank"] as const;

export const deliveryPartners = ["Steadfast", "Pathao", "RedX", "CarryBee", "Other"] as const;

export const adminOrderItemSchema = z.object({
  productId: uuid,
  variantId: uuid.nullable().default(null),
  quantity: z.number().int().min(1).max(99),
  unitPrice: z.number().min(0),
  comboSelections: z.array(z.object({
    itemId: uuid,
    variantId: uuid,
    quantity: z.number().int().min(1).max(99).default(1),
  })).max(50).default([]),
});

export const adminCreateOrderSchema = z.object({
  customerName: z.string().trim().min(2).max(80),
  customerPhone: z
    .string()
    .trim()
    .regex(/^01[3-9]\d{8}$/, "Invalid Bangladeshi mobile number"),
  addressLine: z.string().trim().min(4).max(300),
  division: z.string().trim().min(2).max(60),
  district: z.string().trim().min(2).max(60),
  upazila: z.string().trim().min(2).max(80),
  note: z.string().trim().max(500).optional().default(""),
  discount: z.number().min(0).default(0),
  deliveryCharge: z.number().min(0).default(0),
  advanceAmount: z.number().min(0).default(0),
  advanceMethod: z.enum(advanceMethods).nullable().default(null),
  source: z.enum(orderSources).default("Direct"),
  /**
   * Creation mode. `manual` drops the order into Web Orders → Processing so it
   * can be managed later; `approved` sends it straight to Order List → Pending
   * with a courier and delivery note already attached.
   */
  mode: z.enum(["manual", "approved"]).default("approved"),
  deliveryPartner: z.string().trim().min(2).max(40).nullable().default(null),
  deliveryNote: z.string().trim().max(500).optional().default(""),
  /** Creates the order directly in the Pre-Order status. */
  preOrder: z.boolean().default(false),
  /** ISO timestamp — creates the order in the Scheduled Order status. */
  scheduledFor: z.string().trim().min(1).max(40).nullable().default(null),
  items: z.array(adminOrderItemSchema).min(1).max(30),
});

export type AdminCreateOrderInput = z.infer<typeof adminCreateOrderSchema>;


export const categorySchema = z.object({
  id: uuid.optional(),
  slug: z.string().trim().min(1).max(80),
  name_bn: z.string().trim().min(1).max(120),
  name_en: z.string().trim().min(1).max(120),
  description_bn: optText,
  description_en: optText,
  image_url: optText,
  meta_title: metaTitle,
  meta_description: metaDescription,
  sort_order: z.number().int().min(0).default(0),
  is_active: z.boolean().default(true),
  is_featured: z.boolean().default(false),
  show_in_header: z.boolean().default(true),
});

export const subcategorySchema = categorySchema
  .omit({ is_featured: true, show_in_header: true })
  .extend({ category_id: uuid });

export const productImageSchema = z.object({
  url: z.string().trim().min(1).max(1000),
  alt_bn: optText,
  alt_en: optText,
  sort_order: z.number().int().min(0).default(0),
});

export const productVariantSchema = z.object({
  group_name_bn: z.string().trim().min(1).max(80),
  group_name_en: z.string().trim().min(1).max(80),
  value_bn: z.string().trim().min(1).max(80),
  value_en: z.string().trim().min(1).max(80),
  sku: optText,
  price_delta: z.number().default(0),
  cost_price: z.number().min(0).default(0),
  stock: z.number().int().min(0).default(0),
  sort_order: z.number().int().min(0).default(0),
  is_active: z.boolean().default(true),
});

/** One sub-product line inside a combo gift box. */
export const comboItemSchema = z.object({
  item_id: uuid,
  quantity: z.number().int().min(1).max(99).default(1),
  label_bn: optText,
  label_en: optText,
  is_free: z.boolean().default(false),
  sort_order: z.number().int().min(0).default(0),
});

export const productKinds = ["single", "component", "combo"] as const;
export type ProductKind = (typeof productKinds)[number];

export const specSchema = z.object({
  label_bn: z.string().trim().max(120).default(""),
  label_en: z.string().trim().max(120).default(""),
  value_bn: z.string().trim().max(500).default(""),
  value_en: z.string().trim().max(500).default(""),
});

export const productFaqSchema = z.object({
  question_bn: z.string().trim().max(300).default(""),
  question_en: z.string().trim().max(300).default(""),
  answer_bn: z.string().trim().max(2000).default(""),
  answer_en: z.string().trim().max(2000).default(""),
});

export const productSchema = z.object({
  id: uuid.optional(),
  /** single = normal product, component = combo sub-item, combo = gift box */
  kind: z.enum(productKinds).default("single"),
  slug: z.string().trim().min(1).max(90),
  /** Nullable for sub-items — the server assigns the hidden internal category. */
  category_id: uuid.nullable().default(null),
  subcategory_id: uuid.nullable().default(null),
  name_bn: z.string().trim().min(1).max(200),
  name_en: z.string().trim().min(1).max(200),
  short_description_bn: optText,
  short_description_en: optText,
  description_bn: optText,
  description_en: optText,
  specs: z.array(specSchema).default([]),
  faq: z.array(productFaqSchema).default([]),
  price: z.number().min(0),
  compare_at_price: z.number().min(0).nullable().default(null),
  cost_price: z.number().min(0).default(0),
  stock: z.number().int().min(0).default(0),
  sku: optText,
  brand: optText,
  badge_bn: optText,
  badge_en: optText,
  meta_title: metaTitle,
  meta_description: metaDescription,
  og_image_url: optText,
  is_active: z.boolean().default(true),
  is_featured: z.boolean().default(false),
  sort_order: z.number().int().min(0).default(0),
  images: z.array(productImageSchema).default([]),
  variants: z.array(productVariantSchema).default([]),
  combo_items: z.array(comboItemSchema).default([]),
});

export const promotionSchema = z.object({
  id: uuid.optional(),
  slug: z.string().trim().min(1).max(90),
  title_bn: z.string().trim().min(1).max(200),
  title_en: z.string().trim().min(1).max(200),
  subtitle_bn: optText,
  subtitle_en: optText,
  type: z.enum(promotionTypes).default("offer"),
  banner_url: optText,
  meta_title: metaTitle,
  meta_description: metaDescription,
  starts_at: optText,
  ends_at: optText,
  sort_order: z.number().int().min(0).default(0),
  show_on_home: z.boolean().default(true),
  is_active: z.boolean().default(true),
  /**
   * Products in the promotion, each with its own optional discount. The
   * discount is written onto the product price when the promotion is saved
   * (and rolled back when it is removed/deactivated), so cart, checkout,
   * orders, inventory and profit reporting all keep using one price source.
   */
  products: z
    .array(
      z.object({
        product_id: uuid,
        discount_type: z.enum(promotionDiscountTypes).default("none"),
        discount_value: z.number().min(0).max(1000000).default(0),
      }),
    )
    .default([]),
});


export const landingPageSchema = z.object({
  id: uuid.optional(),
  product_id: uuid,
  slug: z.string().trim().min(1).max(90),
  headline_bn: optText,
  headline_en: optText,
  subheadline_bn: optText,
  subheadline_en: optText,
  meta_title: metaTitle,
  meta_description: metaDescription,
  og_image_url: optText,
  is_active: z.boolean().default(true),
  seo: z
    .object({
      ogTitle: optText,
      ogDescription: optText,
      canonicalUrl: optText,
      productJsonLd: z.boolean().default(true),
      noindex: z.boolean().default(false),
    })
    .default({
      ogTitle: null,
      ogDescription: null,
      canonicalUrl: null,
      productJsonLd: true,
      noindex: false,
    }),
  bullets: z
    .array(z.object({ bn: z.string().trim().max(300), en: z.string().trim().max(300) }))
    .default([]),
});


export const faqSchema = z.object({
  id: uuid.optional(),
  question_bn: z.string().trim().min(1).max(300),
  question_en: z.string().trim().min(1).max(300),
  answer_bn: z.string().trim().min(1).max(4000),
  answer_en: z.string().trim().min(1).max(4000),
  sort_order: z.number().int().min(0).default(0),
  is_active: z.boolean().default(true),
});

export const settingSchema = z.object({
  key: z.string().trim().min(1).max(60),
  value: z.record(z.string(), z.unknown()),
});

export type ProductInput = z.infer<typeof productSchema>;
export type CategoryInput = z.infer<typeof categorySchema>;
export type SubcategoryInput = z.infer<typeof subcategorySchema>;
export type PromotionInput = z.infer<typeof promotionSchema>;
export type LandingPageInput = z.infer<typeof landingPageSchema>;
export type FaqInput = z.infer<typeof faqSchema>;

/**
 * The admin panel exposes a single input per concept instead of separate
 * Bangla/English fields. This mirrors whichever value was provided into its
 * counterpart column so the storefront language toggle always has content.
 */
export function mirrorLang<T>(input: T): T {
  const walk = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(walk);
    if (!value || typeof value !== "object") return value;
    const obj: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) obj[k] = walk(v);
    const filled = (v: unknown) => typeof v === "string" && v.trim().length > 0;
    for (const key of Object.keys(obj)) {
      if (key.endsWith("_bn")) {
        const en = `${key.slice(0, -3)}_en`;
        if (en in obj || filled(obj[key])) {
          if (!filled(obj[en]) && filled(obj[key])) obj[en] = obj[key];
        }
      }
      if (key.endsWith("_en")) {
        const bn = `${key.slice(0, -3)}_bn`;
        if (!filled(obj[bn]) && filled(obj[key])) obj[bn] = obj[key];
      }
    }
    if ("bn" in obj || "en" in obj) {
      if (!filled(obj["bn"]) && filled(obj["en"])) obj["bn"] = obj["en"];
      if (!filled(obj["en"]) && filled(obj["bn"])) obj["en"] = obj["bn"];
    }
    return obj;
  };
  return walk(input) as T;
}

export const productSearchSchema = z.object({ query: z.string().trim().max(80).default("") });

export const customerLookupSchema = z.object({
  phone: z
    .string()
    .trim()
    .regex(/^01[3-9]\d{8}$/),
});


/* ------------------------------------------------------------------ */
/* Order detail workspace (customer edit, items, notes, SMS, blocking) */
/* ------------------------------------------------------------------ */

const bdPhone = z
  .string()
  .trim()
  .regex(/^01[3-9]\d{8}$/, "Invalid Bangladeshi mobile number");

export const orderCustomerSchema = z.object({
  id: uuid,
  customerName: z.string().trim().min(2).max(80),
  customerPhone: bdPhone,
  altPhone: z
    .string()
    .trim()
    .max(20)
    .optional()
    .default("")
    .transform((v) => (v ? v : null)),
  division: z.string().trim().max(60).optional().default(""),
  district: z.string().trim().max(60).optional().default(""),
  upazila: z.string().trim().max(80).optional().default(""),
  addressLine: z.string().trim().min(4).max(300),
});

export const orderDeliveryNoteSchema = z.object({
  id: uuid,
  deliveryNote: z.string().trim().max(500).optional().default(""),
});

export const orderItemsSchema = z.object({
  id: uuid,
  items: z
    .array(
      z.object({
        productId: uuid.nullable().default(null),
        productName: z.string().trim().min(1).max(200),
        variantLabel: z.string().trim().max(120).nullable().default(null),
        sku: z.string().trim().max(80).nullable().default(null),
        unitPrice: z.number().min(0),
        quantity: z.number().int().min(1).max(99),
        comboSelections: z.array(z.object({
          itemId: uuid,
          itemNameBn: z.string().trim().max(200),
          itemNameEn: z.string().trim().max(200),
          quantity: z.number().int().min(1).max(99),
          variantId: uuid.nullable().default(null),
          variantLabelBn: z.string().trim().max(200),
          variantLabelEn: z.string().trim().max(200),
          sku: z.string().trim().max(120).nullable(),
        })).max(50).default([]),
      }),
    )
    .min(1)
    .max(30),
  deliveryCharge: z.number().min(0).default(0),
  discount: z.number().min(0).default(0),
  advanceAmount: z.number().min(0).default(0),
  advanceMethod: z.enum(advanceMethods).nullable().default(null),
});

export const orderNoteSchema = z.object({
  orderId: uuid,
  body: z.string().trim().min(1).max(2000),
});

export const blockKinds = ["ip", "fingerprint", "phone"] as const;
export type BlockKind = (typeof blockKinds)[number];

export const blockSchema = z.object({
  orderId: uuid,
  action: z.enum(["block", "unblock"]),
  targets: z
    .array(z.object({ kind: z.enum(blockKinds), value: z.string().trim().min(1).max(200) }))
    .min(1)
    .max(5),
  reason: z.string().trim().max(300).optional().default(""),
});

export const smsSendSchema = z.object({
  orderId: uuid,
  phone: z.string().trim().min(6).max(20),
  message: z.string().trim().min(1).max(1000),
});

export const smsRetrySchema = z.object({ id: uuid });

/** Reusable SMS templates. Functional sending is wired once BulkSMSBD credentials arrive. */
export const smsTemplates = [
  {
    id: "order_confirm",
    label: "Order confirmation",
    body: "প্রিয় {{name}}, আপনার অর্ডার {{order_no}} কনফার্ম হয়েছে। মোট: {{amount}} টাকা। ধন্যবাদ — উপহারকাব্য",
  },
  {
    id: "no_response",
    label: "No response follow-up",
    body: "প্রিয় {{name}}, আপনার অর্ডার {{order_no}} নিশ্চিত করতে আমরা কল করেছি কিন্তু পাইনি। কল ব্যাক করুন — উপহারকাব্য",
  },
  {
    id: "shipped",
    label: "Order shipped",
    body: "প্রিয় {{name}}, আপনার অর্ডার {{order_no}} কুরিয়ারে পাঠানো হয়েছে। ইনভয়েস: {{receipt_url}}",
  },
  {
    id: "delivery_today",
    label: "Delivery today",
    body: "প্রিয় {{name}}, আজ আপনার পার্সেল {{order_no}} ডেলিভারি হবে। অনুগ্রহ করে ফোন খোলা রাখুন।",
  },
] as const;

export const smsVariables = ["name", "order_no", "amount", "receipt_url", "phone"] as const;
