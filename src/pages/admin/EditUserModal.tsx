import { useState } from 'react';
import api from '../../lib/api';
import type { AdminUser } from './types';
import { Button, Callout, Field, Modal, TextField } from '../../components/ops/ConsoleKit';
import { ink } from '../../components/ops/tokens';

interface EditUserModalProps {
  user: AdminUser;
  onClose: () => void;
  onSaved: () => void;
}

// Moderator-facing profile editor. Deliberately omits any role field —
// access follows the email allowlist, so there is nothing to grant here.
export default function EditUserModal({ user, onClose, onSaved }: EditUserModalProps) {
  const [displayName, setDisplayName] = useState(user.display_name || user.name || '');
  const [userClass, setUserClass] = useState(user.class || '');
  const [diamonds, setDiamonds] = useState(String(user.diamonds ?? 0));
  const [learningPoints, setLearningPoints] = useState(String(user.learning_points ?? 0));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startDiamonds = String(user.diamonds ?? 0);
  const startPoints = String(user.learning_points ?? 0);
  const changed =
    displayName !== (user.display_name || user.name || '') ||
    userClass !== (user.class || '') ||
    diamonds !== startDiamonds ||
    learningPoints !== startPoints;

  // Points and diamonds are a manual override, so the delta is spelled out
  // rather than left for the moderator to work out from two numbers.
  const delta = (next: string, before: string) => {
    const d = (Number(next) || 0) - (Number(before) || 0);
    if (d === 0) return null;
    return `${d > 0 ? '+' : ''}${d.toLocaleString()} from ${Number(before).toLocaleString()}`;
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.admin.updateUser(user.id, {
        display_name: displayName,
        class: userClass,
        diamonds: Number(diamonds) || 0,
        learning_points: Number(learningPoints) || 0,
      });
      onSaved();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update user');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={`Edit ${user.display_name || user.name}`}
      sub={user.email}
      width="470px"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" disabled={saving} onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={saving || !changed} onClick={handleSave}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </>
      }
    >
      {error && (
        <div style={{ marginBottom: '12px' }}>
          <Callout tone="crit">{error}</Callout>
        </div>
      )}

      <Field label="Display name" htmlFor="edit-name">
        <TextField
          id="edit-name"
          label="Display name"
          value={displayName}
          onChange={setDisplayName}
        />
      </Field>

      <Field label="Class" htmlFor="edit-class" hint="Must match a class from the Classes tab.">
        <TextField
          id="edit-class"
          label="Class"
          placeholder="e.g. 10.1"
          value={userClass}
          onChange={setUserClass}
        />
      </Field>

      <Field label="Diamonds" htmlFor="edit-diamonds" hint={delta(diamonds, startDiamonds)}>
        <TextField
          id="edit-diamonds"
          type="number"
          label="Diamonds"
          value={diamonds}
          onChange={setDiamonds}
          mono
          width="130px"
        />
      </Field>

      <Field
        label="Learning points"
        htmlFor="edit-points"
        hint={delta(learningPoints, startPoints)}
      >
        <TextField
          id="edit-points"
          type="number"
          label="Learning points"
          value={learningPoints}
          onChange={setLearningPoints}
          mono
          width="130px"
        />
      </Field>

      <div style={{ marginTop: '14px' }}>
        <Callout>
          Changing points or diamonds by hand is recorded in the activity log under your name.
          Access level is not editable here — it follows the email allowlist.
        </Callout>
      </div>

      {!changed && (
        <div style={{ marginTop: '10px', fontSize: '11px', color: ink.fainter }}>
          Nothing has changed yet.
        </div>
      )}
    </Modal>
  );
}
