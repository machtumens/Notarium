import { useEffect, useState } from 'react';
import api from '../../lib/api';
import { darkTheme, cardStyle } from '../../theme';
import type { AdminSubject } from '../../types';

const inputStyle: React.CSSProperties = {
  padding: '10px 12px',
  background: darkTheme.colors.bgSecondary,
  border: `1px solid ${darkTheme.colors.borderColor}`,
  borderRadius: darkTheme.borderRadius.sm,
  color: darkTheme.colors.textPrimary,
  fontSize: '14px',
  boxSizing: 'border-box',
};

export default function SubjectsTab() {
  const [subjects, setSubjects] = useState<AdminSubject[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [newIcon, setNewIcon] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editIcon, setEditIcon] = useState('');

  const loadSubjects = async () => {
    try {
      setLoading(true);
      const res = await api.admin.getSubjects();
      setSubjects(res.subjects || []);
    } catch (err) {
      console.error('Failed to load subjects:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loader sets loading flag then fetches; behavior intentional
    loadSubjects();
  }, []);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.admin.createSubject({ name: newName.trim(), icon: newIcon.trim() || undefined });
      setNewName('');
      setNewIcon('');
      await loadSubjects();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create subject');
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (subject: AdminSubject) => {
    setEditId(subject.id);
    setEditName(subject.name);
    setEditIcon(subject.icon || '');
  };

  const handleSaveEdit = async (id: number) => {
    setBusy(true);
    setError(null);
    try {
      await api.admin.updateSubject(id, { name: editName.trim(), icon: editIcon.trim() });
      setEditId(null);
      await loadSubjects();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update subject');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this subject?')) return;
    setBusy(true);
    setError(null);
    try {
      await api.admin.deleteSubject(id);
      await loadSubjects();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete subject');
    } finally {
      setBusy(false);
    }
  };

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
        <i
          className="fas fa-book"
          style={{ marginRight: '8px', color: darkTheme.colors.accent }}
        ></i>
        Subjects ({subjects.length})
      </h3>

      {/* Create form */}
      <div
        style={{
          ...(cardStyle as React.CSSProperties),
          display: 'flex',
          gap: '12px',
          alignItems: 'flex-end',
          marginBottom: '24px',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: '2 1 200px' }}>
          <label
            style={{
              fontSize: '12px',
              color: darkTheme.colors.textSecondary,
              marginBottom: '4px',
              display: 'block',
            }}
          >
            Name
          </label>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Subject name"
            style={{ ...inputStyle, width: '100%' }}
          />
        </div>
        <div style={{ flex: '1 1 120px' }}>
          <label
            style={{
              fontSize: '12px',
              color: darkTheme.colors.textSecondary,
              marginBottom: '4px',
              display: 'block',
            }}
          >
            Icon
          </label>
          <input
            value={newIcon}
            onChange={(e) => setNewIcon(e.target.value)}
            placeholder="e.g. 📐 or fa-flask"
            style={{ ...inputStyle, width: '100%' }}
          />
        </div>
        <button
          onClick={handleCreate}
          disabled={busy || !newName.trim()}
          style={{
            padding: '10px 20px',
            background: darkTheme.colors.accent,
            border: 'none',
            color: '#fff',
            borderRadius: darkTheme.borderRadius.md,
            cursor: busy ? 'not-allowed' : 'pointer',
            fontSize: '14px',
            fontWeight: '600',
            opacity: busy || !newName.trim() ? 0.6 : 1,
          }}
        >
          Add Subject
        </button>
      </div>

      {error && (
        <div
          style={{
            padding: '12px 16px',
            marginBottom: '16px',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: darkTheme.borderRadius.md,
            color: '#fca5a5',
            fontSize: '13px',
          }}
        >
          {error}
        </div>
      )}

      {/* List */}
      {loading ? (
        <div
          style={{ padding: '40px', textAlign: 'center', color: darkTheme.colors.textSecondary }}
        >
          Loading subjects...
        </div>
      ) : (
        <div
          style={{
            ...(cardStyle as React.CSSProperties),
            padding: 0,
            overflow: 'auto',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: darkTheme.colors.bgSecondary }}>
              <tr>
                {['Icon', 'Name', 'Notes', 'Actions'].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: '12px 16px',
                      textAlign: 'left',
                      borderBottom: `1px solid ${darkTheme.colors.borderColor}`,
                      fontWeight: '600',
                      fontSize: '13px',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {subjects.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    style={{
                      padding: '40px',
                      textAlign: 'center',
                      color: darkTheme.colors.textSecondary,
                    }}
                  >
                    No subjects yet
                  </td>
                </tr>
              ) : (
                subjects.map((subject) => (
                  <tr
                    key={subject.id}
                    style={{ borderBottom: `1px solid ${darkTheme.colors.borderColor}` }}
                  >
                    {editId === subject.id ? (
                      <>
                        <td style={{ padding: '8px 16px' }}>
                          <input
                            value={editIcon}
                            onChange={(e) => setEditIcon(e.target.value)}
                            style={{ ...inputStyle, width: '80px' }}
                          />
                        </td>
                        <td style={{ padding: '8px 16px' }}>
                          <input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            style={{ ...inputStyle, width: '100%' }}
                          />
                        </td>
                        <td style={{ padding: '8px 16px', fontSize: '13px' }}>
                          {subject.note_count}
                        </td>
                        <td style={{ padding: '8px 16px' }}>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              onClick={() => handleSaveEdit(subject.id)}
                              disabled={busy}
                              style={{
                                padding: '6px 12px',
                                background: darkTheme.colors.accent,
                                border: 'none',
                                color: '#fff',
                                borderRadius: darkTheme.borderRadius.sm,
                                cursor: 'pointer',
                                fontSize: '12px',
                              }}
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditId(null)}
                              style={{
                                padding: '6px 12px',
                                background: darkTheme.colors.bgSecondary,
                                border: `1px solid ${darkTheme.colors.borderColor}`,
                                color: darkTheme.colors.textPrimary,
                                borderRadius: darkTheme.borderRadius.sm,
                                cursor: 'pointer',
                                fontSize: '12px',
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td style={{ padding: '12px 16px', fontSize: '18px' }}>
                          {subject.icon || '—'}
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: '14px', fontWeight: '500' }}>
                          {subject.name}
                        </td>
                        <td
                          style={{
                            padding: '12px 16px',
                            fontSize: '13px',
                            color: darkTheme.colors.textSecondary,
                          }}
                        >
                          {subject.note_count}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              onClick={() => startEdit(subject)}
                              style={{
                                padding: '6px 12px',
                                background: 'rgba(59, 130, 246, 0.15)',
                                border: '1px solid rgba(59, 130, 246, 0.3)',
                                color: '#60a5fa',
                                borderRadius: darkTheme.borderRadius.sm,
                                cursor: 'pointer',
                                fontSize: '12px',
                              }}
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDelete(subject.id)}
                              disabled={busy}
                              style={{
                                padding: '6px 12px',
                                background: 'rgba(239, 68, 68, 0.2)',
                                border: 'none',
                                color: '#fca5a5',
                                borderRadius: darkTheme.borderRadius.sm,
                                cursor: 'pointer',
                                fontSize: '12px',
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
