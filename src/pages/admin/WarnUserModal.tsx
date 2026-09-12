import { useState } from 'react';
import type { AdminUser } from './types';
import { Button, Callout, Field, Modal } from '../../components/ops/ConsoleKit';
import { darkTheme } from '../../theme';

const t = darkTheme;

interface WarnUserModalProps {
  user: AdminUser | null;
  onClose: () => void;
  onWarn: (userId: number, message: string) => Promise<void>;
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

export default function WarnUserModal({ user, onClose, onWarn }: WarnUserModalProps) {
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;

  const name = user.display_name || user.name;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      await onWarn(user.id, message);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the warning. Try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      title={`Warn ${name}`}
      sub={user.email}
      width="470px"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={isSubmitting || !message.trim()}
            onClick={() => {
              const form = document.getElementById('warn-form') as HTMLFormElement | null;
              form?.requestSubmit();
            }}
          >
            {isSubmitting ? 'Sending…' : 'Send warning'}
          </Button>
        </>
      }
    >
      <form id="warn-form" onSubmit={handleSubmit}>
        {error && (
          <div style={{ marginBottom: '12px' }}>
            <Callout tone="crit">{error}</Callout>
          </div>
        )}
        <div style={{ marginBottom: '12px' }}>
          <Callout tone="warn">
            A warning shows a banner on their next sign-in. It does not block anything they can do —
            use it for a first offence or a reminder.
          </Callout>
        </div>

        <Field
          label="Message"
          htmlFor="warn-message"
          hint="The student sees this word for word, so write it to them."
        >
          <textarea
            id="warn-message"
            aria-label="Warning message the student will see"
            required
            rows={4}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="What they did, and what to do instead."
            className="ops-focus"
            style={{ ...controlStyle, resize: 'vertical', fontFamily: 'inherit' }}
          />
        </Field>
      </form>
    </Modal>
  );
}
