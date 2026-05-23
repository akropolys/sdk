import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useSearch } from '../hooks/useSearch';
import { useChat } from '../hooks/useChat';
import { useHuskelContext } from './HuskelProvider';
import { renderMarkdown } from '../utils/markdown';
import { SearchResult, Product, HuskelTheme } from '../types';

export interface SparkleProps {
  productName: string;
  limit?: number;
  onResult?: (results: SearchResult[]) => void;
  /** Override the backdrop colour (any CSS colour/gradient) */
  backdropColor?: string;
  /** Override backdrop blur — e.g. "8px" or 8 */
  backdropBlur?: string | number;
  /** Extra classes on the trigger button */
  className?: string;
  /** Called when user clicks a result — return false to prevent default navigation */
  onNavigate?: (result: SearchResult) => boolean | void;
  theme?: HuskelTheme;
  classNames?: {
    button?: string;
    backdrop?: string;
    card?: string;
    item?: string;
  };
  product?: Product;
}

const SparkleIcon = ({ className }: { className?: string }) => (
  <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
  </svg>
);

const CloseIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"></line>
    <line x1="6" y1="6" x2="18" y2="18"></line>
  </svg>
);

const ArrowUpIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m5 12 7-7 7 7"/>
    <path d="M12 19V5"/>
  </svg>
);

/* ── Modal ────────────────────────────────────────────────────────────────── */
interface ModalProps extends Pick<SparkleProps, 'productName' | 'limit' | 'backdropColor' | 'backdropBlur' | 'onNavigate' | 'onResult' | 'theme' | 'classNames' | 'product'> {
  onClose: () => void;
}

const getFriendlyError = (err: any) => {
  let str = '';
  if (typeof err === 'string') str = err;
  else if (err && typeof err === 'object' && err.message) str = err.message;
  else try { str = JSON.stringify(err); } catch { str = String(err); }

  if (str.toLowerCase().includes('token limit')) {
    return "You've reached your usage limit. Please update your billing limits in your dashboard to continue.";
  }

  try {
    const parsed = JSON.parse(str);
    return parsed.error || parsed.message || str;
  } catch {
    return str;
  }
};

function SparkleModal({ 
  productName, 
  limit, 
  backdropColor, 
  backdropBlur, 
  onClose, 
  onNavigate, 
  onResult,
  theme,
  classNames = {},
  product: initialProduct,
}: ModalProps) {
  const client = useHuskelContext();
  const [fetchedProduct, setFetchedProduct] = useState<Product | null>(null);
  const displayProduct = initialProduct || fetchedProduct;
  const { results, loading: searchLoading, search } = useSearch();
  const { messages, sources, loading: chatLoading, error: chatError, send } = useChat();
  const [chatInput, setChatInput] = useState('');
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const chatTextareaRef = useRef<HTMLTextAreaElement>(null);

  /* auto-search and product fetching on open */
  useEffect(() => {
    if (!initialProduct && !fetchedProduct) {
      client.api.searchVector(productName, 1)
        .then(res => {
          if (res.results && res.results.length > 0) {
            setFetchedProduct(res.results[0].product);
          }
        })
        .catch(err => console.error('[Huskel] Failed to fetch product details', err));
    }
    search(productName, limit);
  }, [productName, initialProduct, fetchedProduct, client, limit, search]);

  /* fire callback */
  useEffect(() => { if (results.length > 0) onResult?.(results); }, [results, onResult]);

  /* Escape key */
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  /* Scroll chat to bottom */
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, chatLoading]);

  const blurVal = typeof backdropBlur === 'number' ? `${backdropBlur}px` : (backdropBlur ?? '16px');
  const bg = backdropColor ?? undefined;

  const handleNav = (r: SearchResult) => {
    const prevent = onNavigate?.(r);
    if (prevent !== false) {
      onClose();
      if (r.product.url) window.location.href = r.product.url;
    }
  };

  const handleSend = async (text?: string) => {
    const q = (text ?? chatInput).trim();
    if (!q || chatLoading) return;
    setChatInput('');
    if (chatTextareaRef.current) {
      chatTextareaRef.current.style.height = 'auto';
    }

    if (messages.length === 0 && displayProduct) {
      const contextQuery = `[Context: Shopper is viewing "${displayProduct.name}". Price: ${displayProduct.price}. Description: ${displayProduct.description || ''}]\n\nQuestion: ${q}`;
      await send(contextQuery, q);
    } else {
      await send(q);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setChatInput(e.target.value);
    const t = e.target;
    t.style.height = 'auto';
    t.style.height = `${Math.min(t.scrollHeight, 140)}px`;
  };

  const customStyles = {
    ...(theme?.primaryColor && { '--hsk-primary': theme.primaryColor }),
    ...(theme?.backgroundColor && { '--hsk-bg': theme.backgroundColor }),
    ...(theme?.textColor && { '--hsk-text': theme.textColor }),
    ...(theme?.fontFamily && { '--hsk-font': theme.fontFamily }),
    ...(theme?.borderRadius && { '--hsk-border-radius': theme.borderRadius }),
  } as React.CSSProperties;

  const displayMessages = messages.length === 0 && displayProduct
    ? [
        {
          role: 'assistant' as const,
          content: `Hi! I can help you with **${displayProduct.name}**. Ask me about its specifications, features, compare it with other options, or find alternatives!`,
        },
      ]
    : messages;

  return (
    <div
      className={`hsk-sp-backdrop ${classNames.backdrop || ''}`}
      onClick={onClose}
      style={{
        backdropFilter: `blur(${blurVal})`,
        WebkitBackdropFilter: `blur(${blurVal})`,
        background: bg ?? undefined,
        ...customStyles,
      }}
    >
      <div className={`hsk-sp-card hsk-sp-fullscreen ${classNames.card || ''}`} onClick={e => e.stopPropagation()}>
        <div className="hsk-sp-header">
          <span className="hsk-sp-header-icon" style={{ display: 'flex', alignItems: 'center' }}>
            <SparkleIcon />
          </span>
          <div className="hsk-sp-header-body">
            <div className="hsk-sp-header-title">{displayProduct?.name || productName}</div>
            <div className="hsk-sp-header-sub">Ask questions, compare specs, or check similar products</div>
          </div>
          <button className="hsk-sp-close" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        {searchLoading && <div className="hsk-sp-bar" />}

        {/* Split pane body */}
        <div className="hsk-sp-body">
          {/* Left Pane: Product Profile */}
          <div className="hsk-sp-details-pane">
            {displayProduct && (
              <div className="hsk-sp-product-profile-container">
                <div className="hsk-sp-product-profile">
                  <div className="hsk-sp-details-imgwrap">
                    {displayProduct.images?.[0] ? (
                      <img src={displayProduct.images[0]} alt={displayProduct.name} />
                    ) : (
                      <span className="hsk-sp-img-placeholder">🛍</span>
                    )}
                  </div>
                  <div className="hsk-sp-details-meta">
                    {displayProduct.brand && <span className="hsk-sp-item-brand">{displayProduct.brand}</span>}
                    {displayProduct.category && <span className="hsk-sp-item-cat">{displayProduct.category}</span>}
                    <h2 className="hsk-sp-details-name">{displayProduct.name}</h2>
                    <div className="hsk-sp-item-price-row">
                      <span className="hsk-sp-item-currency">{displayProduct.currency ?? 'KES'}</span>
                      <span className="hsk-sp-item-price">{parseFloat(displayProduct.price?.replace(/[^0-9.]/g, '') || '0').toLocaleString()}</span>
                      {displayProduct.originalPrice && (
                        <span className="hsk-sp-item-original-price">
                          {parseFloat(displayProduct.originalPrice.replace(/[^0-9.]/g, '') || '0').toLocaleString()}
                        </span>
                      )}
                      {displayProduct.discount && (
                        <span className="hsk-sp-item-discount">({displayProduct.discount})</span>
                      )}
                    </div>
                    
                    <div className="hsk-sp-item-meta-badges">
                      {displayProduct.rating && (
                        <span className="hsk-sp-meta-badge hsk-sp-meta-badge-rating">
                          ★ {parseFloat(displayProduct.rating.toString()).toFixed(1)} {displayProduct.reviewCount ? `(${displayProduct.reviewCount})` : ''}
                        </span>
                      )}
                      {displayProduct.availability && (
                        <span className={`hsk-sp-meta-badge hsk-sp-meta-badge-avail ${displayProduct.availability.toLowerCase().includes('in') ? 'in-stock' : 'out-stock'}`}>
                          {displayProduct.availability}
                        </span>
                      )}
                      {displayProduct.stock && !displayProduct.availability && (
                        <span className="hsk-sp-meta-badge hsk-sp-meta-badge-stock">
                          Stock: {displayProduct.stock}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {displayProduct.specs && Object.keys(displayProduct.specs).length > 0 && (
                  <div className="hsk-sp-specs-horizontal">
                    {Object.entries(displayProduct.specs).map(([key, val]) => (
                      <div key={key} className="hsk-sp-spec-item-horizontal">
                        <span className="hsk-sp-spec-label-horizontal">{key}:</span>
                        <span className="hsk-sp-spec-value-horizontal" title={val}>{val}</span>
                      </div>
                    ))}
                  </div>
                )}

                {displayProduct.description && (
                  <div className="hsk-sp-details-desc">
                    <h4>Description</h4>
                    <p>{displayProduct.description}</p>
                  </div>
                )}
              </div>
            )}

            {/* Similar Products */}
            <div className="hsk-sp-similar-section">
              <h3>Similar Products</h3>
              <div className="hsk-sp-results">
                {(() => {
                  const similarProducts = results.filter(
                    r => {
                      const isSameName = r.product.name.toLowerCase() === displayProduct?.name?.toLowerCase();
                      const isSameSlug = r.product.slug && displayProduct?.slug && r.product.slug.toLowerCase() === displayProduct.slug.toLowerCase();
                      return !isSameName && !isSameSlug;
                    }
                  );

                  if (!searchLoading && similarProducts.length === 0) {
                    return <div className="hsk-sp-empty">No similar products found.</div>;
                  }

                  return similarProducts.map((r, i) => {
                    const price = parseFloat(r.product.price?.replace(/[^0-9.]/g, '') || '0');
                    const currency = r.product.currency ?? 'KES';
                    return (
                      <div
                        key={r.id}
                        className={`hsk-sp-item ${classNames.item || ''}`}
                        style={{ animationDelay: `${i * 55}ms` }}
                      >
                        <div className="hsk-sp-img-wrap">
                          {r.product.images?.[0] ? (
                            <img src={r.product.images[0]} alt={r.product.name} />
                          ) : (
                            <span className="hsk-sp-img-placeholder">🛍</span>
                          )}
                        </div>
                        <div className="hsk-sp-item-body">
                          <div>
                            {r.product.category && (
                              <div className="hsk-sp-item-cat">{r.product.category}</div>
                            )}
                            <div className="hsk-sp-item-name" title={r.product.name}>{r.product.name}</div>
                          </div>
                          <div className="hsk-sp-item-price-row">
                            <span className="hsk-sp-item-currency">{currency}</span>
                            <span className="hsk-sp-item-price">{price.toLocaleString()}</span>
                          </div>
                          <div className="hsk-sp-actions">
                            <button
                              className="hsk-sp-action hsk-sp-action-primary"
                              onClick={() => handleNav(r)}
                            >
                              View
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          </div>

          {/* Right Pane: AI Chat Assistant */}
          <div className="hsk-sp-chat-pane">
            <div className="hsk-cb-msgs">
              {displayMessages.map((msg, idx) => {
                const isUser = msg.role === 'user';
                return (
                  <div key={idx} className="hsk-cb-msg-group">
                    {isUser ? (
                      <div className="hsk-cb-user-msg">
                        <div className="hsk-cb-user-bubble">{msg.content}</div>
                      </div>
                    ) : (
                      <div className="hsk-cb-ai-msg">
                        <div className="hsk-cb-ai-icon" style={{ display: 'flex', alignItems: 'center' }}>
                          <SparkleIcon />
                        </div>
                        <div className="hsk-cb-ai-body">
                          <div className="hsk-cb-ai-text">{renderMarkdown(msg.content)}</div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {chatLoading && (
                <div className="hsk-cb-typing-row">
                  <div className="hsk-cb-ai-icon" style={{ display: 'flex', alignItems: 'center' }}>
                    <SparkleIcon />
                  </div>
                  <div className="hsk-cb-typing">
                    <div className="hsk-cb-dot" />
                    <div className="hsk-cb-dot" />
                    <div className="hsk-cb-dot" />
                  </div>
                </div>
              )}

              {chatError && <div className="hsk-cb-error">{getFriendlyError(chatError)}</div>}
              <div ref={chatBottomRef} style={{ height: 1 }} />
            </div>

            <div className="hsk-cb-input-wrap">
              <div className="hsk-cb-input-box">
                <textarea
                  ref={chatTextareaRef}
                  className="hsk-cb-textarea"
                  value={chatInput}
                  onChange={handleInput}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask about this product, specs, or comparison..."
                  rows={1}
                  disabled={chatLoading}
                />
                <button
                  className="hsk-cb-send"
                  onClick={() => handleSend()}
                  disabled={!chatInput.trim() || chatLoading}
                  aria-label="Send message"
                >
                  <ArrowUpIcon />
                </button>
              </div>
              <div className="hsk-cb-hint">Huskel AI &middot; instant product knowledge</div>
            </div>
          </div>
        </div>

        <div className="hsk-sp-footer">
          <span className="hsk-sp-esc">Esc to close</span>
        </div>
      </div>
    </div>
  );
}

/* ── Exported component ───────────────────────────────────────────────────── */
export function Sparkle({ 
  productName, 
  limit = 8, 
  onResult, 
  backdropColor, 
  backdropBlur, 
  className, 
  onNavigate,
  theme,
  classNames = {},
  product,
}: SparkleProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const customStyles = {
    ...(theme?.primaryColor && { '--hsk-primary': theme.primaryColor }),
    ...(theme?.backgroundColor && { '--hsk-bg': theme.backgroundColor }),
    ...(theme?.textColor && { '--hsk-text': theme.textColor }),
    ...(theme?.fontFamily && { '--hsk-font': theme.fontFamily }),
    ...(theme?.borderRadius && { '--hsk-border-radius': theme.borderRadius }),
  } as React.CSSProperties;

  return (
    <>
      <button
        className={`hsk-sp-btn ${classNames.button || ''} ${className || ''}`}
        onClick={() => setOpen(true)}
        style={customStyles}
        title="Find similar products"
        aria-label="Find similar products"
      >
        <SparkleIcon />
      </button>
      {open && mounted && createPortal(
        <SparkleModal
          productName={productName}
          limit={limit}
          onResult={onResult}
          backdropColor={backdropColor}
          backdropBlur={backdropBlur}
          onClose={() => setOpen(false)}
          onNavigate={onNavigate}
          theme={theme}
          classNames={classNames}
          product={product}
        />,
        document.body
      )}
    </>
  );
}
