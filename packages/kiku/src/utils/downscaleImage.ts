const MAX_EDGE = 1536;
const QUALITY = 0.85;

const SKIP_UNDER_BYTES = 300 * 1024;

function readAsDataURL(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(blob);
  });
}

// Small files, GIFs and SVGs go as they are; anything larger is decoded at its sending size and encoded off the main thread, so picking a photo never stalls the page.
export async function downscaleImage(file: File): Promise<string> {
  if (file.type === 'image/gif' || file.type === 'image/svg+xml' || file.size <= SKIP_UNDER_BYTES) {
    return readAsDataURL(file);
  }
  try {
    const probe = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(probe.width, probe.height));
    const w = Math.max(1, Math.round(probe.width * scale));
    const h = Math.max(1, Math.round(probe.height * scale));
    probe.close?.();

    const bitmap = await createImageBitmap(file, { resizeWidth: w, resizeHeight: h, resizeQuality: 'high' });
    try {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const cx = canvas.getContext('2d');
      if (!cx) return readAsDataURL(file);
      cx.drawImage(bitmap, 0, 0);
      const keepPNG = file.type === 'image/png';
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, keepPNG ? 'image/png' : 'image/jpeg', QUALITY));
      if (!blob || blob.size >= file.size) return readAsDataURL(file);
      return readAsDataURL(blob);
    } finally {
      bitmap.close?.();
    }
  } catch {
    return readAsDataURL(file);
  }
}
