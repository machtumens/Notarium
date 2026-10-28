/**
 * School — the two lists the whole product is shaped around: subjects and classes.
 *
 * They are gates, not labels. Sign-up refuses a class that is not an active `grade_classes` row,
 * and a note cannot exist without a real `subject_id` — so adding a class here is what lets a new
 * intake sign up at all, and renaming a subject renames it everywhere at once.
 *
 * Both deletes are refused by the worker while anything still points at the row (409 with the
 * count in the message), which is the safety net this screen leans on instead of a second confirm.
 */
import { useMemo, useState } from 'react';
import { admin, type GradeClass } from '@/lib/admin-api';
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
  TINY,
  Tag,
  primary,
  useAction,
} from './kit';

export function School() {
  return (
    <div className="flex flex-col gap-10">
      <Subjects />
      <Classes />
    </div>
  );
}

function Subjects() {
  const subjects = useAsync(() => admin.subjects.list(), []);
  const act = useAction(() => subjects.retry());
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('');
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editIcon, setEditIcon] = useState('');

  const rows = subjects.data ?? [];
  const total = rows.reduce((a, s) => a + (s.note_count ?? 0), 0);

  return (
    <Panel
      title={`Subjects · ${rows.length}`}
      note="Every note belongs to one of these, and the rail, Discover and the Create picker all read this list. A subject with notes in it cannot be deleted."
      right={
        <span data-num className="meta">
          {total} notes filed
        </span>
      }
    >
      <Said said={act.said} />
      <Async loading={subjects.loading} error={subjects.error} retry={subjects.retry}>
        <Table
          cols={[
            { key: 'name', label: 'Subject' },
            { key: 'icon', label: 'Icon', w: '110px' },
            { key: 'notes', label: 'Notes', num: true, w: '72px' },
            { key: 'act', label: '', w: '150px' },
          ]}
          rows={rows}
          keyOf={(s) => s.id}
          cell={(s, k) =>
            k === 'name' ? (
              editId === s.id ? (
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  aria-label="Subject name"
                  className={cn(INPUT, 'py-1 text-[13px]')}
                />
              ) : (
                <span className="font-semibold text-ink">{s.name}</span>
              )
            ) : k === 'icon' ? (
              editId === s.id ? (
                <input
                  value={editIcon}
                  onChange={(e) => setEditIcon(e.target.value)}
                  aria-label="Subject icon"
                  className={cn(INPUT, 'py-1 text-[13px]')}
                />
              ) : (
                <span className="text-neutral-700">{s.icon || '—'}</span>
              )
            ) : k === 'notes' ? (
              s.note_count
            ) : (
              <span className="flex gap-1.5 justify-end">
                {editId === s.id ? (
                  <>
                    <button
                      type="button"
                      disabled={act.busy}
                      className={cn(TINY, 'bg-ink text-accent-100 border-ink')}
                      onClick={() =>
                        void act.run(`Renamed to ${editName.trim()}.`, () =>
                          admin.subjects
                            .update(s.id, { name: editName.trim(), icon: editIcon.trim() })
                            .then(() => setEditId(null)),
                        )
                      }
                    >
                      Save
                    </button>
                    <button type="button" className={TINY} onClick={() => setEditId(null)}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className={TINY}
                      onClick={() => {
                        setEditId(s.id);
                        setEditName(s.name);
                        setEditIcon(s.icon ?? '');
                      }}
                    >
                      Edit
                    </button>
                    <Confirm
                      label="Delete"
                      disabled={act.busy || s.note_count > 0}
                      onConfirm={() =>
                        void act.run(`Deleted ${s.name}.`, () => admin.subjects.remove(s.id))
                      }
                    />
                  </>
                )}
              </span>
            )
          }
          empty="No subjects exist yet — the app has nothing to file notes under."
        />
      </Async>

      <div className="flex flex-wrap items-end gap-3 border-t border-neutral-300 pt-3.5">
        <Field label="New subject">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ekonomi"
            className={INPUT}
          />
        </Field>
        <Field label="Icon" hint="The short name the live app's icon map uses; blank is fine.">
          <input
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            placeholder="chart"
            className={cn(INPUT, 'max-w-[160px]')}
          />
        </Field>
        <button
          type="button"
          disabled={act.busy || !name.trim()}
          onClick={() =>
            void act.run(`Added ${name.trim()}.`, () =>
              admin.subjects.create(name.trim(), icon.trim() || undefined).then(() => {
                setName('');
                setIcon('');
              }),
            )
          }
          className={cn(
            primary,
            'px-4 py-2 text-[13px] disabled:opacity-40 disabled:pointer-events-none',
          )}
        >
          Add subject
        </button>
      </div>
    </Panel>
  );
}

function Classes() {
  const classes = useAsync(() => admin.classes.list(), []);
  // Declared before `act`: its callback clears `picked`, and reading a `const` from above its own
  // declaration is a temporal-dead-zone hazard, not just a lint complaint.
  const [grade, setGrade] = useState('10');
  const [className, setClassName] = useState('');
  const [semester, setSemester] = useState('');
  const [picked, setPicked] = useState<number[]>([]);
  const act = useAction(() => {
    classes.retry();
    setPicked([]);
  });

  const rows = classes.data ?? [];
  const active = rows.filter((c) => c.is_active);
  const students = rows.reduce((a, c) => a + (c.student_count ?? 0), 0);
  const pickedRows = useMemo(() => rows.filter((c) => picked.includes(c.id)), [rows, picked]);

  const toggle = (c: GradeClass) =>
    setPicked((p) => (p.includes(c.id) ? p.filter((id) => id !== c.id) : [...p, c.id]));

  return (
    <div className="flex flex-col gap-8">
      <Panel
        title={`Classes · ${active.length} active of ${rows.length}`}
        note="Sign-up and class reassignment both check this list, so an inactive class cannot be joined. Deactivating is the reversible move; deleting is refused while students are assigned."
      >
        <Said said={act.said} />
        <StatRow>
          <Stat label="Students assigned" value={students} />
          <Stat label="Active classes" value={active.length} />
          <Stat
            label="Grade 10 / 11 / 12"
            value={[10, 11, 12].map((g) => active.filter((c) => c.grade === g).length).join(' / ')}
          />
        </StatRow>
        <Async loading={classes.loading} error={classes.error} retry={classes.retry}>
          <Table
            cols={[
              { key: 'pick', label: '', w: '38px' },
              { key: 'name', label: 'Class' },
              { key: 'grade', label: 'Grade', num: true, w: '70px' },
              { key: 'semester', label: 'Semester', w: '110px' },
              { key: 'students', label: 'Students', num: true, w: '84px' },
              { key: 'state', label: 'State', w: '96px' },
              { key: 'act', label: '', w: '186px' },
            ]}
            rows={rows}
            keyOf={(c) => c.id}
            cell={(c, k) =>
              k === 'pick' ? (
                <input
                  type="checkbox"
                  checked={picked.includes(c.id)}
                  onChange={() => toggle(c)}
                  aria-label={`Select ${c.class_name} for promotion`}
                  className="accent-ink w-4 h-4"
                />
              ) : k === 'name' ? (
                <span className="font-semibold text-ink">{c.class_name}</span>
              ) : k === 'grade' ? (
                c.grade
              ) : k === 'semester' ? (
                c.semester || '—'
              ) : k === 'students' ? (
                c.student_count
              ) : k === 'state' ? (
                c.is_active ? (
                  <Tag on>Active</Tag>
                ) : (
                  <Tag>Closed</Tag>
                )
              ) : (
                <span className="flex gap-1.5 justify-end">
                  <button
                    type="button"
                    disabled={act.busy}
                    className={TINY}
                    onClick={() =>
                      void act.run(
                        `${c.class_name} is now ${c.is_active ? 'closed' : 'active'}.`,
                        () => admin.classes.update(c.id, { is_active: !c.is_active }),
                      )
                    }
                  >
                    {c.is_active ? 'Close' : 'Reopen'}
                  </button>
                  <Confirm
                    label="Delete"
                    disabled={act.busy || c.student_count > 0}
                    onConfirm={() =>
                      void act.run(`Deleted ${c.class_name}.`, () => admin.classes.remove(c.id))
                    }
                  />
                </span>
              )
            }
            empty="No classes exist, so nobody can finish signing up. Add one below."
          />
        </Async>

        <div className="flex flex-wrap items-end gap-3 border-t border-neutral-300 pt-3.5">
          <Field label="Grade">
            <select
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              className={cn(INPUT, 'max-w-[120px]')}
            >
              {[10, 11, 12].map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Class name" hint="The shape the app validates: grade.number, e.g. 10.4.">
            <input
              value={className}
              onChange={(e) => setClassName(e.target.value)}
              placeholder="10.4"
              className={cn(INPUT, 'max-w-[160px]')}
            />
          </Field>
          <Field label="Semester" hint="Optional; part of the uniqueness rule.">
            <input
              value={semester}
              onChange={(e) => setSemester(e.target.value)}
              placeholder="2026/1"
              className={cn(INPUT, 'max-w-[160px]')}
            />
          </Field>
          <button
            type="button"
            disabled={act.busy || !className.trim()}
            onClick={() =>
              void act.run(`Added class ${className.trim()}.`, () =>
                admin.classes.create(Number(grade), className.trim(), semester.trim()).then(() => {
                  setClassName('');
                  setSemester('');
                }),
              )
            }
            className={cn(
              primary,
              'px-4 py-2 text-[13px] disabled:opacity-40 disabled:pointer-events-none',
            )}
          >
            Add class
          </button>
        </div>
      </Panel>

      <Panel
        title="Promote into the new year"
        quiet
        note="Grades 10 and 11 move up one (10.1 becomes 11.1); grade 12 graduates and its students are marked as leavers. Tick the classes that are ready."
      >
        {picked.length === 0 ? (
          <p className="text-[13.5px] text-neutral-700">
            Nothing selected. Tick a class in the table above.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-[13.5px] text-neutral-900 [text-wrap:pretty]">
              {pickedRows
                .map(
                  (c) =>
                    `${c.class_name} (${c.student_count} ${c.student_count === 1 ? 'student' : 'students'}${c.grade >= 12 ? ', graduating' : ` → grade ${c.grade + 1}`})`,
                )
                .join(' · ')}
            </p>
            {/* The worker is explicit that this is not idempotent — running it twice promotes twice. */}
            <p className="text-[12.5px] font-semibold text-neutral-800 [text-wrap:pretty]">
              Running this twice promotes twice. It is undone one student at a time under People →
              Class, so press it once and check the register after.
            </p>
            <Confirm
              label={`Promote ${picked.length} ${picked.length === 1 ? 'class' : 'classes'}`}
              confirmLabel={`Promote ${picked.length} — confirm, this runs once`}
              disabled={act.busy}
              className="self-start"
              onConfirm={() =>
                void act.run(
                  `Promoted ${picked.length} ${picked.length === 1 ? 'class' : 'classes'}.`,
                  () => admin.classes.promote(picked),
                )
              }
            />
          </div>
        )}
      </Panel>
    </div>
  );
}
