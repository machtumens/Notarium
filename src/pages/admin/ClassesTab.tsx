import { useMemo, useState } from 'react';
import api from '../../lib/api';
import type { AdminUser } from './types';
import type { PromoteSummaryItem } from '../../types';
import {
  Button,
  Callout,
  ConfirmDialog,
  EmptyState,
  Field,
  Guard,
  Panel,
  Pill,
  RowActions,
  SelectField,
  SwitchRow,
  TableWrap,
  TextField,
  type ConfirmSpec,
} from '../../components/ops/ConsoleKit';
import { ink, monoFace, tdNumStyle, tdStyle, thStyle } from '../../components/ops/tokens';

interface ClassFormData {
  grade: string;
  class_name: string;
  semester: string;
}

interface ClassesTabProps {
  users: AdminUser[];
  gradeClasses: any[];
  setGradeClasses: React.Dispatch<React.SetStateAction<any[]>>;
  classFormData: ClassFormData;
  setClassFormData: React.Dispatch<React.SetStateAction<ClassFormData>>;
  classActionLoading: boolean;
  setClassActionLoading: React.Dispatch<React.SetStateAction<boolean>>;
  loadData: () => Promise<void>;
}

export default function ClassesTab({
  users,
  gradeClasses,
  setGradeClasses,
  classFormData,
  setClassFormData,
  classActionLoading,
  setClassActionLoading,
  loadData,
}: ClassesTabProps) {
  const [promoteSelectedIds, setPromoteSelectedIds] = useState<number[]>([]);
  const [promoteYear, setPromoteYear] = useState('');
  const [promoteLoading, setPromoteLoading] = useState(false);
  const [promoteSummary, setPromoteSummary] = useState<PromoteSummaryItem[] | null>(null);
  const [reassignUser, setReassignUser] = useState('');
  const [reassignClass, setReassignClass] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);

  const activeClasses = gradeClasses.filter((gc: any) => gc.is_active);
  const students = useMemo(() => users.filter((u) => u.role === 'student'), [users]);

  const headcount = (className: string) => users.filter((u) => u.class === className).length;

  const togglePromoteClass = (id: number) =>
    setPromoteSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  const handleCreateClass = async () => {
    if (!classFormData.grade || !classFormData.class_name.trim()) return;
    setClassActionLoading(true);
    setError(null);
    try {
      await api.admin.createGradeClass({
        grade: Number(classFormData.grade),
        class_name: classFormData.class_name.trim(),
        semester: classFormData.semester.trim() || undefined,
      } as any);
      setClassFormData({ grade: '', class_name: '', semester: '' });
      const res = await api.admin.getGradeClasses();
      setGradeClasses((res as any).grade_classes || []);
      setNotice('Class added.');
    } catch (e: any) {
      setError(e?.message ?? 'Could not add the class.');
    } finally {
      setClassActionLoading(false);
    }
  };

  const handleToggleActive = async (gc: any) => {
    setClassActionLoading(true);
    setError(null);
    try {
      await api.admin.updateGradeClass(gc.id, { is_active: gc.is_active ? 0 : 1 });
      const res = await api.admin.getGradeClasses();
      setGradeClasses((res as any).grade_classes || []);
    } catch (e: any) {
      setError(e?.message ?? 'Could not update the class.');
    } finally {
      setClassActionLoading(false);
    }
  };

  const handleReassign = async () => {
    if (!reassignUser || !reassignClass) return;
    setClassActionLoading(true);
    setError(null);
    try {
      await api.admin.reassignUserClass({
        user_id: Number(reassignUser),
        new_class: reassignClass,
      });
      await loadData();
      setNotice(`Moved to ${reassignClass}.`);
      setReassignUser('');
      setReassignClass('');
    } catch (e: any) {
      setError(e?.message ?? 'Could not move that student.');
    } finally {
      setClassActionLoading(false);
    }
  };

  const runPromote = async () => {
    setPromoteLoading(true);
    setPromoteSummary(null);
    setError(null);
    try {
      const res = await api.admin.promoteClasses(
        promoteSelectedIds,
        promoteYear.trim() || undefined,
      );
      setPromoteSummary(res.summary || []);
      setPromoteSelectedIds([]);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to promote classes');
    } finally {
      setPromoteLoading(false);
    }
  };

  const askPromote = () => {
    const names = gradeClasses
      .filter((gc: any) => promoteSelectedIds.includes(gc.id))
      .map((gc: any) => gc.class_name);
    const affected = names.reduce((sum: number, n: string) => sum + headcount(n), 0);
    setConfirm({
      title: `Promote ${names.length} class${names.length === 1 ? '' : 'es'}`,
      body: 'Every student in these classes moves up a year. This cannot be undone, and running it twice promotes them twice.',
      affected: `${names.join(', ')} · ${affected} student${affected === 1 ? '' : 's'}`,
      phrase: `promote ${names.length}`,
      confirmLabel: 'Promote',
      onConfirm: runPromote,
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {error && <Callout tone="crit">{error}</Callout>}
      {notice && <Callout>{notice}</Callout>}

      <Panel legend="Add a class" sub="grade_classes">
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <SelectField
            label="Year"
            value={classFormData.grade}
            onChange={(v) => setClassFormData((p) => ({ ...p, grade: v }))}
            options={[
              { value: '', label: 'Year…' },
              { value: '10', label: 'Year 10' },
              { value: '11', label: 'Year 11' },
              { value: '12', label: 'Year 12' },
            ]}
          />
          <TextField
            label="Class name"
            placeholder="Class name, e.g. 10.4"
            value={classFormData.class_name}
            onChange={(v) => setClassFormData((p) => ({ ...p, class_name: v }))}
            width="180px"
          />
          <TextField
            label="Semester"
            placeholder="Semester, e.g. 2024/2025-1"
            value={classFormData.semester}
            onChange={(v) => setClassFormData((p) => ({ ...p, semester: v }))}
            width="200px"
          />
          <Button
            variant="primary"
            disabled={
              classActionLoading || !classFormData.grade || !classFormData.class_name.trim()
            }
            onClick={handleCreateClass}
          >
            Add class
          </Button>
        </div>
      </Panel>

      <Panel
        legend="Classes"
        sub={`${activeClasses.length} active of ${gradeClasses.length}`}
        bodyPadding="0"
      >
        {gradeClasses.length === 0 ? (
          <EmptyState>No classes yet. Add the first one above.</EmptyState>
        ) : (
          <TableWrap maxHeight="420px">
            <thead>
              <tr>
                <th style={thStyle}>Class</th>
                <th style={thStyle}>Year</th>
                <th style={thStyle}>Semester</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Students</th>
                <th style={thStyle}>State</th>
                <th style={thStyle} aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {[...gradeClasses]
                .sort((a: any, b: any) =>
                  a.grade === b.grade
                    ? String(a.class_name).localeCompare(String(b.class_name))
                    : a.grade - b.grade,
                )
                .map((gc: any) => (
                  <tr key={gc.id} className="ops-row">
                    <td style={{ ...tdStyle, fontWeight: 500 }}>{gc.class_name}</td>
                    <td style={tdStyle}>Year {gc.grade}</td>
                    <td style={{ ...tdStyle, fontFamily: monoFace, color: ink.faint }}>
                      {gc.semester || '—'}
                    </td>
                    <td style={tdNumStyle}>{headcount(gc.class_name)}</td>
                    <td style={tdStyle}>
                      {gc.is_active ? (
                        <Pill tone="ok">Active</Pill>
                      ) : (
                        <Pill tone="mute">Archived</Pill>
                      )}
                    </td>
                    <td style={tdStyle}>
                      <RowActions>
                        <Button
                          size="xs"
                          disabled={classActionLoading}
                          onClick={() => handleToggleActive(gc)}
                        >
                          {gc.is_active ? 'Archive' : 'Reactivate'}
                        </Button>
                      </RowActions>
                    </td>
                  </tr>
                ))}
            </tbody>
          </TableWrap>
        )}
      </Panel>

      <Panel legend="Move a student" sub="one at a time">
        <Field label="Student" htmlFor="reassign-user-select">
          <SelectField
            label="Student to move"
            value={reassignUser}
            onChange={setReassignUser}
            width="100%"
            options={[
              { value: '', label: 'Pick a student…' },
              ...students.map((u) => ({
                value: String(u.id),
                label: `${u.display_name || u.name} · ${u.class || 'no class'}`,
              })),
            ]}
          />
        </Field>
        <Field label="New class" htmlFor="reassign-class-select">
          <SelectField
            label="Destination class"
            value={reassignClass}
            onChange={setReassignClass}
            width="100%"
            options={[
              { value: '', label: 'Pick a class…' },
              ...activeClasses.map((gc: any) => ({
                value: String(gc.class_name),
                label: `${gc.class_name} · Year ${gc.grade}`,
              })),
            ]}
          />
        </Field>
        <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '12px' }}>
          <Button
            variant="primary"
            disabled={classActionLoading || !reassignUser || !reassignClass}
            onClick={handleReassign}
          >
            Move student
          </Button>
        </div>
      </Panel>

      <Panel legend="Promote a year" sub="end of term" tone="crit">
        <div style={{ marginBottom: '12px' }}>
          <Callout tone="crit">
            Promotion is not reversible, and running it twice moves everyone up twice. Check the
            student counts before you arm it.
          </Callout>
        </div>

        {activeClasses.length === 0 ? (
          <EmptyState>No active classes to promote.</EmptyState>
        ) : (
          <>
            {activeClasses.map((gc: any) => {
              const checked = promoteSelectedIds.includes(gc.id);
              return (
                <SwitchRow
                  key={gc.id}
                  name={`${gc.class_name} · Year ${gc.grade}`}
                  desc={`${headcount(gc.class_name)} students → Year ${gc.grade + 1}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    aria-label={`Promote ${gc.class_name}`}
                    onChange={() => togglePromoteClass(gc.id)}
                    className="ops-focus"
                    style={{ accentColor: '#2e7d52', width: '15px', height: '15px' }}
                  />
                </SwitchRow>
              );
            })}

            <div
              style={{
                display: 'flex',
                gap: '8px',
                alignItems: 'center',
                flexWrap: 'wrap',
                paddingTop: '12px',
              }}
            >
              <TextField
                label="New academic year"
                placeholder="New academic year, optional — e.g. 2025/2026"
                value={promoteYear}
                onChange={setPromoteYear}
                width="260px"
              />
              <span style={{ marginLeft: 'auto', fontSize: '11px', color: ink.fainter }}>
                {promoteSelectedIds.length === 0
                  ? 'Pick at least one class'
                  : `${promoteSelectedIds.length} class${promoteSelectedIds.length === 1 ? '' : 'es'} selected`}
              </span>
              <Guard key={promoteSelectedIds.join(',')}>
                <Button
                  variant="danger"
                  disabled={promoteLoading || promoteSelectedIds.length === 0}
                  onClick={askPromote}
                >
                  {promoteLoading ? 'Promoting…' : 'Promote'}
                </Button>
              </Guard>
            </div>
          </>
        )}

        {promoteSummary && promoteSummary.length > 0 && (
          <div style={{ marginTop: '14px' }}>
            <TableWrap>
              <thead>
                <tr>
                  <th style={thStyle}>Class</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Moved</th>
                </tr>
              </thead>
              <tbody>
                {promoteSummary.map((item: any, idx: number) => (
                  <tr key={idx} className="ops-row">
                    <td style={tdStyle}>
                      {item.class_name ?? item.from ?? '—'}
                      {item.to ? ` → ${item.to}` : ''}
                    </td>
                    <td style={tdNumStyle}>{item.promoted ?? item.count ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          </div>
        )}
      </Panel>

      <ConfirmDialog spec={confirm} onCancel={() => setConfirm(null)} />
    </div>
  );
}
