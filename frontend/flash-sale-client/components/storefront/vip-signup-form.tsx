"use client";

import { useState, type FormEvent } from "react";

import { cn } from "@/lib/utils";
import { Alert, Button, Field, Input } from "@/components/hub/ui";
import { CATEGORIES, type CategoryName } from "./categories";

type Result = { tone: "success" | "error"; message: string };

/** VIP Deals Club signup. Posts to /api/vip-signup, which next.config.ts rewrites to Express. */
export function VipSignupForm() {
  const [email, setEmail] = useState("");
  const [interests, setInterests] = useState<CategoryName[]>([]);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const toggle = (name: CategoryName) =>
    setInterests((current) =>
      current.includes(name) ? current.filter((n) => n !== name) : [...current, name],
    );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setResult(null);
    try {
      const res = await fetch("/api/vip-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, interests }),
        signal: AbortSignal.timeout(10000),
      });
      const body = (await res.json().catch(() => ({}))) as { success?: boolean; message?: string; error?: string };
      if (res.ok && body.success) {
        setResult({ tone: "success", message: body.message ?? "You're in." });
        setEmail("");
        setInterests([]);
      } else {
        setResult({ tone: "error", message: body.error ?? "Signup failed. Try again shortly." });
      }
    } catch {
      setResult({ tone: "error", message: "We couldn't reach the server. Check your connection and try again." });
    } finally {
      setPending(false);
    }
  }

  const invalid = result?.tone === "error";

  return (
    <form onSubmit={submit} className="space-y-5">
      <Field label="Email" htmlFor="vip-email" error={invalid ? result.message : undefined}>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Input
            id="vip-email"
            type="email"
            name="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? "vip-email-error" : undefined}
            glass
          />
          <Button type="submit" size="lg" loading={pending} className="shrink-0">
            Join VIP Deals Club
          </Button>
        </div>
      </Field>

      <fieldset>
        <legend className="mb-2 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-ink-muted">
          Alert me about (optional)
        </legend>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map(({ name }) => {
            const checked = interests.includes(name);
            return (
              <label
                key={name}
                className={cn(
                  "cursor-pointer rounded-lg border px-3 py-1.5 font-mono text-xs font-semibold uppercase tracking-wider transition-colors",
                  "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus",
                  checked ? "border-brand/50 bg-brand-tint text-brand" : "border-line text-ink-muted hover:text-ink",
                )}
              >
                <input type="checkbox" className="sr-only" checked={checked} onChange={() => toggle(name)} />
                {name}
              </label>
            );
          })}
        </div>
      </fieldset>

      {result?.tone === "success" && <Alert tone="success">{result.message}</Alert>}
      <p className="text-xs text-ink-subtle">One email per drop, no spam. Unsubscribe any time.</p>
    </form>
  );
}
