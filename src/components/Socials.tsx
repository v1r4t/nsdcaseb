import { AtSign, BriefcaseBusiness, MessageCircle } from 'lucide-react';

const links = [
  { label: 'Instagram', href: 'https://www.instagram.com/nsdc_avvb/', Icon: AtSign },
  { label: 'LinkedIn', href: 'https://www.linkedin.com/company/nsdc-avv-b', Icon: BriefcaseBusiness },
  { label: 'Discord', href: 'https://discord.gg/XeGgzAu93Z', Icon: MessageCircle },
] as const;

// NOTE: lucide-react@1.49 removed brand icons, so generic lucide glyphs are
// used as visual placeholders. aria-labels + hrefs carry the real semantics.

export default function Socials() {
  return (
    <nav aria-label="Social links" className="flex items-center justify-center gap-6">
      {links.map(({ label, href, Icon }) => (
        <a
          key={label}
          href={href}
          aria-label={label}
          target="_blank"
          rel="noopener noreferrer"
          className="text-slate-400 transition-colors duration-200 hover:text-neon"
        >
          <Icon size={20} strokeWidth={1.8} aria-hidden="true" />
        </a>
      ))}
    </nav>
  );
}
