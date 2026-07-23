import api from '../../lib/api';
import { logger } from '../../lib/logger';

export const applyContrastEnhancement = (base64Image: string): Promise<string> => {
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
      }

      ctx.putImageData(imageData, 0, 0);
      const enhanced = canvas.toDataURL('image/jpeg', 0.95);
      logger.debug('upload', 'Applied B&W + high contrast enhancement');
      resolve(enhanced);
    };
    img.src = base64Image;
  });
};

export const compressImage = (base64Image: string): Promise<string> => {
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

export const generateQuickSummary = async (content: string, title: string): Promise<string> => {
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

export const generateAutoTags = async (content: string, title: string): Promise<string[]> => {
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
