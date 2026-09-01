import React, { useEffect, useRef } from 'react';
import { getLoadingMeta } from '../types';
import { CascadeText } from './CascadeText';

const WAVE_BARS = 64;

export function ChromeLoading({
  language,
  onBack,
}: {
  language?: string;
  onBack?: () => void;
}) {
  const meta = getLoadingMeta(language);

  return (
    <div className="hsk-cb-chrome-loading" dir={meta.rtl ? 'rtl' : 'ltr'} aria-busy="true">
      <div className="hsk-cb-chrome-loading-header">
        <h2 className="hsk-cb-hello hsk-cascade">
          <CascadeText baseMs={60}>{meta.preparing}</CascadeText>
        </h2>
      </div>

      {/* Indeterminate on purpose: the translation is all-or-nothing, so a
          filling bar would be inventing progress it cannot know. */}
      <div className="hsk-cb-chrome-progress" role="progressbar" aria-label={meta.preparing}>
        <div className="hsk-cb-chrome-progress-track" />
      </div>

      {onBack && (
        <button
          type="button"
          className="hsk-cb-chrome-back-btn"
          onClick={onBack}
        >
          <span aria-hidden="true">{meta.rtl ? '→' : '←'}</span> {meta.changeLang}
        </button>
      )}

      {!meta.known && (
        <div className="hsk-cb-chrome-notice" dir="ltr" lang="en">
          <div className="hsk-cb-chrome-notice-header">
            <span className="hsk-cb-chrome-notice-pill">Preview / Low-Resource</span>
            <span className="hsk-cb-chrome-notice-title">Live Machine Translation</span>
          </div>
          <span className="hsk-cb-chrome-notice-body">
            <b>{meta.nativeName}</b> is translated in real time as you browse. Some phrasing
            may read differently than human-reviewed copy, but names, prices, and figures are
            always strictly preserved.
          </span>
        </div>
      )}
    </div>
  );
}

export function ListeningWave({ spectrumBins, micSpectrum }: {
  spectrumBins: () => number;
  micSpectrum: (out: Uint8Array) => boolean;
}) {
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    const level = new Array(WAVE_BARS).fill(0);
    const mid = (WAVE_BARS - 1) / 2;
    let spectrum = new Uint8Array(0);

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const bins = spectrumBins();
      if (bins === 0) return;
      if (spectrum.length !== bins) spectrum = new Uint8Array(bins);
      if (!micSpectrum(spectrum)) return;

      const row = rowRef.current;
      if (!row) return;
      for (let i = 0; i < WAVE_BARS; i++) {
        const fromMid = Math.abs(i - mid) / mid;
        const bin = Math.min(spectrum.length - 1, Math.round(fromMid * spectrum.length * 0.45));
        const target = (spectrum[bin] / 255) * (1 - fromMid * 0.45);
        level[i] += (target - level[i]) * 0.3;
        const dot = row.children[i] as HTMLElement | undefined;
        if (dot) {
          dot.style.transform = `scaleY(${(1 + level[i] * 13).toFixed(3)})`;
          dot.style.opacity = (0.3 + level[i] * 0.7).toFixed(3);
        }
      }
    };
    tick();

    return () => cancelAnimationFrame(raf);
  }, [spectrumBins, micSpectrum]);

  return (
    <div className="hsk-cb-listening" ref={rowRef} aria-hidden="true">
      {Array.from({ length: WAVE_BARS }).map((_, i) => <span key={i} />)}
    </div>
  );
}
