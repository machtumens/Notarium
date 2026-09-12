import { useEffect, useMemo, useState } from 'react';
import api from '../../lib/api';
import {
  Button,
  Callout,
  EmptyState,
  Filters,
  Panel,
  Pill,
  RowActions,
  SelectField,
  TableWrap,
  TextField,
} from '../../components/ops/ConsoleKit';
import { ink, rowSubStyle, tdNumStyle, tdStyle, thStyle } from '../../components/ops/tokens';
import { formatDateTime } from '../../lib/datetime';

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

type StateFilter = 'all' | 'active' | 'removed' | 'featured';

export default function NotesTab() {
  const [notes, setNotes] = useState<ModNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('recent');
  const [stateFilter, setStateFilter] = useState<StateFilter>('all');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const loadNotes = async () => {
    try {
      setLoading(true);
      const res = await api.admin.searchNotes({ q: q || undefined, sort });
      setNotes((res.notes as ModNote[]) || []);
    } catch (err) {
      console.error('Failed to load notes:', err);
      setError(err instanceof Error ? err.message : 'Failed to load notes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loader sets loading flag then fetches; behavior intentional
    loadNotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort]);

  // State filtering is local so switching Active/Removed does not re-query.
  const visible = useMemo(
    () =>
      notes.filter((n) => {
        if (stateFilter === 'active') return !n.deleted_at;
        if (stateFilter === 'removed') return Boolean(n.deleted_at);
        if (stateFilter === 'featured') return Boolean(n.featured);
        return true;
      }),
    [notes, stateFilter],
  );

  const runAction = async (id: number, action: () => Promise<unknown>, done: string) => {
    setBusy(id);
    setError(null);
    try {
      await action();
      setNotice(done);
      await loadNotes();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {error && <Callout tone="crit">{error}</Callout>}
      {notice && <Callout>{notice}</Callout>}

      <Panel
        legend="Notes"
        sub={
          loading
            ? 'loading…'
            : visible.length === notes.length
              ? `${notes.length} notes`
              : `${visible.length} of ${notes.length}`
        }
        bodyPadding="0"
        actions={
          <Filters>
            <TextField
              type="search"
              label="Search notes"
              placeholder="Title or description"
              value={q}
              onChange={setQ}
              width="200px"
            />
            <SelectField<StateFilter>
              label="Filter by state"
              value={stateFilter}
              onChange={setStateFilter}
              options={[
                { value: 'all', label: 'Any state' },
                { value: 'active', label: 'Live' },
                { value: 'removed', label: 'Removed' },
                { value: 'featured', label: 'Featured' },
              ]}
            />
            <SelectField
              label="Sort"
              value={sort}
              onChange={setSort}
              options={[
                { value: 'recent', label: 'Newest' },
                { value: 'likes', label: 'Most liked' },
                { value: 'featured', label: 'Featured first' },
              ]}
            />
            <Button variant="primary" onClick={loadNotes}>
              Search
            </Button>
          </Filters>
        }
      >
        {loading ? (
          <EmptyState>Loading notes…</EmptyState>
        ) : visible.length === 0 ? (
          <EmptyState>
            {notes.length === 0
              ? 'No notes match that search.'
              : 'No notes in this state. Try “Any state”.'}
          </EmptyState>
        ) : (
          <TableWrap maxHeight="620px">
            <thead>
              <tr>
                <th style={thStyle}>Note</th>
                <th style={thStyle}>Author</th>
                <th style={thStyle}>Subject</th>
                <th style={thStyle}>State</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Likes</th>
                <th style={thStyle} aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {visible.map((note) => {
                const isBusy = busy === note.id;
                return (
                  <tr key={note.id} className="ops-row">
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 500 }}>{note.title}</div>
                      <div style={rowSubStyle}>added {formatDateTime(note.created_at)}</div>
                    </td>
                    <td style={tdStyle}>{note.author_name || '—'}</td>
                    <td style={tdStyle}>{note.subject_name || '—'}</td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        {note.deleted_at ? (
                          <Pill tone="mute">Removed</Pill>
                        ) : (
                          <Pill tone="ok">Live</Pill>
                        )}
                        {Boolean(note.featured) && <Pill tone="info">Featured</Pill>}
                      </div>
                    </td>
                    <td style={tdNumStyle}>{note.likes}</td>
                    <td style={tdStyle}>
                      <RowActions>
                        <Button
                          size="xs"
                          disabled={isBusy}
                          onClick={() =>
                            runAction(
                              note.id,
                              () => api.admin.featureNote(note.id),
                              note.featured
                                ? `“${note.title}” is no longer featured.`
                                : `“${note.title}” is now featured.`,
                            )
                          }
                        >
                          {note.featured ? 'Unfeature' : 'Feature'}
                        </Button>
                        {note.deleted_at ? (
                          <Button
                            size="xs"
                            disabled={isBusy}
                            onClick={() =>
                              runAction(
                                note.id,
                                () => api.admin.restoreNote(note.id),
                                `“${note.title}” is live again.`,
                              )
                            }
                          >
                            Restore
                          </Button>
                        ) : (
                          <Button
                            size="xs"
                            variant="danger"
                            disabled={isBusy}
                            onClick={() =>
                              runAction(
                                note.id,
                                () => api.admin.deleteNote(note.id),
                                `“${note.title}” removed. It stays under Removed and can be restored.`,
                              )
                            }
                          >
                            Remove
                          </Button>
                        )}
                      </RowActions>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        )}
      </Panel>

      <div style={{ fontSize: '11px', color: ink.fainter }}>
        Removing a note is reversible — it moves to Removed, keeps its likes, and can be restored.
        Permanent deletion lives in the ops Danger zone.
      </div>
    </div>
  );
}
