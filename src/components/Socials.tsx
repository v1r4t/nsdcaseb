import { AtSign, BriefcaseBusiness, GitFork, MessageCircle } from 'lucide-react';

const links = [
  { label: 'Instagram', href: '#', Icon: AtSign },
  { label: 'LinkedIn', href: '#', Icon: BriefcaseBusiness },
  { label: 'GitHub', href: '#', Icon: GitFork },
  { label: 'Discord', href: '#', Icon: MessageCircle },
] as const;

// NOTE: lucide-react@1.49 removed brand icons (Instagram/Linkedin/Github no
// longer exported), so generic lucide glyphs are used as visual placeholders.
// aria-labels + hrefs preserve the intended social semantics.

export default function Socials() {
  return (
    <nav aria-label="Social links" className="flex items-center justify-center gap-6">
      {links.map(({ label, href, Icon }) => (
        <a
          key={label}
          href={href}
          aria-label={label}
          className="text-slate-400 transition-colors duration-200 hover:text-neon"
        >
          <Icon size={20} strokeWidth={1.8} aria-hidden="true" />
        </a>
      ))}
    </nav>
  );
}
