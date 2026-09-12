import { useState, useRef, useEffect } from 'react';
import api from '../../lib/api';
import { logger } from '../../lib/logger';
import { useAuth } from '../../App';
import {
  applyContrastEnhancement,
  compressImage,
  generateQuickSummary,
  generateAutoTags,
} from './helpers';
import type { UploadNoteModalProps, ViewMode, Visibility } from './types';

export function useUploadForm({
  onClose,
  onSuccess,
  preselectedSubject,
}: Pick<UploadNoteModalProps, 'onClose' | 'onSuccess' | 'preselectedSubject'>) {
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
  // True when OCR ran but produced nothing usable — a failed call, or a
  // successful call over a blank page. Publishing is still allowed, but not
  // silently: an empty note is invisible to search and useless to the quiz
  // builder, so the user has to say yes to it.
  const [ocrFailed, setOcrFailed] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('image');
  const [saveAsDraft, setSaveAsDraft] = useState(false);
  const [scheduledDate, setScheduledDate] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('everyone');
  const [selectedSubject, setSelectedSubject] = useState<number | undefined>(preselectedSubject);
  const [enhanceContrast, setEnhanceContrast] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Mirrors uploadImages so the OCR trigger can read the full page list without
  // running inside a state updater — React invokes updaters twice under
  // StrictMode, which fired OCR (and billed the AI call) twice per page.
  const uploadImagesRef = useRef<string[]>([]);
  // Re-entrancy guard. The isProcessingOCR *state* cannot do this job: a second
  // trigger can arrive before React has committed the state update.
  const ocrRunningRef = useRef(false);

  useEffect(() => {
    uploadImagesRef.current = uploadImages;
  }, [uploadImages]);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
            const allImages = [...uploadImagesRef.current, ...newImages];
            uploadImagesRef.current = allImages;
            setUploadImages(allImages);
            if (uploadMode === 'scan') {
              processImagesOCR(allImages);
            }
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
    const newImages = [...uploadImagesRef.current, compressed];
    uploadImagesRef.current = newImages;
    setUploadImages(newImages);
    if (uploadMode === 'scan') {
      processImagesOCR(newImages);
    }
  };

  const processImagesOCR = async (images: string[]) => {
    if (images.length === 0 || ocrRunningRef.current) {
      logger.debug('ocr', 'Skipping:', {
        imagesLength: images.length,
        isProcessingOCR: ocrRunningRef.current,
      });
      return;
    }
    ocrRunningRef.current = true;

    logger.debug('ocr', 'Starting for', images.length, 'images');
    setIsProcessingOCR(true);
    setExtractedText('');
    setOcrCompleted(false);
    setOcrFailed(false);

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
        setOcrFailed(true);
        alert(
          'OCR completed but no text was extracted. The image may be blank or the API key may be invalid.',
        );
      }

      setOcrCompleted(true);
      logger.debug('ocr', 'Complete, total chars:', combinedText.length);
    } catch (error) {
      logger.error('ocr', 'Error:', error);
      setOcrFailed(true);
      alert(`OCR failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      ocrRunningRef.current = false;
      setIsProcessingOCR(false);
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

    if (isProcessingOCR) {
      alert('Still reading your pages — wait for that to finish, then upload.');
      return;
    }

    if (ocrFailed || !extractedText.trim()) {
      const proceed = window.confirm(
        'No text could be read from these pages, so this note will have no searchable ' +
          'content and cannot be used to build a test.\n\nUpload it anyway?',
      );
      if (!proceed) return;
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
          title: noteTitle,
          description: quickSummary || 'No description available',
          subject_id: selectedSubject,
          extracted_text: extractedText,
          images: imageChunk,
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
                ? // Deliberately device-local, not the student's display zone: this
                  // echoes back the value they just typed into a datetime-local
                  // input, and showing a different time than they entered would
                  // read as a bug. (Separately: scheduled_publish_at is sent as a
                  // zone-less local string — a real gap, but out of scope here.)
                  `Note saved as draft and scheduled for ${new Date(scheduledDate).toLocaleString()}!`
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
        }
      }
    };

    generateAISuggestions();
  }, [noteTitle, extractedText]);

  const canSubmit =
    noteTitle && uploadImages.length > 0 && selectedSubject && !isProcessingOCR && !isSubmitting;

  return {
    user,
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
    ocrCompleted,
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
  };
}
