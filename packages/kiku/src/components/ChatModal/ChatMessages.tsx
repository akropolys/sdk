import React from 'react';
import type { ChatMessage, ChatSource, ChatAction } from '@akropolys/sdk';
import { cn } from '../../utils/cn';
import { ContinueIcon } from './icons';
import { getFriendlyError, type UIStringKey } from './types';
import { MessageItem } from './components/MessageItem';
import { PromptKeyCard, MintedKeyCard } from './components/MemoryKeyCards';

export interface ChatMessagesProps {
  displayMessages: ChatMessage[];
  messageRefs: React.MutableRefObject<(HTMLDivElement | null)[]>;
  isNarrow: boolean;
  loading: boolean;
  streaming: boolean;
  sources: ChatSource[];
  referencedIds: string[];
  discussedSources: ChatSource[];
  lastIntent: string | null;
  lastAction: ChatAction | null;
  defaultCurrency: string;
  stopped: boolean;
  interrupted: boolean;
  halted: boolean;
  haltedEmpty: boolean;
  error: string | null;
  errorCode: string | null;
  keyPhase: string;
  keyInput: string;
  setKeyInput: (val: string) => void;
  mintedKey: string | null;
  setMintedKey: (val: string | null) => void;
  mintedPub: string | null;
  setMintedPub: (val: string | null) => void;
  minting: boolean;
  copied: string | null;
  keyCountdown: number;
  handleUseExistingKey: () => void;
  handleCreateKey: () => void;
  copyValue: (val: string, type: 'secret' | 'pub') => void;
  queuedMessage: ChatMessage | null;
  sendQueuedNow: () => void;
  setLightboxSrc: (src: string | null) => void;
  setMarkupSrc: (src: string | null) => void;
  handleSend: (text?: string) => Promise<void>;
  handleSourceClick: (src: ChatSource) => void;
  continueGenerating: () => void;
  t: (key: UIStringKey, vars?: Record<string, string>) => string;
  bottomRef: React.RefObject<HTMLDivElement | null>;
  vizState: Record<string, 'ok' | 'err'>;
  setVizState: React.Dispatch<React.SetStateAction<Record<string, 'ok' | 'err'>>>;
  messages: ChatMessage[];
}

export function ChatMessages({
  displayMessages,
  messageRefs,
  isNarrow,
  loading,
  streaming,
  sources,
  referencedIds,
  discussedSources,
  lastIntent,
  lastAction,
  defaultCurrency,
  stopped,
  interrupted,
  halted,
  haltedEmpty,
  error,
  errorCode,
  keyPhase,
  keyInput,
  setKeyInput,
  mintedKey,
  setMintedKey,
  mintedPub,
  setMintedPub,
  minting,
  copied,
  keyCountdown,
  handleUseExistingKey,
  handleCreateKey,
  copyValue,
  queuedMessage,
  sendQueuedNow,
  setLightboxSrc,
  setMarkupSrc,
  handleSend,
  handleSourceClick,
  continueGenerating,
  t,
  bottomRef,
  vizState,
  setVizState,
  messages,
}: ChatMessagesProps) {
  return (
    <>
      {(() => {
        let lastUserIdx = -1;
        for (let i = displayMessages.length - 1; i >= 0; i--) {
          if (displayMessages[i]?.role === 'user') {
            lastUserIdx = i;
            break;
          }
        }
        return displayMessages.map((msg: ChatMessage, idx: number) => {
          const isLast = idx === displayMessages.length - 1;
          const isUser = msg.role === 'user';
          const isLastUser = isUser && idx === lastUserIdx;
          const isRunEnd = isUser && displayMessages[idx + 1]?.role !== 'user';
          const runMid = isUser && !isRunEnd;
          const runCont = isUser && displayMessages[idx - 1]?.role === 'user';
          const key = (msg as any).id || `${msg.role}-${idx}`;

          return (
            <MessageItem
              key={key}
              msg={msg}
              idx={idx}
              isLast={isLast}
              isLastUser={isLastUser}
              isRunEnd={isRunEnd}
              runMid={runMid}
              runCont={runCont}
              isNarrow={isNarrow}
              loading={loading}
              streaming={streaming}
              stopped={stopped}
              interrupted={interrupted}
              sources={sources}
              referencedIds={referencedIds}
              discussedSources={discussedSources}
              lastIntent={lastIntent}
              lastAction={lastAction}
              defaultCurrency={defaultCurrency}
              vizState={vizState}
              setVizState={setVizState}
              setLightboxSrc={setLightboxSrc}
              setMarkupSrc={setMarkupSrc}
              handleSend={handleSend}
              handleSourceClick={handleSourceClick}
              t={t}
              messageRef={(el) => { messageRefs.current[idx] = el; }}
            />
          );
        });
      })()}

      {halted && messages.length > 0 && (
        <div className={cn("hsk-cb-stopped", haltedEmpty && "hsk-cb-stopped--empty")}>
          {haltedEmpty && (
            <span className="hsk-cb-stopped-dots" aria-hidden="true">
              <i /><i /><i />
            </span>
          )}
          <span className="hsk-cb-stopped-label">
            {stopped ? t('stoppedByYou') : t('stoppedInterrupted')}
          </span>
          <button className="hsk-cb-continue" onClick={continueGenerating}>
            <ContinueIcon />
            {t(messages[messages.length - 1]?.role === 'assistant' ? 'continueGenerating' : 'generateResponse')}
          </button>
        </div>
      )}

      {error && <div className="hsk-cb-error">{getFriendlyError({ code: errorCode ?? undefined, message: error }, t)}</div>}

      {keyPhase === 'prompt_key' && (
        <PromptKeyCard
          keyInput={keyInput}
          setKeyInput={setKeyInput}
          minting={minting}
          handleUseExistingKey={handleUseExistingKey}
          handleCreateKey={handleCreateKey}
          t={t}
        />
      )}

      {mintedKey && (
        <MintedKeyCard
          mintedKey={mintedKey}
          mintedPub={mintedPub}
          copied={copied}
          keyCountdown={keyCountdown}
          onDismiss={() => { setMintedKey(null); setMintedPub(null); }}
          copyValue={copyValue}
          t={t}
        />
      )}

      {queuedMessage && (
        <div className={cn(
          'hsk-cb-msg-group',
          displayMessages[displayMessages.length - 1]?.role === 'user' && 'hsk-cb-msg-group--run-cont',
        )}>
          <div className="hsk-cb-user-msg">
            <div className="hsk-cb-user-bubble hsk-cb-user-bubble--tail hsk-cb-user-bubble--queued">
              {queuedMessage.content}
            </div>
            <button type="button" className="hsk-cb-queued-status" onClick={sendQueuedNow}>
              <span className="hsk-cb-queued-dot" />
              {t('queuedWaiting')}
              <span className="hsk-cb-queued-now">{t('queuedSendNow')}</span>
            </button>
          </div>
        </div>
      )}

      <div ref={bottomRef as any} style={{ height: 1 }} />
    </>
  );
}
