import React, { useState, useRef, useEffect } from 'react';
import { useKiku, ChatMessage, ChatSource } from '@akropolys/sdk';
import { renderMarkdown } from '../utils/markdown';
import { AkropolysTheme } from '@akropolys/sdk';
import { cn } from '../utils/cn';
import { ArrowUpIcon } from '../utils/icons';
import { resolveTheme } from '../utils/theme';
import { VoiceButton } from './VoiceButton';
import { VisualSearch } from './VisualSearch';


export interface ChatWidgetProps {
  title?: string;
  placeholder?: string;
  emptyStateText?: string;
  emptyStateSuggestions?: string;
  defaultCurrency?: string;
  className?: string;
  
  // Allow overriding styles via standard CSS variables
  theme?: AkropolysTheme;
  
  // Allow targeting specific elements with custom classes (e.g. Tailwind)
  classNames?: {
    root?: string;
    header?: string;
    messageBubble?: string;
    input?: string;
  };
  
  onSelectSource?: (source: ChatSource) => void;

  /** Enable 🎙️ voice input via browser Web Speech API (free) */
  enableVoice?: boolean;
  /** Enable 📷 visual style-match search via Gemini (requires backend GEMINI_API_KEY) */
  enableVision?: boolean;
  /** Optional category hint for visual search (e.g. 'dress', 'curtains') */
  visionCategoryHint?: string;
}


const SparkleIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
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
  visionCategoryHint
}: ChatWidgetProps) {
  const { messages, sources, referencedIds, loading: chatLoading, streaming, error, send, reset } = useKiku();
  const [input, setInput] = useState('');
  const [visualLoading, setVisualLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, loading]);

  const handleSend = async () => {
    const q = input.trim();
    if (!q || loading) return;
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    await send(q);
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
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
      visualSources: results.map((r: any) => ({
        id: r.id,
        name: r.product.name,
        price: r.product.price,
        currency: r.product.currency,
        category: r.product.category,
        url: r.product.url,
        image: r.product.images && r.product.images.length > 0 ? r.product.images[0] : undefined,
        brand: r.product.brand,
      })),
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
        {chatHistory.length > 0 && (
          <button className="hsk-chat-reset" onClick={reset} style={{ marginLeft: 'auto' }}>Clear</button>
        )}
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
                  {renderMarkdown(msg.content)}
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

                // Streaming finished: show the products the answer actually
                // references. Only fall back to the full candidate list when the
                // answer referenced none — showing unrelated matches (a kids'
                // sandal for a "heels to match my dress" query) reads as a bug.
                const featured = sources.filter(src => src.id && referencedIds.includes(src.id));
                // Only fall back to the candidate list when the answer referenced
                // nothing at all. If it referenced specific items, show just those —
                // never dump unrelated matches (e.g. phones for a sofa question).
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


