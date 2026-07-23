import { useState, useRef, useEffect } from 'react';
import CameraCapture from './CameraCapture';
import api from '../lib/api';
import { logger } from '../lib/logger';
import { darkTheme } from '../theme';
import LoadingSpinner from './LoadingSpinner';
import { useAuth } from '../App';

interface Subject {
  id: number;
  name: string;
  icon: string;
  note_count: number;
}

interface UploadNoteModalProps {
  onClose: () => void;
  subjects: Subject[];
  onSuccess?: () => void;
  preselectedSubject?: number;
}

export default function UploadNoteModal({
  onClose,
  subjects,
  onSuccess,
  preselectedSubject,
}: UploadNoteModalProps) {
  const { user } = useAuth();
  const uploadMode = 'scan';
  const [uploadImages, setUploadImages] = useState<string[]>([]);
  const [showCamera, setShowCamera] = useState(false);
  const [extractedText, setExtractedText] = useState('');
  const [isProcessingOCR, setIsProcessingOCR] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [noteTitle, setNoteTitle] = useState('');
  const [manualTags, setManualTags] = useState('');
  const [suggestedTags, setSuggestedTags] = useState<string[]>([]);
  const [generatedSummary, setGeneratedSummary] = useState('');
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' && window.innerWidth < 768,
  );
  const [fullscreenImage, setFullscreenImage] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [ocrCompleted, setOcrCompleted] = useState(false);
  const [viewMode, setViewMode] = useState<'image' | 'text'>('image');
  const [saveAsDraft, setSaveAsDraft] = useState(false);
  const [scheduledDate, setScheduledDate] = useState('');
  const [visibility, setVisibility] = useState<'everyone' | 'class'>('everyone');
  const [selectedSubject, setSelectedSubject] = useState<number | undefined>(preselectedSubject);
  const [enhanceContrast, setEnhanceContrast] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const applyContrastEnhancement = (base64Image: string): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(base64Image);
          return;
        }

        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
          const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];

          const contrast = 1.5;
          const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
          const enhanced = factor * (gray - 128) + 128;

          const final = Math.max(0, Math.min(255, enhanced));

          data[i] = final;
          data[i + 1] = final;
          data[i + 2] = final;
          // Alpha stays the same
        }

        ctx.putImageData(imageData, 0, 0);
        const enhanced = canvas.toDataURL('image/jpeg', 0.95);
        logger.debug('upload', 'Applied B&W + high contrast enhancement');
        resolve(enhanced);
      };
      img.src = base64Image;
    });
  };

  const compressImage = (base64Image: string): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 1200;

        let width = img.width;
        let height = img.height;

        if (width > MAX_WIDTH || height > MAX_HEIGHT) {
          const ratio = Math.min(MAX_WIDTH / width, MAX_HEIGHT / height);
          width = width * ratio;
          height = height * ratio;
        }

        canvas.width = width;
        canvas.height = height;

        ctx?.drawImage(img, 0, 0, width, height);

        const compressed = canvas.toDataURL('image/jpeg', 0.8);

        logger.debug(
          'upload',
          `Compressed: ${Math.round((base64Image.length * 0.75) / 1024)}KB → ${Math.round((compressed.length * 0.75) / 1024)}KB`,
        );
        resolve(compressed);
      };
      img.src = base64Image;
    });
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);
    const newImages: string[] = [];
    let processedCount = 0;

    fileArray.forEach((file) => {
      const reader = new FileReader();
      reader.onloadend = async () => {
        if (typeof reader.result === 'string') {
          let processed = reader.result;
          if (enhanceContrast) {
            processed = await applyContrastEnhancement(processed);
          }
          const compressed = await compressImage(processed);
          newImages.push(compressed);
          processedCount++;

          if (processedCount === fileArray.length) {
            setUploadImages((prev) => {
              const allImages = [...prev, ...newImages];
              if (uploadMode === 'scan') {
                setTimeout(() => processImagesOCR(allImages), 100);
              }
              return allImages;
            });
          }
        }
      };
      reader.readAsDataURL(file);
    });

    event.target.value = '';
  };

  const handlePhotoCapture = async (photoBase64: string) => {
    setShowCamera(false);
    let processed = photoBase64;
    if (enhanceContrast) {
      processed = await applyContrastEnhancement(processed);
    }
    const compressed = await compressImage(processed);
    setUploadImages((prev) => {
      const newImages = [...prev, compressed];
      if (uploadMode === 'scan') {
        setTimeout(() => processImagesOCR(newImages), 100);
      }
      return newImages;
    });
  };

  const processImagesOCR = async (images: string[]) => {
    if (images.length === 0 || isProcessingOCR) {
      logger.debug('ocr', 'Skipping:', { imagesLength: images.length, isProcessingOCR });
      return;
    }

    logger.debug('ocr', 'Starting for', images.length, 'images');
    setIsProcessingOCR(true);
    setExtractedText('');
    setOcrCompleted(false);

    try {
      let combinedText = '';

      for (let i = 0; i < images.length; i++) {
        try {
          logger.debug('ocr', `Processing image ${i + 1}/${images.length}`);
          const result = await api.ai.performOCR(images[i], 'image/jpeg');

          if (result.success && result.text) {
            const pageMarker = i > 0 ? `\n\n--- Page ${i + 1} ---\n\n` : '';
            combinedText += pageMarker + result.text;

            setExtractedText(combinedText);
            logger.debug('ocr', `Page ${i + 1} done (${combinedText.length} chars)`);
          } else {
            logger.error('ocr', `Failed for page ${i + 1}:`, result);
          }
        } catch (pageError) {
          logger.error('ocr', `Error on page ${i + 1}:`, pageError);
          alert(
            `OCR Error on page ${i + 1}: ${pageError instanceof Error ? pageError.message : 'Unknown error'}`,
          );
        }
      }

      if (combinedText.length === 0) {
        alert(
          'OCR completed but no text was extracted. The image may be blank or the API key may be invalid.',
        );
      }

      setOcrCompleted(true);
      logger.debug('ocr', 'Complete, total chars:', combinedText.length);
    } catch (error) {
      logger.error('ocr', 'Error:', error);
      alert(`OCR failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsProcessingOCR(false);
    }
  };

  const generateQuickSummary = async (content: string, title: string): Promise<string> => {
    try {
      if (!content || content.trim().length === 0) {
        throw new Error('No content available to summarize. Please upload an image first.');
      }

      const response = await api.request('/api/gemini/quick-summary', {
        method: 'POST',
        body: {
          title: title || 'Untitled',
          content: content,
        },
      });

      if (!response.success || !response.summary) {
        throw new Error(response.error || 'Failed to generate summary');
      }

      return response.summary;
    } catch (error: unknown) {
      console.error('Summary generation error:', error);
      alert(
        `Summary Error: ${error instanceof Error ? error.message : 'Failed to generate summary. Please try again.'}`,
      );
      throw error;
    }
  };

  const generateAutoTags = async (content: string, title: string): Promise<string[]> => {
    try {
      const response = await api.request('/api/gemini/auto-tags', {
        method: 'POST',
        body: {
          title: title,
          content: content,
        },
      });
      return response.tags || [];
    } catch (error) {
      console.error('Tag generation error:', error);
      return [];
    }
  };

  const handleSubmit = async () => {
    if (!noteTitle || uploadImages.length === 0) {
      alert('Please fill in all required fields (Title and Image)');
      return;
    }

    if (!selectedSubject) {
      alert('Please select a subject before uploading.');
      return;
    }

    setIsSubmitting(true);
    try {
      const contentForSummary = extractedText;
      let quickSummary = generatedSummary;
      let autoTags = suggestedTags;

      if (contentForSummary && !quickSummary) {
        const [summary, tags] = await Promise.all([
          generateQuickSummary(contentForSummary, noteTitle),
          generateAutoTags(contentForSummary, noteTitle),
        ]);
        quickSummary = summary;
        autoTags = tags;
        setGeneratedSummary(summary);
        setSuggestedTags(tags);
      }

      const manualTagList = manualTags
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t);
      const finalTags = manualTagList.length > 0 ? manualTagList : autoTags;

      const MAX_SIZE_PER_NOTE = 900000;
      const imageChunks: string[][] = [];
      let currentChunk: string[] = [];
      let currentSize = 0;

      for (const image of uploadImages) {
        const imageSize = image.length * 0.75;

        if (currentChunk.length > 0 && currentSize + imageSize > MAX_SIZE_PER_NOTE) {
          imageChunks.push([...currentChunk]);
          currentChunk = [image];
          currentSize = imageSize;
        } else {
          currentChunk.push(image);
          currentSize += imageSize;
        }
      }

      if (currentChunk.length > 0) {
        imageChunks.push(currentChunk);
      }

      const numberOfNotes = imageChunks.length;

      const createdNotes = [];
      for (let i = 0; i < numberOfNotes; i++) {
        const imageChunk = imageChunks[i];

        const noteData = {
          title: noteTitle, // Same title for all parts
          description: quickSummary || 'No description available',
          subject_id: selectedSubject,
          extracted_text: extractedText || 'No extracted text',
          images: imageChunk, // Send all images in this chunk as array
          quick_summary: quickSummary,
          tags: finalTags,
          status: saveAsDraft ? 'draft' : 'published',
          scheduled_publish_at: saveAsDraft && scheduledDate ? scheduledDate : null,
          visibility: visibility,
        };

        const response = await api.request('/api/notes', {
          method: 'POST',
          body: noteData,
        });

        if (response.note) {
          createdNotes.push(response.note);
        }
      }

      if (createdNotes.length > 0) {
        const message =
          numberOfNotes > 1
            ? `Successfully created ${numberOfNotes} notes! (Auto-split due to size)`
            : saveAsDraft
              ? scheduledDate
                ? `Note saved as draft and scheduled for ${new Date(scheduledDate).toLocaleString()}!`
                : 'Note saved as draft!'
              : 'Note uploaded successfully!';
        alert(message);
        onSuccess?.();
        onClose();
      }
    } catch (error: unknown) {
      console.error('Submit Error:', error);
      alert(`Failed to upload note: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    const generateAISuggestions = async () => {
      if (noteTitle && extractedText && !generatedSummary && !isProcessingOCR) {
        logger.debug('ai', 'Auto-generating summary and tags');
        try {
          const [summary, tags] = await Promise.all([
            generateQuickSummary(extractedText, noteTitle),
            generateAutoTags(extractedText, noteTitle),
          ]);
          setGeneratedSummary(summary);
          setSuggestedTags(tags);
          logger.debug('ai', 'Auto-generation complete');
        } catch (error) {
          logger.error('ai', 'Error generating suggestions:', error);
          // Don't show alert for auto-generation - user can manually trigger
        }
      }
    };

    generateAISuggestions();
  }, [noteTitle, extractedText]);

  const canSubmit =
    noteTitle && uploadImages.length > 0 && selectedSubject && !isProcessingOCR && !isSubmitting;

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
        {/* Header */}
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

        {/* Upload Buttons */}
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

            {/* Contrast Enhancement Toggle */}
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
            {/* Add Another Page Button - Upload from device, available during OCR */}
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

        {/* Multi-Page Preview with Navigation */}
        {uploadImages.length > 0 && (
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

              {/* View Mode Toggle - Only show if OCR text exists */}
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
              {/* Show Image View or Text View based on viewMode */}
              {viewMode === 'image' ? (
                <>
                  {/* Previous Page Arrow */}
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

                  {/* Current Page Image - Clickable for fullscreen */}
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

                  {/* Next Page Arrow */}
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
                  {extractedText ||
                    'No text extracted yet. Click "Start OCR Scan" to extract text.'}
                </div>
              )}
            </div>

            {/* Action Buttons Row */}
            <div
              style={{
                marginTop: '8px',
                display: 'flex',
                gap: '8px',
                alignItems: 'center',
              }}
            >
              {/* Delete Current Page Button */}
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

              {/* Add Page Button - Opens camera, works during OCR */}
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
        )}

        {/* Scanning Indicator - Show while OCR is processing */}
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

        {/* Success message after OCR completes */}
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

        {/* Form Fields */}
        {/* Subject Picker - only show if no preselected subject */}
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

        {/* AI-Generated Summary Preview with Regenerate Button */}
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
                    // Error already shown by generateQuickSummary
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

        {/* Manual Tags Input */}
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
          {/* Preview of manual tags */}
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

        {/* AI-Suggested Tags - always shown when available */}
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

        {/* Visibility Toggle */}
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

        {/* Draft and Scheduling Options */}
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

        {/* Submit Button */}
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

      {/* Camera Modal */}
      {showCamera && (
        <CameraCapture
          onCapture={handlePhotoCapture}
          onClose={() => setShowCamera(false)}
          title="Take Photo of Note"
          facingMode="environment"
        />
      )}

      {/* Fullscreen Image Modal */}
      {fullscreenImage !== null && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.95)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
            flexDirection: 'column',
            gap: '20px',
          }}
          onClick={() => setFullscreenImage(null)}
        >
          {/* Close Button */}
          <button
            onClick={() => setFullscreenImage(null)}
            style={{
              position: 'absolute',
              top: '20px',
              right: '20px',
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '50%',
              width: '48px',
              height: '48px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: 'white',
              fontSize: '24px',
              zIndex: 2001,
            }}
          >
            ×
          </button>

          {/* Navigation Arrows */}
          {uploadImages.length > 1 && fullscreenImage > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setFullscreenImage((prev) => (prev !== null ? Math.max(0, prev - 1) : 0));
              }}
              style={{
                position: 'absolute',
                left: '20px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '50%',
                width: '56px',
                height: '56px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: 'white',
                fontSize: '24px',
                zIndex: 2001,
              }}
            >
              <i className="fas fa-chevron-left"></i>
            </button>
          )}

          {uploadImages.length > 1 && fullscreenImage < uploadImages.length - 1 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setFullscreenImage((prev) =>
                  prev !== null
                    ? Math.min(uploadImages.length - 1, prev + 1)
                    : uploadImages.length - 1,
                );
              }}
              style={{
                position: 'absolute',
                right: '20px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '50%',
                width: '56px',
                height: '56px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: 'white',
                fontSize: '24px',
                zIndex: 2001,
              }}
            >
              <i className="fas fa-chevron-right"></i>
            </button>
          )}

          {/* Image */}
          <img
            src={uploadImages[fullscreenImage]}
            alt={`Page ${fullscreenImage + 1} Fullscreen`}
            style={{
              maxWidth: '90vw',
              maxHeight: '85vh',
              objectFit: 'contain',
              borderRadius: '12px',
            }}
            onClick={(e) => e.stopPropagation()}
          />

          {/* Page Indicator */}
          {uploadImages.length > 1 && (
            <div
              style={{
                position: 'absolute',
                bottom: '20px',
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '24px',
                padding: '12px 24px',
                color: 'white',
                fontSize: '16px',
                fontWeight: '500',
                zIndex: 2001,
              }}
            >
              Page {fullscreenImage + 1} of {uploadImages.length}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
