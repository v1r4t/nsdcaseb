import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { fetchContent, FALLBACK_CONTENT } from '../lib/content';
import type { Achievement, ContentSection, OfficeBearer, SiteContent } from '../lib/content';
import { listEvents, type EventSummary } from '../lib/events';
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

const STATS = [
  { value: '120+', label: 'Members' },
  { value: '15+', label: 'Events' },
  { value: '30+', label: 'Projects' },
];

function Section({ id, label, title, children }: { id: string; label: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-label={title} className="border-t border-white/10 py-16 sm:py-20">
      <Reveal className="mx-auto w-full max-w-3xl px-4">
        <p className="text-[11px] font-medium uppercase tracking-mega text-neon/80">{label}</p>
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
    <div className="max-w-2xl space-y-4">
      {blocks.map((block) => (
        <p key={block.slice(0, 48)} className="text-base leading-relaxed text-white/70">
          {block}
        </p>
      ))}
    </div>
  );
}

/** Slim banner for the first open event. Renders nothing when none is open. */
function NextEventBanner() {
  const [event, setEvent] = useState<EventSummary | null>(null);

  useEffect(() => {
    let active = true;
    listEvents()
      .then(({ events }) => {
        if (!active) return;
        setEvent(events.find((e) => e.registration_open) ?? null);
      })
      .catch(() => {
        // Banner is best-effort; the page must render without it.
      });
    return () => {
      active = false;
    };
  }, []);

  if (!event) return null;
  return (
    <p className="inline-flex max-w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-full border border-neon/30 bg-neon/10 px-4 py-2 text-sm text-white/80">
      <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full bg-neon" />
      <span className="font-medium text-white">{event.title}</span>
      <time dateTime={event.starts_at} className="text-white/60">
        {readableDate(event.starts_at)}
      </time>
      <Link to="/registrations" className="font-medium text-neon underline-offset-4 hover:underline">
        Register
      </Link>
    </p>
  );
}

function BearerCard({ bearer, delay }: { bearer: OfficeBearer; delay: number }) {
  return (
    <li>
      <Reveal
        delay={delay}
        className="h-full rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition duration-300 hover:-translate-y-1 hover:border-neon/40 hover:bg-white/[0.05]"
      >
        <div className="flex items-center gap-4">
          <span
            aria-hidden="true"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-neon/30 bg-neon/10 font-display text-sm font-semibold tracking-wide text-neon"
          >
            {initials(bearer.name)}
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium text-white">{bearer.name}</p>
            <p className="text-sm text-neon/90">{bearer.role}</p>
            {bearer.cohort ? <p className="text-xs text-white/40">Class of {bearer.cohort}</p> : null}
          </div>
        </div>
      </Reveal>
    </li>
  );
}

function TimelineItem({ item, delay, last }: { item: Achievement; delay: number; last: boolean }) {
  return (
    <li className="relative pl-8">
      {!last && <span aria-hidden="true" className="absolute bottom-0 left-[7px] top-6 w-px bg-white/10" />}
      <span
        aria-hidden="true"
        className="absolute left-0 top-1.5 h-[15px] w-[15px] rounded-full border-2 border-neon bg-[#050810]"
      />
      <Reveal delay={delay}>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          {item.date ? (
            <time dateTime={item.date} className="text-xs font-medium uppercase tracking-mega text-neon/80">
              {readableDate(item.date)}
            </time>
          ) : null}
          <h3 className="mt-1.5 font-medium tracking-wide text-white">{item.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-white/60">{item.description}</p>
        </div>
      </Reveal>
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
      <section className="relative overflow-hidden px-4 pb-16 pt-14 sm:pb-20 sm:pt-20">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{ background: 'radial-gradient(60% 50% at 50% 0%, rgba(34,211,238,0.16), transparent 70%)' }}
        />
        <Reveal className="relative mx-auto w-full max-w-3xl">
          <NextEventBanner />
          <p className="mt-6 text-xs font-medium uppercase tracking-mega text-neon">
            Amrita student data club
          </p>
          <h1 className="mt-4 bg-gradient-to-r from-white via-cyan-100 to-cyan-400 bg-clip-text font-display text-4xl font-bold leading-tight tracking-tight text-transparent sm:text-6xl">
            Learn data by building with it.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-white/70">
            NSDC is where Amrita students turn curiosity about data into real projects, together.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              to="/register"
              className="rounded-full bg-neon px-6 py-2.5 text-sm font-semibold text-[#050810] transition hover:brightness-110"
            >
              Join the club
            </Link>
            <Link
              to="/registrations"
              className="rounded-full border border-white/20 px-6 py-2.5 text-sm font-medium text-white/85 transition hover:border-neon/60 hover:text-white"
            >
              Explore events
            </Link>
          </div>

          <dl aria-label="Club milestones (demo figures)" className="mt-10 flex flex-wrap gap-x-10 gap-y-4">
            {STATS.map((stat) => (
              <div key={stat.label} className="flex flex-col">
                <dt className="order-2 mt-1 text-xs uppercase tracking-mega text-white/45">{stat.label}</dt>
                <dd className="order-1 font-display text-2xl font-bold text-white">
                  {stat.value}
                </dd>
              </div>
            ))}
          </dl>

          <div className="mt-8 min-h-[1.75rem] text-sm">
            {loading ? (
              <p role="status" aria-live="polite" className="text-white/50">
                Checking session...
              </p>
            ) : user ? (
              <p className="flex flex-wrap items-center gap-3">
                <span className="truncate text-white/70">{user.email}</span>
                <span className="rounded-full border border-neon/40 px-3 py-1 text-[11px] uppercase tracking-wide text-neon">
                  {user.role}
                </span>
              </p>
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
        <div className="max-w-2xl rounded-2xl border border-neon/20 bg-neon/[0.04] p-6 sm:p-8">
          <Prose section={origin} />
        </div>
      </Section>

      {/* Achievements ----------------------------------------------------- */}
      <Section id="achievements" label="Track record" title="Achievements">
        {content.achievements.length === 0 ? (
          <p className="text-sm text-white/50">Nothing logged yet — the first entry is on its way.</p>
        ) : (
          <ol className="max-w-2xl space-y-5">
            {content.achievements.map((item, i) => (
              <TimelineItem key={item.id} item={item} delay={Math.min(i, 5) * 80} last={i === content.achievements.length - 1} />
            ))}
          </ol>
        )}
      </Section>

      {/* Office bearers ---------------------------------------------------- */}
      <Section id="bearers" label="Who runs it" title="Office bearers">
        {content.bearers.length === 0 ? (
          <p className="text-sm text-white/50">The current board has not been published yet.</p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {content.bearers.map((bearer, i) => (
              <BearerCard key={bearer.id} bearer={bearer} delay={Math.min(i, 5) * 80} />
            ))}
          </ul>
        )}
      </Section>

      {/* Footer ------------------------------------------------------------ */}
      <footer className="border-t border-white/10">
        <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-4 px-4 py-10">
          <div>
            <p className="text-xs uppercase tracking-wide text-white/40">Find us online</p>
            <p className="mt-2 text-sm text-white/60">National Student Data Corps — Amrita student chapter</p>
          </div>
          <SocialLinks />
        </div>
      </footer>
    </div>
  );
}
