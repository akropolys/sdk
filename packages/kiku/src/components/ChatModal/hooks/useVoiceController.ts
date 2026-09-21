import { useState, useCallback, useEffect } from 'react';
import { useAkropolysContext } from '@akropolys/sdk';
import { stopSpeech } from '../../../utils/tts';
import { useVoiceSession } from '../../../utils/voiceSession';
import { useLiveVoice, type LiveState } from '../../../utils/liveVoice';
import { LIVE_VOICES, VOICE_STORAGE_KEY, isSecureOrigin, type VoicePhase } from '../types';

const toVoicePhase = (s: LiveState): VoicePhase =>
  s === 'connecting' || s === 'ended' ? 'idle' : s;

export interface UseVoiceControllerOptions {
  voiceLang?: string;
  speechLang: string;
  shopperLanguage: string;
  ttsVoice?: string;
  handleSendUtterance: (text: string) => void;
  appendSpokenExchange: (heard: string, said: string, duration?: number) => void;
}

export function useVoiceController({
  voiceLang,
  speechLang,
  shopperLanguage,
  ttsVoice = 'Puck',
  handleSendUtterance,
  appendSpokenExchange,
}: UseVoiceControllerOptions) {
  const client = useAkropolysContext();
  const [voiceMode, setVoiceMode] = useState<'off' | 'dictate' | 'converse'>('off');
  const [dictateState, setDictateState] = useState<'idle' | 'listening' | 'thinking'>('idle');
  const [voiceError, setVoiceError] = useState<string>('');
  const [voiceMuted, setVoiceMuted] = useState(false);
  const [voiceBlocked, setVoiceBlocked] = useState(false);

  const [liveVoiceName, setLiveVoiceName] = useState<string>(() => {
    try {
      const stored = localStorage.getItem(VOICE_STORAGE_KEY);
      if (stored && LIVE_VOICES.some(v => v.name === stored)) return stored;
    } catch {  }
    return ttsVoice || 'Puck';
  });

  const chooseVoice = useCallback((name: string) => {
    setLiveVoiceName(name);
    try { localStorage.setItem(VOICE_STORAGE_KEY, name); } catch {  }
  }, []);

  const voice = useVoiceSession({
    lang: voiceLang || speechLang,
    onUtterance: (text) => {
      setDictateState('thinking');
      handleSendUtterance(text);
    },
    onError: (code) => {
      setVoiceMode('off');
      setDictateState('idle');
      if (code === 'not-allowed') setVoiceError('micDenied');
      else if (code === 'language-not-supported') setVoiceError('micLangUnsupported');
      else if (code === 'audio-capture') setVoiceError('micMissing');
      else if (code === 'network') setVoiceError('micNetwork');
      else setVoiceError('micFailed');
    },
    onBargeIn: () => { stopSpeech(); },
  });

  const voiceUrl = (client as any)?.voiceUrl || (client as any)?.api?.voiceUrl;
  const apiUrl = voiceUrl || (client as any)?.api?.apiUrl || (client as any)?.apiUrl || '';
  const siteId = (client as any)?.api?.siteId || (client as any)?.siteId || '';
  const token = (client as any)?.api?.apiToken || (client as any)?.apiToken || '';
  const kikuId = client?.getShopperId?.() || client?.getKikuPub?.() || undefined;
  const shopperName = client?.getShopperName?.() || undefined;

  const live = useLiveVoice({
    apiUrl,
    siteId,
    token,
    kikuId,
    name: shopperName,
    language: shopperLanguage,
    voice: liveVoiceName,
    muted: voiceMuted,
    onExchange: (exchange) => {
      appendSpokenExchange(exchange.heard, exchange.said, exchange.duration);
    },
    onError: (err) => {
      if (err === 'shopper_reply_limit' || err === 'access_revoked' || err === 'account_required') {
        setVoiceBlocked(true);
        live.stop();
        setVoiceMode('off');
        return;
      }
      setVoiceMode('off');
      if (err === 'idle') setVoiceError('voiceIdleEnded');
      else if (err === 'not-allowed') setVoiceError('micDenied');
      else if (err === 'audio-capture') setVoiceError('micMissing');
      else if (err === 'limit') setVoiceError('voiceLimitReached');
      else if (err === 'siteLimit') setVoiceError('voiceSiteLimit');
      else if (err === 'connection' || err === 'network') setVoiceError('micNetwork');
      else setVoiceError('voiceUnavailable');
    },
    onRefused: (code) => {
      if (code === 'shopper_reply_limit' || code === 'access_revoked' || code === 'account_required') {
        setVoiceBlocked(true);
      }
      setVoiceMode('off');
      setVoiceError('voiceUnavailable');
    },
  });

  const canConverse = typeof window !== 'undefined' &&
    !!(window as any).WebSocket &&
    !!(window.AudioContext || (window as any).webkitAudioContext) &&
    !!navigator.mediaDevices?.getUserMedia;

  // Idle-time, so opening the chat never waits on audio setup; no mic is requested here.
  const { prewarm } = live;
  useEffect(() => {
    if (!canConverse) return;
    const w = window as any;
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(prewarm, { timeout: 3000 });
      return () => w.cancelIdleCallback(id);
    }
    const id = window.setTimeout(prewarm, 1500);
    return () => window.clearTimeout(id);
  }, [canConverse, prewarm]);

  // The server ended the session; a dead overlay would keep saying "Listening".
  useEffect(() => {
    if (voiceMode === 'converse' && live.state === 'ended') {
      setVoiceMode('off');
      setVoiceError('voiceSessionEnded');
    }
  }, [voiceMode, live.state]);

  const startVoice = useCallback(async (mode: 'dictate' | 'converse') => {
    if (!isSecureOrigin()) { setVoiceError('micInsecure'); return; }
    setVoiceError('');
    setVoiceMode(mode);
    if (mode === 'dictate') {
      setDictateState('listening');
      await voice.start();
    } else {
      live.start();
    }
  }, [live, voice]);

  const stopVoice = useCallback(() => {
    setVoiceMode('off');
    setDictateState('idle');
    voice.stop();
    live.stop();
  }, [live, voice]);

  const voicePhase: VoicePhase =
    voiceMode === 'converse' ? toVoicePhase(live.state)
    : voiceMode === 'dictate' ? (dictateState === 'listening' ? (voice.hearing ? 'speaking' : 'listening') : dictateState)
    : 'idle';

  const voiceConnecting = voiceMode === 'converse' && (live.phase === 'connecting' || live.state === 'connecting');

  return {
    voiceMode,
    voicePhase,
    voiceConnecting,
    voiceError,
    setVoiceError,
    voiceMuted,
    setVoiceMuted,
    voiceSecondsLeft: live.secondsLeft ?? null,
    voiceBlocked,
    liveVoiceName,
    chooseVoice,
    canConverse,
    startVoice,
    stopVoice,
    voice,
    live,
  };
}
