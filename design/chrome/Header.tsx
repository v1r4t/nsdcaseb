import { useEffect, useState, type ElementType, type ReactNode } from "react";
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

/**
 * The sticky bar: dossier line, mark, primary navigation, clock and menu.
 *
 * The host owns the routes, so navigation arrives as props and links render as
 * plain anchors by default. Pass `linkComponent` to use a router link; the
 * component receives `href`, `className`, `aria-current`, `data-cursor` and
 * `children`.
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
  const home = brand?.href ?? "/";
  const name = brand?.name ?? "NSDC";

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const active = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      <a
        href="#main"
        className="mono sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:bg-paper focus:px-3 focus:py-2"
      >
        Skip to content
      </a>

      {/* The dossier line belongs to the top of the document, not to the sticky bar. */}
      {dossier ? (
        <div className="border-b hairline bg-paper">
          <p className="wrap mono flex h-7 items-center overflow-hidden whitespace-nowrap text-[10px] tracking-[0.14em] text-quiet">
            {dossier}
          </p>
        </div>
      ) : null}

      <header className={["sticky top-0 z-40 bg-paper", className ?? ""].join(" ")}>
        <RouteWipe trigger={pathname} />

        <div className="wrap flex h-16 items-center justify-between gap-6 border-b hairline md:h-[88px]">
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

          <div className="flex items-center gap-5 [--color-faint:var(--color-quiet)]">
            {actions}
            <ClubClock className="hidden items-center lg:flex" />
            <button
              type="button"
              className="mono min-h-11 text-quiet transition-colors duration-200 hover:text-ink md:hidden"
              aria-expanded={open}
              aria-controls="mobile-nav"
              onClick={() => setOpen((value) => !value)}
            >
              Menu
            </button>
          </div>
        </div>

        <div id="mobile-nav" hidden={!open} className="border-b hairline bg-paper md:hidden">
          <nav
            aria-label="Mobile"
            className="wrap flex flex-col py-2 [--color-faint:var(--color-quiet)]"
          >
            {nav.map((item) => {
              const current = active(item.href);
              return (
                <LinkComponent
                  key={item.href}
                  href={item.href}
                  aria-current={current ? "page" : undefined}
                  data-cursor="view"
                  className={`mono flex min-h-12 items-center border-b hairline last:border-b-0 ${
                    current ? "text-ink" : "text-quiet"
                  }`}
                >
                  {item.label}
                </LinkComponent>
              );
            })}
            <ClubClock className="py-3" stacked />
          </nav>
        </div>
      </header>
    </>
  );
}
