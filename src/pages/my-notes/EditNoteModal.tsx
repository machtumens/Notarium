import { darkTheme } from '../../theme';

interface EditNoteModalProps {
  editTitle: string;
  setEditTitle: (value: string) => void;
  editContent: string;
  setEditContent: (value: string) => void;
  editTags: string;
  setEditTags: (value: string) => void;
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
}

export default function EditNoteModal({
  editTitle,
  setEditTitle,
  editContent,
  setEditContent,
  editTags,
  setEditTags,
  saving,
  onClose,
  onSave,
}: EditNoteModalProps) {
  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '20px',
      }}
    >
      <div
        style={{
          background: darkTheme.colors.bgSecondary,
          borderRadius: darkTheme.borderRadius.lg,
          padding: '24px',
          maxWidth: '600px',
          width: '100%',
          maxHeight: '90vh',
          overflow: 'auto',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '20px',
          }}
        >
          <h2
            style={{
              fontSize: '20px',
              fontWeight: '600',
              color: darkTheme.colors.textPrimary,
            }}
          >
            Edit Note
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: darkTheme.colors.textSecondary,
              cursor: 'pointer',
              fontSize: '24px',
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label
            style={{
              display: 'block',
              marginBottom: '8px',
              color: darkTheme.colors.textPrimary,
              fontSize: '14px',
              fontWeight: '500',
            }}
          >
            Title
          </label>
          <input
            type="text"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            style={{
              width: '100%',
              padding: '10px',
              background: darkTheme.colors.bgTertiary,
              border: `1px solid ${darkTheme.colors.borderColor}`,
              borderRadius: darkTheme.borderRadius.md,
              color: darkTheme.colors.textPrimary,
              fontSize: '14px',
            }}
          />
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label
            style={{
              display: 'block',
              marginBottom: '8px',
              color: darkTheme.colors.textPrimary,
              fontSize: '14px',
              fontWeight: '500',
            }}
          >
            Content
          </label>
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            rows={10}
            style={{
              width: '100%',
              padding: '10px',
              background: darkTheme.colors.bgTertiary,
              border: `1px solid ${darkTheme.colors.borderColor}`,
              borderRadius: darkTheme.borderRadius.md,
              color: darkTheme.colors.textPrimary,
              fontSize: '14px',
              fontFamily: 'inherit',
              resize: 'vertical',
            }}
          />
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label
            style={{
              display: 'block',
              marginBottom: '8px',
              color: darkTheme.colors.textPrimary,
              fontSize: '14px',
              fontWeight: '500',
            }}
          >
            Tags (comma-separated)
          </label>
          <input
            type="text"
            value={editTags}
            onChange={(e) => setEditTags(e.target.value)}
            style={{
              width: '100%',
              padding: '10px',
              background: darkTheme.colors.bgTertiary,
              border: `1px solid ${darkTheme.colors.borderColor}`,
              borderRadius: darkTheme.borderRadius.md,
              color: darkTheme.colors.textPrimary,
              fontSize: '14px',
            }}
          />
        </div>

        <div
          style={{
            display: 'flex',
            gap: '12px',
          }}
        >
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: '12px',
              background: darkTheme.colors.bgTertiary,
              border: `1px solid ${darkTheme.colors.borderColor}`,
              borderRadius: darkTheme.borderRadius.md,
              color: darkTheme.colors.textPrimary,
              cursor: 'pointer',
              fontWeight: '500',
            }}
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            style={{
              flex: 1,
              padding: '12px',
              background: darkTheme.colors.accent,
              border: 'none',
              borderRadius: darkTheme.borderRadius.md,
              color: 'white',
              cursor: saving ? 'not-allowed' : 'pointer',
              fontWeight: '500',
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
