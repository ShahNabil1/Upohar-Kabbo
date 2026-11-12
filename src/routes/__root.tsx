import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  useRouterState,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { getLayoutData } from "../lib/catalog.functions";
import { getLang } from "../lib/lang.functions";
import { getGtmContainerId } from "../lib/tracking.functions";

import { LanguageProvider, useLang } from "../lib/language-context";
import { tr } from "../lib/i18n";
import { SiteHeader } from "../components/site/site-header";
import { SiteFooter } from "../components/site/site-footer";
import { LandingFooter } from "../components/site/landing-footer";
import { NotFoundView } from "../components/site/not-found-view";
import { CartProvider } from "@/lib/cart-context";
import { CartDrawer } from "@/components/site/cart-drawer";
import { AuthProvider } from "../lib/auth-context";
import { Toaster } from "../components/ui/sonner";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { SITE_URL } from "../lib/site";
import { useDigitNormalizer } from "../lib/use-digit-normalizer";
import { RoutePending } from "../components/site/route-pending";
import { captureAttribution } from "../lib/attribution";
import { BlockedSupportProvider } from "@/components/site/blocked-support-dialog";


function str(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value : fallback;
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  loader: async () => {
    const [lang, layout, gtm] = await Promise.all([
      getLang().catch(() => "bn" as const),
      getLayoutData().catch(() => ({
        categories: [] as Awaited<ReturnType<typeof getLayoutData>>["categories"],
        settings: {} as Awaited<ReturnType<typeof getLayoutData>>["settings"],
      })),
      getGtmContainerId().catch(() => ({ gtmId: "" })),
    ]);
    const general = layout.settings["general"] ?? {};
    const contactSetting = layout.settings["contact"] ?? {};


    return {
      lang,
      categories: layout.categories,
      gtmId: gtm.gtmId,
      brand: str(general["brand_name"], "উপহারকাব্য"),
      tagline: str(general["tagline"], "গিফট কম্বো ও উপহার সামগ্রী · সারা দেশে ক্যাশ অন ডেলিভারি"),
      contact: {
        phone: str(contactSetting["phone"], ""),
        email: str(contactSetting["email"], ""),
        address: str(contactSetting["address"], ""),
      },
    };
  },

  head: ({ loaderData }) => {
    const brand = loaderData?.brand ?? "উপহারকাব্য";
    return {
      meta: [
        { charSet: "utf-8" },
        {
          name: "viewport",
          content:
            "width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content",
        },
        { title: `${brand} — গিফট কম্বো ও উপহার সামগ্রী` },
        {
          name: "description",
          content:
            "উপহারকাব্য থেকে গিফট কম্বো, উপহার সামগ্রী ও বিশেষ অনুষ্ঠানের কালেকশন কিনুন। সারা দেশে ক্যাশ অন ডেলিভারি উপভোগ করুন।",
        },
        {
          name: "google-site-verification",
          content: "cXRYWCzWKgQUOaUz8mLsw-P1yraw7rQ-hXbzFZHI3-g",
        },
        { property: "og:site_name", content: brand },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "theme-color", content: "#ffffff" },
        { name: "google", content: "notranslate" },
      ],
      links: [
        { rel: "stylesheet", href: appCss },
        // Google's crawler prefers a root .ico; keep the PNG variants for browsers.
        { rel: "icon", href: "/favicon.ico", sizes: "48x48" },
        { rel: "icon", href: "/favicon.png", type: "image/png", sizes: "64x64" },
        { rel: "icon", href: "/icon-192.png", type: "image/png", sizes: "192x192" },
        { rel: "icon", href: "/icon-512.png", type: "image/png", sizes: "512x512" },
        { rel: "apple-touch-icon", href: "/apple-touch-icon.png", sizes: "180x180" },
        { rel: "manifest", href: "/manifest.webmanifest" },
        { rel: "preconnect", href: "https://fonts.googleapis.com" },
        { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
        {
          rel: "stylesheet",
          href: "https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap",
        },
      ],


      scripts: [
        // Google Tag Manager — container id is managed from Admin → API &
        // Integrations, so pixels can be swapped without a code change.
        ...(loaderData?.gtmId
          ? [
              {
                // dataLayer is created immediately so every event pushed before
                // GTM arrives is queued and replayed (no tracking loss). The
                // container itself loads on first interaction or shortly after
                // page load, keeping pixels off the critical rendering path.
                children: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var done=false,ev=['pointerdown','keydown','touchstart','scroll'];function load(){if(done)return;done=true;ev.forEach(function(e){w.removeEventListener(e,load,{passive:true})});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);}ev.forEach(function(e){w.addEventListener(e,load,{passive:true,once:true})});function later(){setTimeout(function(){(w.requestIdleCallback||function(c){c()})(load,{timeout:2000})},3500)}if(d.readyState==='complete')later();else w.addEventListener('load',later);})(window,document,'script','dataLayer','${loaderData.gtmId}');`,
              },
            ]
          : []),

        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": ["Organization", "OnlineStore"],
                "@id": `${SITE_URL}/#organization`,
                name: brand,
                url: SITE_URL,
                ...(loaderData?.contact.phone
                  ? {
                      contactPoint: [
                        {
                          "@type": "ContactPoint",
                          telephone: loaderData.contact.phone,
                          contactType: "customer service",
                          areaServed: "BD",
                          availableLanguage: ["bn", "en"],
                        },
                      ],
                    }
                  : {}),
                ...(loaderData?.contact.address
                  ? (() => {
                      const raw = loaderData.contact.address.trim();
                      const postal = raw.match(/\b(\d{4})\b(?!.*\b\d{4}\b)/)?.[1];
                      const street =
                        raw
                          .replace(/,?\s*Dhaka\s*-?\s*\d{4}\s*$/i, "")
                          .replace(/,?\s*\d{4}\s*$/, "")
                          .trim() || raw;
                      return {
                        address: {
                          "@type": "PostalAddress",
                          streetAddress: street,
                          ...(postal ? { postalCode: postal } : {}),
                          addressCountry: "BD",
                        },
                      };
                    })()
                  : {}),
              },
              {
                "@type": "WebSite",
                "@id": `${SITE_URL}/#website`,
                name: brand,
                alternateName: ["Upoharkabbo", "upoharkabbo.com"],
                url: SITE_URL,

                inLanguage: ["bn", "en"],
                publisher: { "@id": `${SITE_URL}/#organization` },
                potentialAction: {
                  "@type": "SearchAction",
                  target: {
                    "@type": "EntryPoint",
                    urlTemplate: `${SITE_URL}/search?q={search_term_string}`,
                  },
                  "query-input": "required name=search_term_string",
                },
              },
            ],
          }),
        },
      ],
    };
  },
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: RootNotFound,
  errorComponent: ErrorComponent as unknown as import("@tanstack/react-router").ErrorRouteComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="bn" translate="no" className="notranslate">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function Chrome({ children, brand }: { children: ReactNode; brand: string }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const bare = pathname.startsWith("/admin") || pathname.startsWith("/auth");
  const isLanding = pathname.startsWith("/lp");
  const bareOnMobile = pathname.startsWith("/invoice") || pathname.startsWith("/inv/");
  const isCheckout = pathname === "/checkout";
  const isProduct = pathname.startsWith("/p/");

  if (bare) {
    return <div className="min-h-screen">{children}</div>;
  }

  return (
    <div className="flex min-h-screen flex-col" data-site-shell>
      <div className={bareOnMobile ? "hidden md:block" : ""} data-site-chrome>
        <SiteHeader />
      </div>
      <main className="flex-1">{children}</main>
      <div className={bareOnMobile ? "hidden md:block" : ""} data-site-chrome>
        {isLanding ? (
          <LandingFooter brand={brand} />
        ) : isProduct ? (
          <>
            <div className="sm:hidden">
              <LandingFooter brand={brand} />
            </div>
            <div className="hidden sm:block">
              <SiteFooter />
            </div>
          </>
        ) : (
          <SiteFooter minimalOnMobile={isCheckout} />
        )}
      </div>
    </div>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const { lang, brand } = Route.useLoaderData();
  // Bangla/Arabic-Indic digits typed in any field become English digits.
  useDigitNormalizer();

  // Marketing attribution (UTM, fbclid → _fbc, _fbp) is captured on every page
  // view — main site and landing pages alike — so checkout can attach it.
  const href = useRouterState({ select: (s) => s.location.href });
  useEffect(() => {
    captureAttribution();
  }, [href]);

  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider initialLang={lang}>
        <AuthProvider>
          <BlockedSupportProvider>
            <CartProvider>
              <ConfirmProvider>
            <RoutePending />
            <Chrome brand={brand}>
              {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
              <Outlet />
            </Chrome>
            <CartDrawer />
            <Toaster position="top-center" richColors closeButton />
              </ConfirmProvider>
            </CartProvider>
          </BlockedSupportProvider>

        </AuthProvider>
      </LanguageProvider>
    </QueryClientProvider>
  );
}

function RootNotFound() {
  return <NotFoundView />;
}

function ErrorBody({ error, reset }: { error: Error; reset: () => void }) {
  const { lang } = useLang();
  const router = useRouter();

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-4 py-24 text-center">
      <h1 className="text-2xl font-bold tracking-tight">{tr(lang, "errorTitle")}</h1>
      <p className="mt-3 text-sm leading-7 text-muted-foreground">{tr(lang, "errorBody")}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <button
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className="rounded-sm bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
        >
          {tr(lang, "tryAgain")}
        </button>
        <a
          href="/"
          className="rounded-sm border border-border bg-card px-5 py-2.5 text-sm font-semibold"
        >
          {tr(lang, "backHome")}
        </a>
      </div>
      <p className="sr-only">{error.message}</p>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void; info?: unknown }) {
  console.error(error);
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col">
      <ErrorBody error={error} reset={reset} />
    </div>
  );
}
