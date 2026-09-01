import React, { useState, useRef, useEffect } from 'react';
import { useKiku, useAkropolysContext, resolveDisplayFields, ChatMessage, ChatSource } from '@akropolys/sdk';
import { renderMarkdown } from '../utils/markdown';
import { AkropolysTheme } from '@akropolys/sdk';
import { cn } from '../utils/cn';
import { ArrowUpIcon } from '../utils/icons';
import { resolveTheme } from '../utils/theme';
import { VoiceButton } from './VoiceButton';
import { VisualSearch } from './VisualSearch';
import { speak, stopSpeech } from '../utils/tts';

export interface ChatWidgetProps {
  title?: string;
  placeholder?: string;
  emptyStateText?: string;
  emptyStateSuggestions?: string;
  defaultCurrency?: string;
  className?: string;

  theme?: AkropolysTheme;

  classNames?: {
    root?: string;
    header?: string;
    messageBubble?: string;
    input?: string;
  };

  onSelectSource?: (source: ChatSource) => void;

  enableVoice?: boolean;
  /** Enable 📷 visual style-match search */
  enableVision?: boolean;

  visionCategoryHint?: string;

  /** Enable 🔊 TTS voice audio responses from AI */
  enableAudioResponse?: boolean;
  /** Optional AI voice preset */
  ttsVoice?: string;

  autoSpeakResponses?: boolean;
}

const SparkleIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
  </svg>
);

const SpeakerIcon = ({ active }: { active: boolean }) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill={active ? 'currentColor' : 'none'} />
    {active ? (
      <>
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
      </>
    ) : (
      <line x1="23" y1="9" x2="17" y2="15" />
    )}
  </svg>
);

function SourceCard({
  source,
  defaultCurrency,
  onSelect,
  isReferenced
}: {
  source: ChatSource;
  defaultCurrency: string;
  onSelect?: (s: ChatSource) => void;
  isReferenced?: boolean;
}) {
  return (
    <div
      className={cn("hsk-source-card", isReferenced && "hsk-source-card--referenced")}
      onClick={() => onSelect?.(source)}
    >
      {source.image && <img src={source.image} alt={source.name} className="hsk-source-img" />}
      <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
        {isReferenced && (
          <div className="hsk-cb-source-ref-badge" title="Featured in response" style={{ top: '0', right: '0' }}>
            <SparkleIcon />
          </div>
        )}
        <div className="hsk-source-name" style={{ paddingRight: isReferenced ? '20px' : undefined }}>{source.name}</div>
        {source.price && (
          <div className="hsk-source-price">{source.currency ?? defaultCurrency} {source.price}</div>
        )}
      </div>
    </div>
  );
}

interface ChatMessageWithVisual extends ChatMessage {
  imagePreview?: string;
  styleDNA?: any;
  visualSources?: ChatSource[];
}

export function ChatWidget({
  title = 'kiku',
  placeholder = 'Ask about anything in our store…',
  emptyStateText = 'Ask me anything about our products',
  emptyStateSuggestions = '"Find me headphones under KSh 5,000" · "Gift ideas"',
  defaultCurrency = 'KES',
  className,
  theme,
  classNames = {},
  onSelectSource,
  enableVoice = false,
  enableVision = false,
  visionCategoryHint,
  enableAudioResponse = true,
  ttsVoice,
  autoSpeakResponses = true
}: ChatWidgetProps) {
  const client = useAkropolysContext();
  const { messages, sources, referencedIds, loading: chatLoading, streaming, error, send, reset } = useKiku();
  const [input, setInput] = useState('');
  const [visualLoading, setVisualLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [audioEnabled, setAudioEnabled] = useState(enableAudioResponse);
  const [speakingMsgIndex, setSpeakingMsgIndex] = useState<number | null>(null);
  const prevStreamingRef = useRef(streaming);
  const userInitiatedVoiceRef = useRef(false);

  const loading = chatLoading || visualLoading;

  const [chatHistory, setChatHistory] = useState<ChatMessageWithVisual[]>([]);
  const lastSyncedCount = useRef(0);

  useEffect(() => {
    if (messages.length === 0) {
      setChatHistory([]);
      lastSyncedCount.current = 0;
      return;
    }

    if (messages.length > lastSyncedCount.current) {
      const newMsgs = messages.slice(lastSyncedCount.current);
      setChatHistory(prev => [...prev, ...newMsgs]);
      lastSyncedCount.current = messages.length;
    } else if (messages.length < lastSyncedCount.current) {
      setChatHistory(messages);
      lastSyncedCount.current = messages.length;
    } else {
      setChatHistory(prev => {
        const next = [...prev];
        let hookIdx = messages.length - 1;
        let historyIdx = next.length - 1;
        while (hookIdx >= 0 && historyIdx >= 0) {
          if (next[historyIdx].role === messages[hookIdx].role) {
            next[historyIdx] = {
              ...next[historyIdx],
              content: messages[hookIdx].content,
              actionType: messages[hookIdx].actionType,
              thinking: messages[hookIdx].thinking,
              thoughtForSeconds: messages[hookIdx].thoughtForSeconds,
              statusMessage: messages[hookIdx].statusMessage,
            };
            break;
          }
          historyIdx--;
        }
        return next;
      });
    }
  }, [messages]);

  useEffect(() => {
    const wasStreaming = prevStreamingRef.current;
    prevStreamingRef.current = streaming;

    const spoken = userInitiatedVoiceRef.current;
    userInitiatedVoiceRef.current = false;
    if (wasStreaming && !streaming && spoken && audioEnabled && autoSpeakResponses) {
      const lastMsgIndex = chatHistory.length - 1;
      const lastMsg = chatHistory[lastMsgIndex];
      if (lastMsg && lastMsg.role === 'assistant' && lastMsg.content) {
        setSpeakingMsgIndex(lastMsgIndex);
        void speak({
          client: client as any,
          text: lastMsg.content,
          voice: ttsVoice,
          language: client.getShopperLanguage?.(),
          onEnd: () => setSpeakingMsgIndex(null),
          onError: () => setSpeakingMsgIndex(null),
        });
      }
    }
  }, [streaming, audioEnabled, autoSpeakResponses, chatHistory, ttsVoice, client]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: loading ? 'auto' : 'smooth' });
  }, [chatHistory, loading]);

  const handleSend = async () => {
    const q = input.trim();
    if (!q || loading) return;
    stopSpeech();
    setSpeakingMsgIndex(null);
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    await send(q);
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const t = e.target;
    t.style.height = 'auto';
    t.style.height = Math.min(t.scrollHeight, 120) + 'px';
  };

  const handleSpeakToggle = (idx: number, text: string) => {
    if (speakingMsgIndex === idx) {
      stopSpeech();
      setSpeakingMsgIndex(null);
    } else {
      setSpeakingMsgIndex(idx);
      void speak({
        client: client as any,
        text,
        voice: ttsVoice,
        language: client.getShopperLanguage?.(),
        onEnd: () => setSpeakingMsgIndex(null),
        onError: () => setSpeakingMsgIndex(null),
      });
    }
  };

  const handleVisualResults = (res: any, preview: string) => {
    const userMsg: ChatMessageWithVisual = {
      role: 'user',
      content: 'Uploaded a photo for visual search',
      imagePreview: preview,
    };

    const dna = res.style_dna;
    let content = `I've analyzed your image! Here is the Style DNA I found:\n`;
    if (dna) {
      if (dna.color_palette) content += `* **Palette:** ${dna.color_palette}\n`;
      if (dna.dominant_colors && dna.dominant_colors.length > 0) {
        content += `* **Colors:** ${dna.dominant_colors.join(', ')}\n`;
      }
      if (dna.aesthetic && dna.aesthetic.length > 0) {
        content += `* **Aesthetic:** ${dna.aesthetic.join(', ')}\n`;
      }
      if (dna.texture) content += `* **Texture:** ${dna.texture}\n`;
      if (dna.formality) content += `* **Formality:** ${dna.formality}\n`;
    }

    const results = res.results || [];
    if (results.length > 0) {
      content += `\nI found ${results.length} matching products in the store for you.`;
    } else {
      content += `\nI couldn't find any matching products in the store.`;
    }

    const assistantMsg: ChatMessageWithVisual = {
      role: 'assistant',
      content,
      styleDNA: dna,
      visualSources: results.map((r: any) => {
        const fields = r.entity ?? {};
        const d = resolveDisplayFields(fields, undefined);
        return {
          id: r.id,
          url: r.url ?? fields.url,
          fields,
          name: d.title,
          price: d.price,
          image: d.image,
          brand: d.subtitle,
          currency: typeof fields.currency === 'string' ? fields.currency : undefined,
        };
      }),
    };

    setChatHistory(prev => [...prev, userMsg, assistantMsg]);
  };

  const { vars: customStyles } = resolveTheme(theme);

  return (
    <div
      className={cn("hsk-chat-widget", classNames.root, className)}
      style={customStyles}
    >
      <div className={cn("hsk-chat-header", classNames.header)}>
        <span className="hsk-chat-header-icon"><SparkleIcon /></span>
        <span className="hsk-chat-title">{title}</span>
        <span className="hsk-chat-badge">AI</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
          {enableAudioResponse && (
            <button
              type="button"
              className={cn("hsk-audio-toggle-btn", audioEnabled && "hsk-audio-toggle-btn--active")}
              onClick={() => {
                const next = !audioEnabled;
                setAudioEnabled(next);
                if (!next) {
                  stopSpeech();
                  setSpeakingMsgIndex(null);
                }
              }}
              title={audioEnabled ? "Mute AI audio response" : "Enable AI audio response"}
              aria-label={audioEnabled ? "Mute voice" : "Enable voice"}
            >
              <SpeakerIcon active={audioEnabled} />
            </button>
          )}
          {chatHistory.length > 0 && (
            <button className="hsk-chat-reset" onClick={() => { stopSpeech(); reset(); }}>Clear</button>
          )}
        </div>
      </div>

      <div className="hsk-chat-messages">
        {chatHistory.length === 0 ? (
          <div className="hsk-chat-empty">
            <div className="hsk-chat-empty-icon"><SparkleIcon /></div>
            <div>{emptyStateText}</div>
            <div className="hsk-chat-empty-suggestions">{emptyStateSuggestions}</div>
          </div>
        ) : (
          chatHistory.map((msg, idx) => (
            <div key={idx}>
              <div className={`hsk-msg-row ${msg.role}`}>
                <div className={cn("hsk-msg-avatar", msg.role === 'assistant' ? 'ai' : 'user')}>
                  {msg.role === 'assistant' ? <SparkleIcon /> : 'U'}
                </div>
                <div className={cn("hsk-msg-bubble", msg.role, classNames.messageBubble)}>
                  {msg.imagePreview && (
                    <div className="kiku-vs-preview-bubble" style={{ marginBottom: '8px' }}>
                      <img src={msg.imagePreview} alt="Uploaded Preview" className="kiku-vs-preview-bubble-img" style={{ maxWidth: '200px', borderRadius: '8px' }} />
                    </div>
                  )}
                  {msg.thinking && (
                    <details className="hsk-thinking-details" open={streaming && idx === chatHistory.length - 1 && !msg.content}>
                      <summary className="hsk-thinking-summary">
                        Thought for {msg.thoughtForSeconds ?? 1}s
                      </summary>
                      <div className="hsk-thinking-text">{msg.thinking}</div>
                    </details>
                  )}
                  {(!msg.content && !msg.thinking && msg.role === 'assistant' && idx === chatHistory.length - 1) && (
                    <div className="hsk-status-live">
                      <span className="hsk-status-dot" />
                      <span>{msg.statusMessage || 'Thinking...'}</span>
                    </div>
                  )}
                  {renderMarkdown(msg.content)}
                  {msg.role === 'assistant' && msg.content && !streaming && (
                    <button
                      type="button"
                      className={cn("hsk-msg-audio-btn", speakingMsgIndex === idx && "hsk-msg-audio-btn--active")}
                      onClick={() => handleSpeakToggle(idx, msg.content)}
                      title={speakingMsgIndex === idx ? "Stop speaking" : "Listen to response"}
                      aria-label="Toggle speech"
                    >
                      <SpeakerIcon active={speakingMsgIndex === idx} />
                    </button>
                  )}
                  {streaming && idx === chatHistory.length - 1 && msg.role === 'assistant' && (
                    <span className="hsk-streaming-cursor" />
                  )}
                  {msg.styleDNA && (
                    <div className="kiku-vs-preview-banner" style={{ marginTop: '10px' }}>
                      {chatHistory[idx - 1]?.imagePreview && (
                        <img src={chatHistory[idx - 1].imagePreview} alt="Visual Search Input" className="kiku-vs-preview-img" />
                      )}
                      <div className="kiku-vs-preview-info">
                        <div className="kiku-vs-preview-label">Visual Match Palette</div>
                        <div className="kiku-vs-preview-palette">{msg.styleDNA.color_palette || 'Detected Style DNA'}</div>
                        {msg.styleDNA.style_tags && msg.styleDNA.style_tags.length > 0 && (
                          <div className="kiku-style-tags">
                            {msg.styleDNA.style_tags.map((tag: string, ti: number) => (
                              <span key={ti} className="kiku-style-tag">#{tag}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              {msg.role === 'assistant' && msg.visualSources && msg.visualSources.length > 0 && (
                <div className="hsk-sources-container">
                  <div className="hsk-sources">
                    {msg.visualSources.map((src, si) => (
                      <SourceCard key={si} source={src} defaultCurrency={defaultCurrency} onSelect={onSelectSource} />
                    ))}
                  </div>
                </div>
              )}
              {msg.role === 'assistant' && idx === chatHistory.length - 1 && !msg.visualSources && sources.length > 0 && (() => {
                const isStreamingActive = chatLoading || streaming;
                if (isStreamingActive) {
                  return (
                    <div className="hsk-sources-container">
                      <div className="hsk-sources">
                        {sources.map((src, si) => {
                          const isReferenced = !!(src.id && referencedIds.includes(src.id));
                          return (
                            <SourceCard
                              key={si}
                              source={src}
                              defaultCurrency={defaultCurrency}
                              onSelect={onSelectSource}
                              isReferenced={isReferenced}
                            />
                          );
                        })}
                      </div>
                    </div>
                  );
                }

                const featured = sources.filter(src => src.id && referencedIds.includes(src.id));
                const general = referencedIds.length > 0
                  ? []
                  : sources.filter(src => !src.id || !referencedIds.includes(src.id));

                return (
                  <div className="hsk-sources-container">
                    {featured.length > 0 && (
                      <div className="hsk-sources-group" style={{ marginBottom: '10px' }}>
                        <div className="hsk-sources-group-title">⭐ Featured in response</div>
                        <div className="hsk-sources">
                          {featured.map((src, si) => (
                            <SourceCard
                              key={`feat-${si}`}
                              source={src}
                              defaultCurrency={defaultCurrency}
                              onSelect={onSelectSource}
                              isReferenced={true}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                    {general.length > 0 && (
                      <div className="hsk-sources-group">
                        {featured.length > 0 && <div className="hsk-sources-group-title">All matches</div>}
                        <div className="hsk-sources">
                          {general.map((src, si) => (
                            <SourceCard
                              key={`gen-${si}`}
                              source={src}
                              defaultCurrency={defaultCurrency}
                              onSelect={onSelectSource}
                              isReferenced={false}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          ))
        )}

        {loading && (
          <div className="hsk-msg-row">
            <div className="hsk-msg-avatar ai"><SparkleIcon /></div>
            <div className="hsk-pending" role="status" aria-live="polite">
              <div className="hsk-pending-glyph">
                <span className="hsk-pending-ring" />
                <span className="hsk-pending-dot" />
              </div>
              <div className="hsk-pending-text">
                <span className="hsk-pending-step step-1">Searching catalog</span>
                <span className="hsk-pending-step step-2">Reasoning</span>
                <span className="hsk-pending-step step-3">Composing</span>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="hsk-chat-error">
            {(() => {
              try {
                const parsed = JSON.parse(error);
                return parsed.error || parsed.message || error;
              } catch {
                return error;
              }
            })()}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="hsk-chat-input-area" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {enableVision && (
          <VisualSearch
            onResults={handleVisualResults}
            onError={(err) => console.error('[VisualSearch] error:', err)}
            categoryHint={visionCategoryHint}
            disabled={loading}
          />
        )}
        <textarea
          ref={textareaRef}
          className={cn("hsk-chat-input", classNames.input)}
          value={input}
          onChange={handleInput}
          onKeyDown={handleKey}
          placeholder={placeholder}
          rows={1}
          disabled={loading}
          style={{ flex: 1 }}
        />
        {enableVoice && (
          <VoiceButton
            onTranscript={(text) => {
              userInitiatedVoiceRef.current = true;
              stopSpeech();
              setSpeakingMsgIndex(null);
              setInput(text);
              send(text);
              setInput('');
            }}
            onInterim={(text) => setInput(text)}
            disabled={loading}
          />
        )}
        <button
          className="hsk-chat-send"
          onClick={handleSend}
          disabled={!input.trim() || loading}
          aria-label="Send message"
        >
          <ArrowUpIcon />
        </button>
      </div>
    </div>
  );
}

