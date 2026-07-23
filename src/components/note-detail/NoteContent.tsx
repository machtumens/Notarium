import React, { useState } from 'react';
import { darkTheme } from '../../theme';
import { useImagePagination } from '../../hooks/useImagePagination';

interface NoteContentProps {
  title: string;
  description: string;
  content?: string;
  images: string[];
  tags?: string[];
  isMobile: boolean;
}

export const NoteContent: React.FC<NoteContentProps> = ({
  title,
  description,
  content,
  images,
  tags,
  isMobile,
}) => {
  const {
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
  } = useImagePagination({ images });

  return (
    <>
      {/* Note Image Header with Navigation */}
      {currentImage && (
        <div
          style={{
            height: currentImage.startsWith('data:') ? '400px' : '240px',
            background: currentImage.startsWith('data:')
              ? `url(${currentImage}) center/contain no-repeat ${darkTheme.colors.bgSecondary}`
              : `linear-gradient(135deg, ${darkTheme.colors.accent} 0%, #8b5cf6 100%)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: currentImage.startsWith('data:') ? '0' : '96px',
            borderBottom: `1px solid ${darkTheme.colors.borderColor}`,
            cursor: currentImage.startsWith('data:') ? 'zoom-in' : 'default',
            position: 'relative',
          }}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          {/* Show emoji only if no actual image */}
          {!currentImage.startsWith('data:') && currentImage}

          {/* Clickable overlay for zoom */}
          {currentImage.startsWith('data:') && (
            <div
              onClick={() => setIsFullScreen(true)}
              style={{
                position: 'absolute',
                inset: 0,
                cursor: 'zoom-in',
                transition: 'background 0.3s',
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = 'rgba(0,0,0,0.1)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            />
          )}

          {/* Navigation Arrows for Multiple Images */}
          {hasMultipleImages && currentImage.startsWith('data:') && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  goToPreviousImage();
                }}
                style={{
                  position: 'absolute',
                  left: '16px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'rgba(0,0,0,0.6)',
                  backdropFilter: 'blur(4px)',
                  border: 'none',
                  color: 'white',
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '20px',
                  transition: 'all 0.3s',
                  zIndex: 10,
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = 'rgba(0,0,0,0.8)';
                  e.currentTarget.style.transform = 'translateY(-50%) scale(1.1)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = 'rgba(0,0,0,0.6)';
                  e.currentTarget.style.transform = 'translateY(-50%) scale(1)';
                }}
              >
                <i className="fas fa-chevron-left"></i>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  goToNextImage();
                }}
                style={{
                  position: 'absolute',
                  right: '16px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'rgba(0,0,0,0.6)',
                  backdropFilter: 'blur(4px)',
                  border: 'none',
                  color: 'white',
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '20px',
                  transition: 'all 0.3s',
                  zIndex: 10,
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = 'rgba(0,0,0,0.8)';
                  e.currentTarget.style.transform = 'translateY(-50%) scale(1.1)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = 'rgba(0,0,0,0.6)';
                  e.currentTarget.style.transform = 'translateY(-50%) scale(1)';
                }}
              >
                <i className="fas fa-chevron-right"></i>
              </button>

              {/* Page Indicator */}
              <div
                style={{
                  position: 'absolute',
                  bottom: '16px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '8px',
                  pointerEvents: 'none',
                }}
              >
                <div
                  style={{
                    background: 'rgba(0,0,0,0.6)',
                    backdropFilter: 'blur(4px)',
                    borderRadius: '16px',
                    padding: '6px 16px',
                    color: 'white',
                    fontSize: '14px',
                    fontWeight: '600',
                  }}
                >
                  {currentImageIndex + 1} / {images.length}
                </div>

                {/* Dot indicators */}
                <div
                  style={{
                    display: 'flex',
                    gap: '8px',
                    alignItems: 'center',
                  }}
                >
                  {images.map((_, index) => (
                    <div
                      key={index}
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background:
                          index === currentImageIndex ? 'white' : 'rgba(255, 255, 255, 0.4)',
                        transition: 'all 0.3s',
                        boxShadow:
                          index === currentImageIndex ? '0 0 8px rgba(255, 255, 255, 0.6)' : 'none',
                      }}
                    />
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Fullscreen hint icon */}
          {currentImage.startsWith('data:') && (
            <div
              style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                background: 'rgba(0,0,0,0.6)',
                backdropFilter: 'blur(4px)',
                borderRadius: '8px',
                padding: '8px 12px',
                color: 'white',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                pointerEvents: 'none',
              }}
            >
              <i className="fas fa-expand"></i>
              <span style={{ fontSize: '12px' }}>Click to expand</span>
            </div>
          )}
        </div>
      )}

      {/* Content sections */}
      <div style={{ padding: '32px' }}>
        {/* Tags */}
        {tags && tags.length > 0 && (
          <div style={{ marginBottom: '24px' }}>
            <div
              style={{
                fontSize: '12px',
                fontWeight: '600',
                marginBottom: '8px',
                color: darkTheme.colors.textSecondary,
              }}
            >
              TOPICS
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {tags.map((tag) => (
                <span
                  key={tag}
                  style={{
                    background: `${darkTheme.colors.accent}20`,
                    border: `1px solid ${darkTheme.colors.accent}`,
                    color: darkTheme.colors.accent,
                    padding: '6px 14px',
                    borderRadius: '16px',
                    fontSize: '12px',
                    fontWeight: '500',
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Description */}
        <div style={{ marginBottom: '24px' }}>
          <h3
            style={{
              fontSize: '14px',
              fontWeight: '600',
              marginBottom: '8px',
              color: darkTheme.colors.textSecondary,
            }}
          >
            SUMMARY
          </h3>
          <p
            style={{
              fontSize: isMobile ? '13px' : '15px',
              lineHeight: '1.6',
              color: darkTheme.colors.textPrimary,
              margin: 0,
            }}
          >
            {description}
          </p>
        </div>

        {/* Full Content */}
        <div style={{ marginBottom: '24px' }}>
          <h3
            style={{
              fontSize: '14px',
              fontWeight: '600',
              marginBottom: '12px',
              color: darkTheme.colors.textSecondary,
            }}
          >
            EXTRACTED TEXT
          </h3>
          <div
            style={{
              background: darkTheme.colors.bgSecondary,
              border: `1px solid ${darkTheme.colors.borderColor}`,
              borderRadius: '12px',
              padding: '16px',
              fontSize: isMobile ? '13px' : '14px',
              lineHeight: '1.8',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              maxHeight: '500px',
              overflowY: 'auto',
              minHeight: '100px',
              color: darkTheme.colors.textPrimary,
            }}
          >
            {content ? (
              content
            ) : (
              <div
                style={{
                  color: darkTheme.colors.textSecondary,
                  fontStyle: 'italic',
                  textAlign: 'center',
                  padding: '20px',
                }}
              >
                <i
                  className="fas fa-info-circle"
                  style={{ fontSize: '24px', marginBottom: '12px', display: 'block' }}
                ></i>
                No extracted text available for this note
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Fullscreen Image Viewer */}
      {isFullScreen && currentImage && currentImage.startsWith('data:') && (
        <div
          onClick={(e) => {
            if (zoomLevel === 1 && e.target === e.currentTarget) {
              setIsFullScreen(false);
            }
          }}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.95)',
            backdropFilter: 'blur(8px)',
            zIndex: 2000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            cursor: isDragging ? 'grabbing' : zoomLevel > 1 ? 'grab' : 'default',
            overflow: 'hidden',
          }}
        >
          {/* Close button */}
          <button
            onClick={() => setIsFullScreen(false)}
            style={{
              position: 'absolute',
              top: '20px',
              right: '20px',
              background: 'rgba(255,255,255,0.2)',
              backdropFilter: 'blur(4px)',
              border: 'none',
              color: 'white',
              fontSize: '32px',
              width: '50px',
              height: '50px',
              borderRadius: '50%',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.3s',
              zIndex: 2002,
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.3)';
              e.currentTarget.style.transform = 'scale(1.1)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.2)';
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            ×
          </button>

          {/* Zoom Controls */}
          <div
            style={{
              position: 'absolute',
              top: '20px',
              left: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              zIndex: 2002,
            }}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleZoomIn();
              }}
              disabled={zoomLevel >= 4}
              style={{
                background: 'rgba(255,255,255,0.2)',
                backdropFilter: 'blur(4px)',
                border: 'none',
                color: 'white',
                fontSize: '20px',
                width: '50px',
                height: '50px',
                borderRadius: '50%',
                cursor: zoomLevel >= 4 ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.3s',
                opacity: zoomLevel >= 4 ? 0.5 : 1,
              }}
              onMouseOver={(e) => {
                if (zoomLevel < 4) {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.3)';
                  e.currentTarget.style.transform = 'scale(1.1)';
                }
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.2)';
                e.currentTarget.style.transform = 'scale(1)';
              }}
            >
              <i className="fas fa-plus"></i>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleZoomOut();
              }}
              disabled={zoomLevel <= 1}
              style={{
                background: 'rgba(255,255,255,0.2)',
                backdropFilter: 'blur(4px)',
                border: 'none',
                color: 'white',
                fontSize: '20px',
                width: '50px',
                height: '50px',
                borderRadius: '50%',
                cursor: zoomLevel <= 1 ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.3s',
                opacity: zoomLevel <= 1 ? 0.5 : 1,
              }}
              onMouseOver={(e) => {
                if (zoomLevel > 1) {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.3)';
                  e.currentTarget.style.transform = 'scale(1.1)';
                }
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.2)';
                e.currentTarget.style.transform = 'scale(1)';
              }}
            >
              <i className="fas fa-minus"></i>
            </button>
            {zoomLevel > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleResetZoom();
                }}
                style={{
                  background: 'rgba(255,255,255,0.2)',
                  backdropFilter: 'blur(4px)',
                  border: 'none',
                  color: 'white',
                  fontSize: '16px',
                  width: '50px',
                  height: '50px',
                  borderRadius: '50%',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.3s',
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.3)';
                  e.currentTarget.style.transform = 'scale(1.1)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.2)';
                  e.currentTarget.style.transform = 'scale(1)';
                }}
              >
                1:1
              </button>
            )}
          </div>

          {/* Navigation Arrows */}
          {hasMultipleImages && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  goToPreviousImage();
                }}
                style={{
                  position: 'absolute',
                  left: '20px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'rgba(255,255,255,0.2)',
                  backdropFilter: 'blur(4px)',
                  border: 'none',
                  color: 'white',
                  width: '60px',
                  height: '60px',
                  borderRadius: '50%',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '24px',
                  transition: 'all 0.3s',
                  zIndex: 2001,
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.3)';
                  e.currentTarget.style.transform = 'translateY(-50%) scale(1.1)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.2)';
                  e.currentTarget.style.transform = 'translateY(-50%) scale(1)';
                }}
              >
                <i className="fas fa-chevron-left"></i>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  goToNextImage();
                }}
                style={{
                  position: 'absolute',
                  right: '20px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'rgba(255,255,255,0.2)',
                  backdropFilter: 'blur(4px)',
                  border: 'none',
                  color: 'white',
                  width: '60px',
                  height: '60px',
                  borderRadius: '50%',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '24px',
                  transition: 'all 0.3s',
                  zIndex: 2001,
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.3)';
                  e.currentTarget.style.transform = 'translateY(-50%) scale(1.1)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.2)';
                  e.currentTarget.style.transform = 'translateY(-50%) scale(1)';
                }}
              >
                <i className="fas fa-chevron-right"></i>
              </button>
            </>
          )}

          {/* Full size image */}
          <img
            src={currentImage}
            alt={title}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={handleMouseDown}
            style={{
              maxWidth: zoomLevel === 1 ? '100%' : 'none',
              maxHeight: zoomLevel === 1 ? '100%' : 'none',
              width: zoomLevel > 1 ? `${zoomLevel * 100}%` : 'auto',
              objectFit: 'contain',
              borderRadius: '8px',
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
              transform: `translate(${imagePosition.x}px, ${imagePosition.y}px)`,
              transition: isDragging ? 'none' : 'transform 0.3s',
              cursor: zoomLevel > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default',
              userSelect: 'none',
              pointerEvents: zoomLevel > 1 ? 'auto' : 'none',
            }}
            draggable={false}
          />

          {/* Info Panel */}
          <div
            style={{
              position: 'absolute',
              bottom: '30px',
              left: '50%',
              transform: 'translateX(-50%)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '12px',
              pointerEvents: 'none',
            }}
          >
            <div
              style={{
                background: 'rgba(0,0,0,0.6)',
                backdropFilter: 'blur(4px)',
                color: 'white',
                padding: '12px 24px',
                borderRadius: '24px',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
              }}
            >
              {hasMultipleImages && (
                <span style={{ fontWeight: '600' }}>
                  {currentImageIndex + 1} / {images.length}
                </span>
              )}
              {zoomLevel > 1 && (
                <span style={{ fontWeight: '600' }}>{Math.round(zoomLevel * 100)}%</span>
              )}
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <i className="fas fa-info-circle"></i>
                {zoomLevel > 1 ? 'Drag to pan' : 'Use +/- to zoom'}
              </span>
            </div>

            {/* Dot indicators */}
            {hasMultipleImages && (
              <div
                style={{
                  display: 'flex',
                  gap: '10px',
                  alignItems: 'center',
                }}
              >
                {images.map((_, index) => (
                  <div
                    key={index}
                    style={{
                      width: '10px',
                      height: '10px',
                      borderRadius: '50%',
                      background:
                        index === currentImageIndex ? 'white' : 'rgba(255, 255, 255, 0.3)',
                      transition: 'all 0.3s',
                      boxShadow:
                        index === currentImageIndex ? '0 0 10px rgba(255, 255, 255, 0.8)' : 'none',
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};
