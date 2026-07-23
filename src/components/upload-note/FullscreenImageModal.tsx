interface FullscreenImageModalProps {
  images: string[];
  index: number;
  onClose: () => void;
  onNavigate: (updater: (prev: number | null) => number) => void;
}

export default function FullscreenImageModal({
  images,
  index,
  onClose,
  onNavigate,
}: FullscreenImageModalProps) {
  return (
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
      onClick={onClose}
    >
      <button
        onClick={onClose}
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

      {images.length > 1 && index > 0 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onNavigate((prev) => (prev !== null ? Math.max(0, prev - 1) : 0));
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

      {images.length > 1 && index < images.length - 1 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onNavigate((prev) =>
              prev !== null ? Math.min(images.length - 1, prev + 1) : images.length - 1,
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

      <img
        src={images[index]}
        alt={`Page ${index + 1} Fullscreen`}
        style={{
          maxWidth: '90vw',
          maxHeight: '85vh',
          objectFit: 'contain',
          borderRadius: '12px',
        }}
        onClick={(e) => e.stopPropagation()}
      />

      {images.length > 1 && (
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
          Page {index + 1} of {images.length}
        </div>
      )}
    </div>
  );
}
