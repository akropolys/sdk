import React from 'react';
import { SparkleIcon, CopyIcon, CheckIcon } from '../icons';
import type { UIStringKey } from '../types';

export interface PromptKeyCardProps {
  keyInput: string;
  setKeyInput: (val: string) => void;
  minting: boolean;
  handleUseExistingKey: () => void;
  handleCreateKey: () => void;
  t: (key: UIStringKey, vars?: Record<string, string>) => string;
}

export function PromptKeyCard({
  keyInput,
  setKeyInput,
  minting,
  handleUseExistingKey,
  handleCreateKey,
  t,
}: PromptKeyCardProps) {
  return (
    <div className="hsk-cb-ai-msg">
      <div className="hsk-cb-ai-icon" style={{ display: 'flex', alignItems: 'center' }}>
        <SparkleIcon />
      </div>
      <div className="hsk-cb-ai-body">
        <div className="hsk-cb-ai-text">
          <div className="hsk-cb-phone-form">
            <label className="hsk-cb-phone-label">{t('keyPastePrompt')}</label>
            <input
              type="text"
              className="hsk-cb-phone-input"
              placeholder={t('keyPastePlaceholder')}
              value={keyInput}
              onChange={e => setKeyInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleUseExistingKey()}
              autoFocus
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="hsk-cb-phone-submit" onClick={handleUseExistingKey} disabled={!keyInput.trim()}>
                {t('keyUseMine')}
              </button>
              <button className="hsk-cb-phone-submit" onClick={handleCreateKey} disabled={minting}>
                {minting ? t('keyCreating') : t('keyCreateNew')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export interface MintedKeyCardProps {
  mintedKey: string;
  copied: string | null;
  keyCountdown: number;
  onDismiss: () => void;
  copyValue: (val: string, type: 'secret' | 'pub') => void;
  t: (key: UIStringKey, vars?: Record<string, string>) => string;
}

export function MintedKeyCard({
  mintedKey,
  copied,
  keyCountdown,
  onDismiss,
  copyValue,
  t,
}: MintedKeyCardProps) {
  return (
    <div className="hsk-cb-ai-msg">
      <div className="hsk-cb-ai-icon" style={{ display: 'flex', alignItems: 'center' }}>
        <SparkleIcon />
      </div>
      <div className="hsk-cb-ai-body">
        <div className="hsk-cb-secret-card">
          <div className="hsk-cb-secret-head">
            <span className="hsk-cb-secret-title">{t('keySecretTitle')}</span>
            <span className="hsk-cb-secret-timer">{keyCountdown}s</span>
            <button type="button" className="hsk-cb-secret-dismiss" onClick={onDismiss} aria-label={t('keyDismiss')}>×</button>
          </div>
          <button type="button" className="hsk-cb-secret-key" onClick={() => copyValue(mintedKey, 'secret')}>
            <code>{mintedKey}</code>
            <span className="hsk-cb-secret-copy">{copied === 'secret' ? <CheckIcon /> : <CopyIcon />}{copied === 'secret' ? t('keyCopied') : t('keyCopySecret')}</span>
          </button>
          <span className="hsk-cb-secret-hint">{t('keySecretHint')}</span>
        </div>
      </div>
    </div>
  );
}
