import React, { useState, useRef, useEffect } from 'react';
import type { ChatSource, ChatAttachment } from '@akropolys/sdk';
import { cn } from '../../utils/cn';
import {
  SparkleIcon,
  BookmarkIcon,
  HistoryIcon,
  TrashIcon,
  PaperclipIcon,
  WaveformIcon,
  MicIcon,
  MicOffIcon,
  StopIcon,
  ArrowUpIcon,
  PlusIcon,
  XIcon,
} from './icons';
import { ListeningWave } from './components/ListeningWave';
import { AnimatedPlaceholder, HSK_STAGGER_MS, splitPlaceholder } from './components/AnimatedPlaceholder';
import type { UIStringKey, VoicePhase } from './types';

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
  defaultCurrency: string;
  handleSelectExtension: (ext: string) => void;
  handleKikuCapture: (product: ChatSource) => void;
  handleKikuCaptureAll: (products: ChatSource[]) => void;
  handleKikuViewHistory: () => void;
  handleKikuDelete: () => void;
  attachments: ChatAttachment[];
  removeAttachment: (idx: number) => void;
  chromeLoading: boolean;
  imageInputRef: React.RefObject<HTMLInputElement | null>;
  handleImageFiles: (files: FileList | null) => void;
  enableVision: boolean;
  enableVoice: boolean;
  canConverse: boolean;
  voiceMode: 'off' | 'dictate' | 'converse';
  startVoice: (mode: 'dictate' | 'converse') => void;
  stopVoice: () => void;
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
  shopperLanguage: string;
  t: (key: UIStringKey, vars?: Record<string, string>) => string;
  rail?: React.ReactNode;
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
  defaultCurrency,
  handleSelectExtension,
  handleKikuCapture,
  handleKikuCaptureAll,
  handleKikuViewHistory,
  handleKikuDelete,
  attachments,
  removeAttachment,
  chromeLoading,
  imageInputRef,
  handleImageFiles,
  enableVision,
  enableVoice,
  canConverse,
  voiceMode,
  startVoice,
  stopVoice,
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
  shopperLanguage,
  t,
  rail,
}: ChatComposerProps) {
  const [placeholderReplay, setPlaceholderReplay] = React.useState(0);
  const [toolsOpen, setToolsOpen] = React.useState(false);

  React.useEffect(() => {
    if (!voiceError) return;
    const timer = setTimeout(() => {
      setVoiceError?.('');
    }, 6000);
    return () => clearTimeout(timer);
  }, [voiceError, setVoiceError]);

  React.useEffect(() => {
    if (!toolsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setToolsOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toolsOpen]);

  const placeholderText = activePlaceholder || 'Ask me anything…';
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

  return (
    <div className="hsk-cb-input-wrap">
      {toolsOpen && (
        <>
          <div className="hsk-cb-toolsheet-scrim" onClick={() => setToolsOpen(false)} />
          <div className="hsk-cb-toolsheet-wrap">
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
                  onClick={() => { setToolsOpen(false); voiceMode === 'converse' ? stopVoice() : startVoice('converse'); }}
                  disabled={loading || chromeLoading || voiceBlocked}
                >
                  <WaveformIcon active={voiceMode === 'converse'} />
                  <span>{voiceMode === 'converse' ? t('voiceModeExit') : t('voiceModeStart')}</span>
                </button>
              )}
            </div>
          </div>
        </>
      )}
      <div className="hsk-cb-input-card">
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
                      {src.price && (
                        <span className="hsk-cb-docked-option-price">
                          {src.currency ?? defaultCurrency} {parseFloat(String(src.price).replace(/[^0-9.]/g, '') || '0').toLocaleString()}
                        </span>
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
                  <img src={att.data} alt={`attachment ${i + 1}`} className="hsk-cb-img-thumb" />
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
            {(enableVision || (enableVoice && canConverse)) && (
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
                  title="Attach image"
                >
                  <PaperclipIcon />
                </button>
              )}
              {enableVoice && canConverse && (
                <button
                  className={cn("hsk-cb-voice-mode-btn", voiceBlocked && "hsk-cb-voice-mode-btn--blocked")}
                  onClick={() => voiceBlocked ? setVoiceError?.(t('errAccountRequired')) : startVoice('converse')}
                  disabled={loading || chromeLoading}
                  aria-label="Voice conversation"
                  title="Voice conversation"
                >
                  <WaveformIcon />
                </button>
              )}
            </>
            <div className="hsk-cb-field">
              <textarea
                ref={textareaRef as any}
                value={input}
                onChange={handleInput}
                onKeyDown={handleKeyDown}
                rows={1}
                placeholder=""
                className={cn("hsk-cb-textarea", classNames.input)}
                aria-label={activePlaceholder}
                disabled={loading && !streaming}
              />
              <AnimatedPlaceholder
                placeholder={activePlaceholder}
                visible={!input}
                staggerMs={HSK_STAGGER_MS}
                replaySeed={placeholderReplay}
              />
            </div>
            {enableVoice && (
              <button
                className={cn("hsk-cb-mic-btn", (voiceMode === 'converse' || voiceMode === 'dictate') && "hsk-cb-mic-btn--active", voiceBlocked && "hsk-cb-mic-btn--blocked")}
                onClick={() => {
                  if (voiceMode !== 'off') {
                    stopVoice();
                  } else if (canConverse) {
                    startVoice('converse');
                  } else {
                    startVoice('dictate');
                  }
                }}
                disabled={loading || chromeLoading}
                aria-label={voiceMode === 'off' ? 'Start voice mode' : 'Stop voice'}
                title={voiceMode === 'off' ? (canConverse ? 'Voice conversation' : 'Voice input') : 'Stop'}
              >
                {voiceMode === 'off' ? <MicIcon /> : <MicOffIcon />}
              </button>
            )}
            {(loading || streaming) && !launching ? (
              <button
                className={cn("hsk-cb-send", "hsk-cb-send--stop", classNames.sendButton)}
                onClick={stop}
                aria-label="Stop generating"
                title="Stop generating"
              >
                <StopIcon />
              </button>
            ) : (
              <button
                className={cn("hsk-cb-send", launching && "is-launching", classNames.sendButton)}
                onClick={() => { launch(); handleSend(); }}
                disabled={chromeLoading || (!input.trim() && attachments.length === 0)}
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
      <div className="hsk-cb-hint">{shopperLanguage ? t('footerHint') : 'kiku · searches the whole catalogue in real time'}</div>
    </div>
  );
}
