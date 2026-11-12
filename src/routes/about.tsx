import { Link, createFileRoute } from "@tanstack/react-router";
import { BadgeCheck, Gift, RefreshCcw } from "lucide-react";

import { RichText } from "@/components/site/rich-text";
import { useSiteData } from "@/components/site/site-header";
import { Button } from "@/components/ui/button";
import { getLegalPage } from "@/lib/catalog.functions";
import { readLegalPage } from "@/lib/legal-content";
import { absoluteUrl } from "@/lib/site";

export const Route = createFileRoute("/about")({
  loader: () => getLegalPage({ data: { key: "about" } }),
  head: ({ loaderData }) => {
    const page = readLegalPage("about", loaderData);
    return {
      meta: [
        { title: page.metaTitle },
        { name: "description", content: page.metaDescription },
        { property: "og:title", content: page.metaTitle },
        { property: "og:description", content: page.metaDescription },
        { property: "og:type", content: "website" },
        { property: "og:url", content: absoluteUrl("/about") },
        { name: "twitter:card", content: "summary" },
      ],
      links: [{ rel: "canonical", href: absoluteUrl("/about") }],
    };
  },
  component: AboutPage,
});

export function AboutPage() {
  const page = readLegalPage("about", Route.useLoaderData());
  const { brand, contact } = useSiteData();
  const highlights = [
    { icon: Gift, title: "যত্নে সাজানো গিফট", text: "প্রতিটি উপলক্ষের জন্য ভাবনা দিয়ে বাছাই করা কম্বো ও উপহার" },
    { icon: BadgeCheck, title: "মান যাচাই", text: "পাঠানোর আগে প্রতিটি পণ্য ও প্যাকেজিং যত্নসহকারে পরীক্ষা" },
    { icon: RefreshCcw, title: "সহজ এক্সচেঞ্জ", text: "নীতিমালা অনুযায়ী ৭ দিনের সহজ রিটার্ন ও এক্সচেঞ্জ সুবিধা" },
  ];

  return (
    <main className="overflow-hidden bg-background">
      <section className="bg-secondary text-secondary-foreground">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-12 sm:py-16 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,.8fr)] lg:items-center lg:py-20">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-primary-dark">ভালোবাসা পৌঁছে দেওয়ার ঠিকানা</div>
            <h1 className="mt-4 max-w-3xl text-4xl font-bold leading-tight sm:text-5xl">{page.title}</h1>
            <p className="mt-4 max-w-2xl text-base leading-8 text-secondary-foreground/75 sm:text-lg">জন্মদিন, বিবাহবার্ষিকী কিংবা কর্পোরেট — প্রতিটি উপলক্ষের জন্য যত্নে সাজানো গিফট কম্বো ও উপহার সামগ্রী।</p>
            <Button asChild className="mt-7"><Link to="/categories">কালেকশন দেখুন</Link></Button>
          </div>
          <div className="border-l-4 border-primary bg-secondary-foreground/5 p-6 sm:p-8">
            <p className="text-sm font-semibold text-primary-dark">{brand}</p>
            <p className="mt-3 text-2xl font-bold leading-snug sm:text-3xl">উপহার নয়, প্রতিটি কম্বোতে থাকুক আপনার ভালোবাসা।</p>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-10 sm:py-14">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,.72fr)_minmax(0,1.28fr)] lg:gap-14">
          <div>
            <p className="text-sm font-bold text-primary-dark">আমাদের গল্প</p>
            <h2 className="mt-2 text-3xl font-bold leading-tight text-secondary">বিশ্বাসের সঙ্গে অনলাইনে উপহার কেনাকাটা</h2>
            <div className="mt-5 h-1 w-16 bg-primary" />
          </div>
          <RichText html={page.content} className="text-base leading-8" />
        </div>

        <div className="mt-12 grid gap-px overflow-hidden border border-border bg-border sm:grid-cols-3">
          {highlights.map(({ icon: Icon, title, text }) => (
            <article key={title} className="bg-card p-6 sm:p-7">
              <div className="flex size-11 items-center justify-center bg-accent text-primary-dark"><Icon className="size-5" /></div>
              <h3 className="mt-4 text-lg font-bold text-secondary">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="bg-accent">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-9 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="text-sm font-semibold text-primary-dark">আপনার পাশে আছি</p><h2 className="mt-1 text-2xl font-bold text-secondary">উপহার বাছাইয়ে সাহায্য প্রয়োজন?</h2></div>
          {contact.phone ? <Button asChild variant="secondary"><a href={`tel:${contact.phone}`}>কল করুন {contact.phone}</a></Button> : <Button asChild variant="secondary"><Link to="/contact">যোগাযোগ করুন</Link></Button>}
        </div>
      </section>
    </main>
  );
}
