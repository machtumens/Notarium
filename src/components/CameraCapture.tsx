import { useState, useRef, useEffect } from 'react';
import { getCameraStream, capturePhotoFromVideo, stopMediaStream } from '../utils/camera';
import { darkTheme } from '../theme';
import LoadingSpinner from './LoadingSpinner';
import { logger } from '../lib/logger';

interface CameraCaptureProps {
  onCapture: (photoBase64: string) => void;
  onClose: () => void;
  title?: string;
  facingMode?: 'user' | 'environment';
}

export default function CameraCapture({
  onCapture,
  onClose,
  title = 'Capture Photo',
  facingMode = 'environment',
}: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 10, y: 10, width: 80, height: 80 }); // percentage-based crop
  const [isDragging, setIsDragging] = useState<'tl' | 'tr' | 'bl' | 'br' | null>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Ensure video element is mounted before starting camera
    const timer = setTimeout(() => {
      // eslint-disable-next-line react-hooks/immutability -- startCamera is a stable component function referenced by the mount effect; behavior-preserving
      startCamera();
    }, 100);

    return () => {
      clearTimeout(timer);
      if (cameraStream) {
        stopMediaStream(cameraStream);
      }
    };
  }, []);

  const startCamera = async () => {
    try {
      setError(null);

      if (!videoRef.current) {
        throw new Error('Video element ref not available');
      }

      const video = videoRef.current;

      const stream = await getCameraStream({ facingMode });
      logger.debug('camera', '✓ Stream acquired');

      stream.getTracks().forEach((track) => {
        if (!track.enabled) track.enabled = true;
      });

      // IMPORTANT: Set srcObject BEFORE defining event handlers
      video.srcObject = stream;

      let canPlayFired = false;
      video.oncanplay = () => {
        if (!canPlayFired) {
          canPlayFired = true;
          logger.debug('camera', '✓ canplay fired', video.videoWidth, 'x', video.videoHeight);
        }
      };

      video.onloadedmetadata = () => {
        logger.debug('camera', '✓ Metadata loaded:', video.videoWidth, 'x', video.videoHeight);
      };

      video.onplay = null;
      video.onplaying = null;

      try {
        await video.play();
      } catch (e) {
        logger.debug('camera', 'play() deferred to autoPlay');
      }

      setCameraStream(stream);
      setLoading(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to access camera';
      logger.error('camera', message);
      setError(message);
      setLoading(false);
    }
  };

  const handleCapture = () => {
    if (!videoRef.current || !cameraStream) {
      setError('Camera not ready - please wait for stream to load');
      return;
    }

    try {
      const video = videoRef.current;

      // Check if video is actually playing before capture
      if (video.paused) {
        logger.warn('capture', 'Video paused before capture');
        setError('Waiting for camera stream to play...');
        return;
      }

      if (video.videoWidth === 0 || video.videoHeight === 0) {
        logger.warn(
          'capture',
          'Video dimensions not ready:',
          video.videoWidth,
          'x',
          video.videoHeight,
        );
        setError('Camera stream not ready - no video dimensions');
        return;
      }

      logger.debug('capture', '✓ Taking photo', video.videoWidth, 'x', video.videoHeight);

      const photoBase64 = capturePhotoFromVideo(video);
      logger.debug('capture', '✓ Photo captured, size:', photoBase64.length, 'bytes');
      setPreview(photoBase64);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to capture photo';
      logger.error('capture', message);
      setError(message);
    }
  };

  const applyCrop = (imageBase64: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        // Calculate crop dimensions in pixels
        const cropX = (crop.x / 100) * img.width;
        const cropY = (crop.y / 100) * img.height;
        const cropWidth = (crop.width / 100) * img.width;
        const cropHeight = (crop.height / 100) * img.height;

        // Set canvas to crop dimensions
        canvas.width = cropWidth;
        canvas.height = cropHeight;

        // Draw cropped portion
        ctx.drawImage(
          img,
          cropX,
          cropY,
          cropWidth,
          cropHeight, // source rectangle
          0,
          0,
          cropWidth,
          cropHeight, // destination rectangle
        );

        resolve(canvas.toDataURL('image/jpeg', 0.95));
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = imageBase64;
    });
  };

  const handleConfirm = async () => {
    if (preview) {
      try {
        const croppedImage = await applyCrop(preview);
        await onCapture(croppedImage);
        handleClose();
      } catch (error) {
        logger.error('camera', 'Failed to crop image:', error);
        setError('Failed to crop image');
      }
    }
  };

  const handleConfirmAndContinue = async () => {
    if (preview) {
      try {
        const croppedImage = await applyCrop(preview);
        await onCapture(croppedImage);
        setPreview(null); // Reset to camera view for another photo
        setCrop({ x: 10, y: 10, width: 80, height: 80 }); // Reset crop
      } catch (error) {
        logger.error('camera', 'Failed to crop image:', error);
        setError('Failed to crop image');
      }
    }
  };

  const handleRetake = () => {
    setPreview(null);
    setCrop({ x: 10, y: 10, width: 80, height: 80 }); // Reset crop
  };

  const handleMouseDown = (
    corner: 'tl' | 'tr' | 'bl' | 'br',
    e: React.MouseEvent | React.TouchEvent,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(corner);
  };

  const handleMouseMove = (
    e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>,
  ) => {
    if (!isDragging || !previewContainerRef.current) return;

    const rect = previewContainerRef.current.getBoundingClientRect();

    // Handle both mouse and touch events
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;

    setCrop((prevCrop) => {
      const newCrop = { ...prevCrop };

      switch (isDragging) {
        case 'tl': // Top-left
          newCrop.width = Math.max(20, prevCrop.width + (prevCrop.x - x));
          newCrop.height = Math.max(20, prevCrop.height + (prevCrop.y - y));
          newCrop.x = Math.max(0, Math.min(x, prevCrop.x + prevCrop.width - 20));
          newCrop.y = Math.max(0, Math.min(y, prevCrop.y + prevCrop.height - 20));
          break;
        case 'tr': // Top-right
          newCrop.width = Math.max(20, x - prevCrop.x);
          newCrop.height = Math.max(20, prevCrop.height + (prevCrop.y - y));
          newCrop.y = Math.max(0, Math.min(y, prevCrop.y + prevCrop.height - 20));
          break;
        case 'bl': // Bottom-left
          newCrop.width = Math.max(20, prevCrop.width + (prevCrop.x - x));
          newCrop.height = Math.max(20, y - prevCrop.y);
          newCrop.x = Math.max(0, Math.min(x, prevCrop.x + prevCrop.width - 20));
          break;
        case 'br': // Bottom-right
          newCrop.width = Math.max(20, x - prevCrop.x);
          newCrop.height = Math.max(20, y - prevCrop.y);
          break;
      }

      // Ensure crop stays within bounds
      if (newCrop.x + newCrop.width > 100) newCrop.width = 100 - newCrop.x;
      if (newCrop.y + newCrop.height > 100) newCrop.height = 100 - newCrop.y;

      return newCrop;
    });
  };

  const handleMouseUp = () => {
    setIsDragging(null);
  };

  useEffect(() => {
    if (isDragging) {
      const handleGlobalMouseUp = () => setIsDragging(null);
      window.addEventListener('mouseup', handleGlobalMouseUp);
      window.addEventListener('touchend', handleGlobalMouseUp);
      return () => {
        window.removeEventListener('mouseup', handleGlobalMouseUp);
        window.removeEventListener('touchend', handleGlobalMouseUp);
      };
    }
  }, [isDragging]);

  const handleClose = () => {
    if (cameraStream) {
      stopMediaStream(cameraStream);
      setCameraStream(null);
    }
    onClose();
  };

  // Detect mobile for responsive sizing
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Calculate appropriate image height based on screen size using A4 page aspect ratio (210mm x 297mm = ~0.707)
  const calculatePageDimensions = () => {
    const maxWidth = isMobile ? window.innerWidth * 0.9 : 600;
    const maxHeight = isMobile ? window.innerHeight * 0.6 : window.innerHeight * 0.7;

    // A4 aspect ratio: width/height = 210/297 = 0.707
    const pageRatio = 210 / 297;

    // Calculate dimensions while maintaining page aspect ratio
    let width = maxWidth;
    let height = width / pageRatio;

    // If height exceeds max, recalculate based on height
    if (height > maxHeight) {
      height = maxHeight;
      width = height * pageRatio;
    }

    return { width, height };
  };

  const { width: imageWidth, height: imageHeight } = calculatePageDimensions();

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.95)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        padding: isMobile ? '12px' : '16px',
      }}
    >
      <div
        style={{
          background: darkTheme.colors.bgSecondary,
          borderRadius: darkTheme.borderRadius.lg,
          padding: isMobile ? '16px' : '24px',
          maxWidth: `${imageWidth + (isMobile ? 32 : 48)}px`,
          width: '100%',
          maxHeight: '95vh',
          display: 'flex',
          flexDirection: 'column',
          gap: isMobile ? '12px' : '16px',
          overflowY: 'auto',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexShrink: 0,
          }}
        >
          <h2
            style={{
              fontSize: isMobile ? '16px' : '20px',
              fontWeight: '600',
              margin: 0,
              color: darkTheme.colors.textPrimary,
            }}
          >
            {preview ? 'Confirm Photo' : title}
          </h2>
          <button
            onClick={handleClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: darkTheme.colors.textSecondary,
              cursor: 'pointer',
              fontSize: '24px',
              lineHeight: '1',
            }}
          >
            ✕
          </button>
        </div>

        {/* Video element - only show when NOT in preview mode */}
        {!preview && (
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              style={{
                display: 'block',
                width: `${imageWidth}px`,
                height: `${imageHeight}px`,
                background: 'black',
                borderRadius: darkTheme.borderRadius.md,
                objectFit: 'contain',
                margin: '0 auto',
              }}
            />

            {/* Loading overlay */}
            {loading && (
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'rgba(0, 0, 0, 0.7)',
                  borderRadius: darkTheme.borderRadius.md,
                  zIndex: 10,
                }}
              >
                <LoadingSpinner message="Initializing camera..." size="lg" />
              </div>
            )}

            {/* Error overlay */}
            {error && !loading && (
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'rgba(0, 0, 0, 0.9)',
                  borderRadius: darkTheme.borderRadius.md,
                  zIndex: 10,
                  flexDirection: 'column',
                  padding: '20px',
                }}
              >
                <div
                  style={{
                    color: '#fca5a5',
                    fontSize: '14px',
                    textAlign: 'center',
                    marginBottom: '16px',
                  }}
                >
                  {error}
                </div>
                <button
                  onClick={startCamera}
                  style={{
                    padding: '8px 16px',
                    background: darkTheme.colors.accent,
                    border: 'none',
                    color: 'white',
                    borderRadius: darkTheme.borderRadius.md,
                    cursor: 'pointer',
                    fontWeight: '500',
                  }}
                >
                  Retry Camera
                </button>
              </div>
            )}
          </div>
        )}

        {/* Capture button - shown only when not in error/loading and not in preview */}
        {!loading && !error && !preview && (
          <button
            onClick={handleCapture}
            style={{
              padding: isMobile ? '10px 20px' : '12px 24px',
              background: darkTheme.colors.accent,
              border: 'none',
              color: 'white',
              borderRadius: darkTheme.borderRadius.md,
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: isMobile ? '14px' : '16px',
              transition: darkTheme.transitions.default,
              width: '100%',
              flexShrink: 0,
            }}
            onMouseOver={(e) => (e.currentTarget.style.opacity = '0.9')}
            onMouseOut={(e) => (e.currentTarget.style.opacity = '1')}
          >
            📸 Capture Photo
          </button>
        )}

        {/* Preview mode - replaces video */}
        {preview && (
          <>
            <div
              ref={previewContainerRef}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onTouchMove={handleMouseMove}
              onTouchEnd={handleMouseUp}
              style={{
                position: 'relative',
                width: `${imageWidth}px`,
                height: `${imageHeight}px`,
                margin: '0 auto',
                cursor: isDragging ? 'crosshair' : 'default',
                userSelect: 'none',
                flexShrink: 0,
                touchAction: 'none',
              }}
            >
              <img
                src={preview}
                alt="Captured"
                draggable={false}
                style={{
                  width: '100%',
                  height: '100%',
                  borderRadius: darkTheme.borderRadius.md,
                  objectFit: 'contain',
                  background: 'black',
                  display: 'block',
                  pointerEvents: 'none',
                }}
              />

              {/* Dark overlay for non-cropped areas */}
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  pointerEvents: 'none',
                }}
              >
                {/* Top overlay */}
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: `${crop.y}%`,
                    background: 'rgba(0, 0, 0, 0.5)',
                  }}
                />

                {/* Bottom overlay */}
                <div
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: `${100 - crop.y - crop.height}%`,
                    background: 'rgba(0, 0, 0, 0.5)',
                  }}
                />

                {/* Left overlay */}
                <div
                  style={{
                    position: 'absolute',
                    top: `${crop.y}%`,
                    left: 0,
                    width: `${crop.x}%`,
                    height: `${crop.height}%`,
                    background: 'rgba(0, 0, 0, 0.5)',
                  }}
                />

                {/* Right overlay */}
                <div
                  style={{
                    position: 'absolute',
                    top: `${crop.y}%`,
                    right: 0,
                    width: `${100 - crop.x - crop.width}%`,
                    height: `${crop.height}%`,
                    background: 'rgba(0, 0, 0, 0.5)',
                  }}
                />
              </div>

              {/* Crop box border */}
              <div
                style={{
                  position: 'absolute',
                  left: `${crop.x}%`,
                  top: `${crop.y}%`,
                  width: `${crop.width}%`,
                  height: `${crop.height}%`,
                  border: '2px dotted #9ca3af',
                  boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0)',
                  pointerEvents: 'none',
                }}
              >
                {/* Grid lines for rule of thirds */}
                <div
                  style={{
                    position: 'absolute',
                    top: '33.33%',
                    left: 0,
                    right: 0,
                    height: '1px',
                    background: 'rgba(156, 163, 175, 0.3)',
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    top: '66.66%',
                    left: 0,
                    right: 0,
                    height: '1px',
                    background: 'rgba(156, 163, 175, 0.3)',
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    left: '33.33%',
                    width: '1px',
                    background: 'rgba(156, 163, 175, 0.3)',
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    left: '66.66%',
                    width: '1px',
                    background: 'rgba(156, 163, 175, 0.3)',
                  }}
                />
              </div>

              {/* Corner handles */}
              {['tl', 'tr', 'bl', 'br'].map((corner) => {
                const isTopLeft = corner === 'tl';
                const isTopRight = corner === 'tr';
                const isBottomLeft = corner === 'bl';
                const isBottomRight = corner === 'br';

                return (
                  <div
                    key={corner}
                    onMouseDown={(e) => handleMouseDown(corner as any, e)}
                    onTouchStart={(e) => handleMouseDown(corner as any, e)}
                    style={{
                      position: 'absolute',
                      left: isTopLeft || isBottomLeft ? `${crop.x}%` : `${crop.x + crop.width}%`,
                      top: isTopLeft || isTopRight ? `${crop.y}%` : `${crop.y + crop.height}%`,
                      width: isMobile ? '32px' : '24px',
                      height: isMobile ? '32px' : '24px',
                      background: '#9ca3af',
                      border: '3px solid white',
                      borderRadius: '50%',
                      transform: 'translate(-50%, -50%)',
                      cursor: `${corner === 'tl' || corner === 'br' ? 'nwse' : 'nesw'}-resize`,
                      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
                      zIndex: 10,
                      transition: isDragging === corner ? 'none' : 'all 0.2s',
                      touchAction: 'none',
                    }}
                  />
                );
              })}

              {/* Instruction text */}
              <div
                style={{
                  position: 'absolute',
                  bottom: '10px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  background: 'rgba(0, 0, 0, 0.7)',
                  color: 'white',
                  padding: '6px 12px',
                  borderRadius: '20px',
                  fontSize: '12px',
                  fontWeight: '500',
                  pointerEvents: 'none',
                  whiteSpace: 'nowrap',
                }}
              >
                Drag corners to adjust crop area
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                gap: '8px',
                flexShrink: 0,
                flexDirection: isMobile ? 'column' : 'row',
                marginTop: '16px',
              }}
            >
              <button
                onClick={handleRetake}
                style={{
                  flex: isMobile ? undefined : 1,
                  padding: isMobile ? '10px 16px' : '12px 24px',
                  background: darkTheme.colors.bgTertiary,
                  border: `1px solid ${darkTheme.colors.borderColor}`,
                  color: darkTheme.colors.textPrimary,
                  borderRadius: darkTheme.borderRadius.md,
                  cursor: 'pointer',
                  fontWeight: '600',
                  fontSize: isMobile ? '13px' : '15px',
                  transition: darkTheme.transitions.default,
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = darkTheme.colors.bgSecondary;
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = darkTheme.colors.bgTertiary;
                  e.currentTarget.style.borderColor = darkTheme.colors.borderColor;
                }}
              >
                🔄 Retake
              </button>
              <button
                onClick={handleConfirmAndContinue}
                style={{
                  flex: isMobile ? undefined : 1,
                  padding: isMobile ? '10px 16px' : '12px 24px',
                  background: 'rgba(34, 197, 94, 0.2)',
                  border: '1px solid rgba(34, 197, 94, 0.3)',
                  color: '#86efac',
                  borderRadius: darkTheme.borderRadius.md,
                  cursor: 'pointer',
                  fontWeight: '600',
                  fontSize: isMobile ? '13px' : '15px',
                  transition: darkTheme.transitions.default,
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = 'rgba(34, 197, 94, 0.3)';
                  e.currentTarget.style.borderColor = 'rgba(34, 197, 94, 0.5)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = 'rgba(34, 197, 94, 0.2)';
                  e.currentTarget.style.borderColor = 'rgba(34, 197, 94, 0.3)';
                }}
              >
                ➕ Add & Take Another
              </button>
              <button
                onClick={handleConfirm}
                style={{
                  flex: isMobile ? undefined : 1,
                  padding: isMobile ? '10px 16px' : '12px 24px',
                  background: darkTheme.colors.accent,
                  border: 'none',
                  color: 'white',
                  borderRadius: darkTheme.borderRadius.md,
                  cursor: 'pointer',
                  fontWeight: '600',
                  fontSize: isMobile ? '13px' : '15px',
                  transition: darkTheme.transitions.default,
                }}
                onMouseOver={(e) => (e.currentTarget.style.opacity = '0.9')}
                onMouseOut={(e) => (e.currentTarget.style.opacity = '1')}
              >
                ✓ Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
