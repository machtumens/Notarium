/**
 * Publish — announcements and news. One compose form, one record of what has gone out.
 *
 * Whatever is written here lands in the `notifications` table and reaches students through the
 * app's own notification routes, so there is no separate "news" store to keep in step. The
 * audience is one of four: everyone, a grade, a class, or one named student — the worker refuses
 * anything else with a 400.
 *
 * The worker strips HTML from the title and the message before storing them, so this form takes
 * plain text and says so rather than pretending to be a rich editor.
 */
import { useMemo, useState } from 'react';
import { admin, type NewAnnouncement } from '@/lib/admin-api';
import { useAsync } from '@/lib/use-async';
import { cn } from '@/lib/utils';
import {
  Async,
  Confirm,
  Field,
  INPUT,
  Panel,
  Said,
  Stat,
  StatRow,
  Table,
  Tag,
  primary,
  useAction,
} from './kit';

type Target = NewAnnouncement['target_type'];
const TARGETS: { key: Target; label: string; note: string }[] = [
  { key: 'all', label: 'Everyone', note: 'Every account, staff included.' },
  { key: 'grade', label: 'A grade', note: 'Every student in grade 10, 11 or 12.' },
  { key: 'class', label: 'A class', note: 'One class, by name.' },
  { key: 'user', label: 'One student', note: 'A single account, by id.' },
];
const KINDS: {
  key: NonNullable<NewAnnouncement['notification_type']>;
  label: string;
  note: string;
}[] = [
  {
    key: 'announcement',
    label: 'Announcement',
    note: 'News, a deadline, a change to how the school uses Notarium.',
  },
  {
    key: 'class_reassignment',
    label: 'Class change',
    note: 'Reserved for class moves — the app files it alongside the automatic ones.',
  },
  {
    key: 'warning',
    label: 'Warning',
    note: 'Carries a warning’s weight in the student’s inbox. Prefer the warning button under People, which also flags the account.',
  },
];

const audience = (a: {
  target_type: string;
  target_grade: number | null;
  target_class: string | null;
  target_user_id: number | null;
}) =>
  a.target_type === 'all'
    ? 'Everyone'
    : a.target_type === 'grade'
      ? `Grade ${a.target_grade ?? '?'}`
      : a.target_type === 'class'
        ? `Class ${a.target_class ?? '?'}`
        : `Student #${a.target_user_id ?? '?'}`;

export function Publish() {
  const sent = useAsync(() => admin.announcements.list(), []);
  const classes = useAsync(() => admin.classes.list(), []);
  const act = useAction(() => sent.retry());

  const [target, setTarget] = useState<Target>('all');
  const [kind, setKind] =
    useState<NonNullable<NewAnnouncement['notification_type']>>('announcement');
  const [grade, setGrade] = useState('10');
  const [cls, setCls] = useState('');
  const [userId, setUserId] = useState('');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');

  const activeClasses = useMemo(
    () => (classes.data ?? []).filter((c) => c.is_active),
    [classes.data],
  );

  const missing = !title.trim()
    ? 'a title'
    : !message.trim()
      ? 'something to say'
      : target === 'class' && !cls
        ? 'a class'
        : target === 'user' && !Number(userId)
          ? 'a student id'
          : null;

  const send = () => {
    const body: NewAnnouncement = {
      target_type: target,
      notification_type: kind,
      title: title.trim(),
      message: message.trim(),
    };
    if (target === 'grade') body.target_grade = Number(grade);
    if (target === 'class') body.target_class = cls;
    if (target === 'user') body.target_user_id = Number(userId);
    void act.run(
      `Published to ${audience({ target_type: target, target_grade: Number(grade), target_class: cls, target_user_id: Number(userId) }).toLowerCase()}.`,
      () =>
        admin.announcements.create(body).then(() => {
          setTitle('');
          setMessage('');
        }),
    );
  };

  const rows = sent.data ?? [];

  return (
    <div className="flex flex-col gap-9">
      <Panel
        title="Write an announcement"
        note="It appears in the students' notifications the next time they load the app. Plain text — the worker strips any markup before storing it."
      >
        <div className="flex flex-wrap gap-x-10 gap-y-6">
          <div className="flex-[1_1_340px] min-w-[min(100%,320px)] flex flex-col gap-4">
            <Field label="Who gets it" className="grow-0">
              <div className="flex gap-4 flex-wrap pt-1">
                {TARGETS.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    className="tabline"
                    data-on={target === t.key}
                    onClick={() => setTarget(t.key)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </Field>
            <p className="text-[12.5px] text-neutral-700 [text-wrap:pretty]">
              {TARGETS.find((t) => t.key === target)?.note}
            </p>

            {target === 'grade' && (
              <Field label="Grade" className="grow-0">
                <select value={grade} onChange={(e) => setGrade(e.target.value)} className={INPUT}>
                  {[10, 11, 12].map((g) => (
                    <option key={g} value={g}>
                      Grade {g}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {target === 'class' && (
              <Field
                label="Class"
                className="grow-0"
                hint={
                  activeClasses.length
                    ? undefined
                    : 'No active class exists yet — add one under School.'
                }
              >
                <select value={cls} onChange={(e) => setCls(e.target.value)} className={INPUT}>
                  <option value="">Pick a class…</option>
                  {activeClasses.map((c) => (
                    <option key={c.id} value={c.class_name}>
                      {c.class_name} · {c.student_count} students
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {target === 'user' && (
              <Field label="Student id" className="grow-0" hint="The id in the People register.">
                <input
                  type="number"
                  min={1}
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  className={cn(INPUT, 'max-w-[160px]')}
                />
              </Field>
            )}

            <Field label="Kind" className="grow-0">
              <div className="flex gap-4 flex-wrap pt-1">
                {KINDS.map((k) => (
                  <button
                    key={k.key}
                    type="button"
                    className="tabline"
                    data-on={kind === k.key}
                    onClick={() => setKind(k.key)}
                  >
                    {k.label}
                  </button>
                ))}
              </div>
            </Field>
            <p className="text-[12.5px] text-neutral-700 [text-wrap:pretty]">
              {KINDS.find((k) => k.key === kind)?.note}
            </p>
          </div>

          <div className="flex-[2_1_380px] min-w-[min(100%,340px)] flex flex-col gap-4">
            <Field label="Title" className="grow-0">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                placeholder="Exam week timetable is up"
                className={INPUT}
              />
            </Field>
            <Field label="Message" className="grow-0">
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={8}
                placeholder="Say the thing, then say what to do about it."
                className={cn(INPUT, 'resize-y leading-[1.6]')}
              />
            </Field>
            <div className="flex items-center gap-4 flex-wrap">
              <button
                type="button"
                disabled={!!missing || act.busy}
                onClick={send}
                className={cn(
                  primary,
                  'px-5 py-2.5 text-[14px] disabled:opacity-40 disabled:pointer-events-none',
                )}
              >
                Publish
              </button>
              {missing && <span className="text-[12.5px] text-neutral-700">Needs {missing}.</span>}
            </div>
            <Said said={act.said} />
          </div>
        </div>
      </Panel>

      <Panel
        title="A preview of what they will see"
        quiet
        note="Same words, the shape a student's inbox gives them."
      >
        <article className="border-t border-ink pt-3 flex flex-col gap-2 max-w-[62ch]">
          <span className="flex items-center gap-2.5 flex-wrap">
            <Tag on={kind === 'warning'}>{KINDS.find((k) => k.key === kind)?.label}</Tag>
            <span className="meta">
              {audience({
                target_type: target,
                target_grade: Number(grade),
                target_class: cls,
                target_user_id: Number(userId),
              })}
            </span>
          </span>
          <h3 className="text-[clamp(20px,2.4vw,28px)] [text-wrap:balance]">
            {title.trim() || 'Your title goes here'}
          </h3>
          <p className="text-[15px] leading-[1.6] text-neutral-800 whitespace-pre-line [text-wrap:pretty]">
            {message.trim() || 'And the message underneath it.'}
          </p>
        </article>
      </Panel>

      <Panel
        title={`Published · ${rows.length}`}
        note="The hundred most recent, newest first. Deleting one removes it from every student's inbox, read or not."
      >
        <Async loading={sent.loading} error={sent.error} retry={sent.retry}>
          <StatRow>
            <Stat
              label="Announcements"
              value={rows.filter((r) => r.notification_type === 'announcement').length}
            />
            <Stat
              label="Warnings"
              value={rows.filter((r) => r.notification_type === 'warning').length}
            />
            <Stat label="To everyone" value={rows.filter((r) => r.target_type === 'all').length} />
          </StatRow>
          <Table
            cols={[
              { key: 'title', label: 'Announcement' },
              { key: 'kind', label: 'Kind', w: '128px' },
              { key: 'who', label: 'Audience', w: '128px' },
              { key: 'by', label: 'Sent by', w: '136px' },
              { key: 'when', label: 'Sent', w: '96px' },
              { key: 'act', label: '', w: '110px' },
            ]}
            rows={rows}
            keyOf={(r) => r.id}
            cell={(r, k) =>
              k === 'title' ? (
                <span className="flex flex-col gap-0.5">
                  <span className="font-semibold text-ink [text-wrap:pretty]">{r.title}</span>
                  <span className="text-[12px] text-neutral-600 [text-wrap:pretty] line-clamp-2">
                    {r.message}
                  </span>
                </span>
              ) : k === 'kind' ? (
                <Tag on={r.notification_type === 'warning'}>
                  {r.notification_type.replace('_', ' ')}
                </Tag>
              ) : k === 'who' ? (
                audience(r)
              ) : k === 'by' ? (
                (r.sender_name ?? '—')
              ) : k === 'when' ? (
                r.created_at?.slice(0, 10)
              ) : (
                <Confirm
                  label="Delete"
                  onConfirm={() => void act.run('Deleted.', () => admin.announcements.remove(r.id))}
                />
              )
            }
            empty="Nothing has been published yet."
          />
        </Async>
      </Panel>
    </div>
  );
}
