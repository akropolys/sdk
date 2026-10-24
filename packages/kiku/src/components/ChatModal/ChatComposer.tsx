import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAkropolysContext, useCardFields, type ChatSource, type ChatAttachment } from '@akropolys/sdk';
import { cn } from '../../utils/cn';
import { detailsOf } from '../../utils/cardDetails';
import {
  SparkleIcon,
  BookmarkIcon,
  HistoryIcon,
  TrashIcon,
  PaperclipIcon,
  MessageIcon,
  WaveformIcon,
  StopIcon,
  ArrowUpIcon,
  PlusIcon,
  XIcon,
} from './icons';
import { ListeningWave } from './components/ListeningWave';
import { AnimatedPlaceholder, HSK_STAGGER_MS, splitPlaceholder } from './components/AnimatedPlaceholder';
import type { UIStringKey, VoicePhase, ComposerAttachment } from './types';

export interface ChatComposerProps {
  gooId: string;
  input: string;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  showKikuPicker: boolean;
  setShowKikuPicker: (show: boolean) => void;
  showAtPicker: boolean;
  setShowAtPicker: (show: boolean) => void;
  captureAllowed: boolean;
  discussedSources: ChatSource[];
  handleSelectExtension: (ext: string) => void;
  handleKikuCapture: (product: ChatSource) => void;
  handleKikuCaptureAll: (products: ChatSource[]) => void;
  handleKikuViewHistory: () => void;
  handleKikuDelete: () => void;
  attachments: ComposerAttachment[];
  removeAttachment: (idx: number) => void;
  chromeLoading: boolean;
  inputLocked: boolean;
  imageInputRef: React.RefObject<HTMLInputElement | null>;
  handleImageFiles: (files: FileList | null) => void;
  enableVision: boolean;
  enableVoice: boolean;
  canConverse: boolean;
  startVoice: (mode: 'dictate' | 'converse') => void;
  voiceBlocked: boolean;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  classNames?: { input?: string; sendButton?: string };
  handleInput: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  handleKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  voice: {
    active: boolean;
    supported: boolean;
    spectrumBins: () => number;
    micSpectrum: (out: Uint8Array) => boolean;
  };
  voicePhase: VoicePhase;
  activePlaceholder: string;
  loading: boolean;
  streaming: boolean;
  stop: () => void;
  handleSend: (text?: string) => Promise<void>;
  voiceError: string;
  setVoiceError?: (err: string) => void;
  langSwitching?: boolean;
  t: (key: UIStringKey, vars?: Record<string, string>) => string;
  rail?: React.ReactNode;
  notice?: React.ReactNode; // sits on the input's top edge, like a status pill on a reply
  onOpenMimi?: () => void;
}

export function ChatComposer({
  gooId,
  input,
  setInput,
  showKikuPicker,
  setShowKikuPicker,
  showAtPicker,
  setShowAtPicker,
  captureAllowed,
  discussedSources,
  handleSelectExtension,
  handleKikuCapture,
  handleKikuCaptureAll,
  handleKikuViewHistory,
  handleKikuDelete,
  attachments,
  removeAttachment,
  chromeLoading,
  inputLocked,
  langSwitching = false,
  imageInputRef,
  handleImageFiles,
  enableVision,
  enableVoice,
  canConverse,
  startVoice,
  voiceBlocked,
  textareaRef,
  classNames = {},
  handleInput,
  handleKeyDown,
  voice,
  voicePhase,
  activePlaceholder,
  loading,
  streaming,
  stop,
  handleSend,
  voiceError,
  setVoiceError,
  t,
  rail,
  notice,
  onOpenMimi,
}: ChatComposerProps) {
  const client = useAkropolysContext();
  const cardFields = useCardFields();
  const [placeholderReplay, setPlaceholderReplay] = React.useState(0);
  const [toolsOpen, setToolsOpen] = React.useState(false);

  React.useEffect(() => {
    if (!voiceError) return;
    const timer = setTimeout(() => {
      setVoiceError?.('');
    }, 6000);
    return () => clearTimeout(timer);
  }, [voiceError, setVoiceError]);

  const toolsheetRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!toolsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setToolsOpen(false);
    };
    const handleOutside = (e: MouseEvent | TouchEvent) => {
      const path = (e.composedPath ? e.composedPath() : []) as EventTarget[];
      const targetEl = e.target as HTMLElement | null;
      const isInsideToggle = targetEl?.closest?.('.hsk-cb-tools-toggle') || path.some((el: any) => el?.classList?.contains?.('hsk-cb-tools-toggle'));
      const isInsideSheet = toolsheetRef.current && (path.includes(toolsheetRef.current) || toolsheetRef.current.contains(e.target as Node));
      if (isInsideToggle || isInsideSheet) {
        return;
      }
      setToolsOpen(false);
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside, { passive: true });
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, [toolsOpen]);

  const placeholderText = activePlaceholder || 'Ask me anything…';

  const fieldRef = useRef<HTMLDivElement>(null);
  const [phWraps, setPhWraps] = useState(() => placeholderText.length > 26); // a first guess the measurement corrects
  useEffect(() => {
    const field = fieldRef.current;
    if (!field || input) return;
    const measure = () => {
      const units = field.querySelectorAll<HTMLElement>('.hsk-animated-placeholder__char');
      if (units.length < 2) return setPhWraps(false);
      const first = units[0].offsetTop;
      const last = units[units.length - 1].offsetTop;
      setPhWraps(last - first > units[0].offsetHeight / 2);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(field);
    return () => ro.disconnect();
  }, [placeholderText, input]);
  const placeholderSweepMs =
    Math.max(splitPlaceholder(placeholderText).length - 1, 0) * HSK_STAGGER_MS;

  // the kite tears through the seam, the seam heals, a fresh kite glides in
  const [launching, setLaunching] = useState(false);
  const launchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const launch = () => {
    if (launchTimer.current) clearTimeout(launchTimer.current);
    setLaunching(true);
    launchTimer.current = setTimeout(() => {
      setLaunching(false);
      launchTimer.current = null;
    }, 550);
  };
  useEffect(() => () => { if (launchTimer.current) clearTimeout(launchTimer.current); }, []);

  // While a notice asks for a decision, the input takes no typing or clicks.
  const cardRef = useRef<HTMLDivElement>(null);
  const blocked = !!notice;
  useEffect(() => { cardRef.current?.toggleAttribute('inert', blocked); }, [blocked]);

  return (
    <div className="hsk-cb-input-wrap" data-tools-open={toolsOpen ? 'true' : undefined}>
      {toolsOpen && (
        <>
          <div
            className="hsk-cb-toolsheet-scrim"
            onClick={() => setToolsOpen(false)}
            aria-hidden="true"
          />
          <div className="hsk-cb-toolsheet-wrap" ref={toolsheetRef}>
            <div className="hsk-cb-toolsheet" role="menu">
              {enableVision && (
                <button
                  className="hsk-cb-toolsheet-item"
                  role="menuitem"
                  onClick={() => { setToolsOpen(false); imageInputRef.current?.click(); }}
                  disabled={loading}
                >
                  <PaperclipIcon />
                  <span>{t('attachImage')}</span>
                </button>
              )}
              {enableVoice && canConverse && (
                <button
                  className="hsk-cb-toolsheet-item"
                  role="menuitem"
                  onClick={() => {
                    setToolsOpen(false);
                    if (voiceBlocked) setVoiceError?.(t('errAccountRequired'));
                    else startVoice('converse');
                  }}
                  disabled={loading || chromeLoading}
                >
                  <WaveformIcon />
                  <span>{t('voiceModeStart')}</span>
                </button>
              )}
              {onOpenMimi && (
                <button className="hsk-cb-toolsheet-item" role="menuitem" onClick={() => { setToolsOpen(false); onOpenMimi(); }}>
                  <MessageIcon />
                  <span>MiMi</span>
                </button>
              )}
            </div>
          </div>
        </>
      )}
      {notice}
      <div className="hsk-cb-input-card" ref={cardRef}>
        {(/^@kiku\b/i.test(input) || showKikuPicker || showAtPicker) && (
            <div className="hsk-cb-docked-header">
              <span className="hsk-cb-docked-sub">{t('captureAndRemember')}</span>
              <button
                type="button"
                className="hsk-cb-docked-close"
                onClick={() => {
                  setInput(prev => prev.replace(/^@kiku\s*/i, ''));
                  setShowKikuPicker(false);
                  setShowAtPicker(false);
                }}
                aria-label="Close mode"
              >
                ×
              </button>
            </div>
          )}

          {(showKikuPicker || showAtPicker) && (
            <div className="hsk-cb-docked-options" onMouseDown={e => e.preventDefault()}>
              {showAtPicker && captureAllowed && (
                <button
                  type="button"
                  className="hsk-cb-docked-option"
                  onClick={() => handleSelectExtension('@kiku')}
                >
                  <span className="hsk-cb-docked-option-icon"><SparkleIcon /></span>
                  <span className="hsk-cb-docked-option-title">kiku</span>
                  <span className="hsk-cb-docked-option-desc">capture &amp; remember</span>
                </button>
              )}

              {showKikuPicker && captureAllowed && (
                <>
                  {discussedSources.map((src, i) => (
                    <button
                      key={src.id ?? i}
                      type="button"
                      className="hsk-cb-docked-option"
                      onClick={() => { handleKikuCapture(src); setShowKikuPicker(false); }}
                    >
                      <span className="hsk-cb-docked-option-icon">
                        {src.image ? <img src={src.image} alt="" /> : <BookmarkIcon />}
                      </span>
                      <span className="hsk-cb-docked-option-title">{src.name}</span>
                      {detailsOf(src, cardFields)[0] && (
                        <span className="hsk-cb-docked-option-detail">{detailsOf(src, cardFields)[0].value}</span>
                      )}
                    </button>
                  ))}
                  {discussedSources.length > 1 && (
                    <button
                      type="button"
                      className="hsk-cb-docked-option"
                      onClick={() => { handleKikuCaptureAll(discussedSources); setShowKikuPicker(false); }}
                    >
                      <span className="hsk-cb-docked-option-icon"><BookmarkIcon /></span>
                      <span className="hsk-cb-docked-option-title">{t('captureAll', { count: String(discussedSources.length) })}</span>
                    </button>
                  )}
                  {discussedSources.length === 0 && (
                    <button
                      type="button"
                      className="hsk-cb-docked-option"
                      onClick={() => { handleKikuCapture({ name: 'current page', id: undefined }); setShowKikuPicker(false); }}
                    >
                      <span className="hsk-cb-docked-option-icon"><BookmarkIcon /></span>
                      <span className="hsk-cb-docked-option-title">{t('captureCurrentPage')}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    className="hsk-cb-docked-option"
                    onClick={() => { handleKikuViewHistory(); setShowKikuPicker(false); }}
                  >
                    <span className="hsk-cb-docked-option-icon"><HistoryIcon /></span>
                    <span className="hsk-cb-docked-option-title">{t('whatHaveYouSaved')}</span>
                  </button>
                  <button
                    type="button"
                    className="hsk-cb-docked-option"
                    onClick={() => { handleKikuDelete(); setShowKikuPicker(false); }}
                  >
                    <span className="hsk-cb-docked-option-icon"><TrashIcon /></span>
                    <span className="hsk-cb-docked-option-title">{t('deleteThis')}</span>
                  </button>
                </>
              )}
            </div>
          )}

          {attachments.length > 0 && (
            <div className="hsk-cb-img-strip">
              {attachments.map((att, i) => (
                <div key={i} className="hsk-cb-img-thumb-wrap">
                  <img src={att.thumb || att.data} alt={`attachment ${i + 1}`} className="hsk-cb-img-thumb" />
                  <button
                    type="button"
                    className="hsk-cb-img-thumb-remove"
                    onClick={() => removeAttachment(i)}
                    aria-label="Remove image"
                  >
                    <XIcon size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div
            className={cn("hsk-cb-input-box", chromeLoading && "hsk-cb-input-box--waiting")}
            data-cascade={placeholderReplay % 2 ? 'b' : 'a'}
            data-tools={toolsOpen ? 'open' : 'closed'}
            style={{ '--hsk-text-sweep': `${placeholderSweepMs}ms` } as React.CSSProperties}
          >
            <input
              ref={imageInputRef as any}
              type="file"
              accept="image/*"
              className="hsk-sr-only"
              onChange={e => {
                handleImageFiles(e.target.files);
                e.target.value = '';
              }}
            />
            {(onOpenMimi || enableVision || (enableVoice && canConverse)) && (
              <button
                className={cn('hsk-cb-tools-toggle', toolsOpen && 'hsk-cb-tools-toggle--open')}
                onClick={() => setToolsOpen(o => !o)}
                disabled={loading || chromeLoading}
                aria-label={toolsOpen ? 'Close options' : 'More options'}
                aria-expanded={toolsOpen}
              >
                <PlusIcon />
              </button>
            )}
            <>
              {enableVision && (
                <button
                  className="hsk-cb-attach-btn"
                  onClick={() => imageInputRef.current?.click()}
                  disabled={loading}
                  aria-label="Attach image"
                >
                  <PaperclipIcon />
                </button>
              )}
            </>
            <div className="hsk-cb-field" ref={fieldRef} data-ph-lines={!input && phWraps ? '2' : undefined}>
              <textarea
                ref={textareaRef as any}
                value={input}
                onChange={handleInput}
                onKeyDown={handleKeyDown}
                rows={1}
                placeholder=""
                className={cn("hsk-cb-textarea", classNames.input)}
                aria-label={activePlaceholder}
                disabled={inputLocked || (loading && !streaming) || langSwitching}
              />
              <AnimatedPlaceholder
                placeholder={activePlaceholder}
                visible={!input}
                staggerMs={HSK_STAGGER_MS}
                replaySeed={placeholderReplay}
              />
            </div>
            {enableVoice && canConverse && (
              <button
                className={cn("hsk-cb-voice-mode-btn", voiceBlocked && "hsk-cb-voice-mode-btn--blocked")}
                onClick={() => voiceBlocked ? setVoiceError?.(t('errAccountRequired')) : startVoice('converse')}
                disabled={loading || chromeLoading}
                aria-label="Voice conversation"
              >
                <WaveformIcon />
              </button>
            )}
            {(loading || streaming) && !launching ? (
              <button
                className={cn("hsk-cb-send", "hsk-cb-send--stop", classNames.sendButton)}
                onClick={stop}
                aria-label="Stop generating"
              >
                <StopIcon />
              </button>
            ) : (
              <button
                className={cn(
                  "hsk-cb-send",
                  launching && "is-launching",
                  classNames.sendButton
                )}
                onClick={() => {
                  launch();
                  handleSend();
                }}
                disabled={langSwitching || inputLocked || chromeLoading || (!input.trim() && attachments.length === 0)}
                aria-label="Send message"
              >
                <svg width="0" height="0" aria-hidden="true" focusable="false" style={{ position: 'absolute' }}>
                  <defs>
                    <filter id={gooId}>
                      <feGaussianBlur in="SourceGraphic" stdDeviation="1.6" result="blur" />
                      <feColorMatrix in="blur" type="matrix"
                        values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 16 -7" result="goo" />
                      <feBlend in="SourceGraphic" in2="goo" />
                    </filter>
                  </defs>
                </svg>
                <span className="hsk-cb-send-sheath" aria-hidden="true" />
                <span className="hsk-cb-send-stage" style={{ filter: `url(#${gooId})` }}>
                  <span className="hsk-cb-send-seam" aria-hidden="true" />
                  <span className="hsk-cb-send-kite">
                    <ArrowUpIcon />
                  </span>
                </span>
              </button>
            )}
          </div>
        </div>
      {voiceBlocked ? (
        <div className="hsk-cb-voice-error" role="status" onClick={() => setVoiceError?.('')}>
          <span>{t('errAccountRequired')}</span>
          <button
            type="button"
            className="hsk-cb-voice-error-dismiss"
            onClick={(e) => { e.stopPropagation(); setVoiceError?.(''); }}
            aria-label="Dismiss error"
          >
            ×
          </button>
        </div>
      ) : voiceError && (
        <div className="hsk-cb-voice-error" role="status" onClick={() => setVoiceError?.('')}>
          <span>{t(voiceError as UIStringKey)}</span>
          <button
            type="button"
            className="hsk-cb-voice-error-dismiss"
            onClick={(e) => { e.stopPropagation(); setVoiceError?.(''); }}
            aria-label="Dismiss error"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
