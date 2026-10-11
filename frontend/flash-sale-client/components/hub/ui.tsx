/**
 * Hub primitives shared by the storefront and the operator console. Glass is opt-in through
 * `glass` props: the default is the flat base-data layer.
 */
import { AlertTriangle, CheckCircle2, Info, Loader2 } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";
import type { LiquidationStatus } from "@/lib/hub-api";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary:
    "bg-brand text-on-brand hover:bg-brand-hover disabled:bg-sunken disabled:text-ink-subtle " +
    "shadow-[0_0_0_1px_rgb(255_186_32/0.4),0_8px_24px_-12px_rgb(255_186_32/0.6)] hover:shadow-none",
  secondary:
    "bg-transparent text-ink border border-ink-muted hover:border-brand hover:text-brand disabled:border-line disabled:text-ink-subtle",
  ghost: "text-ink hover:bg-white/5 hover:text-brand disabled:text-ink-subtle",
  danger: "bg-transparent text-danger border border-danger hover:bg-danger-tint disabled:opacity-60",
};
const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-10 px-4 text-[13px] gap-2",
  lg: "h-12 px-6 text-sm gap-2",
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  className,
  children,
  disabled,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size; loading?: boolean }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-xl font-mono font-bold tracking-wide transition-[color,background-color,border-color,box-shadow] duration-150",
        "disabled:cursor-not-allowed",
        variants[variant],
        sizes[size],
        className,
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

const fieldBase =
  "w-full rounded-xl border border-line-strong bg-surface px-3 text-[15px] text-ink placeholder:text-ink-subtle " +
  "field-glow aria-[invalid=true]:border-danger";
// On glass the field is translucent until focused, then snaps to the solid data layer.
const fieldGlass = "border-white/15 bg-black/25";

export function Input({ className, glass, ...props }: ComponentProps<"input"> & { glass?: boolean }) {
  return <input className={cn(fieldBase, "h-11", glass && fieldGlass, className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(fieldBase, "min-h-24 py-2 leading-relaxed", className)} {...props} />;
}

export function Select({ className, glass, ...props }: ComponentProps<"select"> & { glass?: boolean }) {
  return <select className={cn(fieldBase, "h-10 pr-8", glass && fieldGlass, className)} {...props} />;
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label
        htmlFor={htmlFor}
        className="block font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-ink-muted"
      >
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-ink-subtle">{hint}</p>
      ) : null}
    </div>
  );
}

const badgeTones = {
  neutral: "bg-data text-ink border-line",
  brand: "bg-brand-tint text-brand border-brand/30",
  success: "bg-success-tint text-success border-success/30",
  signal: "bg-signal-tint text-signal border-signal/60",
  danger: "bg-danger-tint text-danger border-danger/30",
  info: "bg-info-tint text-info border-info/30",
};

export function Badge({
  tone = "neutral",
  className,
  ...props
}: ComponentProps<"span"> & { tone?: keyof typeof badgeTones }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-lg border px-2 py-0.5 font-mono text-[11px] font-semibold uppercase leading-4 tracking-wider",
        badgeTones[tone],
        className,
      )}
      {...props}
    />
  );
}

export const statusMeta: Record<LiquidationStatus, { tone: keyof typeof badgeTones; label: string }> = {
  staged: { tone: "info", label: "Staged" },
  listed: { tone: "brand", label: "Listed" },
  reserved: { tone: "signal", label: "Reserved" },
  liquidated: { tone: "success", label: "Liquidated" },
  written_off: { tone: "danger", label: "Written off" },
};

export function StatusBadge({ status }: { status: LiquidationStatus }) {
  const { tone, label } = statusMeta[status];
  return <Badge tone={tone}>{label}</Badge>;
}

const alertTones = {
  error: { cls: "bg-danger-tint text-danger border-danger/40", Icon: AlertTriangle },
  success: { cls: "bg-success-tint text-success border-success/40", Icon: CheckCircle2 },
  info: { cls: "bg-info-tint text-info border-info/40", Icon: Info },
  warning: { cls: "bg-signal-tint text-signal border-signal/40", Icon: AlertTriangle },
};

export function Alert({ tone = "info", children }: { tone?: keyof typeof alertTones; children: ReactNode }) {
  const { cls, Icon } = alertTones[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn("flex gap-3 rounded-xl border p-3 text-sm font-medium", cls)}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Liquidation Hub mark: a price tag cut by a downward markdown arrow, plus the Space Grotesk logotype. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-7", className)}>
      <rect width="32" height="32" rx="8" className="fill-brand" />
      <path
        d="M9 8.5h8.2l6.3 6.3a1.6 1.6 0 0 1 0 2.3l-6.4 6.4a1.6 1.6 0 0 1-2.3 0L8.5 17.2V9a.5.5 0 0 1 .5-.5Z"
        className="fill-none stroke-on-brand"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="12.5" cy="12.5" r="1.6" className="fill-on-brand" />
    </svg>
  );
}

export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="font-display text-lg font-bold tracking-[0.14em] whitespace-nowrap text-ink">
        LIQUIDATION <span className="text-brand">HUB</span>
      </span>
    </span>
  );
}
