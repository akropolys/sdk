import React, { useEffect, useRef, useState } from 'react';

// Gemini-style image markup: the shopper sketches, erases, or writes on the
// current scene to show exactly WHERE an edit should happen. The flattened
// image is sent as an annotated attachment; the backend tells the model to
// apply the change at the marks and scrub them from the output.

type Tool = 'pen' | 'eraser' | 'text';

interface Point { x: number; y: number }
interface StrokeAction { kind: 'stroke'; tool: 'pen' | 'eraser'; color: string; size: number; points: Point[] }
interface TextAction { kind: 'text'; x: number; y: number; color: string; value: string; size: number }
type Action = StrokeAction | TextAction;

const COLORS = ['#111111', '#ff5a5a', '#ffb300', '#22c55e', '#06b6d4', '#d946ef', '#9ca3af'];
const MAX_EXPORT_DIM = 1280;

export function MarkupEditor({ src, onCancel, onSend }: {
  src: string;
  onCancel: () => void;
  onSend: (dataUrl: string, instruction: string) => void;
}) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState(COLORS[1]);
  const [actions, setActions] = useState<Action[]>([]);
  const [pendingText, setPendingText] = useState<{ x: number; y: number } | null>(null);
  const [textValue, setTextValue] = useState('');
  const [instruction, setInstruction] = useState('');
  const [exportError, setExportError] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef<StrokeAction | null>(null);
  const textInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = new Image();
    el.crossOrigin = 'anonymous';
    el.onload = () => setImg(el);
    el.onerror = () => setLoadError(true);
    el.src = src;
  }, [src]);

  // Canvas internal resolution = (capped) natural size so exports stay sharp.
  const dims = (() => {
    if (!img) return { w: 0, h: 0 };
    const scale = Math.min(1, MAX_EXPORT_DIM / Math.max(img.naturalWidth, img.naturalHeight));
    return { w: Math.round(img.naturalWidth * scale), h: Math.round(img.naturalHeight * scale) };
  })();

  // Marks live on their own layer so the eraser only removes ink, never photo.
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
      if (a.kind === 'stroke') {
        lctx.save();
        lctx.globalCompositeOperation = a.tool === 'eraser' ? 'destination-out' : 'source-over';
        lctx.strokeStyle = a.color;
        lctx.lineWidth = a.tool === 'eraser' ? a.size * 3 : a.size;
        lctx.lineCap = 'round';
        lctx.lineJoin = 'round';
        lctx.beginPath();
        a.points.forEach((p, i) => (i === 0 ? lctx.moveTo(p.x, p.y) : lctx.lineTo(p.x, p.y)));
        if (a.points.length === 1) lctx.lineTo(a.points[0].x + 0.01, a.points[0].y);
        lctx.stroke();
        lctx.restore();
      } else {
        lctx.save();
        lctx.fillStyle = a.color;
        lctx.font = `600 ${a.size}px system-ui, sans-serif`;
        lctx.fillText(a.value, a.x, a.y);
        lctx.restore();
      }
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    ctx.drawImage(layer, 0, 0);
  };

  useEffect(() => { paint(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [img, actions, dims.w, dims.h]);
  useEffect(() => { if (pendingText) textInputRef.current?.focus(); }, [pendingText]);

  const toCanvasPoint = (e: React.PointerEvent): Point => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const strokeSize = () => Math.max(4, Math.round(dims.w / 180));
  const textSize = () => Math.max(18, Math.round(dims.w / 28));

  const onPointerDown = (e: React.PointerEvent) => {
    if (!img) return;
    const p = toCanvasPoint(e);
    if (tool === 'text') {
      setPendingText({ x: p.x, y: p.y });
      setTextValue('');
      return;
    }
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drawingRef.current = { kind: 'stroke', tool, color, size: strokeSize(), points: [p] };
    paint(drawingRef.current);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drawingRef.current) return;
    drawingRef.current.points.push(toCanvasPoint(e));
    paint(drawingRef.current);
  };
  const onPointerUp = () => {
    if (!drawingRef.current) return;
    const done = drawingRef.current;
    drawingRef.current = null;
    setActions(prev => [...prev, done]);
  };

  const commitText = () => {
    if (pendingText && textValue.trim()) {
      setActions(prev => [...prev, { kind: 'text', x: pendingText.x, y: pendingText.y, color, value: textValue.trim(), size: textSize() }]);
    }
    setPendingText(null);
    setTextValue('');
  };

  const handleSend = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      paint();
      const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
      onSend(dataUrl, instruction.trim());
    } catch {
      setExportError(true);
    }
  };

  const hasMarks = actions.length > 0;

  return (
    <div className="hsk-markup" role="dialog" aria-label="Mark up image">
      <div className="hsk-markup-head">
        <span className="hsk-markup-title">Mark where you want the change</span>
        <button className="hsk-markup-cancel" onClick={onCancel}>Cancel</button>
      </div>

      <div className="hsk-markup-stage">
        {loadError ? (
          <div className="hsk-markup-error">This image can't be edited here.</div>
        ) : !img ? (
          <div className="hsk-markup-loading">Loading image…</div>
        ) : (
          <div className="hsk-markup-canvas-wrap">
            <canvas
              ref={canvasRef}
              width={dims.w}
              height={dims.h}
              className={`hsk-markup-canvas hsk-markup-canvas--${tool}`}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerUp}
            />
            {pendingText && canvasRef.current && (
              <input
                ref={textInputRef}
                className="hsk-markup-textinput"
                style={{
                  left: `${(pendingText.x / dims.w) * 100}%`,
                  top: `${(pendingText.y / dims.h) * 100}%`,
                  color,
                }}
                value={textValue}
                placeholder="Type, then Enter"
                onChange={e => setTextValue(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') commitText(); if (e.key === 'Escape') { setPendingText(null); setTextValue(''); } }}
                onBlur={commitText}
              />
            )}
          </div>
        )}
      </div>

      <div className="hsk-markup-tools">
        <div className="hsk-markup-colors">
          {COLORS.map(c => (
            <button
              key={c}
              className={`hsk-markup-color${color === c ? ' hsk-markup-color--on' : ''}`}
              style={{ background: c }}
              onClick={() => { setColor(c); if (tool === 'eraser') setTool('pen'); }}
              aria-label={`Colour ${c}`}
            />
          ))}
        </div>
        <div className="hsk-markup-actions">
          <button className={`hsk-markup-tool${tool === 'pen' ? ' hsk-markup-tool--on' : ''}`} onClick={() => setTool('pen')}>Sketch</button>
          <button className={`hsk-markup-tool${tool === 'text' ? ' hsk-markup-tool--on' : ''}`} onClick={() => setTool('text')}>Text</button>
          <button className={`hsk-markup-tool${tool === 'eraser' ? ' hsk-markup-tool--on' : ''}`} onClick={() => setTool('eraser')}>Eraser</button>
          <button className="hsk-markup-tool" onClick={() => setActions(prev => prev.slice(0, -1))} disabled={!hasMarks}>Undo</button>
          <button className="hsk-markup-tool" onClick={() => setActions([])} disabled={!hasMarks}>Clear</button>
        </div>
      </div>

      <div className="hsk-markup-send">
        <input
          className="hsk-markup-instruction"
          value={instruction}
          placeholder="Describe the change — e.g. add the sofa here"
          onChange={e => setInstruction(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (hasMarks || instruction.trim())) handleSend(); }}
        />
        <button
          className="hsk-markup-go"
          onClick={handleSend}
          disabled={!img || (!hasMarks && !instruction.trim())}
        >
          Send
        </button>
      </div>
      {exportError && <div className="hsk-markup-error">Couldn't process this image — try a newer visualization.</div>}
    </div>
  );
}
