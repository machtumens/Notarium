import CameraCapture from './CameraCapture';
import { darkTheme } from '../theme';
import { useUploadForm } from './upload-note/useUploadForm';
import NotePagesPreview from './upload-note/NotePagesPreview';
import NoteFormFields from './upload-note/NoteFormFields';
import FullscreenImageModal from './upload-note/FullscreenImageModal';
import type { UploadNoteModalProps } from './upload-note/types';

export default function UploadNoteModal({
  onClose,
  subjects,
  onSuccess,
  preselectedSubject,
}: UploadNoteModalProps) {
  const {
    uploadMode,
    uploadImages,
    setUploadImages,
    showCamera,
    setShowCamera,
    extractedText,
    setExtractedText,
    isProcessingOCR,
    isSubmitting,
    noteTitle,
    setNoteTitle,
    manualTags,
    setManualTags,
    suggestedTags,
    generatedSummary,
    setGeneratedSummary,
    setSuggestedTags,
    isMobile,
    fullscreenImage,
    setFullscreenImage,
    currentPage,
    setCurrentPage,
    setOcrCompleted,
    viewMode,
    setViewMode,
    saveAsDraft,
    setSaveAsDraft,
    scheduledDate,
    setScheduledDate,
    visibility,
    setVisibility,
    selectedSubject,
    setSelectedSubject,
    enhanceContrast,
    setEnhanceContrast,
    fileInputRef,
    handleImageUpload,
    handlePhotoCapture,
    handleSubmit,
    canSubmit,
  } = useUploadForm({ onClose, onSuccess, preselectedSubject });

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '16px',
      }}
    >
      <div
        style={{
          background: darkTheme.colors.bgPrimary,
          borderRadius: '16px',
          width: '100%',
          maxWidth: '600px',
          padding: isMobile ? '12px' : '32px',
          boxShadow: darkTheme.shadows.lg,
          maxHeight: '98vh',
          overflowY: 'auto',
          color: darkTheme.colors.textPrimary,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: isMobile ? '12px' : '24px',
            paddingBottom: isMobile ? '8px' : '16px',
            borderBottom: `1px solid ${darkTheme.colors.borderColor}`,
          }}
        >
          <h3
            style={{
              fontSize: isMobile ? '18px' : '24px',
              fontFamily: 'Playfair Display, serif',
              margin: 0,
            }}
          >
            Upload Note
          </h3>
          <button
            onClick={onClose}
            style={{
              fontSize: '24px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: darkTheme.colors.textSecondary,
            }}
          >
            ×
          </button>
        </div>

        {uploadImages.length === 0 ? (
          <div style={{ marginBottom: isMobile ? '12px' : '24px' }}>
            <button
              onClick={() => setShowCamera(true)}
              style={{
                width: '100%',
                padding: isMobile ? '20px' : '24px',
                background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '16px',
                cursor: 'pointer',
                fontSize: isMobile ? '16px' : '18px',
                fontWeight: '700',
                transition: 'all 0.3s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
                boxShadow: '0 4px 12px rgba(34, 197, 94, 0.3)',
                textTransform: 'uppercase',
                letterSpacing: '1px',
                marginBottom: '12px',
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 6px 16px rgba(34, 197, 94, 0.4)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(34, 197, 94, 0.3)';
              }}
            >
              <i className="fas fa-qrcode" style={{ fontSize: isMobile ? '24px' : '28px' }}></i>
              <span>Scan</span>
            </button>
            <div
              style={{
                textAlign: 'center',
                color: darkTheme.colors.textSecondary,
                fontSize: isMobile ? '11px' : '12px',
                marginBottom: '8px',
              }}
            >
              or
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                width: '100%',
                padding: isMobile ? '12px' : '14px',
                background: darkTheme.colors.bgSecondary,
                color: darkTheme.colors.textPrimary,
                border: `1px solid ${darkTheme.colors.borderColor}`,
                borderRadius: '12px',
                cursor: 'pointer',
                fontSize: isMobile ? '13px' : '14px',
                fontWeight: '500',
                transition: 'all 0.3s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = darkTheme.colors.bgTertiary;
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = darkTheme.colors.bgSecondary;
              }}
            >
              <i className="fas fa-upload" style={{ fontSize: isMobile ? '14px' : '16px' }}></i>
              <span>Upload from Device</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleImageUpload}
              style={{ display: 'none' }}
            />

            <div
              style={{
                marginTop: '16px',
                padding: isMobile ? '12px' : '14px',
                background: darkTheme.colors.bgTertiary,
                border: `1px solid ${darkTheme.colors.borderColor}`,
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
              }}
            >
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontSize: isMobile ? '13px' : '14px',
                    fontWeight: '600',
                    color: darkTheme.colors.textPrimary,
                    marginBottom: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <i className="fas fa-adjust"></i>
                  Enhance Contrast
                </div>
                <div
                  style={{
                    fontSize: isMobile ? '11px' : '12px',
                    color: darkTheme.colors.textSecondary,
                  }}
                >
                  Convert to B&W with high contrast for better readability (Recommended)
                </div>
              </div>
              <label
                style={{
                  position: 'relative',
                  display: 'inline-block',
                  width: '50px',
                  height: '26px',
                  flexShrink: 0,
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={enhanceContrast}
                  onChange={(e) => setEnhanceContrast(e.target.checked)}
                  style={{ opacity: 0, width: 0, height: 0 }}
                />
                <span
                  style={{
                    position: 'absolute',
                    cursor: 'pointer',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: enhanceContrast
                      ? darkTheme.colors.accent
                      : darkTheme.colors.borderColor,
                    transition: '0.3s',
                    borderRadius: '26px',
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      content: '""',
                      height: '20px',
                      width: '20px',
                      left: enhanceContrast ? '27px' : '3px',
                      bottom: '3px',
                      backgroundColor: 'white',
                      transition: '0.3s',
                      borderRadius: '50%',
                    }}
                  ></span>
                </span>
              </label>
            </div>
          </div>
        ) : (
          <div style={{ marginBottom: isMobile ? '12px' : '16px' }}>
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                width: '100%',
                padding: isMobile ? '12px' : '14px',
                background: darkTheme.colors.accent,
                color: 'white',
                border: 'none',
                borderRadius: '12px',
                cursor: 'pointer',
                fontSize: isMobile ? '13px' : '14px',
                fontWeight: '600',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = darkTheme.colors.accentHover;
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = darkTheme.colors.accent;
              }}
            >
              <i className="fas fa-image"></i>
              Upload Photo
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleImageUpload}
              style={{ display: 'none' }}
            />
          </div>
        )}

        {uploadImages.length > 0 && (
          <NotePagesPreview
            isMobile={isMobile}
            uploadMode={uploadMode}
            uploadImages={uploadImages}
            extractedText={extractedText}
            isProcessingOCR={isProcessingOCR}
            viewMode={viewMode}
            setViewMode={setViewMode}
            currentPage={currentPage}
            setCurrentPage={setCurrentPage}
            setFullscreenImage={setFullscreenImage}
            setUploadImages={setUploadImages}
            setExtractedText={setExtractedText}
            setOcrCompleted={setOcrCompleted}
            setShowCamera={setShowCamera}
          />
        )}

        {uploadMode === 'scan' && uploadImages.length > 0 && isProcessingOCR && (
          <div
            style={{
              marginBottom: isMobile ? '8px' : '12px',
              padding: isMobile ? '8px 12px' : '12px 16px',
              background: `${darkTheme.colors.accent}10`,
              border: `1px solid ${darkTheme.colors.accent}30`,
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <i
              className="fas fa-spinner fa-spin"
              style={{
                fontSize: isMobile ? '16px' : '18px',
                color: darkTheme.colors.accent,
                flexShrink: 0,
              }}
            ></i>
            <p
              style={{
                margin: 0,
                color: darkTheme.colors.accent,
                fontWeight: '500',
                fontSize: isMobile ? '12px' : '13px',
              }}
            >
              Scanning with AI OCR and cleaning text...
            </p>
          </div>
        )}

        {uploadMode === 'scan' && extractedText && !isProcessingOCR && (
          <div
            style={{
              marginBottom: isMobile ? '8px' : '12px',
              padding: isMobile ? '8px 12px' : '10px 14px',
              background: `${darkTheme.colors.accent}10`,
              border: `1px solid ${darkTheme.colors.accent}30`,
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <i
              className="fas fa-check-circle"
              style={{
                fontSize: isMobile ? '14px' : '16px',
                color: darkTheme.colors.accent,
                flexShrink: 0,
              }}
            ></i>
            <p
              style={{
                margin: 0,
                color: darkTheme.colors.textSecondary,
                fontSize: isMobile ? '11px' : '12px',
              }}
            >
              Text extracted and cleaned with AI. Use the Image/Text toggle above to view it.
            </p>
          </div>
        )}

        <NoteFormFields
          isMobile={isMobile}
          uploadMode={uploadMode}
          subjects={subjects}
          preselectedSubject={preselectedSubject}
          selectedSubject={selectedSubject}
          setSelectedSubject={setSelectedSubject}
          noteTitle={noteTitle}
          setNoteTitle={setNoteTitle}
          extractedText={extractedText}
          generatedSummary={generatedSummary}
          setGeneratedSummary={setGeneratedSummary}
          manualTags={manualTags}
          setManualTags={setManualTags}
          suggestedTags={suggestedTags}
          setSuggestedTags={setSuggestedTags}
          visibility={visibility}
          setVisibility={setVisibility}
          saveAsDraft={saveAsDraft}
          setSaveAsDraft={setSaveAsDraft}
          scheduledDate={scheduledDate}
          setScheduledDate={setScheduledDate}
        />

        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          style={{
            width: '100%',
            padding: isMobile ? '10px 16px' : '12px 24px',
            background: canSubmit
              ? saveAsDraft
                ? '#6366f1'
                : darkTheme.colors.accent
              : `${darkTheme.colors.accent}80`,
            color: 'white',
            border: 'none',
            borderRadius: '12px',
            cursor: canSubmit ? 'pointer' : 'not-allowed',
            fontSize: isMobile ? '14px' : '16px',
            fontWeight: '500',
            transition: 'all 0.3s',
            opacity: canSubmit ? 1 : 0.5,
            marginTop: '16px',
          }}
        >
          {isProcessingOCR
            ? 'Processing OCR...'
            : isSubmitting
              ? saveAsDraft
                ? 'Saving Draft...'
                : 'Uploading...'
              : saveAsDraft
                ? 'Save Draft'
                : 'Upload Note'}
        </button>
      </div>

      {showCamera && (
        <CameraCapture
          onCapture={handlePhotoCapture}
          onClose={() => setShowCamera(false)}
          title="Take Photo of Note"
          facingMode="environment"
        />
      )}

      {fullscreenImage !== null && (
        <FullscreenImageModal
          images={uploadImages}
          index={fullscreenImage}
          onClose={() => setFullscreenImage(null)}
          onNavigate={setFullscreenImage}
        />
      )}
    </div>
  );
}
