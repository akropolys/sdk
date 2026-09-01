import React from 'react';
import type { ChatSource } from '@akropolys/sdk';
import { cn } from '../../utils/cn';
import { SparkleIcon, CloseIcon, MicIcon, MicOffIcon } from './icons';
import { LIVE_VOICES, type UIStringKey, type VoicePhase } from './types';
import { VoiceCanvas } from '../VoiceCanvas';
import KikuDoodles from '../KikuDoodles';

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
  };
  voiceMuted: boolean;
  setVoiceMuted: React.Dispatch<React.SetStateAction<boolean>>;
  shownSources: ChatSource[];
  onSelectSource?: (src: ChatSource) => void;
  defaultCurrency: string;
  voiceError: string;
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
  voiceMuted,
  setVoiceMuted,
  shownSources,
  onSelectSource,
  defaultCurrency,
  voiceError,
  t,
}: VoiceOverlayProps) {
  return (
    <div className="hsk-voice-overlay" role="dialog" aria-label={t('voiceModeStart')}>
      <KikuDoodles seed={siteId} theme={themeAttr} />

      <button
        className="hsk-voice-exit"
        onClick={stopVoice}
        aria-label={t('voiceModeExit')}
        title={t('voiceModeExit')}
      >
        <CloseIcon />
      </button>

      <div className="hsk-voice-picker" role="radiogroup" aria-label={t('voicePickerLabel')}>
        {LIVE_VOICES.map((v, i) => (
          <button
            key={v.name}
            type="button"
            role="radio"
            aria-checked={liveVoiceName === v.name}
            className={cn('hsk-voice-pill', liveVoiceName === v.name && 'hsk-voice-pill--on')}
            style={{ animationDelay: `${i * 60}ms` }}
            onClick={() => chooseVoice(v.name)}
            aria-label={`${v.label}, ${v.gender}`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {voiceSecondsLeft !== null && (
        <div
          className={cn('hsk-voice-allowance', voiceSecondsLeft <= 5 && 'hsk-voice-allowance--low')}
          role="timer"
          aria-live="off"
        >
          {Math.max(0, Math.ceil(voiceSecondsLeft))}s
        </div>
      )}

      <div className={cn('hsk-voice-stage', voiceConnecting && 'hsk-voice-stage--connecting')}>
        <VoiceCanvas
          className="hsk-voice-canvas"
          phase={voicePhase}
          level={live.micLevel}
          spectrum={live.micSpectrum}
          bins={live.spectrumBins}
        />
      </div>

      {voiceConnecting ? (
        <div className="hsk-voice-connecting" role="status">
          <span className="hsk-voice-connecting-dot" />
          <span>{t('voiceConnecting')}</span>
        </div>
      ) : (
        <div className="hsk-voice-caption" aria-live="polite">
          <span className={cn('hsk-voice-phase', `hsk-voice-phase--${voicePhase}`)}>
            {voiceMuted ? t('voiceMuted')
              : voicePhase === 'speaking' ? t('voicePhaseSpeaking')
              : voicePhase === 'thinking' ? t('voicePhaseThinking')
              : t('voicePhaseListening')}
          </span>
          {voiceMuted && <span className="hsk-voice-heard">{t('voiceMutedHint')}</span>}
          {!voiceMuted && voicePhase === 'listening' && (
            <span className="hsk-voice-hint-sub">{t('voiceHint')}</span>
          )}
        </div>
      )}

      {shownSources.length > 0 && (
        <div className="hsk-voice-items">
          {shownSources.slice(0, 4).map((src, i) => (
            <button
              key={src.id ?? i}
              type="button"
              className="hsk-voice-item"
              style={{ animationDelay: `${i * 70}ms` }}
              onClick={() => onSelectSource?.(src)}
            >
              {src.image
                ? <img src={src.image} alt="" className="hsk-voice-item-img" loading="lazy" />
                : <span className="hsk-voice-item-img hsk-voice-item-img--empty"><SparkleIcon /></span>}
              <span className="hsk-voice-item-name">{src.name}</span>
              {src.price && (
                <span className="hsk-voice-item-price">
                  {src.currency ?? defaultCurrency}{' '}
                  {parseFloat(String(src.price).replace(/[^0-9.]/g, '') || '0').toLocaleString()}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {voiceError && <div className="hsk-voice-error">{t(voiceError as UIStringKey)}</div>}

      <div className="hsk-voice-controls">
        <button
          className={cn('hsk-voice-control', voiceMuted && 'hsk-voice-control--muted')}
          onClick={() => setVoiceMuted(m => !m)}
          aria-label={voiceMuted ? t('voicePhaseListening') : t('voiceModeExit')}
          title={voiceMuted ? t('voicePhaseListening') : t('voiceModeExit')}
        >
          <span key={voiceMuted ? 'off' : 'on'} className="hsk-voice-control-icon">
            {voiceMuted ? <MicOffIcon /> : <MicIcon />}
          </span>
        </button>
      </div>
    </div>
  );
}
