import Reveal from './Reveal';

/** Plain-text paragraphs: D1 copy is never HTML, so markup cannot leak in. */
export function paragraphs(body: string): string[] {
  return body
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\\r\\n|\\n/g, '\n')
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);
}

interface OriginStatementProps {
  title: string;
  body: string;
}

/**
 * THE ORIGIN — opens with the founding question, then the real `origin`
 * prose from the API. Offset right (columns 6–12) against the WHAT WE DO
 * block to keep the page deliberately asymmetric.
 */
export default function OriginStatement({ title, body }: OriginStatementProps) {
  const blocks = paragraphs(body);
  return (
    <div className="md:ml-[41.666%] md:max-w-[58.333%]">
      <Reveal>
        <p className="label">We started with a question.</p>
        <p className="mt-4 font-display text-2xl font-bold leading-snug tracking-tight text-paper sm:text-4xl">
          What happens when students stop waiting for the future and start building it?
        </p>
      </Reveal>
      <Reveal delay={120} className="mt-10">
        <h3 className="label">{title}</h3>
        <div className="mt-4 space-y-5">
          {blocks.length === 0 ? (
            <p className="text-sm text-muted">This section has not been written yet.</p>
          ) : (
            blocks.map((block) => (
              <p key={block.slice(0, 48)} className="max-w-2xl text-base leading-relaxed text-paper/70">
                {block}
              </p>
            ))
          )}
        </div>
      </Reveal>
    </div>
  );
}
