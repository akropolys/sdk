import React, { useState, useRef, useEffect } from 'react';
import { useChat, ChatMessage, ChatSource } from '../hooks/useChat';
import { renderMarkdown } from '../utils/markdown';
import { HuskelTheme } from '../types';
import { cn } from '../utils/cn';



// Better Prop Interface for SDKs
export interface ChatWidgetProps {
  title?: string;
  placeholder?: string;
  emptyStateText?: string;
  emptyStateSuggestions?: string;
  defaultCurrency?: string;
  className?: string;
  
  // Allow overriding styles via standard CSS variables
  theme?: HuskelTheme;
  
  // Allow targeting specific elements with custom classes (e.g. Tailwind)
  classNames?: {
    root?: string;
    header?: string;
    messageBubble?: string;
    input?: string;
  };
  
  onSelectSource?: (source: ChatSource) => void;
}

// Simple SVG Icons instead of text characters
const SparkleIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
  </svg>
);

const ArrowUpIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m5 12 7-7 7 7"/>
    <path d="M12 19V5"/>
  </svg>
);

function SourceCard({ source, defaultCurrency, onSelect }: { source: ChatSource; defaultCurrency: string; onSelect?: (s: ChatSource) => void }) {
  return (
    <div className="hsk-source-card" onClick={() => onSelect?.(source)}>
      {source.image && <img src={source.image} alt={source.name} className="hsk-source-img" />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="hsk-source-name">{source.name}</div>
        {source.price && (
          <div className="hsk-source-price">{source.currency ?? defaultCurrency} {source.price}</div>
        )}
      </div>
    </div>
  );
}

export function ChatWidget({ 
  title = 'AI Shopping Assistant',
  placeholder = 'Ask about anything in our store…', 
  emptyStateText = 'Ask me anything about our products',
  emptyStateSuggestions = '"Find me headphones under KSh 5,000" · "Gift ideas"',
  defaultCurrency = 'KES',
  className,
  theme,
  classNames = {},
  onSelectSource 
}: ChatWidgetProps) {
  const { messages, sources, loading, error, send, reset } = useChat();
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

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

  // Apply custom CSS variables inline to the root wrapper
  const customStyles = {
    ...(theme?.primaryColor && { '--hsk-primary': theme.primaryColor }),
    ...(theme?.backgroundColor && { '--hsk-bg': theme.backgroundColor }),
    ...(theme?.textColor && { '--hsk-text': theme.textColor }),
    ...(theme?.fontFamily && { '--hsk-font': theme.fontFamily }),
    ...(theme?.borderRadius && { '--hsk-border-radius': theme.borderRadius }),
  } as React.CSSProperties;

  return (
    <div 
      className={cn("hsk-chat-widget", classNames.root, className)} 
      style={customStyles}
    >
      <div className={cn("hsk-chat-header", classNames.header)}>
        <span className="hsk-chat-header-icon"><SparkleIcon /></span>
        <span className="hsk-chat-title">{title}</span>
        <span className="hsk-chat-badge">AI</span>
        {messages.length > 0 && (
          <button className="hsk-chat-reset" onClick={reset} style={{ marginLeft: 'auto' }}>Clear</button>
        )}
      </div>

      <div className="hsk-chat-messages">
        {messages.length === 0 ? (
          <div className="hsk-chat-empty">
            <div className="hsk-chat-empty-icon"><SparkleIcon /></div>
            <div>{emptyStateText}</div>
            <div className="hsk-chat-empty-suggestions">{emptyStateSuggestions}</div>
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div key={idx}>
              <div className={`hsk-msg-row ${msg.role}`}>
                <div className={cn("hsk-msg-avatar", msg.role === 'assistant' ? 'ai' : 'user')}>
                  {msg.role === 'assistant' ? <SparkleIcon /> : 'U'}
                </div>
                <div className={cn("hsk-msg-bubble", msg.role, classNames.messageBubble)}>
                  {renderMarkdown(msg.content)}
                </div>
              </div>
              {msg.role === 'assistant' && idx === messages.length - 1 && sources.length > 0 && (
                <div className="hsk-sources-container">
                  <div className="hsk-sources">
                    {sources.map((src, si) => (
                      <SourceCard key={si} source={src} defaultCurrency={defaultCurrency} onSelect={onSelectSource} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))
        )}

        {loading && (
          <div className="hsk-msg-row">
            <div className="hsk-msg-avatar ai"><SparkleIcon /></div>
            <div className="hsk-typing">
              <div className="hsk-typing-dot" /><div className="hsk-typing-dot" /><div className="hsk-typing-dot" />
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

      <div className="hsk-chat-input-area">
        <textarea
          ref={textareaRef}
          className={cn("hsk-chat-input", classNames.input)}
          value={input}
          onChange={handleInput}
          onKeyDown={handleKey}
          placeholder={placeholder}
          rows={1}
          disabled={loading}
        />
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

