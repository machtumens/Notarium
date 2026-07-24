import { useEffect, useState } from 'react';
import api from '../../lib/api';
import { darkTheme, cardStyle } from '../../theme';

interface ModNote {
  id: number;
  title: string;
  author_name?: string;
  subject_name?: string;
  likes: number;
  featured?: number;
  deleted_at?: string | null;
  status?: string;
  created_at: string;
}

const inputStyle: React.CSSProperties = {
  padding: '10px 12px',
  background: darkTheme.colors.bgSecondary,
  border: `1px solid ${darkTheme.colors.borderColor}`,
  borderRadius: darkTheme.borderRadius.sm,
  color: darkTheme.colors.textPrimary,
  fontSize: '14px',
  boxSizing: 'border-box',
};

export default function NotesTab() {
  const [notes, setNotes] = useState<ModNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('recent');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const loadNotes = async () => {
    try {
      setLoading(true);
      const res = await api.admin.searchNotes({ q: q || undefined, sort });
      setNotes((res.notes as ModNote[]) || []);
    } catch (err) {
      console.error('Failed to load notes:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loader sets loading flag then fetches; behavior intentional
    loadNotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort]);

  const runAction = async (id: number, action: () => Promise<unknown>) => {
    setBusy(id);
    setError(null);
    try {
      await action();
      await loadNotes();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusy(null);
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
          className="fas fa-file-lines"
          style={{ marginRight: '8px', color: darkTheme.colors.accent }}
        ></i>
        Notes ({notes.length})
      </h3>

      {/* Filters */}
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
        <div style={{ flex: '2 1 220px' }}>
          <label
            style={{
              fontSize: '12px',
              color: darkTheme.colors.textSecondary,
              marginBottom: '4px',
              display: 'block',
            }}
          >
            Search
          </label>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && loadNotes()}
            placeholder="Title or description"
            style={{ ...inputStyle, width: '100%' }}
          />
        </div>
        <div style={{ flex: '1 1 140px' }}>
          <label
            style={{
              fontSize: '12px',
              color: darkTheme.colors.textSecondary,
              marginBottom: '4px',
              display: 'block',
            }}
          >
            Sort
          </label>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            style={{ ...inputStyle, width: '100%' }}
          >
            <option value="recent">Most recent</option>
            <option value="likes">Most liked</option>
            <option value="featured">Featured first</option>
          </select>
        </div>
        <button
          onClick={loadNotes}
          style={{
            padding: '10px 20px',
            background: darkTheme.colors.accent,
            border: 'none',
            color: '#fff',
            borderRadius: darkTheme.borderRadius.md,
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '600',
          }}
        >
          Search
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

      {loading ? (
        <div
          style={{ padding: '40px', textAlign: 'center', color: darkTheme.colors.textSecondary }}
        >
          Loading notes...
        </div>
      ) : (
        <div style={{ ...(cardStyle as React.CSSProperties), padding: 0, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: darkTheme.colors.bgSecondary }}>
              <tr>
                {['Title', 'Author', 'Subject', 'Likes', 'State', 'Actions'].map((h) => (
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
              {notes.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    style={{
                      padding: '40px',
                      textAlign: 'center',
                      color: darkTheme.colors.textSecondary,
                    }}
                  >
                    No notes found
                  </td>
                </tr>
              ) : (
                notes.map((note) => (
                  <tr
                    key={note.id}
                    style={{ borderBottom: `1px solid ${darkTheme.colors.borderColor}` }}
                  >
                    <td style={{ padding: '12px 16px', fontSize: '14px', fontWeight: '500' }}>
                      {note.featured ? '⭐ ' : ''}
                      {note.title}
                    </td>
                    <td
                      style={{
                        padding: '12px 16px',
                        fontSize: '13px',
                        color: darkTheme.colors.textSecondary,
                      }}
                    >
                      {note.author_name || '—'}
                    </td>
                    <td
                      style={{
                        padding: '12px 16px',
                        fontSize: '13px',
                        color: darkTheme.colors.textSecondary,
                      }}
                    >
                      {note.subject_name || '—'}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '13px' }}>{note.likes}</td>
                    <td style={{ padding: '12px 16px', fontSize: '12px' }}>
                      {note.deleted_at ? (
                        <span style={{ color: '#fca5a5' }}>Deleted</span>
                      ) : (
                        <span style={{ color: '#86efac' }}>Active</span>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        <button
                          onClick={() => runAction(note.id, () => api.admin.featureNote(note.id))}
                          disabled={busy === note.id}
                          style={{
                            padding: '6px 10px',
                            background: 'rgba(245, 158, 11, 0.15)',
                            border: '1px solid rgba(245, 158, 11, 0.3)',
                            color: '#fbbf24',
                            borderRadius: darkTheme.borderRadius.sm,
                            cursor: 'pointer',
                            fontSize: '12px',
                          }}
                        >
                          {note.featured ? 'Unfeature' : 'Feature'}
                        </button>
                        {note.deleted_at ? (
                          <button
                            onClick={() => runAction(note.id, () => api.admin.restoreNote(note.id))}
                            disabled={busy === note.id}
                            style={{
                              padding: '6px 10px',
                              background: 'rgba(34, 197, 94, 0.2)',
                              border: '1px solid rgba(34, 197, 94, 0.3)',
                              color: '#86efac',
                              borderRadius: darkTheme.borderRadius.sm,
                              cursor: 'pointer',
                              fontSize: '12px',
                            }}
                          >
                            Restore
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              if (!confirm('Delete this note?')) return;
                              runAction(note.id, () => api.admin.deleteNote(note.id));
                            }}
                            disabled={busy === note.id}
                            style={{
                              padding: '6px 10px',
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
                        )}
                      </div>
                    </td>
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
