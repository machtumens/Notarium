/**
 * Content — every note in the school, and the moderator's powers over it: feature it on the
 * front of Discover, upvote it, rewrite it, bin it, bring it back.
 *
 * Two things about the data are worth knowing before you edit anything:
 *  - the body lives in `extracted_text` first. That is what the live app writes from its upload
 *    form, what search scores, and what `my-notes` returns; `content` is this app's block text,
 *    mirrored. Edit both or the two frontends disagree, which is why the editor writes both.
 *  - `admin.notes.remove` is a HARD delete that also decrements the author's and the subject's
 *    counters. `deleted_at` (the bin) is set elsewhere; this screen can only restore from it.
 */
import { useMemo, useState } from 'react';
import { admin, type AdminNote, type NotePatch } from '@/lib/admin-api';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/use-async';
import { cn } from '@/lib/utils';
import {
  Async,
  Confirm,
  Field,
  INPUT,
  Panel,
  Said,
  Table,
  TINY,
  Tag,
  primary,
  useAction,
} from './kit';

type Sort = 'recent' | 'likes' | 'featured';
const SORTS: { key: Sort; label: string }[] = [
  { key: 'recent', label: 'Newest' },
  { key: 'likes', label: 'Most liked' },
  { key: 'featured', label: 'Featured first' },
];
const STATUSES = [
  { key: '', label: 'Any status' },
  { key: 'published', label: 'Published' },
  { key: 'draft', label: 'Draft' },
];

/** `tags` is stored as a JSON-encoded array; a row that predates that is a bare string. */
const readTags = (raw: string | null): string[] => {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return raw
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
  }
};
const body = (n: AdminNote) => n.extracted_text || n.content || n.description || '';

export function Content() {
  const [sort, setSort] = useState<Sort>('recent');
  const [status, setStatus] = useState('');
  const [subject, setSubject] = useState('');
  const [q, setQ] = useState('');
  const [bin, setBin] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);

  const subjects = useAsync(() => api.subjects(), []);
  // The worker filters server-side on q / subject / status / sort, so they are deps, not a local pass.
  const notes = useAsync(
    () =>
      admin.notes.list({
        q: q.trim() || undefined,
        subject: subject ? Number(subject) : undefined,
        status: status || undefined,
        sort,
      }),
    [q, subject, status, sort],
  );

  const rows = useMemo(
    () => (notes.data ?? []).filter((n) => (bin ? !!n.deleted_at : !n.deleted_at)),
    [notes.data, bin],
  );
  const open = rows.find((n) => n.id === openId) ?? null;
  const binned = (notes.data ?? []).filter((n) => n.deleted_at).length;

  return (
    <div className="flex flex-col gap-9">
      <Panel
        title={`${bin ? 'Bin' : 'Notes'} · ${rows.length}`}
        note={
          bin
            ? 'Soft-deleted notes. Restore puts one back where it was; purging them for good lives under System.'
            : 'Filtering happens on the worker — the search matches the title and the description, not the body.'
        }
        right={
          <>
            <div className="flex gap-4 flex-wrap">
              <button
                type="button"
                className="tabline"
                data-on={!bin}
                onClick={() => setBin(false)}
              >
                Live
              </button>
              <button type="button" className="tabline" data-on={bin} onClick={() => setBin(true)}>
                Bin{binned ? ` · ${binned}` : ''}
              </button>
            </div>
            <span aria-hidden className="h-4 w-px bg-neutral-300" />
            <div className="flex gap-4 flex-wrap">
              {SORTS.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  className="tabline"
                  data-on={sort === s.key}
                  onClick={() => setSort(s.key)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </>
        }
      >
        <div className="flex flex-wrap gap-3 items-end">
          <Field label="Search">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Title or description"
              className={cn(INPUT, 'py-1.5 text-[13px]')}
            />
          </Field>
          <Field label="Subject">
            <select
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className={cn(INPUT, 'py-1.5 text-[13px]')}
            >
              <option value="">Every subject</option>
              {(subjects.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Status">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className={cn(INPUT, 'py-1.5 text-[13px]')}
            >
              {STATUSES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Async loading={notes.loading} error={notes.error} retry={notes.retry}>
          <Table
            cols={[
              { key: 'title', label: 'Note' },
              { key: 'subject', label: 'Subject', w: '116px' },
              { key: 'author', label: 'Author', w: '150px' },
              { key: 'state', label: 'State', w: '150px' },
              { key: 'likes', label: 'Likes', num: true, w: '62px' },
              { key: 'up', label: 'Upvotes', num: true, w: '78px' },
              { key: 'when', label: 'Written', w: '94px' },
              { key: 'act', label: '', w: '86px' },
            ]}
            rows={rows}
            keyOf={(n) => n.id}
            cell={(n, k) =>
              k === 'title' ? (
                <span className="flex flex-col gap-0.5">
                  <span className="font-semibold text-ink [text-wrap:pretty]">
                    {n.title || <span className="text-neutral-500">untitled</span>}
                  </span>
                  <span className="text-[12px] text-neutral-600 [text-wrap:pretty] line-clamp-1">
                    {n.description || body(n).slice(0, 90)}
                  </span>
                </span>
              ) : k === 'subject' ? (
                (n.subject_name ?? `#${n.subject_id}`)
              ) : k === 'author' ? (
                <span className="flex flex-col gap-0.5">
                  <span>{n.author_name ?? `#${n.author_id}`}</span>
                  <span className="text-[12px] text-neutral-600">{n.author_class ?? '—'}</span>
                </span>
              ) : k === 'state' ? (
                <span className="flex flex-wrap gap-1.5">
                  {n.featured ? <Tag on>Featured</Tag> : null}
                  {n.status === 'draft' ? <Tag>Draft</Tag> : null}
                  {n.visibility === 'class' ? <Tag>Class only</Tag> : null}
                  {n.image_path ? <Tag>Image</Tag> : null}
                  {!n.featured &&
                  n.status !== 'draft' &&
                  n.visibility !== 'class' &&
                  !n.image_path ? (
                    <span className="text-neutral-500">—</span>
                  ) : null}
                </span>
              ) : k === 'likes' ? (
                n.likes
              ) : k === 'up' ? (
                n.admin_upvotes
              ) : k === 'when' ? (
                n.created_at?.slice(0, 10)
              ) : (
                <button
                  type="button"
                  className={TINY}
                  onClick={() => setOpenId(openId === n.id ? null : n.id)}
                >
                  {openId === n.id ? 'Close' : 'Open'}
                </button>
              )
            }
            empty={bin ? 'Nothing in the bin.' : 'No note matches those filters.'}
          />
        </Async>
      </Panel>

      {open && <Moderate key={open.id} note={open} onChanged={() => notes.retry()} />}
    </div>
  );
}

function Moderate({ note, onChanged }: { note: AdminNote; onChanged: () => void }) {
  const act = useAction(onChanged);
  const [draft, setDraft] = useState({
    title: note.title ?? '',
    description: note.description ?? '',
    summary: note.summary ?? '',
    text: body(note),
    tags: readTags(note.tags).join(', '),
  });

  const save = () => {
    const patch: NotePatch = {};
    if (draft.title.trim() !== (note.title ?? '')) patch.title = draft.title.trim();
    if (draft.description !== (note.description ?? '')) patch.description = draft.description;
    if (draft.summary !== (note.summary ?? '')) patch.summary = draft.summary;
    if (draft.text !== body(note)) {
      // Both, always: the live app reads and searches `extracted_text`, this app renders `content`.
      patch.extracted_text = draft.text;
      patch.content = draft.text;
    }
    const tags = draft.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    if (tags.join(',') !== readTags(note.tags).join(',')) patch.tags = tags;
    if (Object.keys(patch).length === 0) return;
    void act.run(`Saved ${Object.keys(patch).join(', ')}.`, () =>
      admin.notes.update(note.id, patch),
    );
  };

  return (
    <div className="flex flex-col gap-7 border-t-2 border-ink pt-4">
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div className="flex flex-col gap-1">
          <h2 className="text-[clamp(24px,3vw,36px)] max-w-[26ch] [text-wrap:balance]">
            {note.title || 'Untitled note'}
          </h2>
          <p data-num className="text-[13px] text-neutral-700">
            id {note.id} · {note.subject_name ?? `subject #${note.subject_id}`} ·{' '}
            {note.author_name ?? `author #${note.author_id}`}
            {note.author_class ? ` (${note.author_class})` : ''} · {note.created_at?.slice(0, 10)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {note.deleted_at ? <Tag on>In the bin since {note.deleted_at.slice(0, 10)}</Tag> : null}
          {note.featured ? <Tag on>Featured</Tag> : null}
          <Tag>{note.status === 'draft' ? 'Draft' : 'Published'}</Tag>
        </div>
      </div>

      <Said said={act.said} />

      <Panel
        title="Act on it"
        quiet
        note="Featuring is a toggle. An upvote is yours, once — pressing it again takes it back, and the author's total moves with it."
      >
        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            disabled={act.busy}
            className={TINY}
            onClick={() =>
              void act.run(note.featured ? 'Unfeatured.' : 'Featured.', () =>
                admin.notes.feature(note.id),
              )
            }
          >
            {note.featured ? 'Unfeature' : 'Feature on Discover'}
          </button>
          <button
            type="button"
            disabled={act.busy}
            className={cn(TINY, note.admin_liked ? 'bg-ink text-accent-100 border-ink' : '')}
            onClick={() =>
              void act.run(note.admin_liked ? 'Upvote withdrawn.' : 'Upvoted.', () =>
                admin.notes.like(note.id),
              )
            }
          >
            {note.admin_liked ? 'Withdraw my upvote' : 'Upvote this note'}
          </button>
          {note.deleted_at && (
            <button
              type="button"
              disabled={act.busy}
              className={TINY}
              onClick={() => void act.run('Restored.', () => admin.notes.restore(note.id))}
            >
              Restore from the bin
            </button>
          )}
          <Confirm
            label="Delete for good"
            confirmLabel="Delete for good — confirm"
            disabled={act.busy}
            onConfirm={() => void act.run('Deleted.', () => admin.notes.remove(note.id))}
          />
        </div>
        <p className="text-[12px] text-neutral-600 [text-wrap:pretty]">
          Deleting for good also drops the author&rsquo;s note count and the subject&rsquo;s. It
          cannot be undone from here.
        </p>
      </Panel>

      <Panel
        title="Rewrite it"
        quiet
        note="Saved as the author's own note — there is no revision history behind this, so fix typos and remove material that should not be up, rather than rephrasing someone's work."
      >
        <div className="flex flex-wrap gap-4">
          <Field label="Title">
            <input
              value={draft.title}
              onChange={(e) => setDraft((s) => ({ ...s, title: e.target.value }))}
              maxLength={200}
              className={INPUT}
            />
          </Field>
          <Field label="Tags" hint="Comma separated, 20 max.">
            <input
              value={draft.tags}
              onChange={(e) => setDraft((s) => ({ ...s, tags: e.target.value }))}
              className={INPUT}
            />
          </Field>
        </div>
        <Field
          label="Description"
          className="grow-0"
          hint="The one line Discover shows. 500 characters."
        >
          <input
            value={draft.description}
            onChange={(e) => setDraft((s) => ({ ...s, description: e.target.value }))}
            maxLength={500}
            className={INPUT}
          />
        </Field>
        <Field
          label="Summary"
          className="grow-0"
          hint="Shown above the body in the reader, when it says something the body does not."
        >
          <input
            value={draft.summary}
            onChange={(e) => setDraft((s) => ({ ...s, summary: e.target.value }))}
            maxLength={10000}
            className={INPUT}
          />
        </Field>
        <Field
          label="Body"
          className="grow-0"
          hint="Written to extracted_text and content together, so both frontends read the same note."
        >
          <textarea
            value={draft.text}
            onChange={(e) => setDraft((s) => ({ ...s, text: e.target.value }))}
            rows={12}
            className={cn(INPUT, 'resize-y font-body text-[14px] leading-[1.6]')}
          />
        </Field>
        <button
          type="button"
          disabled={act.busy}
          onClick={save}
          className={cn(primary, 'self-start px-5 py-2.5 text-[13.5px]')}
        >
          Save the note
        </button>
      </Panel>
    </div>
  );
}
