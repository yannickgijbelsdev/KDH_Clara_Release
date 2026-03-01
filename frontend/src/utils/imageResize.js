const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

/**
 * Resize an image file to be under the max file size.
 * Uses canvas-based compression with progressive quality reduction.
 * @param {File} file - The image file to resize
 * @param {function} onProgress - Callback with progress 0-100
 * @returns {Promise<File>} - The resized file
 */
export async function resizeImage(file, onProgress) {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    const url = URL.createObjectURL(file);

    img.onload = async () => {
      URL.revokeObjectURL(url);

      try {
        let { width, height } = img;
        const originalWidth = width;
        const originalHeight = height;

        // Phase 1: Scale down dimensions if very large (0-40% progress)
        onProgress?.(5);
        const maxDimension = 2400;
        if (width > maxDimension || height > maxDimension) {
          const ratio = Math.min(maxDimension / width, maxDimension / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        onProgress?.(20);

        // Phase 2: Try different quality levels (40-90% progress)
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        // White background for transparency (PNG→JPEG conversion)
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        onProgress?.(40);

        // Always use JPEG for compression (PNG is lossless, quality param has no effect)
        const outputType = 'image/jpeg';
        let quality = 0.85;
        let blob = null;
        let attempts = 0;
        const maxAttempts = 10;

        while (attempts < maxAttempts) {
          blob = await new Promise(res => canvas.toBlob(res, outputType, quality));
          const progress = 40 + Math.round(((attempts + 1) / maxAttempts) * 50);
          onProgress?.(Math.min(progress, 90));

          if (blob.size <= MAX_FILE_SIZE) break;

          // Reduce quality first, then dimensions
          if (quality > 0.3) {
            quality -= 0.08;
          } else {
            // Further reduce dimensions
            width = Math.round(width * 0.75);
            height = Math.round(height * 0.75);
            canvas.width = width;
            canvas.height = height;
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);
            quality = 0.6;
          }
          attempts++;
        }

        onProgress?.(95);

        if (!blob || blob.size > MAX_FILE_SIZE) {
          reject(new Error('Could not resize image below 5MB'));
          return;
        }

        const baseName = file.name.replace(/\.[^.]+$/, '');
        const resizedFile = new File([blob], `${baseName}_resized.jpg`, {
          type: 'image/jpeg',
          lastModified: Date.now(),
        });

        onProgress?.(100);

        resolve({
          file: resizedFile,
          originalSize: file.size,
          newSize: resizedFile.size,
          originalDimensions: `${originalWidth}x${originalHeight}`,
          newDimensions: `${width}x${height}`,
        });
      } catch (err) {
        reject(err);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };

    img.src = url;
  });
}

export function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function isImageFile(file) {
  return file?.type?.startsWith('image/');
}

export function isOversized(file) {
  return file?.size > MAX_FILE_SIZE;
}

export { MAX_FILE_SIZE };
