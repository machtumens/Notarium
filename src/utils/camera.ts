import { logger } from '../lib/logger';

export interface CameraStreamOptions {
  facingMode?: 'user' | 'environment';
}

export interface CapturePhotoOptions {
  quality?: number;
  format?: 'image/jpeg' | 'image/png';
}

export async function getCameraStream(options: CameraStreamOptions = {}): Promise<MediaStream> {
  const { facingMode = 'environment' } = options;

  try {
    const constraints = [
      {
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      },
      {
        video: { facingMode },
        audio: false,
      },
      {
        video: {
          width: { min: 320 },
          height: { min: 240 },
        },
        audio: false,
      },
      {
        video: true,
        audio: false,
      },
    ];

    let lastError: Error | null = null;
    for (const constraint of constraints) {
      try {
        logger.debug('camera', 'Trying constraint:', JSON.stringify(constraint));
        const stream = await navigator.mediaDevices.getUserMedia(constraint);

        const videoTracks = stream.getVideoTracks();
        logger.debug('camera', '✓ Stream acquired', {
          tracks: videoTracks.length,
          active: stream.active,
        });

        if (videoTracks.length > 0) {
          const s = videoTracks[0].getSettings();
          logger.debug('camera', 'Track settings:', {
            width: s.width,
            height: s.height,
            frameRate: s.frameRate,
            facingMode: s.facingMode,
          });
        }

        return stream;
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
        logger.debug('camera', 'Constraint failed, trying next...', lastError.message);
      }
    }

    throw lastError || new Error('Failed to access camera with all constraint variations');
  } catch (error) {
    throw new Error(
      `Failed to access camera: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}

export function capturePhotoFromVideo(
  videoElement: HTMLVideoElement,
  options: CapturePhotoOptions = {},
): string {
  const { quality = 0.8, format = 'image/jpeg' } = options;

  logger.debug('capture', 'Video state:', {
    videoWidth: videoElement.videoWidth,
    videoHeight: videoElement.videoHeight,
    paused: videoElement.paused,
    readyState: videoElement.readyState,
  });

  if (videoElement.videoWidth === 0 || videoElement.videoHeight === 0) {
    throw new Error(
      `Video dimensions not available: ${videoElement.videoWidth}x${videoElement.videoHeight}`,
    );
  }

  const canvas = document.createElement('canvas');
  canvas.width = videoElement.videoWidth;
  canvas.height = videoElement.videoHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get canvas 2D context');
  }

  logger.debug('capture', 'Drawing to canvas:', canvas.width, 'x', canvas.height);
  ctx.drawImage(videoElement, 0, 0);

  const result = canvas.toDataURL(format, quality);
  logger.debug('capture', 'Image data size:', result.length, 'bytes');

  return result;
}

export function stopMediaStream(stream: MediaStream): void {
  stream.getTracks().forEach((track) => track.stop());
}

export function base64ToBlob(base64: string, mimeType: string = 'image/jpeg'): Blob {
  const byteCharacters = atob(base64.split(',')[1] || base64);
  const byteNumbers = new Array(byteCharacters.length);

  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }

  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
}

export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to convert blob to base64'));
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
