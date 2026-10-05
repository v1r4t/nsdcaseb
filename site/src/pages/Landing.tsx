import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { fetchContent, FALLBACK_CONTENT } from '../lib/content';
import type { Achievement, ContentSection, OfficeBearer, SiteContent } from '../lib/content';
import Reveal from '../components/Reveal';
import SocialLinks from '../components/SocialLinks';

/**
 * Copy authored in D1 is treated as plain text -- never HTML -- so a bad edit
 * cannot inject markup. The placeholder HTML comment is stripped for the same
 * reason: it is a marker for the club, not something a visitor should read.
 */
function paragraphs(body: string): string[] {
  return body
    .replace(/<!--[\s\S]*?-->/g, '')
    // Tolerate escaped newlines pasted from a shell/SQL string literal.
    .replace(/\\r\\n|\\n/g, '\n')
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);
}

function initials(name: string): string {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase());
  return letters.join('') || '—';
}

/** `2025-08-14` stays as-is; a longer timestamp is trimmed to its date part. */
function readableDate(value: string): string {
  return value.length > 10 ? value.slice(0, 10) : value;
}

function Section({ id, label, title, children }: { id: string; label: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="border-t border-white/10 py-20">
      <Reveal className="mx-auto w-full max-w-3xl px-4">
        <p className="text-[11px] uppercase tracking-wide text-neon/70">{label}</p>
        <h2 className="mt-3 font-display text-2xl font-semibold tracking-wide text-white sm:text-3xl">{title}</h2>
        <div className="mt-6">{children}</div>
      </Reveal>
    </section>
  );
}

function Prose({ section }: { section: ContentSection | undefined }) {
  if (!section) {
    return <p className="text-sm text-white/50">This section has not been written yet.</p>;
  }
  const blocks = paragraphs(section.body);
  if (blocks.length === 0) {
    return <p className="text-sm text-white/50">This section has not been written yet.</p>;
  }
  return (
    <div className="space-y-4">
      {blocks.map((block) => (
        <p key={block} className="text-base leading-relaxed text-white/70">
          {block}
        </p>
      ))}
    </div>
  );
}

function BearerCard({ bearer }: { bearer: OfficeBearer }) {
  return (
    <li className="card">
      <div className="flex items-center gap-4">
        <span
          aria-hidden="true"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-neon/30 bg-neon/10 font-display text-sm font-semibold tracking-wide text-neon"
        >
          {initials(bearer.name)}
        </span>
        <div className="min-w-0">
          <p className="truncate font-medium text-white">{bearer.name}</p>
          <p className="text-sm text-white/60">{bearer.role}</p>
          {bearer.cohort ? <p className="text-xs text-white/40">Cohort {bearer.cohort}</p> : null}
        </div>
      </div>
    </li>
  );
}

function AchievementRow({ item }: { item: Achievement }) {
  return (
    <li className="border-t border-white/10 py-6 first:border-t-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h3 className="font-medium tracking-wide text-white">{item.title}</h3>
        {item.date ? (
          <time dateTime={item.date} className="text-xs uppercase tracking-wide text-white/40">
            {readableDate(item.date)}
          </time>
        ) : null}
      </div>
      <p className="mt-2 text-sm leading-relaxed text-white/60">{item.description}</p>
    </li>
  );
}

export default function Landing() {
  const { user, loading } = useAuth();
  const [content, setContent] = useState<SiteContent>(FALLBACK_CONTENT);

  useEffect(() => {
    let active = true;
    // fetchContent never rejects; it resolves with fallback copy on any failure.
    void fetchContent().then((data) => {
      if (active) setContent(data);
    });
    return () => {
      active = false;
    };
  }, []);

  const about = content.sections.find((section) => section.key === 'about');
  const origin = content.sections.find((section) => section.key === 'origin');

  return (
    <div>
      {/* Hero ------------------------------------------------------------- */}
      <section className="px-4 py-24 sm:py-32">
        <Reveal className="mx-auto w-full max-w-3xl">
          <p className="text-xs uppercase tracking-mega text-neon">National Student Data Corps</p>
          <h1 className="mt-6 font-display text-5xl font-bold tracking-mega text-white sm:text-7xl">NSDC</h1>
          <p className="mt-8 max-w-xl text-lg leading-relaxed text-white/70">
            A student-run data lab — we learn by building, and we share what we find.
          </p>

          <div className="mt-10 flex min-h-[2rem] flex-wrap items-center gap-3 text-sm">
            {loading ? (
              <p role="status" aria-live="polite" className="text-white/50">
                Checking session...
              </p>
            ) : user ? (
              <>
                <span className="truncate text-white/70">{user.email}</span>
                <span className="rounded-full border border-neon/40 px-3 py-1 text-[11px] uppercase tracking-wide text-neon">
                  {user.role}
                </span>
              </>
            ) : (
              <p className="text-white/50">
                Member?{' '}
                <Link to="/login" className="link">
                  Sign in
                </Link>
              </p>
            )}
          </div>
        </Reveal>
      </section>

      <Section id="about" label="Who we are" title={about?.title ?? 'About the club'}>
        <Prose section={about} />
      </Section>

      <Section id="origin" label="Origin" title={origin?.title ?? 'How we started'}>
        <Prose section={origin} />
      </Section>

      {/* Achievements ----------------------------------------------------- */}
      <Section id="achievements" label="Track record" title="Achievements">
        {content.achievements.length === 0 ? (
          <p className="text-sm text-white/50">Nothing logged yet — the first entry is on its way.</p>
        ) : (
          <ul>
            {content.achievements.map((item) => (
              <AchievementRow key={item.id} item={item} />
            ))}
          </ul>
        )}
      </Section>

      {/* Office bearers ---------------------------------------------------- */}
      <Section id="bearers" label="Who runs it" title="Office bearers">
        {content.bearers.length === 0 ? (
          <p className="text-sm text-white/50">The current board has not been published yet.</p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {content.bearers.map((bearer) => (
              <BearerCard key={bearer.id} bearer={bearer} />
            ))}
          </ul>
        )}
      </Section>

      {/* Footer — App owns the org footer, so this bar is links only ----- */}
      <footer className="border-t border-white/10">
        <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-4 px-4 py-10">
          <p className="text-xs uppercase tracking-wide text-white/40">Find us online</p>
          <SocialLinks />
        </div>
      </footer>
    </div>
  );
}