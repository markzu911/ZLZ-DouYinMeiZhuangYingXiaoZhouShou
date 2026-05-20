export async function compressImageToBase64(file: File, options?: { maxBytes?: number }): Promise<string> {
  const maxBytes = options?.maxBytes || 3.5 * 1024 * 1024; // Default to 3.5MB

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        let quality = 0.8;
        let scale = 1.0;

        const maxSizes = [1024, 768, 640];
        let sizeIndex = 0;

        const attemptCompression = () => {
          const maxSize = maxSizes[sizeIndex] || 512;
          
          if (width > maxSize || height > maxSize) {
            if (width > height) {
              height = Math.round((height * maxSize) / width);
              width = maxSize;
            } else {
              width = Math.round((width * maxSize) / height);
              height = maxSize;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            reject(new Error('无法创建 canvas 上下文'));
            return;
          }

          // Use white background in case of transparent PNG
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);

          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          
          // Rough estimation of size: base64 characters * 3/4
          const estimatedBytes = dataUrl.length * 0.75;
          
          if (estimatedBytes > maxBytes) {
            if (quality > 0.6) {
              quality -= 0.1;
              attemptCompression();
            } else if (sizeIndex < maxSizes.length - 1) {
              // Try next smaller dimension
              sizeIndex++;
              quality = 0.8; // reset quality for smaller dimension
              width = img.width; // reset width/height for next iteration calculations
              height = img.height;
              attemptCompression();
            } else {
              reject(new Error('图片过大，已无法继续压缩，请换一张更小的图片或裁剪后再试。'));
            }
          } else {
            resolve(dataUrl);
          }
        };

        attemptCompression();
      };
      img.onerror = () => reject(new Error('图片加载失败'));
    };
    reader.onerror = () => reject(new Error('图片读取失败'));
  });
}
