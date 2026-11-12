import { Link, createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, FilePenLine, ImagePlus, Search, Trash2 } from "lucide-react";

import { adminListSettings, adminSaveSetting } from "@/lib/admin.functions";
import { AdminHeading, AreaField, NumberField, Panel, TextField } from "@/components/admin/kit";
import { SaveButton, isDirty } from "@/components/admin/save-button";
import { ImageField } from "@/components/admin/image-upload";
import { DeliverySettingsPanel } from "@/components/admin/delivery-settings";
import { MAX_HERO_SLIDES, readHeroSlides, type HeroSlide } from "@/components/site/hero-slider";
import { readPromoPopup, type PromoPopup } from "@/components/site/promo-popup";
import { Button } from "@/components/ui/button";
import { normalizeContactPhoneInput } from "@/lib/phone";

export const Route = createFileRoute("/admin/settings/")({
  component: SettingsAdmin,
});

type Obj = Record<string, unknown>;

function str(map: Obj, key: string) {
  const v = map[key];
  return typeof v === "string" ? v : "";
}
function n(map: Obj, key: string, fallback = 0) {
  const v = map[key];
  return typeof v === "number" ? v : fallback;
}

function SettingsAdmin() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["admin", "settings"], queryFn: () => adminListSettings() });

  const [general, setGeneral] = useState<Obj>({});
  const [homeSeo, setHomeSeo] = useState<Obj>({});
  const [contact, setContact] = useState<Obj>({});
  const [delivery, setDelivery] = useState<Obj>({});
  const [slides, setSlides] = useState<HeroSlide[]>([]);
  const [popup, setPopup] = useState<PromoPopup>(() => readPromoPopup(undefined));

  const find = useCallback(
    (key: string) => ((data?.find((r) => r.key === key)?.value ?? {}) as Obj) satisfies Obj,
    [data],
  );

  useEffect(() => {
    if (!data) return;
    setGeneral(find("general"));
    setHomeSeo(find("home_seo"));
    setContact(find("contact"));
    setDelivery(find("delivery"));
    setSlides(readHeroSlides(find("hero") as never));
    setPopup(readPromoPopup(find("popup") as never));
  }, [data, find]);



  const save = useMutation({
    mutationFn: (input: { key: string; value: Obj }) => adminSaveSetting({ data: input }),
    onSuccess: async () => {
      toast.success("Settings saved");
      await qc.invalidateQueries({ queryKey: ["admin", "settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pendingKey = save.isPending ? save.variables?.key : null;
  const savedHero = readHeroSlides(find("hero") as never);
  const savedPopup = readPromoPopup(find("popup") as never);

  return (
    <div className="space-y-6 pb-16">
      <AdminHeading
        title="Settings"
        description="Hero banner, brand, contact and delivery charges."
      />

      <Panel className="space-y-4">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Search className="size-4" />
          </span>
          <div>
            <h2 className="ig-text text-sm font-bold">Homepage SEO & social sharing</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Controls the title, description and preview image used by Google and when the main
              website link is shared on Facebook, WhatsApp or other platforms.
            </p>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]">
          <div className="space-y-4">
            <TextField
              label="Meta title"
              value={str(homeSeo, "meta_title")}
              onChange={(value) => setHomeSeo({ ...homeSeo, meta_title: value })}
              maxLength={60}
              hint="সর্বোচ্চ ৬০ ক্যারেক্টার। মূল কীওয়ার্ড ও ব্র্যান্ডের নাম রাখুন।"
            />
            <AreaField
              label="Meta description"
              rows={4}
              value={str(homeSeo, "meta_description")}
              onChange={(value) => setHomeSeo({ ...homeSeo, meta_description: value })}
              maxLength={160}
              hint="সর্বোচ্চ ১৬০ ক্যারেক্টার। পণ্য, সুবিধা ও ডেলিভারির সংক্ষিপ্ত তথ্য দিন।"
            />
          </div>
          <ImageField
            label="OG image"
            folder="site"
            value={str(homeSeo, "og_image") || null}
            onChange={(url) => setHomeSeo({ ...homeSeo, og_image: url ?? "" })}
            cropPreset="og"
            hint="বেস্ট সাইজ: ১২০০×৬৩০ px (১.৯১:১), JPG/WebP, ৩০০ KB-এর কম। আপলোডের পর Crop চাপলে ছবিটি সঠিক অনুপাতে অ্যাডজাস্ট হবে।"
          />
        </div>

        <SaveButton
          dirty={isDirty(homeSeo, find("home_seo"))}
          loading={pendingKey === "home_seo"}
          onClick={() =>
            save.mutate({
              key: "home_seo",
              value: {
                meta_title: str(homeSeo, "meta_title").trim(),
                meta_description: str(homeSeo, "meta_description").trim(),
                og_image: str(homeSeo, "og_image").trim(),
              },
            })
          }
        />
      </Panel>

      <Panel className="space-y-3">
        <div>
          <h2 className="ig-text text-sm font-bold">About & legal pages</h2>
          <p className="mt-1 text-xs text-muted-foreground">Edit the information and policies linked in the storefront footer.</p>
        </div>
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border/70">
          {[
            { title: "About Us", to: "/admin/settings/about" as const },
            { title: "Privacy Policy", to: "/admin/settings/privacy-policy" as const },
            { title: "Terms & Conditions", to: "/admin/settings/terms-and-conditions" as const },
            { title: "Return Policy", to: "/admin/settings/return-policy" as const },
          ].map((item) => (
            <div key={item.to} className="flex items-center justify-between gap-3 bg-background/40 px-3 py-3">
              <span className="min-w-0 text-sm font-semibold">{item.title}</span>
              <Button asChild size="sm" variant="outline">
                <Link to={item.to}><FilePenLine className="size-4" />Edit</Link>
              </Button>
            </div>
          ))}
        </div>
      </Panel>

      <Panel className="space-y-4">
        <div>
          <h2 className="ig-text text-sm font-bold">Hero banner slider</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            At least 1, up to {MAX_HERO_SLIDES} banners. Adding a link makes
            the banner clickable (e.g. <code className="rounded bg-muted px-1">/c/gift-combo</code>).
          </p>
        </div>

        <div className="space-y-3">
          {slides.map((slide, i) => (
            <div
              key={i}
              className="admin-rise space-y-3 rounded-xl border border-border/70 bg-background/40 p-3 transition-all duration-200 hover:border-primary/30"
            >
              <div className="flex items-center justify-between">
                <span className="ig-text text-xs font-bold">Banner {i + 1}</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={i === 0}
                    aria-label="Move up"
                    onClick={() => {
                      const next = slides.slice();
                      const [row] = next.splice(i, 1);
                      next.splice(i - 1, 0, row!);
                      setSlides(next);
                    }}
                    className="rounded-lg border border-border/80 p-1 transition-colors hover:border-primary/40 hover:bg-muted disabled:opacity-40"
                  >
                    <ArrowUp className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={i === slides.length - 1}
                    aria-label="Move down"
                    onClick={() => {
                      const next = slides.slice();
                      const [row] = next.splice(i, 1);
                      next.splice(i + 1, 0, row!);
                      setSlides(next);
                    }}
                    className="rounded-lg border border-border/80 p-1 transition-colors hover:border-primary/40 hover:bg-muted disabled:opacity-40"
                  >
                    <ArrowDown className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Remove"
                    onClick={() => setSlides(slides.filter((_, j) => j !== i))}
                    className="rounded-lg border border-border/80 p-1 text-destructive transition-colors hover:bg-destructive/10"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
              <ImageField
              cropPreset="og"
                label="Banner image"
                folder="hero"
                value={slide.url || null}
                onChange={(url) =>
                  setSlides(slides.map((s, j) => (j === i ? { ...s, url: url ?? "" } : s)))
                }
                hint="Recommended aspect ratio 21:9 (e.g. 1920×823)."
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField
                  label="Link (optional)"
                  value={slide.link ?? ""}
                  onChange={(v) =>
                    setSlides(slides.map((s, j) => (j === i ? { ...s, link: v || null } : s)))
                  }
                />
                <TextField
                  label="Alt text (optional)"
                  value={slide.alt ?? ""}
                  onChange={(v) =>
                    setSlides(slides.map((s, j) => (j === i ? { ...s, alt: v || null } : s)))
                  }
                />
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            disabled={slides.length >= MAX_HERO_SLIDES}
            onClick={() => setSlides([...slides, { url: "", link: null, alt: null }])}
            className="transition-transform duration-200 hover:-translate-y-0.5"
          >
            <ImagePlus className="size-4" />
            Add banner
          </Button>
          <SaveButton
            dirty={isDirty(slides, savedHero)}
            loading={pendingKey === "hero"}
            onClick={() => {
              const clean = slides.filter((s) => s.url.trim());
              if (clean.length === 0) {
                toast.error("Add at least one banner image.");
                return;
              }
              setSlides(clean);
              save.mutate({ key: "hero", value: { slides: clean.slice(0, MAX_HERO_SLIDES) } });
            }}
          />
        </div>
      </Panel>

      <Panel className="space-y-4">
        <div>
          <h2 className="ig-text text-sm font-bold">Homepage popup</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            A promotional image popup on the homepage. Shown once per visitor session.
          </p>
        </div>

        <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-border/70 bg-background/40 px-3 py-2.5 transition-colors hover:border-primary/30">
          <span>
            <span className="ig-text block text-sm font-bold">Enable popup</span>
            <span className="block text-xs text-muted-foreground">
              Turn off to hide the popup instantly without deleting the image.
            </span>
          </span>
          <input
            type="checkbox"
            role="switch"
            checked={popup.enabled}
            onChange={(e) => setPopup({ ...popup, enabled: e.target.checked })}
            className="peer sr-only"
          />
          <span className="relative inline-flex h-6 w-11 shrink-0 touch-manipulation items-center rounded-full bg-muted shadow-sm transition-[background-color,box-shadow,transform] duration-300 ease-out peer-active:scale-95 peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring/40 motion-reduce:transition-none">
            <span
              className={`absolute left-0.5 size-5 rounded-full bg-background shadow-md transition-transform duration-300 ease-out motion-reduce:transition-none ${
                popup.enabled ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </span>
        </label>

        <ImageField
          label="Popup image"
          folder="popup"
          value={popup.url || null}
          onChange={(url) => setPopup({ ...popup, url: url ?? "" })}
          hint="Portrait or square works best (e.g. 900×1200)."
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label="Link (optional)"
            value={popup.link ?? ""}
            onChange={(v) => setPopup({ ...popup, link: v || null })}
          />
          <TextField
            label="Alt text (optional)"
            value={popup.alt ?? ""}
            onChange={(v) => setPopup({ ...popup, alt: v || null })}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="ig-text mb-1.5 block text-xs font-bold">Trigger</span>
            <select
              value={popup.trigger}
              onChange={(e) =>
                setPopup({ ...popup, trigger: e.target.value as PromoPopup["trigger"] })
              }
              className="h-10 w-full cursor-pointer rounded-xl border border-border bg-background px-3 text-sm outline-none transition-colors focus:border-primary/60"
            >
              <option value="delay">After delay</option>
              <option value="scroll">On scroll</option>
              <option value="both">Both (whichever first)</option>
            </select>
          </label>
          <NumberField
            label="Delay (seconds)"
            value={popup.delaySeconds}
            onChange={(v) => setPopup({ ...popup, delaySeconds: v })}
          />
          <NumberField
            label="Scroll depth (%)"
            value={popup.scrollPercent}
            onChange={(v) => setPopup({ ...popup, scrollPercent: v })}
          />
        </div>

        <SaveButton
          dirty={isDirty(popup, savedPopup)}
          loading={pendingKey === "popup"}
          onClick={() => {
            if (popup.enabled && !popup.url.trim()) {
              toast.error("Upload a popup image first.");
              return;
            }
            save.mutate({
              key: "popup",
              value: {
                enabled: popup.enabled,
                url: popup.url.trim(),
                link: popup.link?.trim() || null,
                alt: popup.alt?.trim() || null,
                trigger: popup.trigger,
                delay_seconds: popup.delaySeconds,
                scroll_percent: popup.scrollPercent,
              },
            });
          }}
        />
      </Panel>


      <Panel className="space-y-4">
        <h2 className="ig-text text-sm font-bold">General</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label="Brand name"
            value={str(general, "brand_name")}
            onChange={(v) => setGeneral({ ...general, brand_name: v })}
          />
          <TextField
            label="Tagline"
            value={str(general, "tagline")}
            onChange={(v) => setGeneral({ ...general, tagline: v })}
          />
        </div>
        <SaveButton
          dirty={isDirty(general, find("general"))}
          loading={pendingKey === "general"}
          onClick={() => save.mutate({ key: "general", value: general })}
        />
      </Panel>

      <Panel className="space-y-4">
        <h2 className="ig-text text-sm font-bold">Contact</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <TextField
            label="Phone"
            value={str(contact, "phone")}
            onChange={(v) => setContact({ ...contact, phone: normalizeContactPhoneInput(v) })}
          />
          <TextField
            label="Email"
            value={str(contact, "email")}
            onChange={(v) => setContact({ ...contact, email: v })}
          />
          <TextField
            label="Address"
            value={str(contact, "address")}
            onChange={(v) => setContact({ ...contact, address: v })}
          />
        </div>
        <SaveButton
          dirty={isDirty(contact, find("contact"))}
          loading={pendingKey === "contact"}
          onClick={() => save.mutate({ key: "contact", value: contact })}
        />
      </Panel>

      <DeliverySettingsPanel
        value={delivery}
        saving={pendingKey === "delivery"}
        onSave={(value) => save.mutate({ key: "delivery", value })}
      />
    </div>
  );
}
