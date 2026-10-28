import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchContent, FALLBACK_CONTENT } from '../lib/content';
import type { SiteContent } from '../lib/content';
import { useDocumentMeta } from '../lib/useDocumentMeta';
import { listEvents, type EventSummary } from '../lib/events';
import { loadSiteState } from '../lib/site';
import { archiveSlides, listMedia } from '../lib/media';
import Reveal from '../components/Reveal';
import CinematicOrigin from '../components/CinematicOrigin';
import LazyGlobe from '../components/LazyGlobe';
import PeopleList from '../components/PeopleList';
import NowSection from '../components/NowSection';
import ProjectStrip from '../components/ProjectStrip';
import EventRows from '../components/EventRows';
import ArchiveTeaser from '../components/ArchiveTeaser';
import type { ArchiveSlide } from '../lib/media';
import PosterBand, { PosterLines } from '../components/PosterBand';

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

/** Folio convention: `data-folio="NN / Name"` sections are numbered in document order;
 * a section's SectionHead `index` always equals its `data-folio` number. */
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
  const [content, setContent] = useState<SiteContent>(FALLBACK_CONTENT);
  // null = in flight or failed; sections degrade to honest empty states.
  const [events, setEvents] = useState<EventSummary[] | null>(null);
  const [photos, setPhotos] = useState<ArchiveSlide[]>([]);
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

  // Recruitment flag for the NOW section. Best-effort; unknown renders "checking".
  useEffect(() => {
    let active = true;
    void loadSiteState().then((state) => {
      if (active) setRecruitmentOpen(state.recruitment_open);
    });
    return () => {
      active = false;
    };
  }, []);

  // Up to six archive photos per event for the carousel. Best-effort.
  useEffect(() => {
    let active = true;
    listMedia()
      .then(({ albums }) => {
        if (active) setPhotos(archiveSlides(albums, 6));
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

  return (
    <div>
      {/* 1. THE NETWORK — scroll-linked globe narrative (lazy: three.js loads near viewport) ---- */}
      <LazyGlobe />

      {/* 1. WHAT WE DO ---------------------------------------------------- */}
      <section id="about" aria-label="What we do" data-folio="01 / About" className="rule">
        <div className="shell grid grid-cols-12 gap-x-6 py-16 sm:py-24">
          <Reveal className="col-span-12 md:col-span-6 md:col-start-2">
            <SectionHead index="01" name="About" />
            <h1 className="mt-8 font-display text-2xl font-bold leading-snug tracking-tight text-paper sm:text-3xl">
              We bring students together to learn, build, experiment and compete across data, AI and
              emerging technology.
            </h1>
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

      {/* POSTER — the typographic moment (unnumbered interlude) ---------------- */}
      <PosterBand>
        <PosterLines lines={['Build.', 'Learn.', 'Ship.']} />
        <p className="mt-10 max-w-md font-mono text-xs uppercase leading-relaxed tracking-wide text-muted">
          A student technology community at Amrita Vishwa Vidyapeetham, Bengaluru.
        </p>
      </PosterBand>

      {/* 2. THE ORIGIN ----------------------------------------------------- */}
      <section id="origin" aria-label="The origin" data-folio="02 / The Origin" className="rule">
        <CinematicOrigin title={origin?.title ?? 'How we started'} body={origin?.body ?? ''} />
      </section>

      {/* 3. PROJECTS -------------------------------------------------------- */}
      <section aria-label="Projects" data-folio="03 / Projects" className="rule">
        <div className="shell py-16 sm:py-24">
          <SectionHead index="03" name="Projects" meta="12.894702° N, 77.675574° E" />
          <h2 className="mt-8 font-display text-2xl font-bold tracking-tight text-paper sm:text-3xl">
            Selected work.
          </h2>
          <div className="mt-8">
            <ProjectStrip />
          </div>
        </div>
      </section>

      {/* 4. EVENTS ----------------------------------------------------------- */}
      <section aria-label="Events" data-folio="04 / Events" className="rule">
        <div className="shell py-16 sm:py-24">
          <SectionHead index="04" name="Events" />
          <h2 className="mt-8 font-display text-2xl font-bold tracking-tight text-paper sm:text-3xl">
            Upcoming dates.
          </h2>
          <div className="mt-8 md:ml-[8.333%] md:max-w-[83.333%]">
            <EventRows events={events} />
          </div>
        </div>
      </section>

      {/* 5. NOW / 2026 ----------------------------------------------------- */}
      <section aria-label="Now" data-folio="05 / Now" className="rule">
        <div className="shell py-16 sm:py-24">
          <SectionHead index="05" name="Now / 2026" meta="System.status · Online" />
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
                <p className="mt-2 text-sm leading-relaxed text-paper/70">
                  Open to 1st, 2nd and 3rd-year students of all branches at Amrita Bengaluru.
                </p>
              </div>
              <div>
                <p className="font-mono text-[11px] uppercase tracking-wide text-muted">
                  How to apply
                </p>
                <p className="mt-2 text-sm leading-relaxed text-paper/70">
                  Submit the application form. Every application is reviewed and you will be
                  notified whether you are selected or not.
                </p>
              </div>
            </div>
            <p className="mt-8 flex flex-wrap gap-3">
              {recruitmentOpen === true ? (
                <Link to="/recruit" className="btn-primary">
                  Apply now
                </Link>
              ) : recruitmentOpen === false ? (
                <Link to="/recruit" className="btn-ghost">
                  Check application status
                </Link>
              ) : null}
            </p>
          </div>
        </div>
      </section>

      {/* 6. PEOPLE ------------------------------------------------------------ */}
      <section id="people" aria-label="People" data-folio="06 / People" className="rule">
        <div className="shell py-16 sm:py-24">
          <SectionHead index="06" name="People" meta="EST. 2024" />
          <h2 className="mt-8 font-display text-2xl font-bold tracking-tight text-paper sm:text-3xl">
            The people holding it together.
          </h2>
          <div className="mt-10">
            <PeopleList bearers={content.bearers} />
          </div>
        </div>
      </section>

      {/* 7. ARCHIVE ---------------------------------------------------------- */}
      <section aria-label="Archive" data-folio="07 / Archive" className="rule">
        <div className="shell py-16 sm:py-24">
          <SectionHead index="07" name="Archive" meta="Filed frames" />
          <h2 className="mt-8 font-display text-2xl font-bold tracking-tight text-paper sm:text-3xl">
            From the room.
          </h2>
          <div className="mt-10">
            <ArchiveTeaser slides={photos} />
          </div>
        </div>
      </section>

      {/* 8. ACHIEVEMENTS — editorial timeline, inline ------------------------ */}
      <section id="achievements" aria-label="Achievements" data-folio="08 / Achievements" className="rule">
        <div className="shell py-16 sm:py-24">
          <SectionHead index="08" name="Achievements" meta="System.status · Online" />
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
