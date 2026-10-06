import Reveal from './Reveal';

/**
 * PROJECTS — a placeholder strip. No project API exists yet, so this renders
 * an honest "coming soon" line with a NEXT tag. No invented names, stacks,
 * or descriptions.
 */
export default function ProjectStrip() {
  return (
    <Reveal className="md:ml-[25%] md:max-w-[50%]">
      <div className="border-t border-line pt-6">
        <p className="font-mono text-xs text-signal">NEXT</p>
        <p className="mt-3 font-display text-xl font-bold tracking-tight text-paper sm:text-2xl">
          Projects coming soon.
        </p>
        <p className="mt-3 max-w-xl text-base leading-relaxed text-paper/70">
          The project index opens here — work from project nights and small
          teams, listed as it ships.
        </p>
      </div>
    </Reveal>
  );
}
