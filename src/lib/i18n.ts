export type Lang = "bn" | "en";

export const LANG_COOKIE = "site_lang";

export function isLang(value: unknown): value is Lang {
  return value === "bn" || value === "en";
}

export function pick(lang: Lang, bn: string | null | undefined, en: string | null | undefined) {
  const value = lang === "bn" ? (bn ?? en) : (en ?? bn);
  return value ?? "";
}

const BN_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];

export function toBnDigits(input: string) {
  return input.replace(/\d/g, (d) => BN_DIGITS[Number(d)] ?? d);
}

export function formatNumber(lang: Lang, value: number) {
  const formatted = new Intl.NumberFormat("en-US").format(value);
  return lang === "bn" ? toBnDigits(formatted) : formatted;
}

export function formatPrice(lang: Lang, value: number | string | null | undefined) {
  const amount = Number(value ?? 0);
  const rounded = Number.isFinite(amount) ? Math.round(amount) : 0;
  return lang === "bn" ? `৳ ${formatNumber("bn", rounded)}` : `Tk ${formatNumber("en", rounded)}`;
}

export function discountPercent(
  price: number | string | null | undefined,
  compareAt: number | string | null | undefined,
) {
  const p = Number(price ?? 0);
  const c = Number(compareAt ?? 0);
  if (!c || c <= p) return 0;
  return Math.round(((c - p) / c) * 100);
}

export const t = {
  home: { bn: "Home", en: "Home" },
  categories: { bn: "ক্যাটাগরি", en: "Categories" },
  offers: { bn: "Offers", en: "Offers" },
  faq: { bn: "FAQ", en: "FAQ" },
  about: { bn: "About", en: "About" },
  contact: { bn: "Contact", en: "Contact" },
  search: { bn: "Search", en: "Search" },
  searchPlaceholder: { bn: "পণ্যের নাম লিখুন...", en: "Search products..." },
  shopNow: { bn: "কেনাকাটা করুন", en: "Shop now" },
  viewAll: { bn: "সব দেখুন", en: "View all" },
  orderNow: { bn: "অর্ডার করুন", en: "Order now" },
  outOfStock: { bn: "স্টক শেষ", en: "Out of stock" },
  inStock: { bn: "স্টকে আছে", en: "In stock" },
  off: { bn: "ছাড়", en: "off" },
  description: { bn: "বিবরণ", en: "Description" },
  specs: { bn: "স্পেসিফিকেশন", en: "Specifications" },
  productFaq: { bn: "যে প্রশ্নগুলো আমরা প্রায়ই পেয়ে থাকি", en: "Frequently asked questions" },
  related: { bn: "সম্পর্কিত পণ্য", en: "Related products" },
  noProducts: { bn: "এই মুহূর্তে কোনো পণ্য নেই।", en: "No products here right now." },
  sku: { bn: "এসকেইউ", en: "SKU" },
  brand: { bn: "ব্র্যান্ড", en: "Brand" },
  reviews: { bn: "রিভিউ", en: "reviews" },
  cod: { bn: "সম্পূর্ণ ক্যাশ অন ডেলিভারি ", en: "Full Cash on delivery" },
  allCategories: { bn: "সব ক্যাটাগরি", en: "All categories" },
  notFoundTitle: { bn: "পেইজটি পাওয়া যায়নি", en: "We couldn't find that page" },
  notFoundBody: {
    bn: "লিংকটি হয়তো বদলে গেছে বা পণ্যটি আর নেই। নিচ থেকে খুঁজে দেখুন।",
    en: "The link may have changed or the product is gone. Try one of these instead.",
  },
  backHome: { bn: "হোমে ফিরুন", en: "Back to home" },
  popular: { bn: "জনপ্রিয় পণ্য", en: "Popular products" },
  results: { bn: "ফলাফল", en: "results" },
  errorTitle: { bn: "কিছু একটা সমস্যা হয়েছে", en: "Something went wrong" },
  errorBody: {
    bn: "পেইজটি লোড করা যায়নি। আবার চেষ্টা করুন।",
    en: "This page could not load. Please try again.",
  },
  cart: { bn: "Your Cart", en: "Your Cart" },
  close: { bn: "বন্ধ করুন", en: "Close" },
  addToCart: { bn: "Add To Cart", en: "Add to cart" },
  buyNow: { bn: "Buy Now", en: "Buy now" },
  added: { bn: "কার্টে যোগ হয়েছে", en: "Added to cart" },
  emptyCart: { bn: "আপনার কার্ট খালি।", en: "Your cart is empty." },
  emptyCartTitle: { bn: "আপনার শপিং কার্ট এখনো খালি", en: "Your cart is still empty" },
  emptyCartBody: {
    bn: "উপহারকাব্য থেকে প্রিয়জনের জন্য সেরা গিফট কম্বোটি বেছে নিন।",
    en: "Pick the perfect gift combo for your loved ones from Upoharkabbo.",
  },
  browseGifts: { bn: "গিফট ব্রাউজ করুন", en: "Browse gifts" },
  continueShopping: { bn: "কেনাকাটা চালিয়ে যান", en: "Continue shopping" },
  downloadInvoice: { bn: "ইনভয়েস ডাউনলোড", en: "Download invoice" },

  quantity: { bn: "পরিমাণ", en: "Quantity" },
  remove: { bn: "সরান", en: "Remove" },
  subtotal: { bn: "সাবটোটাল", en: "Subtotal" },
  deliveryCharge: { bn: "ডেলিভারি চার্জ", en: "Delivery charge" },
  total: { bn: "সর্বমোট", en: "Total" },
  free: { bn: "ফ্রি", en: "Free" },
  checkout: { bn: "চেকআউট", en: "Checkout" },
  placeOrder: { bn: "অর্ডার কনফার্ম করুন", en: "Confirm order" },
  placing: { bn: "পাঠানো হচ্ছে...", en: "Placing order..." },
  orderSummary: { bn: "অর্ডার সারাংশ", en: "Order summary" },
  deliveryInfo: { bn: "ডেলিভারি তথ্য", en: "Delivery details" },
  fullName: { bn: "আপনার নাম", en: "Full name" },
  phone: { bn: "মোবাইল নম্বর", en: "Mobile number" },
  email: { bn: "ইমেইল (ঐচ্ছিক)", en: "Email (optional)" },
  address: { bn: "বিস্তারিত ঠিকানা", en: "Detailed address" },
  addressHint: {
    bn: "(এলাকা/রোড/ব্লক/ফ্ল্যাট নং)",
    en: "(Area / road / block / flat no.)",
  },
  division: { bn: "বিভাগ", en: "Division" },
  district: { bn: "জেলা", en: "District" },
  upazila: { bn: "উপজেলা / থানা", en: "Upazila / Thana" },
  selectDivision: { bn: "বিভাগ নির্বাচন করুন", en: "Select division" },
  selectDistrict: { bn: "জেলা নির্বাচন করুন", en: "Select district" },
  selectUpazila: { bn: "উপজেলা / থানা নির্বাচন করুন", en: "Select upazila / thana" },
  addMoreProducts: { bn: "আরও পণ্য যোগ করুন", en: "Add more products" },
  yourItems: { bn: "আপনার পণ্য", en: "Your items" },
  city: { bn: "শহর / এলাকা", en: "City / area" },
  area: { bn: "ডেলিভারি এলাকা", en: "Delivery area" },
  insideDhaka: { bn: "ঢাকার ভেতরে", en: "Inside Dhaka" },
  outsideDhaka: { bn: "ঢাকার বাইরে", en: "Outside Dhaka" },
  note: { bn: "অতিরিক্ত নির্দেশনা (ঐচ্ছিক)", en: "Order note (optional)" },
  codNote: {
    bn: "পণ্য হাতে পেয়ে টাকা পরিশোধ করুন। কোনো অগ্রিম লাগবে না।",
    en: "Pay when the product reaches your hand. No advance needed.",
  },
  orderPlaced: { bn: "অর্ডার সফল হয়েছে", en: "Order confirmed" },
  orderPlacedBody: {
    bn: "আমাদের টিম শীঘ্রই আপনাকে ফোন করে অর্ডারটি নিশ্চিত করবে।",
    en: "Our team will call you shortly to confirm the order.",
  },
  orderNumber: { bn: "অর্ডার নম্বর", en: "Order number" },
  orderFailed: {
    bn: "অর্ডারটি নেওয়া যায়নি। তথ্যগুলো দেখে আবার চেষ্টা করুন।",
    en: "We could not place the order. Please check the details and try again.",
  },
  invalidForm: { bn: "সব ঘর সঠিকভাবে পূরণ করুন।", en: "Please fill every field correctly." },
  
  tryAgain: { bn: "আবার চেষ্টা করুন", en: "Try again" },
} as const;

export type Dict = typeof t;

export function tr(lang: Lang, key: keyof Dict) {
  return t[key][lang];
}

const BADGE_EN: Record<string, string> = {
  "BEST SELLER": "BEST SELLER",
  "বেস্ট সেলার": "BEST SELLER",
  "বেস্টসেলার": "BEST SELLER",
  "নতুন": "NEW",
  "নিউ": "NEW",
  "সীমিত সময়": "LIMITED TIME",
  "সীমিত স্টক": "LIMITED STOCK",
  "জনপ্রিয়": "POPULAR",
  "হট": "HOT",
  "ছাড়": "SALE",
  "সেল": "SALE",
};

export function badgeLabel(bn?: string | null, en?: string | null): string {
  const raw = (en || "").trim();
  if (raw) return raw.toUpperCase();
  const b = (bn || "").trim();
  if (!b) return "";
  return (BADGE_EN[b] || b).toUpperCase();
}
