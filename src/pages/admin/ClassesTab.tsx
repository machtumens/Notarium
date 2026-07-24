import { useState } from 'react';
import api from '../../lib/api';
import { darkTheme, cardStyle } from '../../theme';
import type { AdminUser } from './types';
import type { PromoteSummaryItem } from '../../types';

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

  const togglePromoteClass = (id: number) => {
    setPromoteSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handlePromote = async () => {
    if (promoteSelectedIds.length === 0) {
      alert('Select at least one class to promote');
      return;
    }
    const confirmed = window.confirm(
      `Promote ${promoteSelectedIds.length} class(es) to the next grade? ` +
        'This is NOT reversible and running it twice will promote twice.',
    );
    if (!confirmed) return;

    setPromoteLoading(true);
    setPromoteSummary(null);
    try {
      const res = await api.admin.promoteClasses(
        promoteSelectedIds,
        promoteYear.trim() || undefined,
      );
      setPromoteSummary(res.summary || []);
      setPromoteSelectedIds([]);
      await loadData();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to promote classes');
    } finally {
      setPromoteLoading(false);
    }
  };

  const activeClasses = gradeClasses.filter((gc: any) => gc.is_active);

  return (
    <div>
      <h3
        style={{
          fontSize: '20px',
          fontWeight: '600',
          marginBottom: '16px',
          color: darkTheme.colors.textPrimary,
        }}
      >
        Class Management
      </h3>
      {/* Add Class Form */}
      <div style={{ ...cardStyle, marginBottom: '24px', padding: '20px' }}>
        <h4
          style={{
            color: darkTheme.colors.textPrimary,
            marginBottom: '12px',
            fontSize: '15px',
            fontWeight: '600',
          }}
        >
          Add New Class
        </h4>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <select
            value={classFormData.grade}
            onChange={(e) => setClassFormData((p) => ({ ...p, grade: e.target.value }))}
            style={{
              padding: '8px 12px',
              background: darkTheme.colors.bgTertiary,
              border: `1px solid ${darkTheme.colors.borderColor}`,
              borderRadius: '6px',
              color: darkTheme.colors.textPrimary,
              fontSize: '14px',
            }}
          >
            <option value="">Grade</option>
            <option value="10">Grade 10</option>
            <option value="11">Grade 11</option>
            <option value="12">Grade 12</option>
          </select>
          <input
            placeholder="Class name (e.g. 10.4)"
            value={classFormData.class_name}
            onChange={(e) => setClassFormData((p) => ({ ...p, class_name: e.target.value }))}
            style={{
              padding: '8px 12px',
              background: darkTheme.colors.bgTertiary,
              border: `1px solid ${darkTheme.colors.borderColor}`,
              borderRadius: '6px',
              color: darkTheme.colors.textPrimary,
              fontSize: '14px',
              flex: 1,
              minWidth: '140px',
            }}
          />
          <input
            placeholder="Semester (e.g. 2024/2025-1)"
            value={classFormData.semester}
            onChange={(e) => setClassFormData((p) => ({ ...p, semester: e.target.value }))}
            style={{
              padding: '8px 12px',
              background: darkTheme.colors.bgTertiary,
              border: `1px solid ${darkTheme.colors.borderColor}`,
              borderRadius: '6px',
              color: darkTheme.colors.textPrimary,
              fontSize: '14px',
              flex: 1,
              minWidth: '160px',
            }}
          />
          <button
            disabled={classActionLoading || !classFormData.grade || !classFormData.class_name}
            onClick={async () => {
              setClassActionLoading(true);
              try {
                await api.admin.createGradeClass({
                  grade: Number(classFormData.grade),
                  class_name: classFormData.class_name,
                  semester: classFormData.semester,
                });
                setClassFormData({ grade: '', class_name: '', semester: '' });
                const res = await api.admin.getGradeClasses();
                setGradeClasses((res as any).grade_classes || []);
              } catch (e: any) {
                alert(e.message);
              } finally {
                setClassActionLoading(false);
              }
            }}
            style={{
              padding: '8px 16px',
              background: darkTheme.colors.accent,
              border: 'none',
              borderRadius: '6px',
              color: 'white',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '14px',
              opacity: classActionLoading ? 0.6 : 1,
            }}
          >
            {classActionLoading ? 'Adding...' : 'Add Class'}
          </button>
        </div>
      </div>

      {/* Class List grouped by grade */}
      {[10, 11, 12].map((grade) => {
        const gradeList = gradeClasses.filter((gc: any) => gc.grade === grade);
        return (
          <div key={grade} style={{ ...cardStyle, marginBottom: '16px', padding: '20px' }}>
            <h4
              style={{
                color: darkTheme.colors.textPrimary,
                marginBottom: '12px',
                fontWeight: '600',
              }}
            >
              Grade {grade}
            </h4>
            {gradeList.length === 0 ? (
              <p style={{ color: darkTheme.colors.textSecondary, fontSize: '13px' }}>
                No classes for Grade {grade}
              </p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ color: darkTheme.colors.textSecondary, textAlign: 'left' }}>
                    <th style={{ padding: '6px 8px' }}>Class</th>
                    <th style={{ padding: '6px 8px' }}>Semester</th>
                    <th style={{ padding: '6px 8px' }}>Students</th>
                    <th style={{ padding: '6px 8px' }}>Status</th>
                    <th style={{ padding: '6px 8px' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {gradeList.map((gc: any) => (
                    <tr
                      key={gc.id}
                      style={{ borderTop: `1px solid ${darkTheme.colors.borderColor}` }}
                    >
                      <td
                        style={{
                          padding: '8px',
                          color: darkTheme.colors.textPrimary,
                          fontWeight: '500',
                        }}
                      >
                        {gc.class_name}
                      </td>
                      <td style={{ padding: '8px', color: darkTheme.colors.textSecondary }}>
                        {gc.semester || '—'}
                      </td>
                      <td style={{ padding: '8px', color: darkTheme.colors.textSecondary }}>
                        {gc.student_count ?? 0}
                      </td>
                      <td style={{ padding: '8px' }}>
                        <span
                          style={{
                            fontSize: '11px',
                            padding: '2px 8px',
                            borderRadius: '9999px',
                            background: gc.is_active
                              ? 'rgba(34,197,94,0.15)'
                              : 'rgba(156,163,175,0.15)',
                            color: gc.is_active ? '#4ade80' : '#9ca3af',
                            fontWeight: '600',
                          }}
                        >
                          {gc.is_active ? 'Active' : 'Archived'}
                        </span>
                      </td>
                      <td style={{ padding: '8px' }}>
                        <button
                          onClick={async () => {
                            setClassActionLoading(true);
                            try {
                              await api.admin.updateGradeClass(gc.id, {
                                is_active: gc.is_active ? 0 : 1,
                              });
                              const res = await api.admin.getGradeClasses();
                              setGradeClasses((res as any).grade_classes || []);
                            } finally {
                              setClassActionLoading(false);
                            }
                          }}
                          style={{
                            padding: '4px 10px',
                            background: 'transparent',
                            border: `1px solid ${darkTheme.colors.borderColor}`,
                            borderRadius: '4px',
                            color: darkTheme.colors.textSecondary,
                            cursor: 'pointer',
                            fontSize: '12px',
                          }}
                        >
                          {gc.is_active ? 'Archive' : 'Restore'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        );
      })}

      {/* Reassign User */}
      <div style={{ ...cardStyle, padding: '20px' }}>
        <h4
          style={{
            color: darkTheme.colors.textPrimary,
            marginBottom: '12px',
            fontSize: '15px',
            fontWeight: '600',
          }}
        >
          Reassign Student to Class
        </h4>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <select
            style={{
              padding: '8px 12px',
              background: darkTheme.colors.bgTertiary,
              border: `1px solid ${darkTheme.colors.borderColor}`,
              borderRadius: '6px',
              color: darkTheme.colors.textPrimary,
              fontSize: '14px',
              flex: 1,
              minWidth: '160px',
            }}
            id="reassign-user-select"
          >
            <option value="">Select student</option>
            {users
              .filter((u) => u.role === 'student')
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.class || 'No class'})
                </option>
              ))}
          </select>
          <select
            style={{
              padding: '8px 12px',
              background: darkTheme.colors.bgTertiary,
              border: `1px solid ${darkTheme.colors.borderColor}`,
              borderRadius: '6px',
              color: darkTheme.colors.textPrimary,
              fontSize: '14px',
              flex: 1,
              minWidth: '140px',
            }}
            id="reassign-class-select"
          >
            <option value="">New class</option>
            {gradeClasses
              .filter((gc: any) => gc.is_active)
              .map((gc: any) => (
                <option key={gc.id} value={gc.class_name}>
                  {gc.class_name}
                </option>
              ))}
          </select>
          <button
            disabled={classActionLoading}
            onClick={async () => {
              const userId = (document.getElementById('reassign-user-select') as HTMLSelectElement)
                ?.value;
              const newClass = (
                document.getElementById('reassign-class-select') as HTMLSelectElement
              )?.value;
              if (!userId || !newClass) {
                alert('Please select a student and a class');
                return;
              }
              setClassActionLoading(true);
              try {
                await api.admin.reassignUserClass({
                  user_id: Number(userId),
                  new_class: newClass,
                });
                await loadData();
                alert('Student reassigned successfully');
              } catch (e: any) {
                alert(e.message);
              } finally {
                setClassActionLoading(false);
              }
            }}
            style={{
              padding: '8px 16px',
              background: darkTheme.colors.accent,
              border: 'none',
              borderRadius: '6px',
              color: 'white',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '14px',
            }}
          >
            Reassign
          </button>
        </div>
      </div>

      {/* Promote to next year */}
      <div style={{ ...cardStyle, padding: '20px', marginTop: '16px' }}>
        <h4
          style={{
            color: darkTheme.colors.textPrimary,
            marginBottom: '4px',
            fontSize: '15px',
            fontWeight: '600',
          }}
        >
          Promote to Next Year
        </h4>
        <p
          style={{
            color: darkTheme.colors.textSecondary,
            fontSize: '13px',
            margin: '0 0 12px',
          }}
        >
          Advance the selected classes to the next grade (e.g. 10.1 → 11.1). Grade 12 classes will
          graduate. This action is not reversible — do not run it twice.
        </p>

        {activeClasses.length === 0 ? (
          <p style={{ color: darkTheme.colors.textSecondary, fontSize: '13px' }}>
            No active classes available to promote.
          </p>
        ) : (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '8px',
              marginBottom: '12px',
            }}
          >
            {activeClasses.map((gc: any) => {
              const checked = promoteSelectedIds.includes(gc.id);
              return (
                <label
                  key={gc.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 10px',
                    borderRadius: '6px',
                    border: `1px solid ${
                      checked ? darkTheme.colors.accent : darkTheme.colors.borderColor
                    }`,
                    background: checked ? 'rgba(59,130,246,0.12)' : 'transparent',
                    color: darkTheme.colors.textPrimary,
                    fontSize: '13px',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => togglePromoteClass(gc.id)}
                  />
                  {gc.class_name}
                </label>
              );
            })}
          </div>
        )}

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            placeholder="New academic year (optional, e.g. 2025/2026)"
            value={promoteYear}
            onChange={(e) => setPromoteYear(e.target.value)}
            style={{
              padding: '8px 12px',
              background: darkTheme.colors.bgTertiary,
              border: `1px solid ${darkTheme.colors.borderColor}`,
              borderRadius: '6px',
              color: darkTheme.colors.textPrimary,
              fontSize: '14px',
              flex: 1,
              minWidth: '220px',
            }}
          />
          <button
            disabled={promoteLoading || promoteSelectedIds.length === 0}
            onClick={handlePromote}
            style={{
              padding: '8px 16px',
              background: darkTheme.colors.accent,
              border: 'none',
              borderRadius: '6px',
              color: 'white',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '14px',
              opacity: promoteLoading || promoteSelectedIds.length === 0 ? 0.6 : 1,
            }}
          >
            {promoteLoading ? 'Promoting...' : `Promote ${promoteSelectedIds.length || ''}`.trim()}
          </button>
        </div>

        {promoteSummary && (
          <div style={{ marginTop: '16px' }}>
            <h5
              style={{
                color: darkTheme.colors.textPrimary,
                fontSize: '13px',
                fontWeight: '600',
                marginBottom: '8px',
              }}
            >
              Promotion Result
            </h5>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ color: darkTheme.colors.textSecondary, textAlign: 'left' }}>
                  <th style={{ padding: '6px 8px' }}>Class</th>
                  <th style={{ padding: '6px 8px' }}>Action</th>
                  <th style={{ padding: '6px 8px' }}>Promoted To</th>
                  <th style={{ padding: '6px 8px' }}>Students</th>
                </tr>
              </thead>
              <tbody>
                {promoteSummary.map((item, idx) => (
                  <tr
                    key={`${item.class}-${idx}`}
                    style={{ borderTop: `1px solid ${darkTheme.colors.borderColor}` }}
                  >
                    <td
                      style={{
                        padding: '8px',
                        color: darkTheme.colors.textPrimary,
                        fontWeight: '500',
                      }}
                    >
                      {item.class}
                    </td>
                    <td
                      style={{
                        padding: '8px',
                        color: item.error ? '#ef4444' : darkTheme.colors.textSecondary,
                      }}
                    >
                      {item.error ? `Error: ${item.error}` : item.action}
                    </td>
                    <td style={{ padding: '8px', color: darkTheme.colors.textSecondary }}>
                      {item.promoted_to || '—'}
                    </td>
                    <td style={{ padding: '8px', color: darkTheme.colors.textSecondary }}>
                      {item.students_affected ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
