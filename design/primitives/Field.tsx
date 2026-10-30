import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";

export function Field({
  id,
  label,
  error,
  hint,
  children,
  className,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  const describedBy =
    [
      hint && !error ? `${id}-hint` : null,
      error ? `${id}-error` : null,
    ]
      .filter(Boolean)
      .join(" ") || undefined;

  const child =
    isValidElement(children) && describedBy
      ? cloneElement(children as ReactElement<Record<string, unknown>>, {
          "aria-describedby": describedBy,
        })
      : children;

  return (
    <div className={className}>
      <label
        htmlFor={id}
        className="mono mb-2 block text-[12px] tracking-[0.08em] text-ink/80"
        style={{ fontSize: "12px", letterSpacing: "0.08em" }}
      >
        {label}
      </label>
      {Children.count(children) === 1 ? child : children}
      {hint && !error ? (
        <p id={`${id}-hint`} className="mono mt-2 text-[11px] text-faint">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p
          id={`${id}-error`}
          className="mono mt-2 text-[12px] text-seal"
          style={{ fontSize: "12px" }}
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

export const inputClass =
  "w-full min-h-11 border-0 border-b bg-transparent px-0 py-2 font-mono text-[15px] text-ink outline-none transition-colors duration-200 border-ink/55 focus:border-b-2 focus:border-ink aria-[invalid=true]:border-seal";
