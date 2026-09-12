import { useState } from 'react';
import type { AdminUser } from './types';
import EditUserModal from './EditUserModal';
import { safePhotoUrl } from '../../lib/safeUrl';
import { formatLongDateTime } from '../../lib/datetime';
import {
  Avatar,
  Button,
  Callout,
  Modal,
  Pill,
  Readout,
  Readouts,
} from '../../components/ops/ConsoleKit';
import { ink } from '../../components/ops/tokens';
import { darkTheme } from '../../theme';

const t = darkTheme;

interface UserDetailModalProps {
  user: AdminUser | null;
  onClose: () => void;
  onSaved?: () => void;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '120px minmax(0,1fr)',
        gap: '10px',
        alignItems: 'center',
        padding: '7px 0',
        borderBottom: `1px solid ${t.colors.borderColor}`,
      }}
    >
      <span style={{ fontSize: '11.5px', color: ink.faint }}>{label}</span>
      <div style={{ fontSize: '12.5px' }}>{children}</div>
    </div>
  );
}

export default function UserDetailModal({ user, onClose, onSaved }: UserDetailModalProps) {
  const [editing, setEditing] = useState(false);
  if (!user) return null;

  const name = user.display_name || user.name;

  return (
    <>
      <Modal
        title={name}
        sub={user.email}
        width="560px"
        onClose={onClose}
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
            <Button variant="primary" onClick={() => setEditing(true)}>
              Edit details
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
          <Avatar name={name} photoUrl={safePhotoUrl(user.photo_url)} size={48} />
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
              {user.suspended ? (
                <Pill tone="crit">Suspended</Pill>
              ) : user.warning ? (
                <Pill tone="warn">Warned</Pill>
              ) : (
                <Pill tone="ok">Good standing</Pill>
              )}
              <Pill tone="mute">{user.class || 'no class'}</Pill>
              <Pill tone="mute">{user.role}</Pill>
            </div>
          </div>
        </div>

        <div style={{ marginBottom: '14px' }}>
          <Readouts>
            <Readout label="Notes" value={user.notes_uploaded || user.notes_count || 0} />
            <Readout label="Likes received" value={(user.total_likes || 0).toLocaleString()} />
            <Readout label="Admin upvotes" value={user.total_admin_upvotes || 0} />
            <Readout label="Points" value={(user.points || 0).toLocaleString()} />
          </Readouts>
        </div>

        {user.suspended && (user.suspension_end_date || user.suspension_reason) && (
          <div style={{ marginBottom: '14px' }}>
            <Callout tone="crit">
              {user.suspension_end_date && (
                <div>
                  <strong>Suspended until</strong> {formatLongDateTime(user.suspension_end_date)}
                </div>
              )}
              {user.suspension_reason && (
                <div style={{ marginTop: '4px' }}>They were told: “{user.suspension_reason}”</div>
              )}
            </Callout>
          </div>
        )}

        {Boolean(user.warning) && user.warning_message && (
          <div style={{ marginBottom: '14px' }}>
            <Callout tone="warn">
              <strong>Active warning.</strong> They were told: “{user.warning_message}”
            </Callout>
          </div>
        )}

        <Row label="Display name">{name}</Row>
        <Row label="Email">
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '12px' }}>
            {user.email}
          </span>
        </Row>
        <Row label="Class">{user.class || '—'}</Row>
        <Row label="Access level">
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Pill tone="mute" bare>
              {user.role}
            </Pill>
            <span style={{ fontSize: '10.5px', color: ink.fainter }}>
              set by the email allowlist, not here
            </span>
          </span>
        </Row>
        <Row label="Account id">
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '12px' }}>
            {user.id}
          </span>
        </Row>
      </Modal>

      {editing && (
        <EditUserModal
          user={user}
          onClose={() => setEditing(false)}
          onSaved={() => {
            onSaved?.();
            onClose();
          }}
        />
      )}
    </>
  );
}
