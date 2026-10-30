import { Logo } from "../identity/Logo";
import { ClubClock } from "./ClubClock";

export interface FooterClub {
  name: string;
  chapter: string;
  email?: string;
  instagram?: string;
  linkedin?: string;
  discord?: string;
  founded?: string | number;
  location?: string;
  /** ISO date used by the day counter. Defaults to the chapter's founding. */
  foundedISO?: string;
}

/**
 * The closing slab, kept deliberately small: identity, the ways to reach the
 * chapter, and the colophon. Navigation lives in the header, and any invitation
 * line belongs to the host's landing page.
 */
export function Footer({ club }: { club: FooterClub }) {
  const year = new Date().getFullYear();

  const links: Array<{ label: string; href: string }> = [];
  if (club.email) links.push({ label: "Email", href: `mailto:${club.email}` });
  if (club.instagram)
    links.push({ label: "Instagram", href: `https://instagram.com/${club.instagram}` });
  if (club.linkedin)
    links.push({ label: "LinkedIn", href: `https://linkedin.com/company/${club.linkedin}` });
  if (club.discord) links.push({ label: "Discord", href: club.discord });

  return (
    <footer data-scene="ink" className="mt-32 w-full bg-ink text-paper">
      <div>
        <div className="wrap py-10 md:py-12">
          <div className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
            <div className="flex items-center gap-4">
              <Logo className="h-[34px]" />
              <p className="mono-sm leading-relaxed text-paper">
                {club.name}
                <br />
                {club.chapter}
              </p>
            </div>

            <ul className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
              {links.map((link) => (
                <li key={link.label}>
                  <a
                    className="mono text-paper transition-colors hover:text-footer-accent"
                    data-cursor="view"
                    href={link.href}
                    rel={link.href.startsWith("mailto:") ? undefined : "noreferrer noopener"}
                    target={link.href.startsWith("mailto:") ? undefined : "_blank"}
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-8 flex flex-col gap-2 border-t border-paper/20 pt-4 md:flex-row md:items-baseline md:justify-between">
            <p className="mono text-footer-muted">© {year} {club.name}</p>
            <ClubClock className="mono text-footer-muted" tone="paper" since={club.foundedISO} />
            <p className="mono text-footer-muted">
              Founded {club.founded ?? 2024} · {club.location ?? "Bengaluru, IN"}
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
