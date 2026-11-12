# GTM Template — এক ক্লিকে সেটআপ

`public/gtm/upoharkabbo-gtm-template.json` হলো একটা **রি-ইউজেবল GTM কন্টেইনার এক্সপোর্ট**।
যেকোনো নতুন GTM অ্যাকাউন্ট/কন্টেইনারে ইমপোর্ট করলেই পুরো ট্র্যাকিং সেটআপ দাঁড়িয়ে যায়।

লিংক: `https://<your-domain>/gtm/upoharkabbo-gtm-template.json`

## ভিতরে কী আছে

- **GA4** — Configuration + view_item, view_item_list, add_to_cart, begin_checkout,
  add_payment_info, purchase, search, generate_lead, scroll (25/50/75/100%)
- **Meta Pixel** — Base + PageView, ViewContent, AddToCart, InitiateCheckout,
  AddPaymentInfo, Purchase, Search, Contact (প্রতিটাতে `eventID` = dataLayer `event_id`,
  তাই CAPI-এর সাথে ডিডুপ্লিকেশন হয়)
- **TikTok Pixel** — Base + ViewContent, AddToCart, InitiateCheckout, PlaceAnOrder,
  Search, Contact (`event_id` সহ)
- **Microsoft Clarity** — All Pages
- **Data Layer Variables** — event_id, surface, external_id, fbp, fbc, ttclid, ttp,
  value, currency, content_ids, contents, content_type, num_items, percent_scrolled,
  transaction_id, items, order_number
- **Triggers** — `src/lib/tracking.ts` যেসব custom event পুশ করে ঠিক সেগুলোর জন্য

## ইমপোর্ট (নতুন প্রোজেক্টে)

1. GTM → **Admin → Import Container**
2. ফাইল সিলেক্ট করো → Workspace: **New / Existing**
3. নতুন কন্টেইনার হলে **Overwrite**, চালু কন্টেইনার হলে **Merge → Rename conflicting**
4. Preview করে চেক করো, তারপর **Submit**

## ইমপোর্টের পর শুধু ৪টা জায়গা বদলাও

Variables → এই ৪টা Constant-এ নতুন প্রোজেক্টের আইডি বসাও:

| Variable | মান |
| --- | --- |
| `CFG - GA4 Measurement ID` | `G-XXXXXXXXXX` |
| `CFG - Meta Pixel ID` | Meta Pixel ID |
| `CFG - TikTok Pixel ID` | TikTok Pixel ID |
| `CFG - Clarity Project ID` | Clarity Project ID |

আর অ্যাডমিন প্যানেলে **API & Integrations → Analytics & Tracking**-এ GTM Container ID
(`GTM-XXXXXXX`) বসালেই সাইটে কন্টেইনার ইনজেক্ট হয়ে যায়। সার্ভার-সাইড (Meta CAPI,
TikTok Events API, GA4 Measurement Protocol) ওখান থেকেই আলাদা করে সেট হয়।

## টেমপ্লেট আপডেট করতে

ট্যাগ/ইভেন্ট যোগ করতে `scripts/build-gtm-template.mjs` এডিট করে:

```bash
node scripts/build-gtm-template.mjs
```

তাহলে JSON রি-জেনারেট হবে। GTM-এ হাতে করা পরিবর্তনও
**Admin → Export Container** দিয়ে নামিয়ে এই ফাইল রিপ্লেস করে রাখা যায়।
