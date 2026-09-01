import React from 'react';
import { SparkleIcon } from '../icons';
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
  mintedPub: string | null;
  copied: string | null;
  keyCountdown: number;
  onDismiss: () => void;
  copyValue: (val: string, type: 'secret' | 'pub') => void;
  t: (key: UIStringKey, vars?: Record<string, string>) => string;
}

export function MintedKeyCard({
  mintedKey,
  mintedPub,
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
        <div className="hsk-cb-ai-text">
          <div style={{ padding: '4px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>{t('keySecretTitle')}</span>
                <button
                  className="hsk-cb-phone-submit"
                  style={{ padding: '2px 8px', fontSize: 11, background: 'transparent', border: 0 }}
                  onClick={onDismiss}
                >
                  {t('keyDismiss')} ✕
                </button>
              </div>
              <code style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 8, wordBreak: 'break-all' }}>{mintedKey}</code>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <button className="hsk-cb-phone-submit" style={{ padding: '4px 10px', border: 0 }} onClick={() => copyValue(mintedKey, 'secret')}>
                  {copied === 'secret' ? t('keyCopied') : t('keyCopySecret')}
                </button>
                <span style={{ fontSize: 11, opacity: 0.7, flex: '1 1 180px' }}>
                  {t('keySecretHint')}
                </span>
              </div>
            </div>
            {mintedPub && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{t('keyPublicTitle')}</div>
                <code style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, wordBreak: 'break-all', opacity: 0.85 }}>{mintedPub}</code>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button className="hsk-cb-phone-submit" style={{ padding: '4px 10px', border: 0 }} onClick={() => copyValue(mintedPub, 'pub')}>
                    {copied === 'pub' ? t('keyCopied') : t('keyCopyId')}
                  </button>
                  <span style={{ fontSize: 11, opacity: 0.7, flex: '1 1 180px' }}>
                    {t('keyPublicHint')}
                  </span>
                </div>
              </div>
            )}
            <div style={{ fontSize: 11, opacity: 0.6 }}>{t('keyAutoHide', { seconds: String(keyCountdown) })}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
