import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { fetchContent, FALLBACK_CONTENT } from '../lib/content';
import type { SiteContent } from '../lib/content';
import { useDocumentMeta } from '../lib/useDocumentMeta';
import { listEvents, type EventSummary } from '../lib/events';
import { loadSiteState } from '../lib/site';
import { listProjects } from '../lib/projects';
import { listMedia } from '../lib/media';
import Reveal from '../components/Reveal';
import Stat from '../components/Stat';
import CinematicOrigin from '../components/CinematicOrigin';
import LazyGlobe from '../components/LazyGlobe';
import PeopleList from '../components/PeopleList';
import NowSection from '../components/NowSection';
import ProjectStrip from '../components/ProjectStrip';
import EventRows from '../components/EventRows';
import ArchiveTeaser, { type ArchivePhoto } from '../components/ArchiveTeaser';
import Testimonials from '../components/Testimonials';
import PosterBand, { PosterLines } from '../components/PosterBand';
import CornerMarks from '../components/CornerMarks';

/** D1 copy is plain text — never HTML. Split on blank lines into paragraphs. */
function paragraphs(body: string): string[] {
  return body
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\\r\\n|\\n/g, '\n')
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);
}

/** `2025-08-14` stays as-is; a longer timestamp is trimmed to its date part. */
function readableDate(value: string): string {
  return value.length > 10 ? value.slice(0, 10) : value;
}

/** The next event worth naming: one you can join, else one still to come. Mirrors NowSection. */
function nextEvent(events: EventSummary[]): EventSummary | null {
  const joinable = events.find((event) => event.registration_open);
  if (joinable) return joinable;
  const now = Date.now();
  const upcoming = events.find((event) => {
    const at = Date.parse(event.starts_at);
    return !Number.isNaN(at) && at >= now;
  });
  return upcoming ?? null;
}

/** Folio convention: `data-folio="NN / Name"` sections are numbered in document order
 * (hero Statement = 01); a section's SectionHead `index` always equals its `data-folio` number. */
function SectionHead({ index, name, meta }: { index: string; name: string; meta?: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
      <p className="label">
        {index} / {name}
      </p>
      {meta ? <p className="font-mono text-[11px] uppercase tracking-wide text-muted">{meta}</p> : null}
    </div>
  );
}

export default function Landing() {
  useDocumentMeta({
    title: 'NSDC — National Student Data Corps',
    description:
      'NSDC — National Student Data Corps. A student technology community at Amrita Vishwa Vidyapeetham, Bengaluru. We bring students together to learn, build, experiment and compete across data, AI and emerging technology.',
  });
  const { user, loading } = useAuth();
  const [content, setContent] = useState<SiteContent>(FALLBACK_CONTENT);
  // null = in flight or failed; sections degrade to honest empty states.
  const [events, setEvents] = useState<EventSummary[] | null>(null);
  const [projectCount, setProjectCount] = useState<number | null>(null);
  const [photos, setPhotos] = useState<ArchivePhoto[]>([]);
  // null = unknown (in flight or failed); mirrors NowSection's recruitment fetch.
  const [recruitmentOpen, setRecruitmentOpen] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    void fetchContent().then((data) => {
      if (active) setContent(data);
    });
    return () => {
      active = false;
    };
  }, []);

  // Single events fetch shared by NOW and EVENTS. Never gates first paint.
  useEffect(() => {
    let active = true;
    listEvents()
      .then(({ events: list }) => {
        if (active) setEvents(list);
      })
      .catch(() => {
        if (active) setEvents(null);
      });
    return () => {
      active = false;
    };
  }, []);

  // Recruitment flag for the hero live label. Best-effort; null falls through to the archive link.
  useEffect(() => {
    let active = true;
    void loadSiteState().then((state) => {
      if (active) setRecruitmentOpen(state.recruitment_open);
    });
    return () => {
      active = false;
    };
  }, []);

  // Project count for the numbers console. Best-effort; null hides the figure.
  useEffect(() => {
    let active = true;
    listProjects()
      .then(({ projects }) => {
        if (active) setProjectCount(projects.length);
      })
      .catch(() => {
        if (active) setProjectCount(null);
      });
    return () => {
      active = false;
    };
  }, []);

  // First 3 images across albums for the archive teaser. Best-effort.
  useEffect(() => {
    let active = true;
    listMedia()
      .then(({ albums }) => {
        if (!active) return;
        const found: ArchivePhoto[] = [];
        for (const album of albums) {
          for (const item of album.items ?? []) {
            if (item.type === 'image' && typeof item.url === 'string' && item.url.length > 0) {
              found.push({ url: item.url, title: item.title ?? '' });
              if (found.length >= 3) break;
            }
          }
          if (found.length >= 3) break;
        }
        setPhotos(found);
      })
      .catch(() => {
        if (active) setPhotos([]);
      });
    return () => {
      active = false;
    };
  }, []);

  const about = content.sections.find((section) => section.key === 'about');
  const origin = content.sections.find((section) => section.key === 'origin');
  const aboutBlocks = paragraphs(about?.body ?? '');
  const next = events ? nextEvent(events) : null;

  return (
    <div>
      {/* 0. STATEMENT — min-h-screen asymmetric hero ---------------------- */}
      <section aria-label="Introduction" data-folio="01 / Statement" className="rule relative">
        {/* Edge metadata — identity running up the margin. */}
        <p
          aria-hidden="true"
          className="edge-meta absolute bottom-16 left-3 hidden font-mono text-[10px] uppercase tracking-wide text-muted xl:block"
        >
          National Student Data Corps · Bengaluru · 26—27
        </p>
        <CornerMarks />
        <div className="shell grid min-h-screen grid-cols-12 gap-x-6 pb-16 pt-14 sm:pt-20">
          <Reveal className="col-span-12 md:col-span-7">
            <p className="label">12.8947° N, 77.6756° E · EST. 2024</p>
            <h1 className="mt-6 text-left font-display text-6xl font-bold leading-[0.95] tracking-tight text-paper sm:text-8xl">
              NATIONAL
              <br />
              STUDENT
              <br />
              DATA
              <br />
              CORPS
            </h1>
            <p className="mt-8 font-mono text-xs uppercase tracking-wide text-muted">Amrita / Bengaluru</p>
            <p className="mt-2 font-mono text-xs uppercase tracking-wide text-paper/80">Build. Learn. Ship.</p>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-paper/70">
              A student technology community at Amrita Bengaluru working across data, AI and emerging
              tech.
            </p>
            <p className="mt-8 flex flex-wrap gap-3">
              <Link to="/projects" className="btn-primary">
                Explore Projects
              </Link>
              <Link to="/registrations" className="btn-ghost">
                Upcoming Events
              </Link>
            </p>
            {loading ? (
              <p role="status" aria-live="polite" className="mt-8 font-mono text-xs text-muted">
                Checking session…
              </p>
            ) : user ? (
              <p className="mt-8 flex flex-wrap items-center gap-3">
                <span className="truncate font-mono text-xs text-muted">{user.email}</span>
                <span className="rounded-sm border border-line px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide text-signal">
                  {user.role}
                </span>
              </p>
            ) : (
              <p className="mt-8 font-mono text-xs text-muted">
                Member?{' '}
                <Link to="/login" className="link">
                  Sign in
                </Link>
              </p>
            )}
          </Reveal>
          <Reveal
            delay={140}
            className="col-span-10 col-start-2 flex flex-col justify-end md:col-span-3 md:col-start-10"
          >
            <p className="font-mono text-xs text-muted">26—27</p>
            {next ? (
              <Link
                to={`/registrations/${encodeURIComponent(next.id)}`}
                className="mt-3 font-mono text-[11px] uppercase tracking-wide text-muted transition-colors duration-200 hover:text-paper"
              >
                Next: {next.title} ·{' '}
                <time dateTime={next.starts_at}>{readableDate(next.starts_at)}</time>
              </Link>
            ) : recruitmentOpen === true ? (
              <Link
                to="/registrations"
                className="mt-3 font-mono text-[11px] uppercase tracking-wide text-muted transition-colors duration-200 hover:text-paper"
              >
                Recruitment open — apply via registrations
              </Link>
            ) : (
              <Link
                to="/registrations#archive"
                className="mt-3 font-mono text-[11px] uppercase tracking-wide text-muted transition-colors duration-200 hover:text-paper"
              >
                Browse the archive →
              </Link>
            )}
            <a
              href="#about"
              aria-label="Scroll to about section"
              className="mt-8 inline-block"
            >
              <span aria-hidden="true" className="block font-mono text-xs text-signal">
                ↓
              </span>
              <span className="mt-2 block font-mono text-[11px] uppercase tracking-wide text-muted">
                Scroll
              </span>
            </a>
          </Reveal>
        </div>
      </section>

      {/* 1. THE NETWORK — scroll-linked globe narrative (lazy: three.js loads near viewport) ---- */}
      <LazyGlobe />

      {/* 2. WHAT WE DO ---------------------------------------------------- */}
      <section id="about" aria-label="What we do" data-folio="02 / About" className="rule">
        <div className="shell grid grid-cols-12 gap-x-6 py-16 sm:py-24">
          <Reveal className="col-span-12 md:col-span-6 md:col-start-2">
            <SectionHead index="02" name="About" />
            <p className="mt-8 font-display text-2xl font-bold leading-snug tracking-tight text-paper sm:text-3xl">
              We bring students together to learn, build, experiment and compete across data, AI and
              emerging technology.
            </p>
          </Reveal>
          <Reveal delay={120} className="col-span-12 mt-10 md:col-span-6 md:col-start-6">
            {aboutBlocks.length === 0 ? (
              <p className="text-sm text-muted">This section has not been written yet.</p>
            ) : (
              <div className="space-y-5">
                {aboutBlocks.map((block) => (
                  <p key={block.slice(0, 48)} className="max-w-2xl text-base leading-relaxed text-paper/70">
                    {block}
                  </p>
                ))}
              </div>
            )}
          </Reveal>
        </div>
      </section>

      {/* 3. NUMBERS -------------------------------------------------------- */}
      <section aria-label="Numbers" data-folio="03 / Numbers" className="rule">
        <div className="shell py-16 sm:py-24">
          <Reveal>
            <p className="label">The record so far</p>
          </Reveal>
          <dl className="mt-10 grid grid-cols-2 gap-x-6 gap-y-12 md:grid-cols-4">
            <Reveal className="flex flex-col">
              <Stat label="Founded" value={2024} />
            </Reveal>
            <Reveal delay={80} className="flex flex-col">
              <Stat label="Events" value={events?.length ?? 0} />
            </Reveal>
            <Reveal delay={160} className="flex flex-col">
              <Stat label="Projects" value={projectCount ?? 0} />
            </Reveal>
            <Reveal delay={240} className="flex flex-col">
              <Stat label="Ideas" glyph="∞" />
            </Reveal>
          </dl>
        </div>
      </section>

      {/* POSTER — the typographic moment (unnumbered interlude) ---------------- */}
      <PosterBand>
        <PosterLines lines={['Build.', 'Learn.', 'Ship.']} />
        <p className="mt-10 max-w-md font-mono text-xs uppercase leading-relaxed tracking-wide text-muted">
          A student technology community at Amrita Vishwa Vidyapeetham, Bengaluru.
        </p>
      </PosterBand>

      {/* 4. THE ORIGIN ----------------------------------------------------- */}
      <section id="origin" aria-label="The origin" data-folio="04 / The Origin" className="rule">
        <CinematicOrigin title={origin?.title ?? 'How we started'} body={origin?.body ?? ''} />
      </section>

      {/* 5. PROJECTS -------------------------------------------------------- */}
      <section aria-label="Projects" data-folio="05 / Projects" className="rule">
        <div className="shell py-16 sm:py-24">
          <SectionHead index="05" name="Projects" meta="12.8947° N, 77.6756° E" />
          <h2 className="mt-8 font-display text-2xl font-bold tracking-tight text-paper sm:text-3xl">
            Selected work.
          </h2>
          <div className="mt-8">
            <ProjectStrip />
          </div>
        </div>
      </section>

      {/* 6. EVENTS ----------------------------------------------------------- */}
      <section aria-label="Events" data-folio="06 / Events" className="rule">
        <div className="shell py-16 sm:py-24">
          <SectionHead index="06" name="Events" />
          <h2 className="mt-8 font-display text-2xl font-bold tracking-tight text-paper sm:text-3xl">
            Upcoming dates.
          </h2>
          <div className="mt-8 md:ml-[8.333%] md:max-w-[83.333%]">
            <EventRows events={events} />
          </div>
        </div>
      </section>

      {/* 7. NOW / 2026 ----------------------------------------------------- */}
      <section aria-label="Now" data-folio="07 / Now" className="rule">
        <div className="shell py-16 sm:py-24">
          <SectionHead index="07" name="Now / 2026" meta="System.status · Online" />
          <h2 className="mt-8 max-w-2xl font-display text-2xl font-bold tracking-tight text-paper sm:text-3xl">
            What is happening now.
          </h2>
          <div className="mt-8">
            <NowSection events={events} mediaCount={photos.length} />
          </div>
          <div className="mt-12 border-t border-line pt-8 md:ml-[8.333%] md:max-w-[66.666%]">
            <p className="label">Recruitment</p>
            <h3 className="mt-4 font-display text-xl font-bold tracking-tight text-paper sm:text-2xl">
              Join the corps.
            </h3>
            <p role="status" className="mt-3 font-mono text-xs uppercase tracking-wide text-muted">
              {recruitmentOpen === true
                ? 'Recruitment is open now.'
                : recruitmentOpen === false
                  ? 'Recruitment is currently closed.'
                  : 'Checking recruitment status…'}
            </p>
            <div className="mt-6 grid gap-6 sm:grid-cols-2">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-wide text-muted">
                  Who can apply
                </p>
                {/* COPY_TODO(owner): replace the sentence below with the real eligibility criteria — e.g. which years/branches, must be enrolled at Amrita Bengaluru, any prerequisites? Keep it to 2–4 short sentences or a short list. */}
                <p className="mt-2 text-sm leading-relaxed text-paper/70">
                  Eligibility is confirmed by the team each cycle and published here when
                  recruitment opens.
                </p>
              </div>
              <div>
                <p className="font-mono text-[11px] uppercase tracking-wide text-muted">
                  How to apply
                </p>
                {/* COPY_TODO(owner): replace the sentence below with the real application steps — where the form lives, deadlines, selection rounds, and who to contact with questions. */}
                <p className="mt-2 text-sm leading-relaxed text-paper/70">
                  Application steps are published here when recruitment opens.
                </p>
              </div>
            </div>
            {/* COPY_TODO(owner): there is no notification channel (no mailing list, form, or contact route) in the site, so the closed-state button below points at the registrations archive where the next opening will appear — confirm that destination, or tell us what "Get notified" should link to. */}
            <p className="mt-8 flex flex-wrap gap-3">
              {recruitmentOpen === true ? (
                <Link to="/registrations" className="btn-primary">
                  Apply via registrations
                </Link>
              ) : recruitmentOpen === false ? (
                <Link to="/registrations#archive" className="btn-ghost">
                  Get notified
                </Link>
              ) : null}
            </p>
          </div>
        </div>
      </section>

      {/* 8. PEOPLE ------------------------------------------------------------ */}
      <section id="people" aria-label="People" data-folio="08 / People" className="rule">
        <div className="shell py-16 sm:py-24">
          <SectionHead index="08" name="People" meta="EST. 2024" />
          <h2 className="mt-8 font-display text-2xl font-bold tracking-tight text-paper sm:text-3xl">
            The people holding it together.
          </h2>
          <div className="mt-10">
            <PeopleList bearers={content.bearers} />
          </div>
        </div>
      </section>

      {/* 9. ARCHIVE ---------------------------------------------------------- */}
      <section aria-label="Archive" data-folio="09 / Archive" className="rule">
        <div className="shell py-16 sm:py-24">
          <SectionHead index="09" name="Archive" meta="Filed frames" />
          <h2 className="mt-8 font-display text-2xl font-bold tracking-tight text-paper sm:text-3xl">
            From the room.
          </h2>
          <div className="mt-10">
            <ArchiveTeaser photos={photos} />
          </div>
        </div>
      </section>

      {/* 10. VOICES ------------------------------------------------------------ */}
      <section aria-label="Voices" data-folio="10 / Voices" className="rule">
        <div className="shell py-16 sm:py-24">
          <SectionHead index="10" name="Voices" meta="From the members" />
          <div className="mt-10">
            <Testimonials />
          </div>
        </div>
      </section>

      {/* 11. ACHIEVEMENTS — editorial timeline, inline ------------------------ */}
      <section id="achievements" aria-label="Achievements" data-folio="11 / Achievements" className="rule">
        <div className="shell py-16 sm:py-24">
          <SectionHead index="11" name="Achievements" meta="System.status · Online" />
          <h2 className="mt-8 font-display text-2xl font-bold tracking-tight text-paper sm:text-3xl">
            Logged, not claimed.
          </h2>
          <div className="mt-10 md:ml-[16.666%] md:max-w-[66.666%]">
            {content.achievements.length === 0 ? (
              <p className="border-t border-line pt-5 text-sm text-muted">
                Nothing logged yet — the first entry is on its way.
              </p>
            ) : (
              <ol>
                {content.achievements.map((item, i) => (
                  <li key={item.id} className="relative pl-8">
                    {i !== content.achievements.length - 1 && (
                      <span aria-hidden="true" className="absolute bottom-0 left-[4px] top-6 w-px bg-line" />
                    )}
                    <span aria-hidden="true" className="absolute left-0 top-2 h-2 w-2 rounded-full bg-signal" />
                    <Reveal delay={Math.min(i, 5) * 60}>
                      <div className="border-t border-line py-6">
                        {item.date ? (
                          <p className="font-mono text-xs text-muted">
                            <time dateTime={item.date}>{readableDate(item.date)}</time>
                          </p>
                        ) : null}
                        <h3 className="mt-2 font-display text-lg font-bold tracking-tight text-paper">
                          {item.title}
                        </h3>
                        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-paper/70">
                          {item.description}
                        </p>
                      </div>
                    </Reveal>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
