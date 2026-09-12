import { useState } from 'react';
import type { AdminUser } from './types';
import { Button, Callout, Field, Modal } from '../../components/ops/ConsoleKit';
import { ink, monoFace } from '../../components/ops/tokens';
import { darkTheme } from '../../theme';

const t = darkTheme;

interface SuspendUserModalProps {
  user: AdminUser | null;
  onClose: () => void;
  onSuspend: (userId: number, days: number, reason: string) => Promise<void>;
}

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

export default function SuspendUserModal({ user, onClose, onSuspend }: SuspendUserModalProps) {
  const [days, setDays] = useState(7);
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;

  const name = user.display_name || user.name;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      await onSuspend(user.id, days, reason);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not suspend this student. Try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      title={`Suspend ${name}`}
      sub={user.email}
      tone="crit"
      width="470px"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            type="submit"
            disabled={isSubmitting || !reason.trim()}
            onClick={() => {
              const form = document.getElementById('suspend-form') as HTMLFormElement | null;
              form?.requestSubmit();
            }}
          >
            {isSubmitting ? 'Suspending…' : `Suspend for ${days} day${days === 1 ? '' : 's'}`}
          </Button>
        </>
      }
    >
      <form id="suspend-form" onSubmit={handleSubmit}>
        {error && (
          <div style={{ marginBottom: '12px' }}>
            <Callout tone="crit">{error}</Callout>
          </div>
        )}
        <div style={{ marginBottom: '12px' }}>
          <Callout tone="warn">
            They cannot sign in until the suspension ends. Their notes stay visible unless you
            remove them separately.
          </Callout>
        </div>

        <Field label="Length" htmlFor="suspend-days" hint="Between 1 and 365 days.">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              id="suspend-days"
              aria-label="Suspension length in days"
              type="number"
              min={1}
              max={365}
              required
              value={days}
              onChange={(e) =>
                setDays(Math.min(365, Math.max(1, parseInt(e.target.value || '1', 10))))
              }
              className="ops-focus"
              style={{ ...controlStyle, width: '90px', fontFamily: monoFace }}
            />
            <span style={{ fontSize: '11.5px', color: ink.fainter }}>days</span>
          </div>
        </Field>

        <Field
          label="Reason"
          htmlFor="suspend-reason"
          hint="The student sees this word for word, so write it to them."
        >
          <textarea
            id="suspend-reason"
            aria-label="Reason the student will see"
            required
            rows={4}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="What they did, and what happens if it happens again."
            className="ops-focus"
            style={{ ...controlStyle, resize: 'vertical', fontFamily: 'inherit' }}
          />
        </Field>
      </form>
    </Modal>
  );
}
