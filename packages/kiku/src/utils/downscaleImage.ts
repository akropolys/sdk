const MAX_EDGE = 1536;
const QUALITY = 0.85;

const SKIP_UNDER_BYTES = 300 * 1024;

function approxBytesOfDataURL(dataURL: string): number {
  const i = dataURL.indexOf(',');
  const b64 = i === -1 ? dataURL : dataURL.slice(i + 1);
  return Math.floor(b64.length * 0.75);
}

export async function downscaleImage(file: File): Promise<string> {
  const original = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(file);
  });

  if (file.type === 'image/gif' || file.type === 'image/svg+xml') return original;
  if (approxBytesOfDataURL(original) <= SKIP_UNDER_BYTES) return original;

  try {
    const bitmap = await createImageBitmap(file);
    try {
      const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
      const w = Math.max(1, Math.round(bitmap.width * scale));
      const h = Math.max(1, Math.round(bitmap.height * scale));

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const cx = canvas.getContext('2d');
      if (!cx) return original;
      cx.drawImage(bitmap, 0, 0, w, h);

      const keepPNG = file.type === 'image/png';
      const out = canvas.toDataURL(keepPNG ? 'image/png' : 'image/jpeg', QUALITY);

      return approxBytesOfDataURL(out) < approxBytesOfDataURL(original) ? out : original;
    } finally {
      bitmap.close?.();
    }
  } catch {
    return original;
  }
}
