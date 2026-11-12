import { createFileRoute } from "@tanstack/react-router";
import { ArrowUpRight, Banknote, Clock3, Mail, MapPin, Phone } from "lucide-react";

import { useLang } from "@/lib/language-context";
import { tr } from "@/lib/i18n";
import { useSiteData } from "@/components/site/site-header";
import { Breadcrumbs, Section } from "@/components/site/ui";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "যোগাযোগ | Contact — উপহারকাব্য" },
      {
        name: "description",
        content: "অর্ডার, ডেলিভারি বা পণ্য সংক্রান্ত যেকোনো প্রশ্নে ফোন, ইমেইল বা হোয়াটসঅ্যাপে যোগাযোগ করুন।",
      },
      { property: "og:title", content: "যোগাযোগ | Contact — উপহারকাব্য" },
      { property: "og:description", content: "ফোন, ইমেইল বা সরাসরি দোকানে যোগাযোগ করুন।" },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "/contact" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "/contact" }],
  }),
  component: ContactPage,
});

function ContactPage() {
  const { lang } = useLang();
  const { brand, contact } = useSiteData();

  const details = [
    contact.phone
      ? {
          label: lang === "bn" ? "ফোন" : "Phone",
          value: contact.phone,
          href: `tel:${contact.phone}`,
          icon: Phone,
        }
      : null,
    contact.email
      ? {
          label: lang === "bn" ? "ইমেইল" : "Email",
          value: contact.email,
          href: `mailto:${contact.email}`,
          icon: Mail,
        }
      : null,
    contact.address
      ? {
          label: lang === "bn" ? "ঠিকানা" : "Address",
          value: contact.address,
          href: null,
          icon: MapPin,
        }
      : null,
    {
      label: lang === "bn" ? "পেমেন্ট" : "Payment",
      value: tr(lang, "cod"),
      href: null,
      icon: Banknote,
    },
  ].filter(Boolean) as Array<{
    label: string;
    value: string;
    href: string | null;
    icon: typeof Phone;
  }>;

  const supportHours = lang === "bn" ? "প্রতিদিন · সকাল ১০টা—রাত ৮টা" : "Every day · 10am—8pm";
  const phoneHref = contact.phone ? `tel:${contact.phone}` : null;

  return (
    <main className="overflow-hidden bg-background">
      <section className="bg-secondary text-secondary-foreground">
        <div className="mx-auto w-full max-w-6xl px-4 pb-12 pt-6 sm:pb-16 sm:pt-8 lg:pb-20">
          <div className="[&_a]:text-secondary-foreground/70 [&_span]:text-secondary-foreground/70">
            <Breadcrumbs
              items={[{ label: tr(lang, "home"), to: "/" }, { label: tr(lang, "contact") }]}
            />
          </div>

          <div className="mt-10 grid min-w-0 gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)] lg:items-end lg:gap-16">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-primary-dark">
                {lang === "bn" ? "আমরা আছি আপনার পাশে" : "We are here for you"}
              </p>
              <h1 className="mt-3 max-w-2xl text-4xl font-bold leading-tight sm:text-5xl lg:text-6xl">
                {lang === "bn" ? "কথা বলুন আমাদের সঙ্গে" : "Let’s talk"}
              </h1>
              <p className="mt-5 max-w-xl text-base leading-8 text-secondary-foreground/75 sm:text-lg">
                {lang === "bn"
                  ? `অর্ডার, ডেলিভারি বা পণ্য নিয়ে জানতে ${brand}-এর সঙ্গে সরাসরি যোগাযোগ করুন।`
                  : `Contact ${brand} directly about an order, delivery, or product.`}
              </p>
              {phoneHref ? (
                <Button asChild size="lg" className="mt-7 h-12 px-6 shadow-lift">
                  <a href={phoneHref}>
                    <Phone />
                    {lang === "bn" ? "এখনই কল করুন" : "Call now"}
                  </a>
                </Button>
              ) : null}
            </div>

            <div className="border-l-2 border-primary pl-5 sm:pl-7">
              <Clock3 className="size-6 text-primary-dark" aria-hidden />
              <p className="mt-4 text-sm text-secondary-foreground/60">
                {lang === "bn" ? "সাপোর্ট সময়" : "Support hours"}
              </p>
              <p className="mt-1 text-xl font-semibold sm:text-2xl">{supportHours}</p>
            </div>
          </div>
        </div>
      </section>

      <Section className="py-12 sm:py-16 lg:py-20">
        <div className="mb-7 grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-primary-dark">
              {lang === "bn" ? "যোগাযোগের বিস্তারিত" : "Contact details"}
            </p>
            <h2 className="mt-2 text-2xl font-bold sm:text-3xl">
              {lang === "bn" ? "আপনার সুবিধামতো যোগাযোগ করুন" : "Reach us your way"}
            </h2>
          </div>
          <p className="max-w-sm text-sm leading-6 text-muted-foreground sm:text-right">
            {lang === "bn" ? "প্রয়োজনীয় সব তথ্য এক জায়গায়।" : "Everything you need, in one place."}
          </p>
        </div>

        <dl className="grid gap-3 sm:grid-cols-2">
          {details.map((detail) => {
            const Icon = detail.icon;
            const content = (
              <>
                <span className="grid size-11 shrink-0 place-items-center rounded-md bg-accent text-accent-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <Icon className="size-5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <dt className="text-sm text-muted-foreground">{detail.label}</dt>
                  <dd className="mt-1 break-words text-base font-semibold leading-6 text-card-foreground">
                    {detail.value}
                  </dd>
                </span>
                {detail.href ? (
                  <ArrowUpRight
                    className="mt-1 size-5 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary-dark"
                    aria-hidden
                  />
                ) : null}
              </>
            );

            return detail.href ? (
              <a
                key={detail.label}
                href={detail.href}
                className="group flex min-w-0 items-start gap-4 rounded-lg border border-border bg-card p-5 shadow-card transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-6"
              >
                {content}
              </a>
            ) : (
              <div
                key={detail.label}
                className="group flex min-w-0 items-start gap-4 rounded-lg border border-border bg-card p-5 shadow-card sm:p-6"
              >
                {content}
              </div>
            );
          })}
        </dl>
      </Section>
    </main>
  );
}
