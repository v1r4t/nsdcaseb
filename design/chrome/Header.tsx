import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ElementType,
  type ReactNode,
} from "react";
import { Logo } from "../identity/Logo";
import { ClubClock } from "./ClubClock";
import { RouteWipe } from "./RouteWipe";
import { InkUnderline } from "../motion/InkUnderline";

export interface NavItem {
  label: string;
  href: string;
}

export interface HeaderBrand {
  name?: string;
  href?: string;
}

/** Where the host's `actions` node is being rendered. */
export interface HeaderActionsContextValue {
  slot: "bar" | "menu";
  /** Present inside the full-screen menu so controls can dismiss it. */
  closeMenu?: () => void;
}

const HeaderActionsContext = createContext<HeaderActionsContextValue>({ slot: "bar" });

/** Lets host controls (search, session) adapt to the bar or the phone menu. */
export function useHeaderActionsContext(): HeaderActionsContextValue {
  return useContext(HeaderActionsContext);
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The sticky bar: dossier line, mark, primary navigation, clock and menu.
 *
 * The host owns the routes, so navigation arrives as props and links render as
 * plain anchors by default. Pass `linkComponent` to use a router link; the
 * component receives `href`, `className`, `aria-current`, `data-cursor` and
 * `children`.
 *
 * Below `md` the primary nav collapses into a full-screen paper menu. That menu
 * is a modal dialog: it locks the page, traps Tab inside itself, closes on
 * Escape and returns focus to the trigger.
 */
export function Header({
  nav,
  pathname = "/",
  dossier,
  brand,
  linkComponent: LinkComponent = "a",
  className,
  actions,
}: {
  nav: NavItem[];
  pathname?: string;
  dossier?: string;
  brand?: HeaderBrand;
  linkComponent?: ElementType;
  className?: string;
  /** Host controls (session, search) rendered before the clock. */
  actions?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const home = brand?.href ?? "/";
  const name = brand?.name ?? "NSDC";

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Modal behaviour for the phone menu: hold the page still, move focus inside,
  // wrap Tab, close on Escape, and hand focus back to the MENU trigger.
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== "Tab") return;

      const panel = dialogRef.current;
      if (!panel) return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const current = document.activeElement;

      if (!current || !panel.contains(current)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && (current === first || current === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previous && previous.isConnected) previous.focus();
    };
  }, [open]);

  // A menu left open across a resize must not cover the desktop header.
  useEffect(() => {
    if (!open || typeof window.matchMedia !== "function") return;
    const desktop = window.matchMedia("(min-width: 768px)");
    const closeOnDesktop = () => {
      if (desktop.matches) setOpen(false);
    };
    closeOnDesktop();
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, [open]);

  const active = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      <a
        href="#main"
        className="mono sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:bg-paper focus:px-3 focus:py-2"
      >
        Skip to content
      </a>

      {/* The dossier line belongs to the top of the document, not to the sticky bar.
          It stays outside `<header>` so it scrolls away, so it needs its own
          landmark to keep page content inside one (axe `region`). On phones it
          condenses to a 24px mono line. */}
      {dossier ? (
        <aside aria-label="Club dossier" className="border-b hairline bg-paper">
          <p className="wrap mono flex h-6 items-center overflow-hidden whitespace-nowrap text-[9px] tracking-[0.12em] text-quiet md:h-7 md:text-[10px] md:tracking-[0.14em]">
            {dossier}
          </p>
        </aside>
      ) : null}

      <header className={["sticky top-0 z-40 bg-paper", className ?? ""].join(" ")}>
        <RouteWipe trigger={pathname} />

        <div className="wrap flex h-16 items-center justify-between gap-3 border-b hairline md:h-[88px] md:gap-6">
          <LinkComponent href={home} className="flex min-h-11 items-center gap-3" aria-label={`${name} home`}>
            <Logo className="h-[30px]" />
            <span className="mono hidden text-[12px] tracking-[0.18em] text-ink sm:inline">
              {name}
            </span>
          </LinkComponent>

          <nav aria-label="Primary" className="hidden items-center gap-5 md:flex lg:gap-7">
            {nav.map((item) => {
              const current = active(item.href);
              return (
                <LinkComponent
                  key={item.href}
                  href={item.href}
                  aria-current={current ? "page" : undefined}
                  data-cursor="view"
                  className={`mono group relative inline-flex min-h-11 items-center pb-1 uppercase transition-colors duration-200 hover:text-ink focus-visible:text-ink ${
                    current ? "text-ink" : "text-quiet"
                  }`}
                >
                  {item.label}
                  <InkUnderline
                    className={`pointer-events-none absolute inset-x-0 bottom-0 transition-opacity duration-300 ${
                      current
                        ? "opacity-100"
                        : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
                    }`}
                  />
                </LinkComponent>
              );
            })}
          </nav>

          <div className="flex items-center gap-1 sm:gap-2 md:gap-5 [--color-faint:var(--color-quiet)]">
            <HeaderActionsContext.Provider value={{ slot: "bar" }}>
              {actions}
            </HeaderActionsContext.Provider>
            <ClubClock className="hidden items-center lg:flex" />
            <button
              ref={menuButtonRef}
              type="button"
              className="mono inline-flex min-h-11 min-w-11 items-center justify-center border hairline px-3 text-quiet transition-colors duration-200 hover:border-ink/40 hover:text-ink md:hidden"
              aria-expanded={open}
              aria-controls={open ? "mobile-nav" : undefined}
              aria-haspopup="dialog"
              onClick={() => setOpen((value) => !value)}
            >
              Menu
            </button>
          </div>
        </div>
      </header>

      {open ? (
        <div
          id="mobile-nav"
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label={`${name} menu`}
          className="fixed inset-0 z-50 overflow-hidden bg-paper text-ink md:hidden"
        >
          <div className="flex h-full min-h-0 flex-col [--color-faint:var(--color-quiet)]">
            <div className="wrap flex h-16 shrink-0 items-center justify-between gap-3 border-b hairline">
              <LinkComponent
                href={home}
                onClick={() => setOpen(false)}
                className="flex min-h-11 items-center gap-3"
                aria-label={`${name} home`}
              >
                <Logo className="h-[30px]" />
                <span className="mono text-[11px] tracking-[0.18em]">{name}</span>
              </LinkComponent>
              <button
                ref={closeButtonRef}
                type="button"
                aria-label="Close menu"
                onClick={() => setOpen(false)}
                className="mono inline-flex min-h-11 min-w-11 items-center justify-center border hairline px-3 text-quiet transition-colors duration-200 hover:border-ink/40 hover:text-ink"
              >
                Close
              </button>
            </div>

            <nav aria-label="Mobile" className="wrap flex-1 overflow-y-auto overscroll-contain py-2">
              {nav.map((item, index) => {
                const current = active(item.href);
                return (
                  <LinkComponent
                    key={item.href}
                    href={item.href}
                    aria-current={current ? "page" : undefined}
                    data-cursor="view"
                    onClick={() => setOpen(false)}
                    className={`group grid min-h-16 grid-cols-[2rem_1fr_auto] items-center gap-x-3 border-b hairline py-2 transition-colors duration-200 hover:text-ink focus-visible:text-ink ${
                      current ? "text-ink" : "text-quiet"
                    }`}
                  >
                    <span className="mono text-[10px] tracking-[0.18em] text-faint">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="serif text-[clamp(1.75rem,7.5vw,2.75rem)] uppercase leading-[0.95] tracking-[-0.01em]">
                      {item.label}
                    </span>
                    <span
                      aria-hidden="true"
                      className={`block h-1.5 w-1.5 justify-self-end transition-colors duration-200 ${
                        current ? "bg-seal" : "bg-transparent group-hover:bg-faint"
                      }`}
                    />
                  </LinkComponent>
                );
              })}
            </nav>

            <div className="wrap shrink-0 border-t hairline py-3">
              <ClubClock className="flex flex-wrap items-baseline justify-between gap-x-4" stacked />
              <div role="group" aria-label="Search and session" className="mt-3">
                <HeaderActionsContext.Provider
                  value={{ slot: "menu", closeMenu: () => setOpen(false) }}
                >
                  {actions}
                </HeaderActionsContext.Provider>
              </div>
              <p className="mono mt-4 text-[9px] tracking-[0.14em] text-faint">
                NSDC · AMRITA BENGALURU · IST
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
