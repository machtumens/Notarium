import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import api from '../lib/api';
import { logger } from '../lib/logger';
import LoadingSpinner from '../components/LoadingSpinner';
import CameraCapture from '../components/CameraCapture';
import { compressImage, applyContrastEnhancement } from '../components/upload-note/helpers';
import { darkTheme } from '../theme';
import type { Subject } from '../types';

// CaptureNotePage — the standalone /notes/capture "quick capture" entry point.
// Flow: snap a single photo → OCR it → confirm a title + subject → create the
// note (HYBRID-DELAYED-CREATE: the record is created HERE, at confirm, the first
// point an id is both needed and available) → redirect into /notes/:id/process.
// Single-image only by design; the full multi-page upload flow lives elsewhere.

type CaptureStep = 'capture' | 'ocr' | 'confirm';

// Local response shape for POST /api/notes. The shared api.notes.create is typed
// as Promise<Note> but the backend actually nests the note under `.note`; we call
// api.request directly with this correct local type to avoid that mismatch.
interface CreateNoteResponse {
  note: { id: number; [key: string]: unknown };
  success: boolean;
}

const pageWrap: React.CSSProperties = {
  minHeight: '100vh',
  background: darkTheme.colors.bgPrimary,
  color: darkTheme.colors.textPrimary,
  padding: '32px 20px 64px',
};
const inner: React.CSSProperties = { maxWidth: '640px', margin: '0 auto' };
const card: React.CSSProperties = {
  background: darkTheme.colors.bgSecondary,
  border: `1px solid ${darkTheme.colors.borderColor}`,
  borderRadius: darkTheme.borderRadius.lg,
  padding: '24px',
};
const label: React.CSSProperties = {
  display: 'block',
  fontSize: '13px',
  fontWeight: 600,
  marginBottom: '6px',
  color: darkTheme.colors.textSecondary,
};
const field: React.CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  background: darkTheme.colors.bgTertiary,
  border: `1px solid ${darkTheme.colors.borderColor}`,
  borderRadius: darkTheme.borderRadius.md,
  color: darkTheme.colors.textPrimary,
  fontSize: '14px',
  outline: 'none',
  boxSizing: 'border-box',
  marginBottom: '20px',
};
const primaryBtn: React.CSSProperties = {
  padding: '12px 20px',
  background: darkTheme.colors.accent,
  border: 'none',
  color: '#fff',
  borderRadius: darkTheme.borderRadius.md,
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: '15px',
  transition: darkTheme.transitions.default,
};
const secondaryBtn: React.CSSProperties = {
  padding: '12px 20px',
  background: 'transparent',
  border: `1px solid ${darkTheme.colors.borderColor}`,
  color: darkTheme.colors.textPrimary,
  borderRadius: darkTheme.borderRadius.md,
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: '15px',
  transition: darkTheme.transitions.default,
};

export default function CaptureNotePage() {
  const navigate = useNavigate();

  const [step, setStep] = useState<CaptureStep>('capture');
  const [compressedImage, setCompressedImage] = useState<string | null>(null);
  const [extractedText, setExtractedText] = useState('');

  const [title, setTitle] = useState('');
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectId, setSubjectId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.subjects
      .getAll()
      .then((res) => {
        if (cancelled) return;
        setSubjects(res.subjects || []);
      })
      .catch((err) => {
        logger.error('capture', 'Failed to load subjects', err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handlePhoto = async (photoBase64: string) => {
    try {
      setStep('ocr');
      // Compress for storage; enhance (B&W + high contrast) purely to improve OCR.
      const compressed = await compressImage(photoBase64);
      const enhanced = await applyContrastEnhancement(compressed);
      setCompressedImage(compressed);
      const ocr = await api.ai.performOCR(enhanced, 'image/jpeg');
      setExtractedText(ocr.text || '');
      setStep('confirm');
    } catch (err) {
      logger.error('capture', 'OCR failed', err);
      toast.error('Could not read that photo. Please try capturing it again.');
      setStep('capture');
    }
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast.error('Please enter a title.');
      return;
    }
    if (!subjectId) {
      toast.error('Please choose a subject.');
      return;
    }
    if (!compressedImage) {
      toast.error('No captured image found. Please capture a photo first.');
      setStep('capture');
      return;
    }
    try {
      setSubmitting(true);
      // Direct request with the correct nested-`note` response type. Payload uses
      // the `images` array key — the field createNote is actually built around.
      const response = await api.request<CreateNoteResponse>('/api/notes', {
        method: 'POST',
        body: {
          title: title.trim(),
          subject_id: Number(subjectId),
          extracted_text: extractedText,
          images: [compressedImage],
        },
      });
      navigate(`/notes/${response.note.id}/process`, { replace: true });
    } catch (err) {
      logger.error('capture', 'Failed to create note', err);
      toast.error('Failed to save the note. Please try again.');
      setSubmitting(false);
    }
  };

  if (step === 'capture') {
    return (
      <CameraCapture
        title="Capture a note"
        facingMode="environment"
        onCapture={handlePhoto}
        onClose={() => navigate('/my-notes')}
      />
    );
  }

  if (step === 'ocr') {
    return (
      <div style={pageWrap}>
        <div style={inner}>
          <LoadingSpinner message="Reading your note..." />
        </div>
      </div>
    );
  }

  // step === 'confirm'
  return (
    <div style={pageWrap}>
      <div style={inner}>
        <h1
          style={{ fontSize: 'clamp(22px, 4vw, 30px)', fontWeight: 'bold', margin: '0 0 24px 0' }}
        >
          Confirm your note
        </h1>
        <div style={card}>
          <label style={label} htmlFor="capture-title">
            Title
          </label>
          <input
            id="capture-title"
            style={field}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Chapter 4 — Photosynthesis"
          />

          <label style={label} htmlFor="capture-subject">
            Subject
          </label>
          <select
            id="capture-subject"
            style={field}
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
          >
            <option value="">Choose a subject…</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          <div style={label}>Extracted text (from OCR)</div>
          <div
            style={{
              maxHeight: '200px',
              overflowY: 'auto',
              whiteSpace: 'pre-wrap',
              background: darkTheme.colors.bgTertiary,
              border: `1px solid ${darkTheme.colors.borderColor}`,
              borderRadius: darkTheme.borderRadius.md,
              padding: '14px',
              fontSize: '13px',
              lineHeight: 1.6,
              color: darkTheme.colors.textSecondary,
              marginBottom: '20px',
            }}
          >
            {extractedText.trim() ? extractedText : 'No text was detected in the photo.'}
          </div>

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <button style={primaryBtn} onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Saving…' : 'Save & Process'}
            </button>
            <button style={secondaryBtn} onClick={() => setStep('capture')} disabled={submitting}>
              Retake photo
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
