import { Link } from "@tanstack/react-router";
import { FileText, Headphones, RotateCcw, ScrollText, ShieldCheck, type LucideIcon } from "lucide-react";

import { RichText } from "@/components/site/rich-text";
import { Button } from "@/components/ui/button";
import type { LegalPageContent, LegalPageKey } from "@/lib/legal-content";

type PolicyKey = Exclude<LegalPageKey, "about">;

const policyDetails: Record<PolicyKey, { icon: LucideIcon; eyebrow: string; description: string }> = {
  legal_privacy: {
    icon: ShieldCheck,
    eyebrow: "আপনার তথ্য, আমাদের দায়িত্ব",
    description: "আপনার ব্যক্তিগত তথ্য কীভাবে সংগ্রহ, ব্যবহার ও সুরক্ষিত রাখা হয়—সহজ ভাষায় জেনে নিন।",
  },
  legal_terms: {
    icon: ScrollText,
    eyebrow: "স্বচ্ছ কেনাকাটার শর্ত",
    description: "অর্ডার, মূল্য, পেমেন্ট ও আমাদের সেবা ব্যবহারের প্রয়োজনীয় শর্তগুলো এক জায়গায় পড়ুন।",
  },
  legal_returns: {
    icon: RotateCcw,
    eyebrow: "নিশ্চিন্ত রিটার্ন ও এক্সচেঞ্জ",
    description: "পণ্য পরিবর্তন, ফেরত ও রিফান্ডের নিয়মগুলো পরিষ্কারভাবে জেনে নিশ্চিন্তে কেনাকাটা করুন।",
  },
};

const policyLinks: Array<{ key: PolicyKey; label: string; to: "/privacy-policy" | "/terms-and-conditions" | "/return-policy" }> = [
  { key: "legal_privacy", label: "Privacy Policy", to: "/privacy-policy" },
  { key: "legal_terms", label: "Terms & Conditions", to: "/terms-and-conditions" },
  { key: "legal_returns", label: "Return Policy", to: "/return-policy" },
];

export function LegalPage({ page, pageKey }: { page: LegalPageContent; pageKey: PolicyKey }) {
  const detail = policyDetails[pageKey];
  const Icon = detail.icon;
  return (
    <main className="overflow-hidden bg-background">
      <section className="bg-secondary text-secondary-foreground">
        <div className="mx-auto w-full max-w-6xl px-4 py-11 sm:py-15 lg:py-18">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-secondary-foreground/70 transition-colors hover:text-primary-dark">
            Home <span aria-hidden="true">/</span> <span className="text-primary-dark">{page.title}</span>
          </Link>
          <div className="mt-7 grid gap-7 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-end">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-semibold text-primary-dark"><Icon className="size-5" /> {detail.eyebrow}</div>
              <h1 className="mt-4 max-w-3xl text-4xl font-bold leading-tight sm:text-5xl">{page.title}</h1>
              <p className="mt-4 max-w-2xl text-base leading-8 text-secondary-foreground/75 sm:text-lg">{detail.description}</p>
            </div>
            <div className="border-l-4 border-primary bg-secondary-foreground/5 p-5 sm:p-6">
              <p className="text-sm font-semibold text-primary-dark">Upoharkabbo</p>
              <p className="mt-2 text-lg font-bold leading-7">স্বচ্ছতা, বিশ্বাস ও গ্রাহকের নিশ্চয়তা আমাদের অগ্রাধিকার।</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 sm:py-14 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-12">
        <aside className="lg:sticky lg:top-28 lg:self-start">
          <p className="flex items-center gap-2 text-sm font-bold text-primary-dark"><FileText className="size-4" /> নীতিমালা</p>
          <nav className="mt-4 grid border-y border-border" aria-label="Legal pages">
            {policyLinks.map((item) => (
              <Link
                key={item.key}
                to={item.to}
                aria-current={item.key === pageKey ? "page" : undefined}
                className={item.key === pageKey
                  ? "border-l-4 border-primary bg-accent px-4 py-3 text-sm font-bold text-foreground"
                  : "border-l-4 border-transparent px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>

        <article className="min-w-0 border-t-4 border-primary bg-card px-5 py-7 shadow-card sm:px-8 sm:py-9 lg:px-10">
          <RichText html={page.content} className="text-base leading-8 [&_h2]:text-foreground [&_h3]:text-foreground" />
        </article>
      </section>

      <section className="bg-accent">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-9 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-primary-dark"><Headphones className="size-4" /> সাহায্য প্রয়োজন?</p>
            <h2 className="mt-1 text-2xl font-bold text-foreground">নীতিমালা সম্পর্কে কোনো প্রশ্ন আছে?</h2>
          </div>
          <Button asChild variant="secondary"><Link to="/contact">আমাদের সাথে যোগাযোগ করুন</Link></Button>
        </div>
      </section>
    </main>
  );
}