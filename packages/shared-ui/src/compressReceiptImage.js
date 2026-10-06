/**
 * Loads an image from a Blob/File using createImageBitmap (with EXIF orientation support)
 * or HTMLImageElement fallback.
 */
async function loadImage(source) {
    if (typeof window !== 'undefined' && 'createImageBitmap' in window) {
        try {
            const bitmap = await createImageBitmap(source, {
                imageOrientation: 'from-image',
            });
            return {
                drawable: bitmap,
                width: bitmap.width,
                height: bitmap.height,
                cleanup: () => bitmap.close(),
            };
        }
        catch (_) {
            // Fallback to Image element if createImageBitmap fails
        }
    }
    return new Promise((resolve, reject) => {
        const img = new Image();
        const objectUrl = URL.createObjectURL(source);
        img.onload = () => {
            resolve({
                drawable: img,
                width: img.naturalWidth || img.width,
                height: img.naturalHeight || img.height,
                cleanup: () => URL.revokeObjectURL(objectUrl),
            });
        };
        img.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            reject(new Error('Failed to load image for canvas compression.'));
        };
        img.src = objectUrl;
    });
}
function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve) => {
        canvas.toBlob((blob) => resolve(blob), type, quality);
    });
}
/**
 * Compresses and squashes DuitNow payment receipts or transaction screenshots
 * to strictly under 200KB using the HTML5 Canvas API before uploading to Supabase Storage.
 */
export async function compressReceiptImage(file, options = {}) {
    const { maxSizeBytes = 200 * 1024, // 200 KB
    maxWidth = 1280, maxHeight = 1280, initialQuality = 0.85, minQuality = 0.25, } = options;
    if (file.size <= maxSizeBytes && file.type === 'image/jpeg') {
        if (file instanceof File)
            return file;
        return new File([file], 'receipt.jpg', {
            type: 'image/jpeg',
            lastModified: Date.now(),
        });
    }
    if (typeof document === 'undefined') {
        throw new Error('compressReceiptImage must be executed in a browser environment with Canvas support.');
    }
    const { drawable, width: origWidth, height: origHeight, cleanup } = await loadImage(file);
    try {
        let currentWidth = origWidth;
        let currentHeight = origHeight;
        if (currentWidth > maxWidth || currentHeight > maxHeight) {
            const scale = Math.min(maxWidth / currentWidth, maxHeight / currentHeight);
            currentWidth = Math.max(1, Math.round(currentWidth * scale));
            currentHeight = Math.max(1, Math.round(currentHeight * scale));
        }
        const canvas = document.createElement('canvas');
        let ctx = canvas.getContext('2d');
        if (!ctx) {
            throw new Error('Unable to initialize HTML5 2D canvas context.');
        }
        const redrawCanvas = (w, h) => {
            canvas.width = w;
            canvas.height = h;
            if (!ctx)
                return;
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, w, h);
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(drawable, 0, 0, w, h);
        };
        redrawCanvas(currentWidth, currentHeight);
        let currentQuality = initialQuality;
        let compressedBlob = null;
        let attempts = 0;
        const maxAttempts = 8;
        while (attempts < maxAttempts) {
            attempts++;
            compressedBlob = await canvasToBlob(canvas, 'image/jpeg', currentQuality);
            if (!compressedBlob) {
                throw new Error('Canvas failed to export image/jpeg Blob.');
            }
            if (compressedBlob.size <= maxSizeBytes) {
                break;
            }
            if (currentQuality > minQuality) {
                currentQuality = Math.max(minQuality, currentQuality - 0.15);
            }
            else {
                currentWidth = Math.max(100, Math.round(currentWidth * 0.85));
                currentHeight = Math.max(100, Math.round(currentHeight * 0.85));
                redrawCanvas(currentWidth, currentHeight);
                currentQuality = 0.65;
            }
        }
        if (!compressedBlob) {
            throw new Error('Failed to generate compressed receipt blob.');
        }
        const originalName = file instanceof File ? file.name : 'duitnow_receipt';
        const cleanBaseName = originalName.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
        const finalFileName = `${cleanBaseName || 'receipt'}.jpg`;
        return new File([compressedBlob], finalFileName, {
            type: 'image/jpeg',
            lastModified: Date.now(),
        });
    }
    finally {
        cleanup();
    }
}
