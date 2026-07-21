import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useSearch, useKiku, useAkropolysContext } from '@akropolys/sdk';
import { renderMarkdown } from '../utils/markdown';
import { SearchResult, Product, AkropolysTheme } from '@akropolys/sdk';
import { cn } from '../utils/cn';
import { ArrowUpIcon } from '../utils/icons';

export interface SparkleProps {
  productName: string;
  limit?: number;
  onResult?: (results: SearchResult[]) => void;
  /** Override the backdrop colour (any CSS colour/gradient) */
  backdropColor?: string;
  /** Override backdrop blur â€” e.g. "8px" or 8 */
  backdropBlur?: string | number;
  /** Extra classes on the trigger button */
  className?: string;
  /** Called when user clicks a result â€” return false to prevent default navigation */
  onNavigate?: (result: SearchResult) => boolean | void;
  theme?: AkropolysTheme;
  classNames?: {
    button?: string;
    backdrop?: string;
    card?: string;
    item?: string;
  };
  product?: Product;
  children?: React.ReactNode;
}

/* â”€â”€ Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
interface ModalProps extends Pick<SparkleProps, 'productName' | 'limit' | 'backdropColor' | 'backdropBlur' | 'onNavigate' | 'onResult' | 'theme' | 'classNames' | 'product'> {
  onClose: () => void;
}

const SparkleIcon = ({ className, size = 16 }: { className?: string; size?: number }) => (
  <svg
    className={cn("hsk-brand-mark", className)}
    width={size}
    height={size}
    viewBox="0 0 100 100"
    xmlns="http://www.w3.org/2000/svg"
    aria-label="kiku"
  >
    <g transform="translate(22.7 19) scale(0.62)" fill="currentColor" fillRule="evenodd">
      <path d="M39.4 10.4 Q44 0 48.6 10.4 L86.1 95.8 Q88 100 83.4 100 L4.6 100 Q0 100 1.9 95.8 Z M24 100 L24 65 Q24 60 27.4 56.3 Q44 38 60.6 56.3 Q64 60 64 65 L64 100 Z" />
      <circle cx="55" cy="82" r="3.4" />
    </g>
  </svg>
);

const CloseIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"></line>
    <line x1="6" y1="6" x2="18" y2="18"></line>
  </svg>
);


/* â”€â”€ Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
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
  const client = useAkropolysContext();
  const [fetchedProduct, setFetchedProduct] = useState<Product | null>(null);
  const displayProduct = initialProduct || fetchedProduct;
  const { results, loading: searchLoading, search } = useSearch({ type: 'vector' });
  const { messages, sources, loading: chatLoading, error: chatError, send } = useKiku();
  const [chatInput, setChatInput] = useState('');
  const [isMobile, setIsMobile] = useState(false);
  const [showSpecs, setShowSpecs] = useState(false);
  const [collapseSimilar, setCollapseSimilar] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const chatTextareaRef = useRef<HTMLTextAreaElement>(null);

  /* auto-search and product fetching on open */
  useEffect(() => {
    if (!initialProduct && !fetchedProduct) {
      client.api.searchVector(productName, 1)
        .then(res => {
          if (res.results && res.results.length > 0) {
            setFetchedProduct(res.results[0].entity);
          }
        })
        .catch(err => console.error('[Akropolys] Failed to fetch product details', err));
    }
    search(productName, limit);
  }, [productName, initialProduct, fetchedProduct, client, limit, search]);

  /* handle window resize for mobile check */
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    handleResize();
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
  }, []);

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
      if (r.entity.url) window.location.href = r.entity.url;
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

  if (isMobile) {
    return (
      <div
        className={cn("hsk-sp-backdrop hsk-sp-mobile-view", classNames.backdrop)}
        onClick={onClose}
        style={{
          backdropFilter: `blur(${blurVal})`,
          WebkitBackdropFilter: `blur(${blurVal})`,
          background: bg ?? undefined,
          ...customStyles,
        }}
      >
        <div className={cn("hsk-sp-card hsk-sp-fullscreen hsk-sp-mobile-card", classNames.card)} onClick={e => e.stopPropagation()}>
          {/* Header */}
          <div className="hsk-sp-header">
            <span className="hsk-sp-header-icon" style={{ display: 'flex', alignItems: 'center' }}>
              <SparkleIcon />
            </span>
            <div className="hsk-sp-header-body">
              <div className="hsk-sp-header-title-row">
                <div className="hsk-sp-header-title">{displayProduct?.name || productName}</div>
                {displayProduct && (
                  <button 
                    type="button" 
                    className="hsk-sp-header-specs-btn"
                    onClick={() => setShowSpecs(true)}
                  >
                    Specs
                  </button>
                )}
              </div>
              <div className="hsk-sp-header-sub">kiku</div>
            </div>
            <button className="hsk-sp-close" onClick={onClose} aria-label="Close">
              <CloseIcon />
            </button>
          </div>

          {searchLoading && <div className="hsk-sp-bar" />}

          {/* Chat Assistant */}
          <div className="hsk-sp-mobile-chat-container">
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
                          
                          {/* Inline Claude-like attachments under the first assistant message */}
                          {idx === 0 && displayProduct && (
                            <div className="hsk-sp-mobile-attachment-deck">
                              {/* Main Product Card */}
                              <div className="hsk-sp-mobile-main-card">
                                <div className="hsk-sp-mobile-main-card-img">
                                  {displayProduct.images?.[0] ? (
                                    <img src={displayProduct.images[0]} alt={displayProduct.name} />
                                  ) : (
                                    <span>ðŸ›</span>
                                  )}
                                </div>
                                <div className="hsk-sp-mobile-main-card-info">
                                  <div className="hsk-sp-mobile-main-card-brand">
                                    {displayProduct.brand || displayProduct.category || 'Product'}
                                  </div>
                                  <div className="hsk-sp-mobile-main-card-name">{displayProduct.name}</div>
                                  <div className="hsk-sp-mobile-main-card-price">
                                    {displayProduct.currency ?? 'KES'} {parseFloat(displayProduct.price?.replace(/[^0-9.]/g, '') || '0').toLocaleString()}
                                  </div>
                                </div>
                                {((displayProduct.specs && Object.keys(displayProduct.specs).length > 0) || displayProduct.description) && (
                                  <button 
                                    type="button"
                                    className="hsk-sp-mobile-main-card-specs-btn"
                                    onClick={() => setShowSpecs(true)}
                                  >
                                    Specs
                                  </button>
                                )}
                              </div>

                              {/* Similar Products Carousel */}
                              {(() => {
                                const similarProducts = results.filter(
                                  r => {
                                    const isSameName = !!(r.entity.name && displayProduct?.name && r.entity.name.toLowerCase() === displayProduct.name.toLowerCase());
                                    const isSameSlug = r.entity.slug && displayProduct?.slug && r.entity.slug.toLowerCase() === displayProduct.slug.toLowerCase();
                                    return !isSameName && !isSameSlug;
                                  }
                                );

                                if (similarProducts.length === 0) return null;

                                return (
                                  <div className="hsk-sp-mobile-similar-carousel-inline">
                                    <div className="hsk-sp-mobile-similar-carousel-title">Similar Products</div>
                                    <div className="hsk-sp-mobile-similar-carousel-list">
                                      {similarProducts.map((r) => {
                                        const price = parseFloat(r.entity.price?.replace(/[^0-9.]/g, '') || '0');
                                        const currency = r.entity.currency ?? 'KES';
                                        return (
                                          <div
                                            key={r.id}
                                            className="hsk-sp-mobile-similar-carousel-item"
                                            onClick={() => handleNav(r)}
                                          >
                                            <div className="hsk-sp-mobile-similar-carousel-img">
                                              {r.entity.images?.[0] ? (
                                                <img src={r.entity.images[0]} alt={r.entity.name} />
                                              ) : (
                                                <span>ðŸ›</span>
                                              )}
                                            </div>
                                            <div className="hsk-sp-mobile-similar-carousel-meta">
                                              <div className="hsk-sp-mobile-similar-carousel-name" title={r.entity.name}>
                                                {r.entity.name}
                                              </div>
                                              <div className="hsk-sp-mobile-similar-carousel-price">
                                                {currency} {price.toLocaleString()}
                                              </div>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>
                          )}
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
            </div>
          </div>

          {/* Specs Sheet Drawer Overlay */}
          {showSpecs && displayProduct && (
            <div className="hsk-sp-mobile-specs-overlay" onClick={() => setShowSpecs(false)}>
              <div className="hsk-sp-mobile-specs-drawer" onClick={e => e.stopPropagation()}>
                <div className="hsk-sp-mobile-specs-header">
                  <h3>Specifications</h3>
                  <button type="button" onClick={() => setShowSpecs(false)}>Close</button>
                </div>
                <div className="hsk-sp-mobile-specs-body">
                  <h4 className="hsk-sp-mobile-specs-title">{displayProduct.name}</h4>
                  {displayProduct.description && (
                    <div className="hsk-sp-mobile-specs-desc">
                      <h5>Description</h5>
                      <p>{displayProduct.description}</p>
                    </div>
                  )}
                  {displayProduct.specs && Object.keys(displayProduct.specs).length > 0 && (
                    <div className="hsk-sp-mobile-specs-list">
                      <h5>Details</h5>
                      {Object.entries(displayProduct.specs).map(([key, val]) => (
                        <div key={key} className="hsk-sp-mobile-spec-row">
                          <span className="hsk-sp-mobile-spec-label">{key}</span>
                          <span className="hsk-sp-mobile-spec-value">{val}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn("hsk-sp-backdrop", classNames.backdrop)}
      onClick={onClose}
      style={{
        backdropFilter: `blur(${blurVal})`,
        WebkitBackdropFilter: `blur(${blurVal})`,
        background: bg ?? undefined,
        ...customStyles,
      }}
    >
      <div className={cn("hsk-sp-card hsk-sp-fullscreen", classNames.card)} onClick={e => e.stopPropagation()}>
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
                      <span className="hsk-sp-img-placeholder">ðŸ›</span>
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
                          â˜… {parseFloat(displayProduct.rating.toString()).toFixed(1)} {displayProduct.reviewCount ? `(${displayProduct.reviewCount})` : ''}
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
                      const isSameName = !!(r.entity.name && displayProduct?.name && r.entity.name.toLowerCase() === displayProduct.name.toLowerCase());
                      const isSameSlug = r.entity.slug && displayProduct?.slug && r.entity.slug.toLowerCase() === displayProduct.slug.toLowerCase();
                      return !isSameName && !isSameSlug;
                    }
                  );

                  if (!searchLoading && similarProducts.length === 0) {
                    return <div className="hsk-sp-empty">No similar products found.</div>;
                  }

                  return similarProducts.map((r, i) => {
                    const price = parseFloat(r.entity.price?.replace(/[^0-9.]/g, '') || '0');
                    const currency = r.entity.currency ?? 'KES';
                    return (
                      <div
                        key={r.id}
                        className={cn("hsk-sp-item", classNames.item)}
                        style={{ animationDelay: `${i * 55}ms`, cursor: 'pointer' }}
                        onClick={() => handleNav(r)}
                      >
                        <div className="hsk-sp-img-wrap">
                          {r.entity.images?.[0] ? (
                            <img src={r.entity.images[0]} alt={r.entity.name} />
                          ) : (
                            <span className="hsk-sp-img-placeholder">ðŸ›</span>
                          )}
                        </div>
                        <div className="hsk-sp-item-body">
                          <div>
                            {r.entity.category && (
                              <div className="hsk-sp-item-cat">{r.entity.category}</div>
                            )}
                            <div className="hsk-sp-item-name" title={r.entity.name}>{r.entity.name}</div>
                          </div>
                          <div className="hsk-sp-item-price-row">
                            <span className="hsk-sp-item-currency">{currency}</span>
                            <span className="hsk-sp-item-price">{price.toLocaleString()}</span>
                          </div>
                          <div className="hsk-sp-actions">
                            <button
                              className="hsk-sp-action hsk-sp-action-primary"
                              onClick={(e) => { e.stopPropagation(); handleNav(r); }}
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
              <div className="hsk-cb-hint">Akropolys &middot; instant product knowledge</div>
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

/* â”€â”€ Exported component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
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
  children,
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
        className={cn("hsk-sp-btn", classNames.button, className)}
        onClick={() => setOpen(true)}
        style={customStyles}
        title="Find similar products"
        aria-label="Find similar products"
      >
        {children || <SparkleIcon />}
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

