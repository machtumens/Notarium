import { useState } from 'react';
import api from '../../lib/api';
import type { AdminUser } from './types';
import { formatDate } from '../../lib/datetime';
import {
  Button,
  Callout,
  EmptyState,
  Field,
  Panel,
  Pill,
  RowActions,
  SelectField,
  TableWrap,
  TextField,
  type Tone,
} from '../../components/ops/ConsoleKit';
import { ink, rowSubStyle, tdStyle, thStyle } from '../../components/ops/tokens';
import { darkTheme } from '../../theme';

const t = darkTheme;

interface NotifForm {
  target_type: string;
  target_grade: string;
  target_class: string;
  target_user_id: string;
  notification_type: string;
  title: string;
  message: string;
}

interface NotificationsTabProps {
  users: AdminUser[];
  gradeClasses: any[];
  notifForm: NotifForm;
  setNotifForm: React.Dispatch<React.SetStateAction<NotifForm>>;
  notifLoading: boolean;
  setNotifLoading: React.Dispatch<React.SetStateAction<boolean>>;
  sentNotifications: any[];
  setSentNotifications: React.Dispatch<React.SetStateAction<any[]>>;
}

const EMPTY_FORM: NotifForm = {
  target_type: 'all',
  target_grade: '',
  target_class: '',
  target_user_id: '',
  notification_type: 'announcement',
  title: '',
  message: '',
};

const TYPE_TONE: Record<string, Tone> = {
  announcement: 'info',
  warning: 'warn',
  class_reassignment: 'mute',
};

export default function NotificationsTab({
  users,
  gradeClasses,
  notifForm,
  setNotifForm,
  notifLoading,
  setNotifLoading,
  sentNotifications,
  setSentNotifications,
}: NotificationsTabProps) {
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<number | null>(null);

  const set = (patch: Partial<NotifForm>) => setNotifForm((p) => ({ ...p, ...patch }));

  // Spelled out so the send button says exactly who receives it.
  const audienceCount =
    notifForm.target_type === 'all'
      ? users.length
      : notifForm.target_type === 'grade'
        ? users.filter((u) => String(u.grade ?? '') === notifForm.target_grade).length
        : notifForm.target_type === 'class'
          ? users.filter((u) => u.class === notifForm.target_class).length
          : notifForm.target_user_id
            ? 1
            : 0;

  const targetChosen =
    notifForm.target_type === 'all' ||
    (notifForm.target_type === 'grade' && notifForm.target_grade) ||
    (notifForm.target_type === 'class' && notifForm.target_class) ||
    (notifForm.target_type === 'user' && notifForm.target_user_id);

  const canSend =
    !notifLoading && Boolean(notifForm.title.trim() && notifForm.message.trim() && targetChosen);

  const handleSend = async () => {
    setNotifLoading(true);
    setError(null);
    try {
      await api.admin.createNotification({
        target_type: notifForm.target_type,
        target_grade: notifForm.target_grade ? Number(notifForm.target_grade) : undefined,
        target_class: notifForm.target_class || undefined,
        target_user_id: notifForm.target_user_id ? Number(notifForm.target_user_id) : undefined,
        notification_type: notifForm.notification_type,
        title: notifForm.title,
        message: notifForm.message,
      });
      setNotifForm(EMPTY_FORM);
      const res = await api.admin.getNotifications();
      setSentNotifications((res as any).notifications || []);
      setNotice(
        `Sent to ${audienceCount.toLocaleString()} student${audienceCount === 1 ? '' : 's'}.`,
      );
    } catch (e: any) {
      setError(e?.message ?? 'Could not send the announcement.');
    } finally {
      setNotifLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    setError(null);
    try {
      await api.admin.deleteNotification(id);
      setSentNotifications((prev) => prev.filter((x: any) => x.id !== id));
      setPendingDelete(null);
      setNotice('Taken down. Students no longer see it.');
    } catch (e: any) {
      setError(e?.message ?? 'Could not take it down.');
    }
  };

  const controlStyle: React.CSSProperties = {
    width: '100%',
    font: 'inherit',
    fontSize: '12.5px',
    padding: '6px 9px',
    border: '1px solid rgba(28,42,34,.2)',
    borderRadius: t.borderRadius.sm,
    background: '#fff',
    color: t.colors.textPrimary,
    boxSizing: 'border-box',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {error && <Callout tone="crit">{error}</Callout>}
      {notice && <Callout>{notice}</Callout>}

      <Panel legend="Write an announcement" sub="lands in the inbox of everyone you target">
        <Field label="Audience" htmlFor="notif-audience">
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <SelectField
              label="Who receives this"
              value={notifForm.target_type}
              onChange={(v) =>
                set({ target_type: v, target_grade: '', target_class: '', target_user_id: '' })
              }
              options={[
                { value: 'all', label: 'Everyone' },
                { value: 'grade', label: 'One year group' },
                { value: 'class', label: 'One class' },
                { value: 'user', label: 'One student' },
              ]}
            />

            {notifForm.target_type === 'grade' && (
              <SelectField
                label="Year group"
                value={notifForm.target_grade}
                onChange={(v) => set({ target_grade: v })}
                options={[
                  { value: '', label: 'Pick a year…' },
                  { value: '10', label: 'Year 10' },
                  { value: '11', label: 'Year 11' },
                  { value: '12', label: 'Year 12' },
                ]}
              />
            )}

            {notifForm.target_type === 'class' && (
              <SelectField
                label="Class"
                value={notifForm.target_class}
                onChange={(v) => set({ target_class: v })}
                options={[
                  { value: '', label: 'Pick a class…' },
                  ...gradeClasses.map((gc: any) => ({
                    value: String(gc.class_name),
                    label: String(gc.class_name),
                  })),
                ]}
              />
            )}

            {notifForm.target_type === 'user' && (
              <SelectField
                label="Student"
                value={notifForm.target_user_id}
                onChange={(v) => set({ target_user_id: v })}
                options={[
                  { value: '', label: 'Pick a student…' },
                  ...users.map((u) => ({
                    value: String(u.id),
                    label: `${u.display_name || u.name} · ${u.email}`,
                  })),
                ]}
              />
            )}
          </div>
        </Field>

        <Field label="Kind" hint="Warnings render with a yellow banner rather than a plain card.">
          <SelectField
            label="Announcement kind"
            value={notifForm.notification_type}
            onChange={(v) => set({ notification_type: v })}
            options={[
              { value: 'announcement', label: 'Announcement' },
              { value: 'warning', label: 'Warning' },
              { value: 'class_reassignment', label: 'Class reassignment' },
            ]}
          />
        </Field>

        <Field label="Title" htmlFor="notif-title">
          <TextField
            id="notif-title"
            label="Announcement title"
            placeholder="e.g. Notarium is down Saturday 09:00"
            value={notifForm.title}
            onChange={(v) => set({ title: v })}
          />
        </Field>

        <Field
          label="Message"
          htmlFor="notif-message"
          hint="What students need to know, and what they should do about it."
        >
          <textarea
            id="notif-message"
            aria-label="Announcement message"
            rows={4}
            value={notifForm.message}
            onChange={(e) => set({ message: e.target.value })}
            placeholder="Keep it short. They read this on a phone between lessons."
            className="ops-focus"
            style={{ ...controlStyle, resize: 'vertical', fontFamily: 'inherit' }}
          />
        </Field>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            justifyContent: 'flex-end',
            paddingTop: '12px',
          }}
        >
          <span style={{ fontSize: '11px', color: ink.fainter }}>
            {targetChosen
              ? `${audienceCount.toLocaleString()} student${audienceCount === 1 ? '' : 's'} will receive this`
              : 'Pick an audience first'}
          </span>
          <Button variant="primary" disabled={!canSend} onClick={handleSend}>
            {notifLoading ? 'Sending…' : 'Send'}
          </Button>
        </div>
      </Panel>

      <Panel legend="Sent" sub={`${sentNotifications.length} live`} bodyPadding="0">
        {sentNotifications.length === 0 ? (
          <EmptyState>Nothing sent yet.</EmptyState>
        ) : (
          <TableWrap maxHeight="480px">
            <thead>
              <tr>
                <th style={thStyle}>Announcement</th>
                <th style={thStyle}>Kind</th>
                <th style={thStyle}>Audience</th>
                <th style={thStyle}>Sent</th>
                <th style={thStyle} aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {sentNotifications.map((n: any) => (
                <tr key={n.id} className="ops-row">
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 500 }}>{n.title}</div>
                    <div style={rowSubStyle}>{n.message}</div>
                  </td>
                  <td style={tdStyle}>
                    <Pill tone={TYPE_TONE[n.notification_type] ?? 'mute'}>
                      {String(n.notification_type).replace(/_/g, ' ')}
                    </Pill>
                  </td>
                  <td style={tdStyle}>
                    {n.target_type === 'all'
                      ? 'Everyone'
                      : `${n.target_type}${n.target_grade ? ` ${n.target_grade}` : ''}${
                          n.target_class ? ` ${n.target_class}` : ''
                        }`}
                  </td>
                  <td style={tdStyle}>{formatDate(n.created_at)}</td>
                  <td style={tdStyle}>
                    {pendingDelete === n.id ? (
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                        <Button size="xs" variant="ghost" onClick={() => setPendingDelete(null)}>
                          Keep
                        </Button>
                        <Button size="xs" variant="danger" onClick={() => handleDelete(n.id)}>
                          Take down
                        </Button>
                      </div>
                    ) : (
                      <RowActions>
                        <Button size="xs" variant="danger" onClick={() => setPendingDelete(n.id)}>
                          Take down
                        </Button>
                      </RowActions>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Panel>
    </div>
  );
}
