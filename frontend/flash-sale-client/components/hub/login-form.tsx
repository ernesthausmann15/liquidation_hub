"use client";

import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { ApiError, hubApi } from "@/lib/hub-api";
import { Alert, Button, Field, Input } from "./ui";

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      // The server answers with Set-Cookie; the token never touches JavaScript.
      await hubApi.login(email.trim(), password);
      router.replace(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sign-in failed. Try again.");
      setPassword("");
      setPending(false);
    }
  }

  const invalid = error ? true : undefined;

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-5">
      {error && <Alert tone="error">{error}</Alert>}

      <Field label="Email" htmlFor="email">
        <div className="relative">
          <Mail className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-subtle" aria-hidden />
          <Input
            glass
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            inputMode="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={invalid}
            className="pl-10"
            placeholder="operator@vrymnox.com"
          />
        </div>
      </Field>

      <Field label="Password" htmlFor="password">
        <div className="relative">
          <LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-subtle" aria-hidden />
          <Input
            glass
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={invalid}
            className="pl-10 pr-11"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
            className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-ink-subtle transition-colors hover:text-brand"
          >
            {showPassword ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
          </button>
        </div>
      </Field>

      <Button type="submit" size="lg" loading={pending} className="w-full">
        {pending ? "Verifying" : "Sign in"}
        {!pending && <ArrowRight className="size-4" aria-hidden />}
      </Button>
    </form>
  );
}
