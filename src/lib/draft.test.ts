import { afterEach, describe, expect, it, vi } from 'vitest';
import { DRAFT_LIMIT, draftKey, drafts, type Draft } from '@/lib/draft';

/** Feature A: the Create editor kept per account in this tab's sessionStorage, never throwing out of storage. */
const draft: Draft = {
  title: 'Stoikiometri',
  blocks: [
    { kind: 'p', text: 'Mol adalah satuan jumlah zat.' },
    { kind: 'f', text: 'n = m / Mr' },
  ],
  subjectId: 14,
  audience: 'My class',
  savedAt: 1_758_400_000_000,
};

afterEach(() => vi.restoreAllMocks());

describe('drafts (W5.5)', () => {
  it('is keyed create:{userId} in sessionStorage, and round-trips', () => {
    expect(draftKey(7)).toBe('create:7');
    expect(drafts.save(7, draft)).toBe(true);
    expect(JSON.parse(sessionStorage.getItem('create:7') ?? 'null')).toEqual(draft);
    expect(localStorage.length).toBe(0);
    expect(drafts.load(7)).toEqual(draft);
    expect(drafts.load(8)).toBeNull();
    drafts.clear(7);
    expect(sessionStorage.getItem('create:7')).toBeNull();
    expect(drafts.load(7)).toBeNull();
  });

  it('refuses a draft over the 200 KB cap and drops the stale one, rather than risk the quota', () => {
    drafts.save(7, draft);
    const huge = { ...draft, blocks: [{ kind: 'p' as const, text: 'x'.repeat(DRAFT_LIMIT) }] };
    expect(drafts.save(7, huge)).toBe(false);
    expect(sessionStorage.getItem('create:7')).toBeNull();
  });

  it('treats anything that is not a draft as no draft', () => {
    sessionStorage.setItem('create:7', 'not json');
    expect(drafts.load(7)).toBeNull();
    sessionStorage.setItem(
      'create:7',
      JSON.stringify({
        title: 'x',
        blocks: [{ kind: 'zz', text: 1 }],
        subjectId: 14,
        audience: 'My class',
        savedAt: 1,
      }),
    );
    expect(drafts.load(7)).toBeNull();
    sessionStorage.setItem('create:7', JSON.stringify({ title: 'x' }));
    expect(drafts.load(7)).toBeNull();
  });

  it('never throws when storage does (private mode, quota): a failed write is false, a failed read is no draft', () => {
    const boom = () => {
      throw new DOMException('blocked', 'SecurityError');
    };
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(boom);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(boom);
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(boom);
    expect(drafts.save(7, draft)).toBe(false);
    expect(drafts.load(7)).toBeNull();
    expect(() => drafts.clear(7)).not.toThrow();
  });
});
