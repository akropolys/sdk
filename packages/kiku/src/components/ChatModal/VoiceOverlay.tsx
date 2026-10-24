import React, { useEffect, useRef, useState } from 'react';
import { cn } from '../../utils/cn';
import { ChevronRightIcon, CloseIcon, EditIcon, ImageIcon, MicIcon, MicOffIcon } from './icons';
import { LIVE_VOICES, type UIStringKey, type VoicePhase } from './types';
import type { EarlierCalls } from './hooks/useVoiceController';
import { VoiceCanvas } from '../VoiceCanvas';
import KikuDoodles, { WorkingVeil } from '../KikuDoodles';
import { LightboxModal } from './components/LightboxModal';
import { SourcesCarousel } from './components/SourcesCarousel';
import { normalizeEntityImages, type ChatSource } from '@akropolys/sdk';
import type { LiveImage, LiveSource, LiveTurn } from '../../utils/liveVoice';

// Every image of the call in a row above the wave: the photo, then each edit, newest last.
function ImageRow({ images, siteId, themeAttr }: {
  images: LiveImage[];
  siteId: string;
  themeAttr?: string;
}) {
  const rowRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    const row = rowRef.current;
    if (row) row.scrollTo({ left: row.scrollWidth, behavior: 'smooth' });
  }, [images.length]);

  if (!images.length) return null;
  // While a render is on its way, the picture it reworks is the latest one before it.
  const pendingAt = images.findIndex(i => i.pending);
  const reworked = pendingAt > 0 ? images.slice(0, pendingAt).reverse().find(i => i.url)?.id : undefined;
  return (
    <div className="hsk-voice-images" ref={rowRef}>
      {images.map(img => (
        <button
          key={img.id}
          type="button"
          className="hsk-voice-image"
          data-pending={img.pending ? '' : undefined}
          disabled={img.pending}
          onClick={() => setOpen(img.url)}
        >
          {img.pending && <WorkingVeil active seed={siteId} theme={themeAttr} />}
          {img.url && <img key={img.url} src={img.url} alt="" draggable={false} />}
          {img.url && <WorkingVeil active={!!img.sending || img.id === reworked} seed={siteId} theme={themeAttr} />}
        </button>
      ))}
      {open && <LightboxModal src={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

// One pill naming the voice; the full list, by gender, only while choosing.
function VoicePicker({ current, choose, label, groups }: {
  current: string;
  choose: (name: string) => void;
  label: string;
  groups: { female: string; male: string };
}) {
  const chosen = LIVE_VOICES.find(v => v.name === current);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Mounted while closed so it can fold away; inert keeps it out of tab order and clicks.
    if (listRef.current) listRef.current.inert = !open;
    if (!open) return;
    const list = listRef.current;
    const on = list?.querySelector<HTMLElement>('[aria-checked="true"]');
    if (list && on) list.scrollTop = on.offsetTop - (list.clientHeight - on.offsetHeight) / 2;
    // The widget sits in a shadow root, so the event's composed path is what says "inside".
    const away = (e: PointerEvent) => {
      if (rootRef.current && !e.composedPath().includes(rootRef.current)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  return (
    <div className="hsk-voice-picker" ref={rootRef} data-open={open ? '' : undefined} dir="ltr">
      <button
        type="button"
        className="hsk-voice-pill hsk-voice-pill--current"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`${label}: ${chosen?.trait ?? current} (${current})`}
        onClick={() => setOpen(o => !o)}
      >
        <span>{chosen?.trait ?? current}</span>
        <span className="hsk-voice-pill-caret"><ChevronRightIcon /></span>
      </button>
      <div className="hsk-voice-menu-list" role="radiogroup" aria-label={label} ref={listRef}>
        {(['male', 'female'] as const).map(g => (
          <React.Fragment key={g}>
            <div className="hsk-voice-group" aria-hidden="true">{groups[g]}</div>
            {LIVE_VOICES.filter(v => v.gender === g).map(v => (
              <button
                key={v.name}
                type="button"
                role="radio"
                aria-checked={current === v.name}
                aria-label={`${v.trait}, ${groups[g]} (${v.name})`}
                className={cn('hsk-voice-option', current === v.name && 'hsk-voice-option--on')}
                onClick={() => {
                  choose(v.name);
                  setOpen(false);
                }}
              >
                <span className="hsk-voice-option-name">{v.trait}</span>
                <span className="hsk-voice-option-trait">{v.name}</span>
              </button>
            ))}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

export interface VoiceOverlayProps {
  siteId: string;
  themeAttr?: 'light' | 'dark' | string;
  stopVoice: () => void;
  chooseVoice: (name: string) => void;
  liveVoiceName: string;
  voiceSecondsLeft: number | null;
  voiceConnecting: boolean;
  voicePhase: VoicePhase;
  live: {
    micLevel: () => number;
    micSpectrum: (out: Uint8Array) => boolean;
    spectrumBins: () => number;
    turns?: LiveTurn[];
    images?: LiveImage[];
    sources?: LiveSource[];
    photos?: boolean;
  };
  // Earlier calls in this chat, shown above this one until the chat is cleared.
  earlier: EarlierCalls;
  // Clears the voice conversation and restarts the call with no memory; the chat keeps everything.
  newVoiceChat: () => void;
  // A tapped card asks Kiku about itself, the way a tapped card in chat does.
  onSelectSource: (src: ChatSource) => void;
  voiceMuted: boolean;
  setVoiceMuted: React.Dispatch<React.SetStateAction<boolean>>;
  voiceError: string;
  attachPhoto: (file: File) => Promise<void>;
  t: (key: UIStringKey, vars?: Record<string, string>) => string;
}

export function VoiceOverlay({
  siteId,
  themeAttr,
  stopVoice,
  chooseVoice,
  liveVoiceName,
  voiceSecondsLeft,
  voiceConnecting,
  voicePhase,
  live,
  earlier,
  newVoiceChat,
  voiceMuted,
  setVoiceMuted,
  voiceError,
  attachPhoto,
  onSelectSource,
  t,
}: VoiceOverlayProps) {
  const threadRef = useRef<HTMLDivElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const turns = [...earlier.turns, ...(live.turns ?? [])];
  const images = [...earlier.images, ...(live.images ?? [])];
  const sources = live.sources ?? [];
  const [lightbox, setLightbox] = useState<string | null>(null);
  const rendering = images.some(i => i.pending);
  const turnCount = turns.length;
  const lastText = turns[turnCount - 1]?.text ?? '';

  // Follows the conversation as it is spoken, the way a chat does; opens already at the end.
  const scrolledRef = useRef(false);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end', behavior: scrolledRef.current ? 'smooth' : 'auto' });
    scrolledRef.current = true;
  }, [turnCount, lastText]);

  return (
    <div className="hsk-voice-overlay" role="dialog" aria-label={t('voiceModeStart')}>
      <KikuDoodles seed={siteId} theme={themeAttr} />

      {turns.some(x => x.text) && (
        <button
          type="button"
          className="hsk-voice-new"
          onClick={newVoiceChat}
          disabled={voiceConnecting}
          aria-label={t('voiceNewChat')}
          title={t('voiceNewChat')}
        >
          <EditIcon size={15} />
        </button>
      )}

      <button
        className="hsk-voice-exit"
        onClick={stopVoice}
        aria-label={t('voiceModeExit')}
      >
        <CloseIcon />
      </button>

      <VoicePicker
        current={liveVoiceName}
        choose={chooseVoice}
        label={t('voicePickerLabel')}
        groups={{ female: t('voiceFemale'), male: t('voiceMale') }}
      />

      <div className="hsk-voice-thread" ref={threadRef}>
        {turns.filter(x => x.text).map((turn, i) =>
          turn.role === 'user' ? (
            <div key={i} className="hsk-cb-user-msg">
              <div
                className={cn(
                  'hsk-cb-user-bubble',
                  'hsk-cb-user-bubble--spoken',
                  !turn.done && 'hsk-voice-turn--live',
                )}
              >
                {turn.text}
              </div>
            </div>
          ) : (
            <div key={i} className="hsk-cb-ai-msg">
              <div className={cn('hsk-cb-ai-body', !turn.done && 'hsk-voice-turn--live')}>
                {turn.text}
              </div>
            </div>
          ),
        )}
        <div ref={endRef} />
      </div>

      {/* One shelf between the words and the wave: the shopper's images, then the entries the last search found. */}
      {(images.length > 0 || sources.length > 0) && (
        <div className="hsk-voice-shelf">
          <ImageRow images={images} siteId={siteId} themeAttr={themeAttr} />
          {sources.length > 0 && (
            <div className="hsk-voice-sources">
              <SourcesCarousel
                sources={sources.map(source => ({
                  ...source,
                  images: normalizeEntityImages(source.images ?? source.fields?.images, source.image, source.url),
                }))}
                onSelectSource={onSelectSource}
                onImageClick={setLightbox}
                referencedIds={sources.map(s => s.id).filter((id): id is string => !!id)}
                compact
              />
            </div>
          )}
        </div>
      )}
      {lightbox && <LightboxModal src={lightbox} onClose={() => setLightbox(null)} />}

      {/* The wave and the mic already show listening, speaking and muted; only connecting needs words. */}
      {voiceConnecting && (
        <div className="hsk-voice-connecting" role="status">
          <span className="hsk-voice-connecting-dot" />
          <span>{t('voiceConnecting')}</span>
        </div>
      )}

      {voiceError && <div className="hsk-voice-error">{t(voiceError as UIStringKey)}</div>}

      <div className="hsk-voice-controls" dir="ltr">
        {live.photos && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hsk-sr-only"
              onChange={e => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) void attachPhoto(file);
              }}
            />
            <button
              type="button"
              className="hsk-voice-control hsk-voice-control--attach"
              data-control="attach"
              disabled={voiceConnecting || rendering}
              onClick={() => fileRef.current?.click()}
              aria-label={t('voiceAttachPhoto')}
            >
              <span className="hsk-voice-control-icon"><ImageIcon /></span>
            </button>
          </>
        )}
        <div className={cn('hsk-voice-stage', voiceConnecting && 'hsk-voice-stage--connecting')}>
          <VoiceCanvas
            className="hsk-voice-canvas"
            theme={themeAttr}
            phase={voicePhase}
            level={live.micLevel}
            spectrum={live.micSpectrum}
            bins={live.spectrumBins}
          />
        </div>
        <button
          className={cn(
            'hsk-voice-control',
            voiceMuted && 'hsk-voice-control--muted',
            voiceConnecting && 'hsk-voice-control--waiting',
          )}
          data-control="mic"
          disabled={voiceConnecting}
          onClick={() => setVoiceMuted(m => !m)}
          aria-label={voiceMuted ? t('voicePhaseListening') : t('voiceModeExit')}
        >
          <span key={voiceMuted ? 'off' : 'on'} className="hsk-voice-control-icon">
            {voiceMuted ? <MicOffIcon /> : <MicIcon />}
          </span>
        </button>
      </div>
    </div>
  );
}
