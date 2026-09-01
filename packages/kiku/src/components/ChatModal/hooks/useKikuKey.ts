import { useState, useEffect, useCallback } from 'react';
import type { ChatAction } from '@akropolys/sdk';
import { useAkropolysContext } from '@akropolys/sdk';
import { KIKU_KEY_REVEAL_SECONDS } from '../types';

export function useKikuKey(lastAction: ChatAction | null, retryLastMessage: () => Promise<void>) {
  const client = useAkropolysContext();
  const [keyInput, setKeyInput] = useState('');
  const [keyPhase, setKeyPhase] = useState<'idle' | 'prompt_key'>('idle');
  const [mintedKey, setMintedKey] = useState<string | null>(null);
  const [mintedPub, setMintedPub] = useState<string | null>(null);
  const [copied, setCopied] = useState<'secret' | 'pub' | null>(null);
  const [keyCountdown, setKeyCountdown] = useState(KIKU_KEY_REVEAL_SECONDS);
  const [minting, setMinting] = useState(false);

  const copyValue = useCallback(async (val: string, type: 'secret' | 'pub') => {
    try {
      await navigator.clipboard.writeText(val);
      setCopied(type);
      setTimeout(() => setCopied(null), 2000);
    } catch {  }
  }, []);

  useEffect(() => {
    if (!lastAction) return;
    if (lastAction.type === 'request_kiku_key') {
      setKeyPhase('prompt_key');
      setKeyInput('');
    }
  }, [lastAction]);

  useEffect(() => {
    if (!mintedKey) return;
    setKeyCountdown(KIKU_KEY_REVEAL_SECONDS);
    const t = setInterval(() => {
      setKeyCountdown(s => {
        if (s <= 1) {
          clearInterval(t);
          setMintedKey(null);
          setMintedPub(null);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [mintedKey]);

  const handleUseExistingKey = useCallback(async () => {
    const pub = keyInput.trim();
    if (!pub) return;
    client.setKikuPub(pub);
    setKeyInput('');
    setKeyPhase('idle');
    await retryLastMessage();
  }, [client, keyInput, retryLastMessage]);

  const handleCreateKey = useCallback(async () => {
    if (minting) return;
    setMinting(true);
    try {
      const { secret, publicId } = await client.mintKikuKey();
      setMintedKey(secret);
      setMintedPub(publicId);
      setKeyPhase('idle');
      await retryLastMessage();
    } catch {  } finally {
      setMinting(false);
    }
  }, [client, minting, retryLastMessage]);

  return {
    keyInput,
    setKeyInput,
    keyPhase,
    setKeyPhase,
    mintedKey,
    setMintedKey,
    mintedPub,
    setMintedPub,
    copied,
    keyCountdown,
    minting,
    copyValue,
    handleUseExistingKey,
    handleCreateKey,
  };
}
