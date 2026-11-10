import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import StoryRecord from './StoryRecord';
import type { RecordBand } from '../lib/story-record';

const bands: RecordBand[] = [
  {
    key: 'founded',
    kicker: 'AUG 2024',
    claim: 'Chapter founded.',
    values: [{ label: 'MENTOR', value: '01' }],
    link: { label: 'Join →', to: '/recruit' },
  },
  {
    key: 'network',
    kicker: '2024—26',
    claim: 'The network.',
    values: [{ label: 'OFFICE BEARERS', value: '—' }],
    link: { label: 'Projects →', to: '/projects' },
  },
  {
    key: 'open',
    kicker: 'NOW',
    claim: 'In the open.',
    values: [{ label: 'FRAMES FILED', value: '00' }],
    link: { label: 'Archive →', to: '/archive' },
  },
];

const html = (active?: number) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <StoryRecord bands={bands} active={active} />
    </MemoryRouter>,
  );

describe('StoryRecord', () => {
  it('marks the active band and leaves the others readable', () => {
    const out = html(1);
    expect(out).toContain('data-active="true"');
    expect(out.match(/data-active="false"/g)).toHaveLength(2);
    expect(out).toContain('OFFICE BEARERS');
    expect(out).toContain('—');
  });

  it('renders every band at rest when no active index is given', () => {
    expect(html().match(/data-active="true"/g)).toHaveLength(3);
  });

  it('is a labelled region with links to the three destinations', () => {
    const out = html(0);
    expect(out).toContain('aria-label="The record"');
    expect(out).toContain('href="/recruit"');
    expect(out).toContain('href="/projects"');
    expect(out).toContain('href="/archive"');
  });
});
