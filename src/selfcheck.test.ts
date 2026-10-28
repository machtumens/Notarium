/**
 * One runnable check behind the non-trivial pure logic. Run: `npx tsx src/selfcheck.test.ts`
 * Oracle values come from the design prototype's own chartPaths() (design/prototype.html).
 */
const assert = {
  equal: (a: unknown, b: unknown, m?: string) => {
    if (a !== b) throw new Error(m ?? `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
  },
  deepEqual: (a: unknown, b: unknown, m?: string) => {
    if (JSON.stringify(a) !== JSON.stringify(b))
      throw new Error(m ?? `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
  },
};
import { chartPaths } from './components/ui/area-chart-card';
import { blocksToText, textToBlocks, type Block } from './lib/blocks';
import { SERIES, tutorsFiltered, TUTORS } from './lib/data';
import { tone } from './lib/utils';

const c = chartPaths({ labels: SERIES.weeks, you: SERIES.you, klas: SERIES.klas }, 70);
assert.equal(
  c.you.slice(0, 22),
  'M8.0 130.3 L53.8 119.4',
  'you-line start must match the prototype path',
);
assert.equal(c.lastX, '512.0');
assert.equal(c.lastY, '78.7');
assert.deepEqual(
  c.grid.map((g) => g.label),
  ['70%', '53%', '35%', '18%'],
);
assert.equal(c.labels.length, 4, 'only the four named months get x labels');

assert.deepEqual(
  tutorsFiltered('Tonight').map((t) => t.name),
  ['Paul', 'Rosmyas', 'Petris', 'Lisa'],
);
assert.equal(tutorsFiltered('Geografi')[0].name, 'Jennifer');
assert.equal(tutorsFiltered('Matched to me').length, TUTORS.length);

assert.equal(tone(41), '#0b0b0b');
assert.equal(tone(66), '#6e6e6e');
assert.equal(tone(78), '#c9c9c9');

const sample: Block[] = [
  { kind: 'h', text: 'Konsep Mol' },
  { kind: 'p', text: 'Mol adalah satuan jumlah zat.' },
  { kind: 'f', text: 'n = m / Mr' },
  { kind: 'p', text: 'Contoh: 9,8 g' },
];
assert.equal(
  blocksToText(sample),
  '## Konsep Mol\n\nMol adalah satuan jumlah zat.\n\n$$ n = m / Mr\n\nContoh: 9,8 g',
);
assert.deepEqual(textToBlocks(blocksToText(sample)), sample, 'note block format must round-trip');
console.log('selfcheck ok');
