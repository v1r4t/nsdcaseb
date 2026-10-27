/**
 * Footer. Deliberately tiny: identity and institution left, contact and social
 * links right on desktop, one left-aligned column on mobile. No link columns,
 * no newsletter pitch, no oversized padding — see design/design.md "FOOTER".
 */

import SocialLinks from './SocialLinks';

const CONTACT_EMAIL = 'nsdcaseb@gmail.com';

export default function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="shell grid gap-8 py-10 md:grid-cols-2 md:gap-12">
        <div>
          <p className="font-display text-2xl font-medium tracking-tight text-paper">NSDC</p>

          <p className="label mt-3">Amrita Vishwa Vidyapeetham / Bengaluru</p>

          <p className="label mt-8">&copy; 2026 &middot; Built by students.</p>
        </div>

        <div className="md:justify-self-end md:text-right">
          <p className="label">Contact</p>

          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="mt-2 inline-block py-1 text-sm text-paper/80 underline decoration-line underline-offset-4 transition-colors hover:text-signal hover:decoration-signal"
          >
            {CONTACT_EMAIL}
          </a>

          <div className="mt-4">
            <SocialLinks className="md:justify-end" />
          </div>
        </div>
      </div>
    </footer>
  );
}