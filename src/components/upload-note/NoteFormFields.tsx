import { darkTheme } from '../../theme';
import { logger } from '../../lib/logger';
import { generateQuickSummary, generateAutoTags } from './helpers';
import type { Subject, Visibility } from './types';

interface NoteFormFieldsProps {
  isMobile: boolean;
  uploadMode: string;
  subjects: Subject[];
  preselectedSubject?: number;
  selectedSubject: number | undefined;
  setSelectedSubject: (id: number) => void;
  noteTitle: string;
  setNoteTitle: (value: string) => void;
  extractedText: string;
  generatedSummary: string;
  setGeneratedSummary: (value: string) => void;
  manualTags: string;
  setManualTags: React.Dispatch<React.SetStateAction<string>>;
  suggestedTags: string[];
  setSuggestedTags: (tags: string[]) => void;
  visibility: Visibility;
  setVisibility: (value: Visibility) => void;
  saveAsDraft: boolean;
  setSaveAsDraft: (value: boolean) => void;
  scheduledDate: string;
  setScheduledDate: (value: string) => void;
}

export default function NoteFormFields({
  isMobile,
  uploadMode,
  subjects,
  preselectedSubject,
  selectedSubject,
  setSelectedSubject,
  noteTitle,
  setNoteTitle,
  extractedText,
  generatedSummary,
  setGeneratedSummary,
  manualTags,
  setManualTags,
  suggestedTags,
  setSuggestedTags,
  visibility,
  setVisibility,
  saveAsDraft,
  setSaveAsDraft,
  scheduledDate,
  setScheduledDate,
}: NoteFormFieldsProps) {
  return (
    <>
      {!preselectedSubject && (
        <div style={{ marginBottom: isMobile ? '12px' : '16px' }}>
          <label
            style={{
              display: 'block',
              marginBottom: '8px',
              fontSize: isMobile ? '12px' : '14px',
              fontWeight: '500',
              color: darkTheme.colors.textPrimary,
            }}
          >
            Subject
          </label>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)',
              gap: '8px',
            }}
          >
            {subjects.map((subject) => (
              <button
                key={subject.id}
                type="button"
                onClick={() => setSelectedSubject(subject.id)}
                style={{
                  padding: isMobile ? '10px' : '12px',
                  background:
                    selectedSubject === subject.id
                      ? `linear-gradient(135deg, ${darkTheme.colors.accent}, #8b5cf6)`
                      : darkTheme.colors.bgSecondary,
                  color: selectedSubject === subject.id ? '#fff' : darkTheme.colors.textSecondary,
                  border: 'none',
                  borderRadius: darkTheme.borderRadius.md,
                  cursor: 'pointer',
                  fontSize: isMobile ? '13px' : '14px',
                  fontWeight: '600',
                  transition: 'all 0.2s',
                  boxShadow: selectedSubject === subject.id ? darkTheme.shadows.default : 'none',
                }}
                onMouseOver={(e) => {
                  if (selectedSubject !== subject.id) {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                  }
                }}
                onMouseOut={(e) => {
                  if (selectedSubject !== subject.id) {
                    e.currentTarget.style.background = darkTheme.colors.bgSecondary;
                  }
                }}
              >
                {subject.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginBottom: isMobile ? '8px' : '16px' }}>
        <label
          style={{
            display: 'block',
            marginBottom: '6px',
            fontSize: isMobile ? '12px' : '14px',
            fontWeight: '500',
          }}
        >
          Note Title
        </label>
        <input
          type="text"
          value={noteTitle}
          onChange={(e) => setNoteTitle(e.target.value)}
          placeholder="Enter a title for your note"
          style={{
            width: '100%',
            padding: isMobile ? '8px 12px' : '12px 16px',
            background: darkTheme.colors.bgSecondary,
            border: `1px solid ${darkTheme.colors.borderColor}`,
            borderRadius: '12px',
            outline: 'none',
            color: darkTheme.colors.textPrimary,
            boxSizing: 'border-box',
            fontSize: isMobile ? '13px' : '14px',
          }}
        />
      </div>

      {uploadMode === 'scan' && extractedText && (
        <div style={{ marginBottom: isMobile ? '8px' : '16px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '6px',
            }}
          >
            <label style={{ fontSize: isMobile ? '12px' : '14px', fontWeight: '500', margin: 0 }}>
              <i
                className="fas fa-magic"
                style={{ color: darkTheme.colors.accent, marginRight: '8px' }}
              ></i>
              AI-Generated Summary (2 sentences)
            </label>
            <button
              onClick={async () => {
                if (!noteTitle || noteTitle.trim().length === 0) {
                  alert('Please add a title first');
                  return;
                }

                if (!extractedText || extractedText.trim().length === 0) {
                  alert(
                    'No extracted text available. Please wait for OCR to complete or upload an image.',
                  );
                  return;
                }

                try {
                  logger.debug('ai', 'Generating summary and tags...');
                  const summary = await generateQuickSummary(extractedText, noteTitle);
                  setGeneratedSummary(summary);

                  const tags = await generateAutoTags(extractedText, noteTitle);
                  setSuggestedTags(tags);
                } catch (error: unknown) {
                  console.error('Summary generation failed:', error);
                }
              }}
              disabled={!noteTitle}
              style={{
                padding: '4px 12px',
                background: darkTheme.colors.accent,
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: noteTitle ? 'pointer' : 'not-allowed',
                fontSize: isMobile ? '11px' : '12px',
                fontWeight: '500',
                opacity: noteTitle ? 1 : 0.5,
                transition: 'all 0.2s',
              }}
              onMouseOver={(e) => {
                if (noteTitle && extractedText) {
                  e.currentTarget.style.background = darkTheme.colors.accentHover;
                }
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = darkTheme.colors.accent;
              }}
            >
              <i className="fas fa-sync" style={{ marginRight: '4px' }}></i>
              {generatedSummary ? 'Regenerate' : 'Generate'}
            </button>
          </div>
          {generatedSummary ? (
            <div
              style={{
                width: '100%',
                padding: isMobile ? '8px 12px' : '12px 16px',
                background: `${darkTheme.colors.accent}10`,
                border: `1px solid ${darkTheme.colors.accent}30`,
                borderRadius: '12px',
                color: darkTheme.colors.textPrimary,
                boxSizing: 'border-box',
                fontSize: isMobile ? '13px' : '14px',
                lineHeight: '1.6',
              }}
            >
              {generatedSummary}
            </div>
          ) : (
            <div
              style={{
                width: '100%',
                padding: isMobile ? '8px 12px' : '12px 16px',
                background: `${darkTheme.colors.borderColor}20`,
                border: `1px dashed ${darkTheme.colors.borderColor}`,
                borderRadius: '12px',
                color: darkTheme.colors.textSecondary,
                boxSizing: 'border-box',
                fontSize: isMobile ? '12px' : '13px',
                fontStyle: 'italic',
                textAlign: 'center',
              }}
            >
              Click "Generate" to create an AI summary from your note
            </div>
          )}
        </div>
      )}

      <div style={{ marginBottom: isMobile ? '8px' : '16px' }}>
        <label
          style={{
            display: 'block',
            marginBottom: '6px',
            fontSize: isMobile ? '12px' : '14px',
            fontWeight: '500',
          }}
        >
          Topic Tags{' '}
          <span
            style={{
              fontSize: isMobile ? '10px' : '12px',
              color: darkTheme.colors.textSecondary,
            }}
          >
            (comma-separated, optional)
          </span>
        </label>
        <input
          type="text"
          value={manualTags}
          onChange={(e) => setManualTags(e.target.value)}
          placeholder="e.g. algebra, equations, mathematics"
          style={{
            width: '100%',
            padding: isMobile ? '8px 12px' : '12px 16px',
            background: darkTheme.colors.bgSecondary,
            border: `1px solid ${darkTheme.colors.borderColor}`,
            borderRadius: '12px',
            outline: 'none',
            color: darkTheme.colors.textPrimary,
            boxSizing: 'border-box',
            fontSize: isMobile ? '13px' : '14px',
          }}
        />
        {manualTags && (
          <div style={{ marginTop: '12px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {manualTags.split(',').map((tag, idx) => {
              const trimmedTag = tag.trim();
              if (!trimmedTag) return null;
              return (
                <span
                  key={idx}
                  style={{
                    background: `${darkTheme.colors.accent}20`,
                    border: `1px solid ${darkTheme.colors.accent}`,
                    color: darkTheme.colors.accent,
                    padding: '4px 12px',
                    borderRadius: '16px',
                    fontSize: '12px',
                    fontWeight: '500',
                  }}
                >
                  {trimmedTag}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {suggestedTags.length > 0 && (
        <div style={{ marginBottom: isMobile ? '8px' : '16px' }}>
          <label
            style={{
              display: 'block',
              marginBottom: '6px',
              fontSize: isMobile ? '11px' : '14px',
              fontWeight: '500',
              color: darkTheme.colors.textSecondary,
            }}
          >
            <i
              className="fas fa-lightbulb"
              style={{ color: darkTheme.colors.accent, marginRight: '8px' }}
            ></i>
            AI Suggestions (click to add):
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {suggestedTags.map((tag, idx) => {
              const currentTags = manualTags
                ? manualTags
                    .split(',')
                    .map((t) => t.trim())
                    .filter((t) => t)
                : [];
              const isSelected = currentTags.includes(tag);

              return (
                <span
                  key={idx}
                  onClick={() => {
                    setManualTags((prev) => {
                      const currentTags = prev
                        ? prev
                            .split(',')
                            .map((t) => t.trim())
                            .filter((t) => t)
                        : [];
                      if (!currentTags.includes(tag)) {
                        return [...currentTags, tag].join(', ');
                      }
                      return prev;
                    });
                  }}
                  style={{
                    background: isSelected
                      ? `${darkTheme.colors.accent}30`
                      : `${darkTheme.colors.accent}15`,
                    border: isSelected
                      ? `1px solid ${darkTheme.colors.accent}`
                      : `1px dashed ${darkTheme.colors.accent}60`,
                    color: darkTheme.colors.accent,
                    padding: '4px 12px',
                    borderRadius: '16px',
                    fontSize: '11px',
                    fontWeight: '500',
                    cursor: isSelected ? 'default' : 'pointer',
                    transition: 'all 0.2s',
                    opacity: isSelected ? 0.6 : 1,
                  }}
                  onMouseOver={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.background = `${darkTheme.colors.accent}30`;
                      e.currentTarget.style.borderColor = darkTheme.colors.accent;
                    }
                  }}
                  onMouseOut={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.background = `${darkTheme.colors.accent}15`;
                      e.currentTarget.style.borderColor = `${darkTheme.colors.accent}60`;
                    }
                  }}
                >
                  {isSelected && <i className="fas fa-check" style={{ marginRight: '4px' }}></i>}
                  {tag}
                </span>
              );
            })}
          </div>
        </div>
      )}

      <div
        style={{
          background: darkTheme.colors.bgSecondary,
          padding: '16px',
          borderRadius: '12px',
          marginTop: '16px',
        }}
      >
        <label
          style={{
            display: 'block',
            color: darkTheme.colors.textPrimary,
            fontSize: '14px',
            fontWeight: '500',
            marginBottom: '12px',
          }}
        >
          Who can see this note?
        </label>
        <div
          style={{
            display: 'flex',
            gap: '8px',
          }}
        >
          <button
            type="button"
            onClick={() => setVisibility('everyone')}
            style={{
              flex: 1,
              padding: '10px 16px',
              background:
                visibility === 'everyone' ? darkTheme.colors.accent : darkTheme.colors.bgTertiary,
              color: visibility === 'everyone' ? 'white' : darkTheme.colors.textSecondary,
              border: `1px solid ${visibility === 'everyone' ? darkTheme.colors.accent : darkTheme.colors.borderColor}`,
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: '500',
              transition: 'all 0.2s',
            }}
          >
            <div style={{ fontSize: '16px', marginBottom: '4px' }}>🌍</div>
            Everyone
          </button>
          <button
            type="button"
            onClick={() => setVisibility('class')}
            style={{
              flex: 1,
              padding: '10px 16px',
              background:
                visibility === 'class' ? darkTheme.colors.accent : darkTheme.colors.bgTertiary,
              color: visibility === 'class' ? 'white' : darkTheme.colors.textSecondary,
              border: `1px solid ${visibility === 'class' ? darkTheme.colors.accent : darkTheme.colors.borderColor}`,
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: '500',
              transition: 'all 0.2s',
            }}
          >
            <div style={{ fontSize: '16px', marginBottom: '4px' }}>👥</div>
            My Class Only
          </button>
        </div>
        <p
          style={{
            fontSize: '11px',
            color: darkTheme.colors.textSecondary,
            marginTop: '8px',
            fontStyle: 'italic',
          }}
        >
          {visibility === 'everyone'
            ? 'All users can see this note'
            : 'Only students in your class can see this note'}
        </p>
      </div>

      <div
        style={{
          background: darkTheme.colors.bgSecondary,
          padding: '16px',
          borderRadius: '12px',
          marginTop: '16px',
        }}
      >
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            cursor: 'pointer',
            marginBottom: saveAsDraft ? '12px' : '0',
          }}
        >
          <input
            type="checkbox"
            checked={saveAsDraft}
            onChange={(e) => setSaveAsDraft(e.target.checked)}
            style={{
              width: '18px',
              height: '18px',
              cursor: 'pointer',
            }}
          />
          <span
            style={{
              color: darkTheme.colors.textPrimary,
              fontSize: '14px',
              fontWeight: '500',
            }}
          >
            Save as draft (don't publish yet)
          </span>
        </label>

        {saveAsDraft && (
          <div style={{ marginTop: '12px' }}>
            <label
              style={{
                display: 'block',
                color: darkTheme.colors.textSecondary,
                fontSize: '13px',
                marginBottom: '8px',
              }}
            >
              Schedule for later (optional):
            </label>
            <input
              type="datetime-local"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
              style={{
                width: '100%',
                padding: '10px',
                background: darkTheme.colors.bgTertiary,
                border: `1px solid ${darkTheme.colors.borderColor}`,
                borderRadius: '8px',
                color: darkTheme.colors.textPrimary,
                fontSize: '14px',
              }}
            />
            <p
              style={{
                fontSize: '11px',
                color: darkTheme.colors.textSecondary,
                marginTop: '6px',
                fontStyle: 'italic',
              }}
            >
              Leave empty to save as draft without scheduling
            </p>
          </div>
        )}
      </div>
    </>
  );
}
