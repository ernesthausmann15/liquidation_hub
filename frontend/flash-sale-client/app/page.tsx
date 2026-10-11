import { ArrowRight, BadgePercent, PackageCheck, Tag, Truck } from "lucide-react";
import Link from "next/link";

import { BrandMark } from "@/components/hub/ui";
import { CATEGORIES } from "@/components/storefront/categories";
import { VipSignupForm } from "@/components/storefront/vip-signup-form";
import { backendUrl } from "@/lib/backend-url";

type Deal = {
  product_id: number;
  name: string;
  description: string | null;
  category: string;
  base_price: string;
  stock: number;
};

// Re-render at most once a minute, including when the API was unreachable at build time.
export const revalidate = 60;

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/** Listed stock from the public catalog. A storefront that cannot reach the API still renders. */
async function loadDeals(): Promise<Deal[] | null> {
  try {
    const res = await fetch(`${backendUrl()}/api/products`, {
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(4000),
    });
    const body = (await res.json()) as { success?: boolean; products?: Deal[] };
    return res.ok && body.success && body.products ? body.products.filter((p) => p.stock > 0) : null;
  } catch {
    return null;
  }
}

const PERKS = [
  { icon: BadgePercent, title: "Up to 70% off retail", text: "Priced below wholesale on overstock and returns." },
  { icon: PackageCheck, title: "Verified lots", text: "Every listing is inspected and graded before it goes live." },
  { icon: Truck, title: "Single units to pallets", text: "Buy one open-box item or a full truckload." },
];

export default async function StorefrontPage() {
  const deals = await loadDeals();

  return (
    <div className="ambient-canvas flex min-h-dvh flex-col">
      <header className="sticky top-3 z-40 mx-3 sm:mx-6">
        <nav
          aria-label="Primary"
          className="glass-overlay mx-auto flex h-16 max-w-6xl items-center gap-6 rounded-2xl px-4 sm:px-6"
        >
          <Link href="/" aria-label="Liquidation Hub home">
            <BrandMark />
          </Link>
          <div className="ml-auto flex items-center gap-1 font-mono text-xs font-bold uppercase tracking-wider">
            <a href="#categories" className="hidden rounded-lg px-3 py-1.5 text-ink-muted hover:text-brand md:block">
              Categories
            </a>
            <a href="#deals" className="hidden rounded-lg px-3 py-1.5 text-ink-muted hover:text-brand md:block">
              Deals
            </a>
            <a
              href="#vip"
              className="rounded-lg border border-brand/40 px-3 py-1.5 text-brand hover:bg-brand-tint"
            >
              VIP Club
            </a>
          </div>
        </nav>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="relative mx-auto max-w-6xl px-4 pb-20 pt-20 sm:px-6 sm:pt-28">
          <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute -left-32 top-10 size-[28rem] rounded-full bg-brand/10 blur-3xl motion-safe:animate-pulse [animation-duration:9s]" />
          </div>
          <div className="relative max-w-3xl">
            <p className="inline-flex items-center gap-2 rounded-lg border border-brand/30 bg-brand-tint px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-wider text-brand">
              <Tag className="size-3.5" aria-hidden />
              New lots added daily
            </p>
            <h1 className="mt-6 text-4xl font-bold leading-[1.05] text-ink sm:text-6xl">
              Exclusive Deals on Overstock &amp; Liquidation Inventory.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-muted">
              Source verified overstock, open-box electronics, and wholesale liquidation lots at up to 70% off
              retail prices.
            </p>
            <div className="mt-10 flex flex-col gap-3 sm:flex-row">
              <a
                href="#deals"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-brand px-6 font-mono text-sm font-bold tracking-wide text-on-brand transition-colors hover:bg-brand-hover"
              >
                Browse Liquidation Deals
                <ArrowRight className="size-4" aria-hidden />
              </a>
              <a
                href="#vip"
                className="inline-flex h-12 items-center justify-center rounded-xl border border-ink-muted px-6 font-mono text-sm font-bold tracking-wide text-ink transition-colors hover:border-brand hover:text-brand"
              >
                Join VIP Deals Club
              </a>
            </div>
          </div>

          <ul className="relative mt-16 grid gap-4 sm:grid-cols-3">
            {PERKS.map(({ icon: Icon, title, text }) => (
              <li key={title} className="glass-raised rounded-2xl p-5">
                <Icon className="size-5 text-brand" aria-hidden />
                <p className="mt-3 font-display font-semibold text-ink">{title}</p>
                <p className="mt-1 text-sm text-ink-muted">{text}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* Categories */}
        <section id="categories" aria-labelledby="categories-title" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-16 sm:px-6">
          <h2 id="categories-title" className="text-3xl font-bold text-ink">
            Shop by category
          </h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {CATEGORIES.map(({ name, icon: Icon, blurb }) => (
              <a
                key={name}
                href="#deals"
                className="group glass-raised flex flex-col rounded-2xl p-6 transition-transform hover:-translate-y-0.5"
              >
                <span className="grid size-12 place-items-center rounded-xl bg-brand-tint text-brand">
                  <Icon className="size-6" aria-hidden />
                </span>
                <span className="mt-5 font-display text-lg font-semibold text-ink group-hover:text-brand">{name}</span>
                <span className="mt-2 text-sm leading-relaxed text-ink-muted">{blurb}</span>
              </a>
            ))}
          </div>
        </section>

        {/* Live deals */}
        <section id="deals" aria-labelledby="deals-title" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-16 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 id="deals-title" className="text-3xl font-bold text-ink">
              Live liquidation deals
            </h2>
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-subtle">Updated every minute</p>
          </div>

          {deals && deals.length > 0 ? (
            <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {deals.map((deal) => (
                <li key={deal.product_id} className="surface-data flex flex-col rounded-2xl p-5">
                  <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
                    {deal.category}
                  </span>
                  <h3 className="mt-2 font-semibold text-ink">{deal.name}</h3>
                  {deal.description && <p className="mt-1 line-clamp-2 text-sm text-ink-muted">{deal.description}</p>}
                  <div className="mt-auto flex items-end justify-between pt-5">
                    <span className="font-display text-2xl font-bold text-brand">
                      {usd.format(Number(deal.base_price))}
                    </span>
                    <span
                      className={
                        deal.stock <= 5
                          ? "font-mono text-xs font-semibold text-signal"
                          : "font-mono text-xs text-ink-muted"
                      }
                    >
                      {deal.stock <= 5 ? `Only ${deal.stock} left` : `${deal.stock} available`}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="surface-data mt-8 rounded-2xl p-10 text-center">
              <p className="font-display text-lg font-semibold text-ink">
                {deals ? "The current drop just sold out." : "Deals are loading slowly right now."}
              </p>
              <p className="mt-2 text-sm text-ink-muted">
                Join the VIP Deals Club below and we&apos;ll email you when the next lots go live.
              </p>
            </div>
          )}
        </section>

        {/* VIP Deals Club */}
        <section id="vip" aria-labelledby="vip-title" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-16 sm:px-6">
          <div className="glass-overlay grid gap-10 rounded-3xl p-8 sm:p-12 lg:grid-cols-2">
            <div>
              <h2 id="vip-title" className="text-3xl font-bold text-ink">
                Join the VIP Deals Club
              </h2>
              <p className="mt-4 leading-relaxed text-ink-muted">
                Members hear about new pallets and open-box drops first, before they hit the public catalog. Pick
                the categories you care about and we&apos;ll only send those.
              </p>
            </div>
            <VipSignupForm />
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-ink-subtle sm:flex-row sm:px-6">
          <p>© {new Date().getFullYear()} Liquidation Hub. All rights reserved.</p>
          <Link href="/login" className="font-mono text-xs uppercase tracking-wider hover:text-brand">
            Operator sign-in
          </Link>
        </div>
      </footer>
    </div>
  );
}
