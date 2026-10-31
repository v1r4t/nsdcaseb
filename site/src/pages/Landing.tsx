import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchContent, FALLBACK_CONTENT } from '../lib/content';
import type { SiteContent } from '../lib/content';
import { useDocumentMeta } from '../lib/useDocumentMeta';
import { listEvents, type EventSummary } from '../lib/events';
import { loadSiteState } from '../lib/site';
import { archiveSlides, listMedia } from '../lib/media';
import type { ArchiveSlide } from '../lib/media';
import { Reveal } from '../../../design/motion/Reveal';
import { SectionIndex } from '../../../design/primitives/SectionIndex';
import StorySequence from '../components/StorySequence';
import CinematicOrigin from '../components/CinematicOrigin';
import GlobeStory from '../components/GlobeStory';
import PeopleList from '../components/PeopleList';
import NowSection from '../components/NowSection';
import LandingProjects from '../components/LandingProjects';
import LandingEvents from '../components/LandingEvents';
import LandingArchive from '../components/LandingArchive';
import Swoop from '../components/Swoop';
import ZoomIn from '../components/ZoomIn';

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

/**
 * Folio convention: `data-folio="NN / Name"` sections are numbered in document
 * order; a section's SectionHead `index` always equals its `data-folio` number.
 * The label is a mono filing mark; the hairline underneath replaces the box.
 */
function SectionHead({ index, name, meta }: { index: string; name: string; meta?: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-b hairline pb-3">
      <p className="mono flex items-center gap-2.5 text-quiet">
        <span aria-hidden="true" className="inline-block h-1.5 w-1.5 shrink-0 bg-seal" />
        {index} / {name}
      </p>
      {meta ? <p className="mono text-faint">{meta}</p> : null}
    </div>
  );
}

export default function Landing() {
  useDocumentMeta({
    title: 'NSDC — National Student Data Corps',
    description:
      'What happens when students stop waiting for the future and start building it? NSDC at Amrita Bengaluru — events, projects and research in the open.',
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
      {/* THE NETWORK — the story over the room ---------------------------- */}
      <GlobeStory />

      {/* 1. WHAT WE DO ---------------------------------------------------- */}
      <section id="about" aria-label="About" data-folio="01 / About" className="border-t hairline">
        <div className="wrap pt-20 sm:pt-28">
          <SectionHead index="01" name="About" />
        </div>

        {/* The question leads: the page's only h1. ZoomIn is the entrance;
            the restored CinematicOrigin sequence slides the lines on scroll. */}
        <ZoomIn>
          <CinematicOrigin />
        </ZoomIn>

        {/* The CMS mission prose, two columns, after the question. */}
        <Swoop from="up" className="wrap pb-20 sm:pb-28">
          <div className="grid grid-cols-12 gap-x-6 gap-y-8">
            <div className="col-span-12 md:col-span-3">
              <SectionIndex value="01" className="hidden md:block" />
            </div>
            <div className="col-span-12 md:col-span-9">
              {aboutBlocks.length === 0 ? (
                <p className="text-[17px] leading-[1.65] text-quiet">
                  This section has not been written yet.
                </p>
              ) : (
                <div className="md:columns-2 md:gap-x-10">
                  {aboutBlocks.map((block) => (
                    <p
                      key={block.slice(0, 48)}
                      className="mb-5 break-inside-avoid text-[17px] leading-[1.65] text-ink/80"
                    >
                      {block}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Swoop>
      </section>

      {/* 2. THE ORIGIN ----------------------------------------------------- */}
      <section id="origin" aria-label="The origin" data-folio="02 / The Origin" className="border-t hairline">
        <StorySequence title={origin?.title ?? 'How we started'} body={origin?.body ?? ''} />
      </section>

      {/* 3. PROJECTS -------------------------------------------------------- */}
      <section aria-label="Projects" data-folio="03 / Projects" className="border-t hairline">
        <div className="wrap py-20 sm:py-28">
          <SectionHead index="03" name="Projects" meta="12.894702° N, 77.675574° E" />
          <Reveal as="h2" className="mt-6 statement-sm text-ink">
            Selected work.
          </Reveal>
          <div className="mt-10">
            <LandingProjects />
          </div>
        </div>
      </section>

      {/* 4. EVENTS ----------------------------------------------------------- */}
      <section aria-label="Events" data-folio="04 / Events" className="border-t hairline">
        <div className="wrap py-20 sm:py-28">
          <SectionHead index="04" name="Events" />
          <Reveal as="h2" className="mt-6 statement-sm text-ink">
            Upcoming dates.
          </Reveal>
          <div className="mt-8 md:ml-[8.333%] md:max-w-[83.333%]">
            <LandingEvents />
          </div>
        </div>
      </section>

      {/* 5. NOW / 2026 ----------------------------------------------------- */}
      <section aria-label="Now" data-folio="05 / Now" className="border-t hairline">
        <div className="wrap py-20 sm:py-28">
          <SectionHead index="05" name="Now / 2026" meta="System.status · Online" />
          <Reveal as="h2" className="mt-6 statement-sm max-w-2xl text-ink">
            What is happening now.
          </Reveal>
          <div className="mt-8">
            <NowSection events={events} mediaCount={photos.length} />
          </div>
          <div className="mt-14 border-t hairline pt-8 md:ml-[8.333%] md:max-w-[66.666%]">
            <p className="mono text-quiet">Recruitment</p>
            <h3 className="mt-3 font-display text-[clamp(1.5rem,2.6vw,2rem)] leading-tight tracking-tight text-ink">
              Join the corps.
            </h3>
            <p role="status" className="mono mt-3 text-faint">
              {recruitmentOpen === true
                ? 'Recruitment is open now.'
                : recruitmentOpen === false
                  ? 'Recruitment is currently closed.'
                  : 'Checking recruitment status…'}
            </p>
            <div className="mt-6 grid gap-6 sm:grid-cols-2">
              <div>
                <p className="mono text-faint">Who can apply</p>
                <p className="mt-2 text-[17px] leading-[1.6] text-ink/80">
                  Open to 1st, 2nd and 3rd-year students of all branches at Amrita Bengaluru.
                </p>
              </div>
              <div>
                <p className="mono text-faint">How to apply</p>
                <p className="mt-2 text-[17px] leading-[1.6] text-ink/80">
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
      <section id="people" aria-label="People" data-folio="06 / People" className="border-t hairline">
        <div className="wrap py-20 sm:py-28">
          <SectionHead index="06" name="People" meta="EST. 2024" />
          <Reveal as="h2" className="mt-6 statement-sm max-w-2xl text-ink">
            The people holding it together.
          </Reveal>
          <div className="mt-10">
            <PeopleList bearers={content.bearers} />
          </div>
        </div>
      </section>

      {/* 7. ARCHIVE ---------------------------------------------------------- */}
      <section aria-label="Archive" data-folio="07 / Archive" className="border-t hairline">
        <div className="wrap py-20 sm:py-28">
          <SectionHead index="07" name="Archive" meta="Filed frames" />
          <Reveal as="h2" className="mt-6 statement-sm text-ink">
            From the room.
          </Reveal>
          <div className="mt-10">
            <LandingArchive />
          </div>
        </div>
      </section>

      {/* 8. ACHIEVEMENTS — editorial timeline, inline ------------------------ */}
      <section
        id="achievements"
        aria-label="Achievements"
        data-folio="08 / Achievements"
        className="border-t hairline"
      >
        <div className="wrap py-20 sm:py-28">
          <SectionHead index="08" name="Achievements" meta="System.status · Online" />
          <Reveal as="h2" className="mt-6 statement-sm text-ink">
            Logged, not claimed.
          </Reveal>
          <div className="mt-10 md:ml-[16.666%] md:max-w-[75%]">
            {content.achievements.length === 0 ? (
              <p className="border-t hairline pt-5 text-[17px] leading-[1.65] text-quiet">
                Nothing logged yet — the first entry is on its way.
              </p>
            ) : (
              <ol className="border-t hairline">
                {content.achievements.map((item) => (
                  <li key={item.id} className="border-b hairline">
                    <div className="grid grid-cols-12 gap-x-6 gap-y-2 py-6">
                      <div className="col-span-12 md:col-span-2">
                        {item.date ? (
                          <p className="mono text-faint">
                            <time dateTime={item.date}>{readableDate(item.date)}</time>
                          </p>
                        ) : null}
                      </div>
                      <h3 className="col-span-12 font-display text-xl leading-snug tracking-tight text-ink md:col-span-4">
                        {item.title}
                      </h3>
                      <p className="col-span-12 max-w-[60ch] text-[17px] leading-[1.6] text-ink/80 md:col-span-6">
                        {item.description}
                      </p>
                    </div>
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
