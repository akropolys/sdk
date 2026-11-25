export function externalLinkGlass(w: number, h: number, phase: number) {
  const r = h / 2;
  const center = -90 + (w + 180) * ((phase - .08) / .7);
  const wave = (x: number): [number, number] => {
    if (phase < 0) return [0, 0];
    const d = (x - center) / 33;
    const envelope = 3.4 * Math.exp(-d * d / 2);
    return [envelope * Math.sin(d * 1.8),
      envelope / 33 * (1.8 * Math.cos(d * 1.8) - d * Math.sin(d * 1.8))];
  };
  const straight = w - 2 * r;
  const arc = Math.PI * r;
  const perimeter = 2 * (straight + arc);
  const point = (distance: number) => {
    let x: number, y: number, tx: number, ty: number;
    if (distance <= straight) {
      x = r + distance; y = 0; tx = 1; ty = 0;
    } else if (distance <= straight + arc) {
      const angle = (distance - straight) / r - Math.PI / 2;
      x = w - r + r * Math.cos(angle); y = r + r * Math.sin(angle);
      tx = -Math.sin(angle); ty = Math.cos(angle);
    } else if (distance <= 2 * straight + arc) {
      x = w - r - (distance - straight - arc); y = h; tx = -1; ty = 0;
    } else {
      const angle = (distance - 2 * straight - arc) / r + Math.PI / 2;
      x = r + r * Math.cos(angle); y = r + r * Math.sin(angle);
      tx = -Math.sin(angle); ty = Math.cos(angle);
    }
    const [offset, slope] = wave(x);
    return { x, y: 6 + y + offset, tx, ty: ty + slope * tx };
  };
  const segments = 96;
  const step = perimeter / segments;
  const format = (value: number) => value.toFixed(3);
  let previous = point(0);
  let d = `M${format(previous.x)},${format(previous.y)}`;
  for (let i = 1; i <= segments; i++) {
    const next = point(i * step);
    d += ` C${format(previous.x + previous.tx * step / 3)},${format(previous.y + previous.ty * step / 3)}`
      + ` ${format(next.x - next.tx * step / 3)},${format(next.y - next.ty * step / 3)}`
      + ` ${format(next.x)},${format(next.y)}`;
    previous = next;
  }
  d += ' Z';
  return { d, center };
}
