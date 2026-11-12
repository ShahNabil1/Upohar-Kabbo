import { createFileRoute } from "@tanstack/react-router";

import { useCart } from "@/lib/cart-context";
import { getDeliveryRates } from "@/lib/order.functions";
import { normalizeDeliveryConfig } from "@/lib/delivery-rates";
import { CheckoutForm } from "@/components/site/checkout-form";
import { Section } from "@/components/site/ui";
import { SITE_URL } from "@/lib/site";

export const Route = createFileRoute("/checkout")({
  loader: async () => {
    try {
      return { rates: await getDeliveryRates() };
    } catch {
      // Transient network/RPC failure shouldn't blank the checkout page.
      return { rates: normalizeDeliveryConfig(null) };
    }
  },
  component: CheckoutPage,
  head: () => ({
    meta: [
      { title: "চেকআউট | উপহারকাব্য" },
      {
        name: "description",
        content: "ক্যাশ অন ডেলিভারিতে অর্ডার সম্পন্ন করুন — কোনো অগ্রিম পেমেন্ট লাগবে না।",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "চেকআউট | উপহারকাব্য" },
      { property: "og:description", content: "ক্যাশ অন ডেলিভারিতে অর্ডার সম্পন্ন করুন।" },
      { property: "og:url", content: `${SITE_URL}/checkout` },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/checkout` }],
  }),
});

function CheckoutPage() {
  const { rates } = Route.useLoaderData();
  const { items, ready, setQuantity, remove } = useCart();

  return (
    <Section>
      {!ready ? (
        <div className="h-64 animate-pulse rounded-sm bg-secondary" />
      ) : (

        <div className="mx-auto max-w-2xl">
          <div className="mb-5 text-center">
            <h1 className="bg-gradient-to-r from-primary via-primary to-foreground bg-clip-text text-transparent text-xl font-bold tracking-tight drop-shadow-sm sm:text-2xl">
              Checkout
            </h1>
          </div>
          <div className="mb-5 text-center">
            <h2 className="inline-flex items-center gap-2 text-base font-bold text-primary">
              <span className="inline-block h-2 w-2 rounded-full bg-primary shadow-[0_0_8px_var(--color-primary)]" />
              Delivery Information
            </h2>
            <div className="mx-auto mt-2 h-0.5 w-12 rounded-full bg-gradient-to-r from-primary to-foreground" />
          </div>
          <CheckoutForm
            items={items}
            rates={rates}
            source="website"
            onSetQuantity={setQuantity}
            onRemove={remove}
            allowAddMore
          />
        </div>
      )}
    </Section>
  );
}
