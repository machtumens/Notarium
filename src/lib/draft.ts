import type { Block } from '@/lib/blocks';

/** What Create keeps between visits (Feature A): the editor, and when it was last saved. */
export type Draft = {
  title: string;
  blocks: Block[];
  subjectId: number;
  audience: string;
  savedAt: number;
};

/** Per account and per tab — sessionStorage, like the guest flag: a draft should not follow the visitor into another tab or a later visit. */
export const draftKey = (userId: number) => `create:${userId}`;
/** 200 KB in UTF-16 units (what storage counts). Above it the draft is dropped rather than risk the tab's quota. */
export const DRAFT_LIMIT = 200 * 1024;

const KINDS: readonly string[] = ['h', 'p', 'f'];
const isBlock = (b: unknown): b is Block =>
  typeof b === 'object' &&
  b !== null &&
  KINDS.includes((b as Block).kind) &&
  typeof (b as Block).text === 'string';
const isDraft = (d: unknown): d is Draft => {
  const x = d as Partial<Draft> | null;
  return (
    typeof x === 'object' &&
    x !== null &&
    typeof x.title === 'string' &&
    Array.isArray(x.blocks) &&
    x.blocks.every(isBlock) &&
    typeof x.subjectId === 'number' &&
    typeof x.audience === 'string' &&
    typeof x.savedAt === 'number'
  );
};

/** Storage never throws out of here (private mode, quota, a tampered value): a failed read is "no draft", a failed write is `false`. */
export const drafts = {
  load(userId: number): Draft | null {
    try {
      const raw = sessionStorage.getItem(draftKey(userId));
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      return isDraft(parsed) ? parsed : null;
    } catch {
      return null;
    }
  },
  save(userId: number, draft: Draft): boolean {
    const raw = JSON.stringify(draft);
    if (raw.length > DRAFT_LIMIT) {
      drafts.clear(userId);
      return false;
    }
    try {
      sessionStorage.setItem(draftKey(userId), raw);
      return true;
    } catch {
      return false;
    }
  },
  clear(userId: number) {
    try {
      sessionStorage.removeItem(draftKey(userId));
    } catch {
      /* ignore */
    }
  },
};
