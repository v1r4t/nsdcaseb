import { Link } from 'react-router-dom';
import type { RecordBand } from '../lib/story-record';

interface StoryRecordProps {
  bands: RecordBand[];
  /** Zero-based active band. Omit to render every band at rest. */
  active?: number;
}

/**
 * The story's centrepiece: a filed record in three bands, one per chapter.
 * All bands are always readable; the active one is ink and seal, the others
 * recede. Purely presentational — `buildRecord` owns the data.
 */
export default function StoryRecord({ bands, active }: StoryRecordProps) {
  const allAtRest = active === undefined;

  return (
    <section aria-label="The record" className="max-w-[30rem] border-t hairline pt-4">
      <p className="mono text-seal">The record</p>
      <ol className="mt-4">
        {bands.map((band, index) => {
          const on = allAtRest || index === active;
          return (
            <li
              key={band.key}
              data-band={band.key}
              data-active={on ? 'true' : 'false'}
              aria-current={on ? 'step' : undefined}
              className={`border-b hairline py-5 transition-colors duration-200 ${
                on ? 'text-ink' : 'text-faint'
              }`}
            >
              <p className="mono">{band.kicker}</p>
              <h3 className="mt-2 font-display text-xl leading-snug tracking-tight">{band.claim}</h3>
              <dl className="mono mt-3 space-y-1">
                {band.values.map((value) => (
                  <div key={value.label} className="flex items-baseline justify-between gap-4">
                    <dt>{value.label}</dt>
                    <dd className="text-ink">{value.value}</dd>
                  </div>
                ))}
              </dl>
              <Link
                to={band.link.to}
                className="mono mt-3 inline-block text-quiet transition-colors duration-200 hover:text-seal"
              >
                {band.link.label}
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
