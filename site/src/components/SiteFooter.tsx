/**
 * Footer. Deliberately tiny: identity, institution, social links, credit line.
 * No link columns, no newsletter pitch, no oversized padding — see
 * design/design.md "FOOTER".
 */

import SocialLinks from './SocialLinks';

export default function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="shell py-10">
        <p className="font-display text-2xl font-medium tracking-tight text-paper">NSDC</p>

        <p className="label mt-3">Amrita Vishwa Vidyapeetham / Bengaluru</p>

        <div className="mt-6">
          <SocialLinks />
        </div>

        <p className="label mt-8">&copy; 2026 &middot; Built by students.</p>
      </div>
    </footer>
  );
}