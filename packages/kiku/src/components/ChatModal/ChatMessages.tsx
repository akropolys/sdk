import React from 'react';
import type { ChatMessage, ChatSource, ChatAction } from '@akropolys/sdk';
import { cn } from '../../utils/cn';
import { ContinueIcon } from './icons';
import { getFriendlyError, type UIStringKey } from './types';
import { MessageItem } from './components/MessageItem';
import { parseThinking } from './components/ThinkingBlock';
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
  setMintedPub: (val: string | null) => void;
  minting: boolean;
  copied: string | null;
  keyCountdown: number;
  handleUseExistingKey: () => void;
  handleCreateKey: () => void;
  copyValue: (val: string, type: 'secret' | 'pub') => void;
  queuedMessage: ChatMessage | null;
  sendQueuedNow: () => void;
  setLightboxSrc: (src: string | null, gallery?: import('./components/LightboxModal').LightboxGalleryData) => void;
  setMarkupSrc: (src: string | null) => void;
  handleSend: (text?: string) => Promise<void>;
  handleSourceClick: (src: ChatSource) => void;
  onRetry?: (msg: ChatMessage) => void;
  onEdit?: (msg: ChatMessage) => void;
  onLongPress?: (msg: ChatMessage, rect: { top: number; left: number; width: number; height: number }, isUser: boolean, el: HTMLElement) => void;
  retrying?: boolean;
  continueGenerating: () => void;
  t: (key: UIStringKey, vars?: Record<string, string>) => string;
  spacerRef: React.RefObject<HTMLDivElement | null>;
  vizState: Record<string, 'ok' | 'err'>;
  setVizState: React.Dispatch<React.SetStateAction<Record<string, 'ok' | 'err'>>>;
  messages: ChatMessage[];
  doodleTheme?: string;
}

function latestPicture(messages: ChatMessage[], before: number): string | undefined {
  for (let i = before - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.visualization && m.visualizationType !== 'video') return m.visualization;
    if (m.images?.length) return m.images[m.images.length - 1];
  }
  return undefined;
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
  onRetry,
  onEdit,
  onLongPress,
  retrying,
  continueGenerating,
  t,
  spacerRef,
  vizState,
  setVizState,
  messages,
  doodleTheme,
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
          // A voice turn often lands as filler then answer; both roles stack as one run.
          const isRunEnd = displayMessages[idx + 1]?.role !== msg.role;
          const runMid = !isRunEnd;
          const runCont = displayMessages[idx - 1]?.role === msg.role;
          const key = (msg as any).id || `${msg.role}-${idx}`;
          // The photo just sent is in flight until the reply starts; a render reworks the latest picture before it.
          const reply = displayMessages[idx + 1]?.content ?? '';
          const photosSending = isLastUser && (loading || streaming) && !parseThinking(reply).content.trim();
          const workingOn = msg.visualizing ? latestPicture(displayMessages, idx) : undefined;
          const hasError = (isLastUser && Boolean(error)) ||
            (!isUser && isLast && Boolean(error)) ||
            (!isUser && Boolean(msg.content?.includes("We're experiencing high demand right now")));

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
              vizState={vizState}
              setVizState={setVizState}
              setLightboxSrc={setLightboxSrc}
              setMarkupSrc={setMarkupSrc}
              handleSend={handleSend}
              handleSourceClick={handleSourceClick}
              onRetry={onRetry}
              onEdit={onEdit}
              onLongPress={onLongPress}
              hasError={hasError}
              retrying={retrying}
              t={t}
              messageRef={(el) => { messageRefs.current[idx] = el; }}
              photosSending={photosSending}
              workingOn={workingOn}
              doodleTheme={doodleTheme}
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

      <div ref={spacerRef as any} className="hsk-cb-msgs-spacer" />
    </>
  );
}
