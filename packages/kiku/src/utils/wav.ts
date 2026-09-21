/**
 * Fast in-browser conversion of Float32Array PCM samples (24kHz Gemini output)
 * or Int16Array PCM samples (16kHz microphone input) into standard 16-bit mono PCM WAV Blobs.
 */

function writeAscii(view: DataView, offset: number, string: string): void {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

export function float32ToWav(chunks: Float32Array[], sampleRate = 24000): Blob {
  let totalLen = 0;
  for (const c of chunks) totalLen += c.length;
  const merged = new Float32Array(totalLen);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.length;
  }

  const buffer = new ArrayBuffer(44 + totalLen * 2);
  const view = new DataView(buffer);

  // RIFF chunk descriptor
  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + totalLen * 2, true);
  writeAscii(view, 8, 'WAVE');

  // fmt sub-chunk
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 = PCM)
  view.setUint16(22, 1, true); // NumChannels (1 = mono)
  view.setUint32(24, sampleRate, true); // SampleRate
  view.setUint32(28, sampleRate * 2, true); // ByteRate (SampleRate * 1 * 16 / 8)
  view.setUint16(32, 2, true); // BlockAlign (1 * 16 / 8)
  view.setUint16(34, 16, true); // BitsPerSample (16 bits)

  // data sub-chunk
  writeAscii(view, 36, 'data');
  view.setUint32(40, totalLen * 2, true);

  // Write 16-bit PCM samples
  let dataOffset = 44;
  for (let i = 0; i < totalLen; i++) {
    const s = Math.max(-1, Math.min(1, merged[i]));
    view.setInt16(dataOffset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    dataOffset += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

export function int16ToWav(chunks: Int16Array[], sampleRate = 16000): Blob {
  let totalLen = 0;
  for (const c of chunks) totalLen += c.length;
  const merged = new Int16Array(totalLen);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.length;
  }

  const buffer = new ArrayBuffer(44 + totalLen * 2);
  const view = new DataView(buffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + totalLen * 2, true);
  writeAscii(view, 8, 'WAVE');

  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);

  writeAscii(view, 36, 'data');
  view.setUint32(40, totalLen * 2, true);

  let dataOffset = 44;
  for (let i = 0; i < totalLen; i++) {
    view.setInt16(dataOffset, merged[i], true);
    dataOffset += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}
