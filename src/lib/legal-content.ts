export type LegalPageKey = "about" | "legal_privacy" | "legal_terms" | "legal_returns";

export type LegalPageContent = {
  title: string;
  metaTitle: string;
  metaDescription: string;
  content: string;
};

export const LEGAL_PAGES: Record<LegalPageKey, LegalPageContent & { path: string }> = {
  about: {
    path: "/about",
    title: "আমাদের কথা",
    metaTitle: "আমাদের কথা — উপহারকাব্য",
    metaDescription: "উপহারকাব্য প্রতিটি উপলক্ষের জন্য যত্নে সাজানো গিফট কম্বো তৈরি করে। আমাদের গল্প ও প্রতিশ্রুতি জানুন।",
    content: "<p>উপহারকাব্য শুরু হয়েছিল একটা সহজ ভাবনা থেকে — উপহার শুধু একটা জিনিস নয়, এটা একটা কথা বলার উপায়।</p><p>আমরা প্রতিটি গিফট কম্বো নিজেরা সাজাই। কোন উপলক্ষ, কার জন্য, বাজেট কত — এসব মাথায় রেখে পণ্য বাছাই করা হয়, তারপর হাতে মোড়ানো হয় সুন্দর বক্সে, সঙ্গে থাকে আপনার লেখা কার্ড।</p><p>পাঠানোর আগে প্রতিটি বক্স হাতে ধরে যাচাই করা হয় — পণ্যের মান, প্যাকেজিং আর মোড়কের নিখুঁততা। পছন্দ না হলে ডেলিভারির ৭ দিনের ভেতর ফেরত দেওয়া যাবে।</p>",
  },
  legal_privacy: {
    path: "/privacy-policy",
    title: "Privacy Policy",
    metaTitle: "Privacy Policy — Upoharkabbo",
    metaDescription: "উপহারকাব্য কীভাবে অর্ডারের তথ্য সংগ্রহ, ব্যবহার, শেয়ার ও সুরক্ষিত রাখে এবং Google ডেটার ক্ষেত্রে কী নীতি মেনে চলে তা জানুন।",
    content: "<h2>আপনার গোপনীয়তা আমাদের কাছে গুরুত্বপূর্ণ</h2><p>উপহারকাব্য (https://upoharkabbo.com) বাংলাদেশের একটি অনলাইন গিফট শপ। এই নীতিমালায় ব্যাখ্যা করা হয়েছে আমাদের ওয়েবসাইট ব্যবহার ও অর্ডার করার সময় কোন তথ্য সংগ্রহ করা হয়, কীভাবে ব্যবহার ও সুরক্ষিত রাখা হয় এবং এ বিষয়ে আপনার অধিকার কী। অর্ডার করতে কোনো অ্যাকাউন্ট খোলা বা লগইন করার প্রয়োজন নেই।</p><h3>আমরা যে তথ্য সংগ্রহ করি</h3><ul><li><strong>অর্ডারের তথ্য:</strong> নাম, মোবাইল নম্বর, ডেলিভারি ঠিকানা, অর্ডার করা পণ্য ও নোট।</li><li><strong>ডিভাইস ও ব্যবহারের তথ্য:</strong> ব্রাউজারের ধরন, IP ঠিকানা, দেখা পেজ এবং কুকি — সাইট চালু রাখা, নিরাপত্তা ও পরিসংখ্যানের জন্য।</li></ul><h3>তথ্যের ব্যবহার</h3><ul><li>অর্ডার প্রক্রিয়াকরণ ও ডেলিভারি</li><li>অর্ডারসংক্রান্ত কল বা এসএমএস</li><li>গ্রাহক সহায়তা</li><li>ভুয়া অর্ডার ও জালিয়াতি প্রতিরোধ</li><li>সাইটের মান উন্নয়ন ও আইনগত বাধ্যবাধকতা পালন</li></ul><h3>তথ্য শেয়ার</h3><p>আমরা আপনার ব্যক্তিগত তথ্য বিক্রি বা ভাড়া দিই না। শুধু সেবা দেওয়ার প্রয়োজনে বিশ্বস্ত সেবাদাতাদের (যেমন কুরিয়ার, এসএমএস, হোস্টিং ও অ্যানালিটিক্স) সঙ্গে প্রয়োজনীয় তথ্য শেয়ার করা হয়, অথবা আইন অনুযায়ী প্রয়োজন হলে।</p><h3>কুকি ও বিজ্ঞাপন</h3><p>সাইটের কার্যকারিতা, পরিসংখ্যান এবং বিজ্ঞাপনের ফলাফল পরিমাপের জন্য কুকি ও অনুরূপ প্রযুক্তি ব্যবহার করা হতে পারে। ব্রাউজারের সেটিংস থেকে কুকি নিয়ন্ত্রণ বা মুছে ফেলা যায়।</p><h3>Google ব্যবহারকারীর ডেটা</h3><p>কোনো ক্ষেত্রে Google সেবার মাধ্যমে তথ্য পাওয়া গেলে তা শুধু মৌলিক পরিচয় যাচাই (নাম ও ইমেইল) ও নিরাপদ লগইনের জন্য ব্যবহার করা হয়। এই তথ্য বিক্রি, বিজ্ঞাপনের জন্য শেয়ার বা AI মডেল প্রশিক্ষণে ব্যবহার করা হয় না। Google API থেকে পাওয়া তথ্যের ব্যবহার <a href='https://developers.google.com/terms/api-services-user-data-policy' target='_blank' rel='noopener noreferrer'>Google API Services User Data Policy</a>-এর Limited Use শর্তসহ মেনে চলে।</p><h3>তথ্যের সুরক্ষা ও সংরক্ষণ</h3><p>আমরা এনক্রিপ্টেড সংযোগ (HTTPS), সীমিত অ্যাক্সেস ও যুক্তিসঙ্গত প্রযুক্তিগত ব্যবস্থার মাধ্যমে তথ্য সুরক্ষিত রাখি। অর্ডার, হিসাব ও আইনগত প্রয়োজনে যতদিন দরকার ততদিনই তথ্য সংরক্ষণ করা হয়।</p><h3>আপনার অধিকার ও তথ্য মুছে ফেলা</h3><p>আপনার তথ্য দেখা, সংশোধন বা মুছে ফেলার অনুরোধ যেকোনো সময় সাপোর্টে জানাতে পারেন। যাচাইয়ের পর আইনগতভাবে সংরক্ষণ বাধ্যতামূলক নয় এমন সব তথ্য মুছে ফেলা হবে।</p><h3>শিশুদের গোপনীয়তা</h3><p>আমাদের সেবা ১৩ বছরের কম বয়সীদের উদ্দেশ্যে নয় এবং আমরা জেনে-শুনে তাদের তথ্য সংগ্রহ করি না।</p><h3>নীতিমালার পরিবর্তন</h3><p>প্রয়োজনে এই নীতিমালা হালনাগাদ করা হতে পারে; পরিবর্তন এই পেজেই প্রকাশ করা হবে।</p><h3>যোগাযোগ</h3><p>এই নীতিমালা বা আপনার তথ্য সম্পর্কে প্রশ্ন থাকলে আমাদের সাপোর্ট নম্বর বা ইমেইলে যোগাযোগ করুন।</p><p><strong>English summary:</strong> Upoharkabbo is an online gift shop in Bangladesh. Customers order without creating an account; we collect only the details needed to deliver orders (name, phone, address) and basic usage data via cookies. We never sell personal data and share it only with service providers such as couriers and SMS gateways. Any information received from Google APIs is used only for basic identity verification and secure sign-in, is never sold, shared for advertising or used to train AI models, and adheres to the Google API Services User Data Policy, including the Limited Use requirements. Contact us to request access to or deletion of your data.</p>",
  },
  legal_terms: {
    path: "/terms-and-conditions",
    title: "Terms & Conditions",
    metaTitle: "Terms & Conditions — Upoharkabbo",
    metaDescription: "উপহারকাব্য থেকে গিফট অর্ডার, মূল্য, ডেলিভারি, পেমেন্ট ও ব্যবহারের শর্তাবলি পড়ুন।",
    content: "<h2>অর্ডারের শর্তাবলি</h2><p>উপহারকাব্য-এ অর্ডার করার মাধ্যমে আপনি এই শর্তাবলিতে সম্মতি দিচ্ছেন। পণ্যের ছবি ও রঙ যতটা সম্ভব সঠিকভাবে দেখানো হয়; তবে স্ক্রিন ও আলোর পার্থক্যে সামান্য ভিন্নতা হতে পারে।</p><h3>মূল্য ও পেমেন্ট</h3><p>ওয়েবসাইটে প্রদর্শিত মূল্য বাংলাদেশি টাকায়। প্রযোজ্য ডেলিভারি চার্জ অর্ডার নিশ্চিত করার আগে দেখানো হবে। ক্যাশ অন ডেলিভারি বা উপলভ্য অনুমোদিত পেমেন্ট পদ্ধতিতে মূল্য পরিশোধ করা যাবে।</p><h3>অর্ডার ও ডেলিভারি</h3><p>স্টক, ঠিকানা যাচাই এবং যোগাযোগ সফল হওয়ার ওপর অর্ডার গ্রহণ নির্ভর করে। ভুল বা অসম্পূর্ণ তথ্যের কারণে ডেলিভারিতে বিলম্ব হলে উপহারকাব্য দায়ী থাকবে না।</p><h3>ব্যবহারবিধি</h3><p>ভুয়া অর্ডার, প্রতারণামূলক কার্যক্রম বা সেবার অপব্যবহার শনাক্ত হলে অর্ডার বাতিল বা ভবিষ্যৎ অর্ডার সীমিত করা হতে পারে।</p>",
  },
  legal_returns: {
    path: "/return-policy",
    title: "Return Policy",
    metaTitle: "Return Policy — Upoharkabbo",
    metaDescription: "উপহারকাব্য-এর গিফট পরিবর্তন, ফেরত, ত্রুটিপূর্ণ পণ্য ও রিফান্ডের নিয়ম জানুন।",
    content: "<h2>রিটার্ন ও এক্সচেঞ্জ</h2><p>ভুল পণ্য বা উৎপাদনজনিত ত্রুটি থাকলে পণ্য হাতে পাওয়ার ৭ দিনের মধ্যে আমাদের সঙ্গে যোগাযোগ করুন। পণ্যটি অব্যবহৃত, অপরিষ্কার, অক্ষত এবং মূল ট্যাগ ও প্যাকেজিংসহ থাকতে হবে।</p><h3>যেভাবে অনুরোধ করবেন</h3><ol><li>অর্ডার নম্বরসহ সাপোর্ট টিমে যোগাযোগ করুন।</li><li>সমস্যাটি স্পষ্ট দেখা যায় এমন ছবি বা ভিডিও দিন।</li><li>আমাদের নির্দেশনা অনুযায়ী পণ্যটি ফেরত পাঠান।</li></ol><h3>যেসব ক্ষেত্রে রিটার্ন প্রযোজ্য নয়</h3><p>ব্যবহৃত, ধোয়া, সুগন্ধি বা দাগযুক্ত, পরিবর্তন করা কিংবা ট্যাগবিহীন পণ্য ফেরত নেওয়া হবে না। শুধু পছন্দ পরিবর্তনের ক্ষেত্রে ফেরত ডেলিভারি খরচ গ্রাহককে বহন করতে হতে পারে।</p><h3>রিফান্ড</h3><p>ফেরত পণ্য যাচাইয়ের পর প্রযোজ্য রিফান্ড অনুমোদিত পেমেন্ট মাধ্যমে সম্পন্ন করা হবে। ব্যাংক বা মোবাইল আর্থিক সেবার প্রক্রিয়াকরণে অতিরিক্ত সময় লাগতে পারে।</p>",
  },
};

export function readLegalPage(
  key: LegalPageKey,
  raw: Record<string, unknown> | undefined,
): LegalPageContent {
  const fallback = LEGAL_PAGES[key];
  const text = (name: string, defaultValue: string) => {
    const value = raw?.[name];
    return typeof value === "string" && value.trim() ? value : defaultValue;
  };
  return {
    title: text("title", fallback.title),
    metaTitle: text("meta_title", fallback.metaTitle),
    metaDescription: text("meta_description", fallback.metaDescription),
    content: text("content", fallback.content),
  };
}