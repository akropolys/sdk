// 4-bit IMA ADPCM blocks, byte-identical to the server's: int16 predictor, uint8 index, uint8 odd-flag, nibbles low-first.
const HEADER = 4;

const INDEX_TABLE = [-1, -1, -1, -1, 2, 4, 6, 8, -1, -1, -1, -1, 2, 4, 6, 8];

const STEP_TABLE = [
  7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31, 34, 37, 41, 45,
  50, 55, 60, 66, 73, 80, 88, 97, 107, 118, 130, 143, 157, 173, 190, 209, 230,
  253, 279, 307, 337, 371, 408, 449, 494, 544, 598, 658, 724, 796, 876, 963,
  1060, 1166, 1282, 1411, 1552, 1707, 1878, 2066, 2272, 2499, 2749, 3024, 3327,
  3660, 4026, 4428, 4871, 5358, 5894, 6484, 7132, 7845, 8630, 9493, 10442,
  11487, 12635, 13899, 15289, 16818, 18500, 20350, 22385, 24623, 27086, 29794,
  32767,
];

const clampIndex = (i: number) => (i < 0 ? 0 : i > 88 ? 88 : i);
const clampSample = (v: number) => (v < -32768 ? -32768 : v > 32767 ? 32767 : v);

export class AdpcmEncoder {
  private index = 0;

  encode(pcm: Int16Array): ArrayBuffer {
    const n = pcm.length;
    const out = new Uint8Array(HEADER + ((n + 1) >> 1));
    if (n === 0) return out.buffer;
    let pred = pcm[0];
    const view = new DataView(out.buffer);
    view.setInt16(0, pred, true);
    out[2] = this.index;
    out[3] = n & 1;
    let idx = this.index;
    for (let i = 0; i < n; i++) {
      let step = STEP_TABLE[idx];
      let diff = pcm[i] - pred;
      let nib = 0;
      if (diff < 0) { nib = 8; diff = -diff; }
      let vpdiff = step >> 3;
      if (diff >= step) { nib |= 4; diff -= step; vpdiff += step; }
      step >>= 1;
      if (diff >= step) { nib |= 2; diff -= step; vpdiff += step; }
      step >>= 1;
      if (diff >= step) { nib |= 1; vpdiff += step; }
      pred = clampSample(nib & 8 ? pred - vpdiff : pred + vpdiff);
      idx = clampIndex(idx + INDEX_TABLE[nib]);
      out[HEADER + (i >> 1)] |= nib << (4 * (i & 1));
    }
    this.index = idx;
    return out.buffer;
  }
}

export function decodeAdpcm(block: ArrayBuffer): Float32Array {
  const bytes = new Uint8Array(block);
  if (bytes.length < HEADER) return new Float32Array(0);
  let pred = new DataView(block).getInt16(0, true);
  let idx = clampIndex(bytes[2]);
  let n = (bytes.length - HEADER) * 2;
  if (bytes[3] & 1 && n > 0) n--;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const nib = (bytes[HEADER + (i >> 1)] >> (4 * (i & 1))) & 0xf;
    const step = STEP_TABLE[idx];
    let vpdiff = step >> 3;
    if (nib & 4) vpdiff += step;
    if (nib & 2) vpdiff += step >> 1;
    if (nib & 1) vpdiff += step >> 2;
    pred = clampSample(nib & 8 ? pred - vpdiff : pred + vpdiff);
    idx = clampIndex(idx + INDEX_TABLE[nib]);
    out[i] = pred / 32768;
  }
  return out;
}
