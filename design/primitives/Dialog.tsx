import { useEffect, useId, useRef, type ReactNode } from "react";

/**
 * A native <dialog> with the two things the platform still leaves to you:
 * focus lands on the close button, and Escape always reports back.
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
  width = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  width?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    const node = ref.current;
    if (!open || !node) return;
    const previous = document.activeElement as HTMLElement | null;
    if (typeof node.showModal === "function" && !node.open) node.showModal();
    closeRef.current?.focus();
    return () => {
      previous?.focus?.();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <dialog
      ref={ref}
      open={open}
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${id}-title`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className={`w-[calc(100vw-2rem)] ${width} border-0 bg-paper p-0 text-ink backdrop:bg-ink/40`}
    >
      <div className="border hairline p-6 md:p-8">
        <div className="mb-6 flex items-start justify-between gap-6">
          <h2 id={`${id}-title`} className="statement-sm">
            {title}
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="mono -mr-2 -mt-1 flex min-h-11 min-w-11 items-center justify-center text-faint transition-colors hover:text-ink"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
