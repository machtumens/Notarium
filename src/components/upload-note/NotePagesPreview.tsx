import { darkTheme } from '../../theme';
import type { ViewMode } from './types';

interface NotePagesPreviewProps {
  isMobile: boolean;
  uploadMode: string;
  uploadImages: string[];
  extractedText: string;
  isProcessingOCR: boolean;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  currentPage: number;
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
  setFullscreenImage: (index: number) => void;
  setUploadImages: (images: string[]) => void;
  setExtractedText: (text: string) => void;
  setOcrCompleted: (value: boolean) => void;
  setShowCamera: (value: boolean) => void;
}

export default function NotePagesPreview({
  isMobile,
  uploadMode,
  uploadImages,
  extractedText,
  isProcessingOCR,
  viewMode,
  setViewMode,
  currentPage,
  setCurrentPage,
  setFullscreenImage,
  setUploadImages,
  setExtractedText,
  setOcrCompleted,
  setShowCamera,
}: NotePagesPreviewProps) {
  return (
    <div style={{ marginBottom: isMobile ? '12px' : '16px' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '8px',
        }}
      >
        <label style={{ fontSize: isMobile ? '12px' : '14px', fontWeight: '500', margin: 0 }}>
          <i
            className="fas fa-images"
            style={{ color: darkTheme.colors.accent, marginRight: '8px' }}
          ></i>
          Note Pages ({uploadImages.length})
        </label>

        {uploadMode === 'scan' && extractedText && (
          <div
            style={{
              display: 'flex',
              gap: '4px',
              background: darkTheme.colors.bgSecondary,
              padding: '4px',
              borderRadius: '8px',
              border: `1px solid ${darkTheme.colors.borderColor}`,
            }}
          >
            <button
              onClick={() => setViewMode('image')}
              style={{
                padding: '6px 12px',
                background: viewMode === 'image' ? darkTheme.colors.accent : 'transparent',
                color: viewMode === 'image' ? 'white' : darkTheme.colors.textSecondary,
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: isMobile ? '11px' : '12px',
                fontWeight: '500',
                transition: 'all 0.2s',
              }}
            >
              <i className="fas fa-image" style={{ marginRight: '4px' }}></i>
              Image
            </button>
            <button
              onClick={() => setViewMode('text')}
              style={{
                padding: '6px 12px',
                background: viewMode === 'text' ? darkTheme.colors.accent : 'transparent',
                color: viewMode === 'text' ? 'white' : darkTheme.colors.textSecondary,
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: isMobile ? '11px' : '12px',
                fontWeight: '500',
                transition: 'all 0.2s',
              }}
            >
              <i className="fas fa-align-left" style={{ marginRight: '4px' }}></i>
              Text
            </button>
          </div>
        )}
      </div>
      <div
        style={{
          position: 'relative',
          background: `${darkTheme.colors.accent}10`,
          border: `1px solid ${darkTheme.colors.accent}30`,
          borderRadius: '12px',
          padding: '12px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        {viewMode === 'image' ? (
          <>
            {uploadImages.length > 1 && currentPage > 0 && (
              <button
                onClick={() => setCurrentPage((prev) => Math.max(0, prev - 1))}
                style={{
                  background: darkTheme.colors.accent,
                  border: 'none',
                  borderRadius: '8px',
                  width: '32px',
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: 'white',
                  fontSize: '14px',
                  flexShrink: 0,
                }}
              >
                <i className="fas fa-chevron-left"></i>
              </button>
            )}

            <div
              onClick={() => setFullscreenImage(currentPage)}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                cursor: 'pointer',
                gap: '8px',
              }}
            >
              <img
                src={uploadImages[currentPage]}
                alt={`Page ${currentPage + 1}`}
                style={{
                  width: '100%',
                  maxHeight: '150px',
                  objectFit: 'contain',
                  borderRadius: '8px',
                  border: `2px solid ${darkTheme.colors.accent}`,
                }}
              />
              <div style={{ fontSize: '12px', color: darkTheme.colors.textSecondary }}>
                Page {currentPage + 1} of {uploadImages.length} - Click to view fullscreen
              </div>
              {isProcessingOCR && (
                <div style={{ fontSize: '11px', color: darkTheme.colors.accent }}>
                  <i className="fas fa-spinner fa-spin"></i> Scanning...
                </div>
              )}
            </div>

            {uploadImages.length > 1 && currentPage < uploadImages.length - 1 && (
              <button
                onClick={() =>
                  setCurrentPage((prev) => Math.min(uploadImages.length - 1, prev + 1))
                }
                style={{
                  background: darkTheme.colors.accent,
                  border: 'none',
                  borderRadius: '8px',
                  width: '32px',
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: 'white',
                  fontSize: '14px',
                  flexShrink: 0,
                }}
              >
                <i className="fas fa-chevron-right"></i>
              </button>
            )}
          </>
        ) : (
          <div
            style={{
              flex: 1,
              padding: '12px',
              background: darkTheme.colors.bgPrimary,
              borderRadius: '8px',
              maxHeight: '200px',
              overflowY: 'auto',
              fontSize: isMobile ? '12px' : '13px',
              lineHeight: '1.6',
              whiteSpace: 'pre-wrap',
              fontFamily: 'monospace',
              color: darkTheme.colors.textPrimary,
            }}
          >
            {extractedText || 'No text extracted yet. Click "Start OCR Scan" to extract text.'}
          </div>
        )}
      </div>

      <div
        style={{
          marginTop: '8px',
          display: 'flex',
          gap: '8px',
          alignItems: 'center',
        }}
      >
        <button
          onClick={() => {
            const newImages = uploadImages.filter((_, idx) => idx !== currentPage);
            setUploadImages(newImages);
            if (newImages.length === 0) {
              setExtractedText('');
              setCurrentPage(0);
              setOcrCompleted(false);
            } else if (currentPage >= newImages.length) {
              setCurrentPage(newImages.length - 1);
            }
          }}
          style={{
            flex: 1,
            padding: '6px 12px',
            background: 'transparent',
            color: 'rgba(239, 68, 68, 0.8)',
            border: `1px solid rgba(239, 68, 68, 0.5)`,
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '11px',
            fontWeight: '500',
            transition: 'all 0.2s',
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.background = 'transparent';
          }}
        >
          <i className="fas fa-trash" style={{ marginRight: '6px' }}></i>
          Delete
        </button>

        <button
          onClick={() => setShowCamera(true)}
          style={{
            flex: 1,
            padding: '6px 12px',
            background: darkTheme.colors.accent,
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '11px',
            fontWeight: '500',
            transition: 'all 0.2s',
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.background = darkTheme.colors.accentHover;
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.background = darkTheme.colors.accent;
          }}
        >
          <i className="fas fa-camera" style={{ marginRight: '6px' }}></i>
          Add Page
        </button>
      </div>
    </div>
  );
}
