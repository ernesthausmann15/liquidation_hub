"use client";

import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Modal on the native <dialog>: focus trap, Escape and inert background come from the browser
 * (same approach as vrymnox-systems confirm-dialog). Dialogs are layer 3, so they get full glass.
 */
export function GlassDialog({
  open,
  onClose,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="glass-dialog-title"
      // A click on the backdrop lands on the <dialog> itself, not on its content.
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className={cn(
        "glass-overlay m-auto w-[calc(100%-2rem)] max-w-lg rounded-3xl border-0 p-0 text-ink open:animate-glass-in",
        className,
      )}
    >
      <div className="p-6 sm:p-7">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 id="glass-dialog-title" className="text-xl font-semibold">
              {title}
            </h2>
            {description && <p className="mt-1 text-sm text-ink-muted">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-8 shrink-0 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-white/5 hover:text-brand"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
