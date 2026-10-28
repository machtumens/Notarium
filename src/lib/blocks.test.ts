import { describe, expect, it } from 'vitest';
import { blocksToText, noteSummary, textToBlocks, type Block } from './blocks';

const sample: Block[] = [
  { kind: 'h', text: 'Konsep Mol' },
  { kind: 'p', text: 'Mol adalah satuan jumlah zat.' },
  { kind: 'f', text: 'n = m / Mr' },
  { kind: 'p', text: 'Contoh: 9,8 g' },
];

describe('note blocks ⇄ content string', () => {
  it('writes the exact wire format (same oracle as selfcheck)', () => {
    expect(blocksToText(sample)).toBe(
      '## Konsep Mol\n\nMol adalah satuan jumlah zat.\n\n$$ n = m / Mr\n\nContoh: 9,8 g',
    );
  });

  it('round-trips heading, paragraph and formula blocks', () => {
    expect(textToBlocks(blocksToText(sample))).toEqual(sample);
  });

  it('drops blank blocks on write and blank chunks on read', () => {
    expect(
      blocksToText([
        { kind: 'p', text: '  ' },
        { kind: 'h', text: 'A' },
        { kind: 'f', text: '' },
      ]),
    ).toBe('## A');
    expect(textToBlocks('\n\n\n   \n\n')).toEqual([]);
  });

  it('reads Windows line endings and runs of blank lines as one separator', () => {
    expect(textToBlocks('## A\r\n\r\n\r\n\r\nB')).toEqual([
      { kind: 'h', text: 'A' },
      { kind: 'p', text: 'B' },
    ]);
  });

  it('treats a prefix without its trailing space as plain text', () => {
    expect(textToBlocks('##A\n\n$$B')).toEqual([
      { kind: 'p', text: '##A' },
      { kind: 'p', text: '$$B' },
    ]);
  });
});

describe('noteSummary — the plain-text description main lists and falls back to for the summary (W5.5)', () => {
  it('strips the heading and formula markers and collapses whitespace', () => {
    expect(noteSummary(blocksToText(sample))).toBe(
      'Konsep Mol Mol adalah satuan jumlah zat. n = m / Mr Contoh: 9,8 g',
    );
    expect(noteSummary('## A\n\n$$ x = 1\n  y = 2\n\nB\r\n\r\nC')).toBe('A x = 1 y = 2 B C');
  });

  it('caps at 160 characters and leaves in-text ## / $$ alone', () => {
    expect(noteSummary('p '.repeat(200))).toHaveLength(160);
    expect(noteSummary('cost is $$ 5 and ## is not a heading here')).toBe(
      'cost is $$ 5 and ## is not a heading here',
    );
    expect(noteSummary('   ')).toBe('');
  });
});
