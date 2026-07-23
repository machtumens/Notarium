import { useState, useEffect, useCallback } from 'react';

interface UseImagePaginationProps {
  images: string[];
}

export const useImagePagination = ({ images }: UseImagePaginationProps) => {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [imagePosition, setImagePosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const [isFullScreen, setIsFullScreen] = useState(false);

  const currentImage = images[currentImageIndex] || null;
  const hasMultipleImages = images.length > 1;
  const minSwipeDistance = 50;

  // Reset zoom when changing images
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: reset zoom/position when the displayed image changes; behavior-preserving
    setZoomLevel(1);
    setImagePosition({ x: 0, y: 0 });
  }, [currentImageIndex]);

  // Navigation handlers
  const goToPreviousImage = useCallback(() => {
    setCurrentImageIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
  }, [images.length]);

  const goToNextImage = useCallback(() => {
    setCurrentImageIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
  }, [images.length]);

  // Zoom handlers
  const handleZoomIn = useCallback(() => {
    setZoomLevel((prev) => Math.min(prev + 0.5, 4));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoomLevel((prev) => {
      const next = Math.max(prev - 0.5, 1);
      // Recenter once we drop back to (or below) 1.5x, matching prior behavior
      // which checked the pre-update zoom level of <= 1.5.
      if (prev <= 1.5) {
        setImagePosition({ x: 0, y: 0 });
      }
      return next;
    });
  }, []);

  const handleResetZoom = useCallback(() => {
    setZoomLevel(1);
    setImagePosition({ x: 0, y: 0 });
  }, []);

  // Drag handlers for zoomed images
  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoomLevel > 1) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - imagePosition.x, y: e.clientY - imagePosition.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && zoomLevel > 1) {
      setImagePosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Touch swipe handlers
  const onTouchStart = (e: React.TouchEvent) => {
    if (hasMultipleImages && zoomLevel === 1) {
      setTouchEnd(null);
      setTouchStart(e.targetTouches[0].clientX);
    }
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (hasMultipleImages && zoomLevel === 1) {
      setTouchEnd(e.targetTouches[0].clientX);
    }
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd || zoomLevel > 1) return;

    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isLeftSwipe) {
      goToNextImage();
    }
    if (isRightSwipe) {
      goToPreviousImage();
    }
  };

  // Keyboard navigation for fullscreen.
  // Wrapped in useCallback with only the values it actually reads so the global
  // keydown listener is not torn down / re-added on every zoom step. The zoom and
  // navigation handlers it calls are themselves stable (useCallback above).
  const handleKeyPress = useCallback(
    (e: KeyboardEvent) => {
      if (isFullScreen) {
        if (e.key === 'ArrowLeft') goToPreviousImage();
        if (e.key === 'ArrowRight') goToNextImage();
        if (e.key === 'Escape') setIsFullScreen(false);
        if (e.key === '+' || e.key === '=') handleZoomIn();
        if (e.key === '-') handleZoomOut();
        if (e.key === '0') handleResetZoom();
      }
    },
    [isFullScreen, goToPreviousImage, goToNextImage, handleZoomIn, handleZoomOut, handleResetZoom],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [handleKeyPress]);

  return {
    currentImage,
    currentImageIndex,
    hasMultipleImages,
    zoomLevel,
    imagePosition,
    isDragging,
    isFullScreen,
    goToPreviousImage,
    goToNextImage,
    handleZoomIn,
    handleZoomOut,
    handleResetZoom,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    setIsFullScreen,
  };
};
