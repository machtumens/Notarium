/**
 * Note body format, blocks ⇄ plain text (the API stores `content` as one string).
 * Blocks are separated by a blank line; `## ` marks a heading, `$$ ` a formula, anything else is a paragraph.
 */
export type Block = { kind: 'h' | 'p' | 'f'; text: string };

const PREFIX: Record<Block['kind'], string> = { h: '## ', f: '$$ ', p: '' };

/** Blank blocks are dropped. ponytail: a blank line typed inside one block splits it into two on read-back. */
export const blocksToText = (blocks: Block[]) =>
  blocks
    .filter((b) => b.text.trim())
    .map((b) => `${PREFIX[b.kind]}${b.text}`)
    .join('\n\n');

export const textToBlocks = (text: string): Block[] =>
  text
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((c) => c.trim())
    .filter(Boolean)
    .map(
      (c): Block =>
        c.startsWith('## ')
          ? { kind: 'h', text: c.slice(3) }
          : c.startsWith('$$ ')
            ? { kind: 'f', text: c.slice(3) }
            : { kind: 'p', text: c },
    );

/** Plain text for main's `description` (its list teaser, and what it copies into `summary`): block markers stripped, whitespace collapsed, at most `max` characters. */
export const noteSummary = (text: string, max = 160) =>
  text
    .replace(/^(## |\$\$ )/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
