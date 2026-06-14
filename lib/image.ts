/**
 * Resize an uploaded image file on the client before sending to the server.
 * Keeps text highly legible for vision models while dramatically reducing
 * payload size, token usage, latency, and cost.
 */
export async function resizeImageToDataUrl(
  file: File,
  maxLongestSide = 1550,
  quality = 0.86
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;

        // Calculate new size (maintain aspect)
        if (width > height) {
          if (width > maxLongestSide) {
            height = Math.round((height * maxLongestSide) / width);
            width = maxLongestSide;
          }
        } else {
          if (height > maxLongestSide) {
            width = Math.round((width * maxLongestSide) / height);
            height = maxLongestSide;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d", { alpha: false });
        if (!ctx) {
          reject(new Error("Could not get canvas context"));
          return;
        }

        // Fast, good quality draw
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, width, height);

        // Prefer JPEG for smaller size on labels (text remains crisp at this res)
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        resolve(dataUrl);
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Convert a File to a data URL (used as fallback / for previews).
 */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
