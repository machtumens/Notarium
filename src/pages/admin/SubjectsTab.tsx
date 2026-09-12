import { useEffect, useState } from 'react';
import api from '../../lib/api';
import type { AdminSubject } from '../../types';
import {
  Button,
  Callout,
  EmptyState,
  Panel,
  Pill,
  RowActions,
  TableWrap,
  TextField,
} from '../../components/ops/ConsoleKit';
import { ink, tdNumStyle, tdStyle, thStyle } from '../../components/ops/tokens';

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
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const loadSubjects = async () => {
    try {
      setLoading(true);
      const res = await api.admin.getSubjects();
      setSubjects(res.subjects || []);
    } catch (err) {
      console.error('Failed to load subjects:', err);
      setError(err instanceof Error ? err.message : 'Failed to load subjects');
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
    setBusy(true);
    setError(null);
    try {
      await api.admin.deleteSubject(id);
      setConfirmDelete(null);
      await loadSubjects();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete subject');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {error && <Callout tone="crit">{error}</Callout>}

      <Panel legend="Add a subject" sub="students file notes under these">
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <TextField
            label="Subject name"
            placeholder="e.g. Bedrijfseconomie"
            value={newName}
            onChange={setNewName}
            width="240px"
          />
          <TextField
            label="Icon"
            placeholder="Icon — one character, e.g. €"
            value={newIcon}
            onChange={setNewIcon}
            width="120px"
          />
          <Button variant="primary" disabled={busy || !newName.trim()} onClick={handleCreate}>
            {busy ? 'Saving…' : 'Add subject'}
          </Button>
        </div>
      </Panel>

      <Panel
        legend="Subjects"
        sub={loading ? 'loading…' : `${subjects.length} active`}
        bodyPadding="0"
      >
        {loading ? (
          <EmptyState>Loading subjects…</EmptyState>
        ) : subjects.length === 0 ? (
          <EmptyState>No subjects yet. Add the first one above.</EmptyState>
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <th style={thStyle}>Subject</th>
                <th style={thStyle}>Icon</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Notes</th>
                <th style={thStyle} aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {subjects.map((subject) => {
                const editing = editId === subject.id;
                const pendingDelete = confirmDelete === subject.id;
                return (
                  <tr key={subject.id} className="ops-row">
                    <td style={tdStyle}>
                      {editing ? (
                        <TextField
                          label="Subject name"
                          value={editName}
                          onChange={setEditName}
                          width="220px"
                        />
                      ) : (
                        <span style={{ fontWeight: 500 }}>{subject.name}</span>
                      )}
                    </td>
                    <td style={tdStyle}>
                      {editing ? (
                        <TextField
                          label="Icon"
                          value={editIcon}
                          onChange={setEditIcon}
                          width="70px"
                        />
                      ) : (
                        <span style={{ fontSize: '15px' }}>{subject.icon || '—'}</span>
                      )}
                    </td>
                    <td style={tdNumStyle}>{subject.note_count ?? 0}</td>
                    <td style={tdStyle}>
                      {editing ? (
                        <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                          <Button size="xs" variant="ghost" onClick={() => setEditId(null)}>
                            Cancel
                          </Button>
                          <Button
                            size="xs"
                            variant="primary"
                            disabled={busy || !editName.trim()}
                            onClick={() => handleSaveEdit(subject.id)}
                          >
                            Save
                          </Button>
                        </div>
                      ) : pendingDelete ? (
                        <div
                          style={{
                            display: 'flex',
                            gap: '6px',
                            alignItems: 'center',
                            justifyContent: 'flex-end',
                          }}
                        >
                          <span style={{ fontSize: '11px', color: ink.crit }}>
                            {(subject.note_count ?? 0) > 0
                              ? `${subject.note_count} notes will lose their subject.`
                              : 'Delete this subject?'}
                          </span>
                          <Button size="xs" variant="ghost" onClick={() => setConfirmDelete(null)}>
                            Keep
                          </Button>
                          <Button
                            size="xs"
                            variant="danger"
                            disabled={busy}
                            onClick={() => handleDelete(subject.id)}
                          >
                            Delete
                          </Button>
                        </div>
                      ) : (
                        <RowActions>
                          <Button size="xs" onClick={() => startEdit(subject)}>
                            Rename
                          </Button>
                          <Button
                            size="xs"
                            variant="danger"
                            onClick={() => setConfirmDelete(subject.id)}
                          >
                            Delete
                          </Button>
                        </RowActions>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        )}
      </Panel>

      {subjects.some((s) => (s.note_count ?? 0) === 0) && (
        <Callout tone="warn">
          <Pill tone="warn" bare>
            Empty
          </Pill>{' '}
          Some subjects have no notes at all. Worth an announcement, or worth removing.
        </Callout>
      )}
    </div>
  );
}
