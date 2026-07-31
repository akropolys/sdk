// Longest edge the widget will upload. The image model composites at 1024px, so
// anything past this is detail nothing downstream can use — it only costs upload
// time, request size and generation latency.
const MAX_EDGE = 1536;
const QUALITY = 0.85;

// Below this a re-encode is not worth the quality loss.
const SKIP_UNDER_BYTES = 300 * 1024;

function approxBytesOfDataURL(dataURL: string): number {
  const i = dataURL.indexOf(',');
  const b64 = i === -1 ? dataURL : dataURL.slice(i + 1);
  return Math.floor(b64.length * 0.75);
}

/**
 * Shrinks a photo before it ever leaves the browser.
 *
 * A phone photo is ~9MB, and base64 inflates it by a third — so ~12MB went up to
 * the backend and straight on to the image model inline, which blew the request
 * timeout. At 1536px it lands in the low hundreds of KB with no visible loss at
 * the size the result is generated and displayed.
 *
 * Transparency is preserved by keeping PNG for PNG input; everything else
 * becomes JPEG, which is far smaller for photographs.
 */
export async function downscaleImage(file: File): Promise<string> {
  const original = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(file);
  });

  // GIFs would lose animation, SVGs are already tiny and rasterising them loses
  // their scalability. Small files aren't worth re-encoding.
  if (file.type === 'image/gif' || file.type === 'image/svg+xml') return original;
  if (approxBytesOfDataURL(original) <= SKIP_UNDER_BYTES) return original;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const cx = canvas.getContext('2d');
    if (!cx) return original;
    cx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();

    const keepPNG = file.type === 'image/png';
    const out = canvas.toDataURL(keepPNG ? 'image/png' : 'image/jpeg', QUALITY);

    // A re-encode that grew the file is not an improvement — PNG screenshots do
    // this routinely.
    return approxBytesOfDataURL(out) < approxBytesOfDataURL(original) ? out : original;
  } catch {
    // Any failure (no createImageBitmap, tainted canvas, decode error) falls back
    // to the original: a large upload beats a broken one.
    return original;
  }
}
