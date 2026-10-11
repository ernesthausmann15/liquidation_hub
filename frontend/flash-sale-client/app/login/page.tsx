import type { Metadata } from "next";

import { DemoButtons } from "@/components/hub/demo-buttons";
import { LoginForm } from "@/components/hub/login-form";
import { BrandMark } from "@/components/hub/ui";

export const metadata: Metadata = { title: "Sign in" };

/** Only same-site paths are honoured, so ?next= cannot become an open redirect. */
function safeNext(value: string | string[] | undefined) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//")
    ? value
    : "/inventory";
}

/** Asks Express whether DEMO_MODE is on, so the buttons only render when they will work. */
async function demoEnabled() {
  try {
    const res = await fetch(`${process.env.BACKEND_URL ?? "http://localhost:4000"}/api/auth/demo`, {
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    return res.ok && (await res.json()).enabled === true;
  } catch {
    return false;
  }
}

export default async function LoginPage(props: PageProps<"/login">) {
  const [{ next }, showDemo] = await Promise.all([props.searchParams, demoEnabled()]);

  return (
    <main className="ambient-canvas relative grid min-h-dvh place-items-center overflow-hidden px-4 py-12">
      {/* Slow-drifting light pools give the glass something to refract. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 top-1/4 size-[28rem] rounded-full bg-brand/10 blur-3xl motion-safe:animate-pulse [animation-duration:9s]" />
        <div className="absolute -right-24 bottom-10 size-[24rem] rounded-full bg-signal/8 blur-3xl motion-safe:animate-pulse [animation-duration:12s]" />
      </div>

      <div className="relative w-full max-w-[26rem] animate-glass-in">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <BrandMark />
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-ink-muted">
            Staged Portfolio Liquidation Hub
          </p>
        </div>

        <section aria-labelledby="login-title" className="glass-overlay rounded-3xl p-8 sm:p-10">
          <h1 id="login-title" className="text-2xl font-semibold text-ink">
            Operator sign-in
          </h1>
          <p className="mt-1.5 text-sm text-ink-muted">
            Access is limited to provisioned Vrymnox operators.
          </p>
          <LoginForm next={safeNext(next)} />
          {showDemo && <DemoButtons next={safeNext(next)} />}
        </section>

        <p className="mt-6 text-center font-mono text-[11px] uppercase tracking-[0.14em] text-ink-subtle">
          Session secured · HttpOnly · SameSite=Strict
        </p>
      </div>
    </main>
  );
}
