import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class ImageService {
  /**
   * Compress and resize an image file to base64 with size optimization
   * @param file - The image file to process
   * @param maxWidth - Maximum width for the resized image
   * @param maxHeight - Maximum height for the resized image
   * @param quality - Compression quality (0.1 to 1.0)
   * @returns Promise<string> - Base64 encoded image
   */
  async compressImage(
    file: File,
    maxWidth: number = 800,
    maxHeight: number = 800,
    quality: number = 0.8
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();

      img.onload = () => {
        // Calculate new dimensions
        const { width, height } = this.calculateDimensions(
          img.width,
          img.height,
          maxWidth,
          maxHeight
        );

        canvas.width = width;
        canvas.height = height;

        // Draw and compress
        ctx?.drawImage(img, 0, 0, width, height);

        // Convert to base64 with compression
        const compressedBase64 = canvas.toDataURL('image/jpeg', quality);
        resolve(compressedBase64);
      };

      img.onerror = () => reject(new Error('Failed to load image'));

      // Create object URL for the file
      const reader = new FileReader();
      reader.onload = (e) => {
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  }

  /**
   * Compress a data URL image
   * @param dataUrl - The image data URL to compress
   * @param maxWidth - Maximum width for the resized image
   * @param maxHeight - Maximum height for the resized image
   * @param quality - Compression quality (0.1 to 1.0)
   * @returns Promise<string> - Compressed base64 encoded image
   */
  async compressDataUrl(
    dataUrl: string,
    maxWidth: number = 800,
    maxHeight: number = 800,
    quality: number = 0.8
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();

      img.onload = () => {
        // Calculate new dimensions
        const { width, height } = this.calculateDimensions(
          img.width,
          img.height,
          maxWidth,
          maxHeight
        );

        canvas.width = width;
        canvas.height = height;

        // Draw and compress
        ctx?.drawImage(img, 0, 0, width, height);

        // Convert to base64 with compression
        const compressedBase64 = canvas.toDataURL('image/jpeg', quality);
        resolve(compressedBase64);
      };

      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = dataUrl;
    });
  }

  /**
   * Calculate optimal dimensions while maintaining aspect ratio
   */
  private calculateDimensions(
    originalWidth: number,
    originalHeight: number,
    maxWidth: number,
    maxHeight: number
  ): { width: number; height: number } {
    let { width, height } = { width: originalWidth, height: originalHeight };

    // Scale down if necessary
    if (width > maxWidth) {
      height = (height * maxWidth) / width;
      width = maxWidth;
    }

    if (height > maxHeight) {
      width = (width * maxHeight) / height;
      height = maxHeight;
    }

    return { width: Math.floor(width), height: Math.floor(height) };
  }

  /**
   * Convert file to base64 string
   */
  async fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });
  }

  /**
   * Validate image file type and size
   */
  validateImageFile(
    file: File,
    maxSizeMB: number = 10,
    allowedTypes: string[] = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
    ]
  ): { valid: boolean; error?: string } {
    // Check file type
    if (!allowedTypes.includes(file.type)) {
      return {
        valid: false,
        error: `Invalid file type. Allowed types: ${allowedTypes.join(', ')}`,
      };
    }

    // Check file size
    const fileSizeMB = file.size / 1024 / 1024;
    if (fileSizeMB > maxSizeMB) {
      return {
        valid: false,
        error: `File size too large. Maximum size: ${maxSizeMB}MB`,
      };
    }

    return { valid: true };
  }

  /**
   * Get optimized image size info
   */
  getImageSizeInfo(base64String: string): {
    sizeKB: number;
    sizeMB: number;
    estimatedFirestoreSize: number;
  } {
    // Calculate actual string size (base64 is ~33% larger than original)
    const sizeInBytes = base64String.length * 0.75;
    const sizeKB = sizeInBytes / 1024;
    const sizeMB = sizeKB / 1024;

    // Firestore has a 1MB document size limit
    const estimatedFirestoreSize = base64String.length;

    return {
      sizeKB: Math.round(sizeKB * 100) / 100,
      sizeMB: Math.round(sizeMB * 100) / 100,
      estimatedFirestoreSize,
    };
  }
}
