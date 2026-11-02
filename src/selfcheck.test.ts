/**
 * One runnable check behind the non-trivial pure logic. Run: `npx tsx src/selfcheck.test.ts`
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
import { blocksToText, textToBlocks, type Block } from './lib/blocks';
import { tone } from './lib/utils';

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
