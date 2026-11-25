class KikuCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this._ratio = sampleRate / 16000;
    this._chunk = 640;
    this._acc = new Int16Array(this._chunk);
    this._n = 0;
    this._pos = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    while (this._pos < ch.length) {
      const i = this._pos | 0;
      const frac = this._pos - i;
      const a = ch[i];
      const b = i + 1 < ch.length ? ch[i + 1] : a;
      const s = a + (b - a) * frac;
      const c = s < -1 ? -1 : s > 1 ? 1 : s;
      this._acc[this._n++] = c < 0 ? c * 0x8000 : c * 0x7fff;
      if (this._n === this._chunk) {
        this.port.postMessage(this._acc.buffer, [this._acc.buffer]);
        this._acc = new Int16Array(this._chunk);
        this._n = 0;
      }
      this._pos += this._ratio;
    }
    this._pos -= ch.length;
    return true;
  }
}
registerProcessor('kiku-capture', KikuCapture);
