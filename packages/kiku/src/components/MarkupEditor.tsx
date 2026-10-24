import React, { useEffect, useRef, useState } from 'react';
import { buildMarkRegions, type MarkRegion } from '../utils/markRegions';

type Tool = 'pen' | 'eraser' | 'select' | 'pin';

interface Point { x: number; y: number }
interface StrokeAction { kind: 'stroke'; tool: 'pen' | 'eraser'; size: number; points: Point[] }
interface PinAction { kind: 'pin'; x: number; y: number; id: string; label: string; size: number }
type Action = StrokeAction | PinAction;
interface Selection { points: Point[]; closed: boolean }

const MARK_COLOR = '#ff5a5a';
const MAX_EXPORT_DIM = 1280;
const MAX_PINS = 4;
const PIN_LABEL_MAX = 80;

function wrapLabel(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

// Anchored to the nearer edge near the sides, so a long label never runs off the photo.
function labelPlacement(xPct: number, topPct: number): React.CSSProperties {
  const top = `${topPct}%`;
  if (xPct < 33) return { top, left: 8, transform: 'translateY(-100%)' };
  if (xPct > 67) return { top, right: 8, transform: 'translateY(-100%)' };
  return { top, left: `${xPct}%`, transform: 'translate(-50%, -100%)' };
}

export function MarkupEditor({ src, onCancel, onSend, t }: {
  src: string;
  onCancel: () => void;
  onSend: (dataUrl: string, instruction: string, marks: MarkRegion[], preview: string) => void;
  t: (key: string, vars?: Record<string, string>) => string;
}) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [tool, setTool] = useState<Tool>('pin');
  const nextPin = useRef(0);
  const [activePin, setActivePin] = useState<string | null>(null);
  const pinDrag = useRef<{ id: string; offset: Point } | null>(null);
  const [selectionHistory, setSelectionHistory] = useState<Selection[]>([{ points: [], closed: false }]);
  const selection = selectionHistory[selectionHistory.length - 1];
  const selectionId = useRef(`selection-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
  const vertexDrag = useRef<{ index: number; point: Point } | null>(null);
  const remember = (next: Selection) => setSelectionHistory(prev => [...prev.slice(-66), next]);
  const selecting = tool === 'select';
  const [actions, setActions] = useState<Action[]>([]);
  const [exportError, setExportError] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef<StrokeAction | null>(null);

  useEffect(() => {
    const el = new Image();
    el.crossOrigin = 'anonymous';
    el.onload = () => setImg(el);
    el.onerror = () => setLoadError(true);
    el.src = src;
    return () => { el.onload = null; el.onerror = null; };
  }, [src]);

  const dims = (() => {
    if (!img) return { w: 0, h: 0 };
    const scale = Math.min(1, MAX_EXPORT_DIM / Math.max(img.naturalWidth, img.naturalHeight));
    return { w: Math.round(img.naturalWidth * scale), h: Math.round(img.naturalHeight * scale) };
  })();

  const markLayer = useRef<HTMLCanvasElement | null>(null);
  const paint = (live?: StrokeAction | null) => {
    const canvas = canvasRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (!markLayer.current) markLayer.current = document.createElement('canvas');
    const layer = markLayer.current;
    layer.width = canvas.width;
    layer.height = canvas.height;
    const lctx = layer.getContext('2d')!;
    const all = live ? [...actions, live] : actions;
    for (const a of all) {
      if (a.kind !== 'stroke') continue;
      lctx.save();
      lctx.globalCompositeOperation = a.tool === 'eraser' ? 'destination-out' : 'source-over';
      lctx.strokeStyle = MARK_COLOR;
      lctx.lineWidth = a.tool === 'eraser' ? a.size * 3 : a.size;
      lctx.lineCap = 'round';
      lctx.lineJoin = 'round';
      lctx.beginPath();
      a.points.forEach((p, i) => (i === 0 ? lctx.moveTo(p.x, p.y) : lctx.lineTo(p.x, p.y)));
      if (a.points.length === 1) lctx.lineTo(a.points[0].x + 0.01, a.points[0].y);
      lctx.stroke();
      lctx.restore();
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    ctx.drawImage(layer, 0, 0);
    const visiblePoints = selection.points.map((p, i) => vertexDrag.current?.index === i ? vertexDrag.current.point : p);
    if (visiblePoints.length) {
      ctx.save();
      ctx.beginPath();
      visiblePoints.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
      if (selection.closed) { ctx.closePath(); ctx.fillStyle = '#22c55e33'; ctx.fill(); }
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = Math.max(2, dims.w / 400);
      ctx.stroke();
      ctx.restore();
    }
    for (const p of visiblePoints) {
      ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(3, dims.w / 260), 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.strokeStyle = '#15803d'; ctx.stroke();
    }
    for (const a of all) {
      if (a.kind !== 'pin') continue;
      const r = a.size;
      ctx.save();
      ctx.beginPath(); ctx.moveTo(a.x, a.y);
      ctx.bezierCurveTo(a.x - r * 2, a.y - r * 2, a.x - r, a.y - r * 3.5, a.x, a.y - r * 3.5);
      ctx.bezierCurveTo(a.x + r, a.y - r * 3.5, a.x + r * 2, a.y - r * 2, a.x, a.y);
      ctx.fillStyle = MARK_COLOR; ctx.fill(); ctx.lineWidth = Math.max(1, r / 7); ctx.strokeStyle = '#fff'; ctx.stroke();
      ctx.beginPath(); ctx.arc(a.x, a.y - r * 2.2, r * .5, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
      if (a.label) {
        ctx.font = `600 ${r * 1.2}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const lines = wrapLabel(ctx, a.label, canvas.width * 0.32);
        const lineH = r * 1.5;
        const w = Math.min(canvas.width, Math.max(...lines.map(l => ctx.measureText(l).width)) + r);
        const h = lines.length * lineH + r * .4;
        const x = Math.max(w / 2, Math.min(canvas.width - w / 2, a.x));
        const bottom = Math.max(h, a.y - r * 3.7);
        ctx.fillStyle = 'rgba(0,0,0,.8)'; ctx.fillRect(x - w / 2, bottom - h, w, h);
        ctx.fillStyle = '#fff';
        lines.forEach((l, i) => ctx.fillText(l, x, bottom - h + r * .2 + lineH * (i + .5), w - r));
      }
      ctx.restore();
    }
  };

  useEffect(() => { paint(); }, [img, actions, selection, dims.w, dims.h]);

  const toCanvasPoint = (e: React.PointerEvent): Point => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(canvas.width, ((e.clientX - rect.left) / rect.width) * canvas.width)),
      y: Math.max(0, Math.min(canvas.height, ((e.clientY - rect.top) / rect.height) * canvas.height)),
    };
  };

  const strokeSize = () => Math.max(4, Math.round(dims.w / 180));

  const removePin = (id: string) => {
    setActions(prev => prev.filter(a => a.kind !== 'pin' || a.id !== id));
    setActivePin(null);
  };

  // A tap away from an open label closes it; an unnamed pin goes with it.
  const closeActivePin = () => {
    const open = actions.find(a => a.kind === 'pin' && a.id === activePin);
    if (open?.kind === 'pin' && !open.label.trim()) removePin(open.id);
    else setActivePin(null);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!img) return;
    const p = toCanvasPoint(e);
    if (tool === 'pin') {
      const hit = actions.find(a => a.kind === 'pin' && Math.hypot(p.x - a.x, p.y - (a.y - a.size * 1.7)) < a.size * 2);
      if (hit?.kind === 'pin') {
        setActivePin(hit.id); e.currentTarget.setPointerCapture(e.pointerId);
        pinDrag.current = { id: hit.id, offset: { x: p.x - hit.x, y: p.y - hit.y } }; return;
      }
      if (activePin) { closeActivePin(); return; }
      if (actions.filter(a => a.kind === 'pin').length >= MAX_PINS) return;
      const id = `pin-${++nextPin.current}`;
      const size = Math.max(10, dims.w / canvasRef.current!.getBoundingClientRect().width * 9);
      setActions(prev => [...prev, { kind: 'pin', ...p, id, label: '', size }]);
      setActivePin(id); return;
    }
    if (tool === 'select') {
      const first = selection.points[0];
      const rect = canvasRef.current!.getBoundingClientRect();
      const hitRadius = 12 * dims.w / rect.width;
      if (!selection.closed && first && selection.points.length >= 3 && Math.hypot(p.x - first.x, p.y - first.y) < hitRadius) {
        remember({ ...selection, closed: true });
      } else {
        const index = selection.points.findIndex(v => Math.hypot(p.x - v.x, p.y - v.y) < hitRadius);
        if (index >= 0) { e.currentTarget.setPointerCapture(e.pointerId); vertexDrag.current = { index, point: p }; return; }
        if (selection.closed || selection.points.length >= 64) return;
        remember({ ...selection, points: [...selection.points, p] });
      }
      return;
    }
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drawingRef.current = { kind: 'stroke', tool, size: strokeSize(), points: [p] };
    paint(drawingRef.current);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (pinDrag.current) {
      const { id, offset } = pinDrag.current; const p = toCanvasPoint(e);
      setActions(prev => prev.map(a => a.kind === 'pin' && a.id === id ? { ...a, x: Math.max(0, Math.min(dims.w, p.x - offset.x)), y: Math.max(0, Math.min(dims.h, p.y - offset.y)) } : a));
      return;
    }
    if (vertexDrag.current) { vertexDrag.current.point = toCanvasPoint(e); paint(); return; }
    if (!drawingRef.current) return;
    drawingRef.current.points.push(toCanvasPoint(e));
    paint(drawingRef.current);
  };
  const onPointerUp = () => {
    if (pinDrag.current) { pinDrag.current = null; return; }
    if (vertexDrag.current) {
      const { index, point } = vertexDrag.current;
      vertexDrag.current = null;
      remember({ ...selection, points: selection.points.map((p, i) => i === index ? point : p) });
      return;
    }
    if (!drawingRef.current) return;
    const done = drawingRef.current;
    drawingRef.current = null;
    setActions(prev => [...prev, done]);
  };

  const pins = actions.filter((a): a is PinAction => a.kind === 'pin');
  const editingPin = pins.find(a => a.id === activePin);
  const canSend = !!img && !(selection.points.length > 0 && !selection.closed) &&
    pins.length > 0 && pins.every(p => p.label.trim());

  const handleSend = () => {
    if (!canSend || !img) return;
    try {
      const clean = document.createElement('canvas');
      clean.width = dims.w;
      clean.height = dims.h;
      const cctx = clean.getContext('2d');
      if (!cctx) { setExportError(true); return; }
      cctx.drawImage(img, 0, 0, dims.w, dims.h);
      const dataUrl = clean.toDataURL('image/jpeg', 0.92);
      const drawn = canvasRef.current?.toDataURL('image/jpeg', 0.85) || dataUrl;
      const marks = buildMarkRegions(actions, dims.w, dims.h);
      if (selection.closed) {
        const normX = (x: number) => Math.round(x / dims.w * 1000);
        const normY = (y: number) => Math.round(y / dims.h * 1000);
        marks.unshift({
          gesture: 'selection', id: selectionId.current,
          box: [
            normY(Math.min(...selection.points.map(p => p.y))), normX(Math.min(...selection.points.map(p => p.x))),
            normY(Math.max(...selection.points.map(p => p.y))), normX(Math.max(...selection.points.map(p => p.x))),
          ],
          points: selection.points.map(p => [normX(p.x), normY(p.y)]),
        });
      }
      onSend(dataUrl, pins.map(p => p.label.trim()).join('; '), marks, drawn);
    } catch {
      setExportError(true);
    }
  };

  const hint = tool === 'pin' ? 'markupPinHint' : tool === 'select'
    ? (selection.closed ? 'markupSelectedHint' : 'markupOutlineHint') : 'markupSketchHint';

  return (
    <div className="hsk-markup" role="dialog" aria-label={t('markupDialogLabel')}>
      <div className="hsk-markup-head">
        <span className="hsk-markup-title" role="status">{t(hint)}</span>
        <button className="hsk-markup-cancel" onClick={onCancel}>{t('markupCancel')}</button>
      </div>

      <div className="hsk-markup-stage">
        {loadError ? (
          <div className="hsk-markup-error">{t('markupLoadError')}</div>
        ) : !img ? (
          <div className="hsk-markup-loading">{t('markupLoading')}</div>
        ) : (
          <div className="hsk-markup-canvas-wrap">
            <canvas
              ref={canvasRef}
              width={dims.w}
              height={dims.h}
              className={`hsk-markup-canvas hsk-markup-canvas--${tool}`}
              style={{ touchAction: 'none', cursor: selecting || tool === 'pin' ? 'crosshair' : undefined }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={() => { pinDrag.current = null; vertexDrag.current = null; drawingRef.current = null; paint(); }}
            />
            {tool === 'pin' && editingPin && (
              <div
                className="hsk-markup-pinlabel"
                style={labelPlacement(editingPin.x / dims.w * 100, Math.max(12, (editingPin.y - editingPin.size * 4) / dims.h * 100))}
              >
                <input
                  autoFocus
                  aria-label={t('markupPinLabel')}
                  placeholder={t('markupPinLabelHint')}
                  value={editingPin.label}
                  maxLength={PIN_LABEL_MAX}
                  style={{ width: `${Math.min(34, Math.max(16, editingPin.label.length + 2))}ch` }}
                  onChange={e => setActions(prev => prev.map(a => a.kind === 'pin' && a.id === editingPin.id ? { ...a, label: e.target.value } : a))}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') closeActivePin(); }}
                />
                <button aria-label={t('markupRemovePin')} title={t('markupRemovePin')} onClick={() => removePin(editingPin.id)}>×</button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="hsk-markup-tools">
        <button className={`hsk-markup-tool${tool === 'pin' ? ' hsk-markup-tool--on' : ''}`} onClick={() => setTool('pin')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ verticalAlign: 'middle', marginInlineEnd: 5 }} aria-hidden="true"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
          {t('markupPin')}
        </button>
        <button className={`hsk-markup-tool${tool === 'select' ? ' hsk-markup-tool--on' : ''}`} onClick={() => { setActivePin(null); setTool('select'); }}>{t('markupSelect')}</button>
        <button className="hsk-markup-tool" disabled={selection.closed || selection.points.length < 3} onClick={() => remember({ ...selection, closed: true })}>{t('markupCloseOutline')}</button>
        <button className={`hsk-markup-tool${tool === 'pen' ? ' hsk-markup-tool--on' : ''}`} onClick={() => { setActivePin(null); setTool('pen'); }}>{t('markupSketch')}</button>
        <button className={`hsk-markup-tool${tool === 'eraser' ? ' hsk-markup-tool--on' : ''}`} onClick={() => { setActivePin(null); setTool('eraser'); }}>{t('markupEraser')}</button>
        <button className="hsk-markup-tool" onClick={() => selecting ? setSelectionHistory(prev => prev.length > 1 ? prev.slice(0, -1) : prev) : setActions(prev => prev.slice(0, -1))} disabled={selecting ? selectionHistory.length < 2 : actions.length === 0}>{t('markupUndo')}</button>
        <button className="hsk-markup-tool" onClick={() => { setActions([]); setActivePin(null); setSelectionHistory([{ points: [], closed: false }]); setTool('pin'); }} disabled={actions.length === 0 && !selection.points.length}>{t('markupClear')}</button>
        <button className="hsk-markup-go" onClick={handleSend} disabled={!canSend}>{t('markupSend')}</button>
      </div>
      {exportError && <div className="hsk-markup-error">{t('markupError')}</div>}
    </div>
  );
}
