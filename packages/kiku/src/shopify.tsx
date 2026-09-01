import React, { useEffect, useState, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { AkropolysProvider, getAkropolysClient, ChatSource } from '@akropolys/sdk';
import { KikuButton } from './components/KikuButton';

export interface ShopifyProduct {
  id?: number | string;
  title?: string;
  name?: string;
  handle?: string;
  url?: string;
  price?: number | string;
  compare_at_price?: number | string;
  price_min?: number | string;
  featured_image?: string;
  images?: string[] | { src: string }[];
  image?: string;
  type?: string;
  product_type?: string;
  category?: string;
  vendor?: string;
  brand?: string;
  tags?: string[] | string;
  description?: string;
  body_html?: string;
  variants?: Array<{
    id: number | string;
    title?: string;
    price?: number | string;
    sku?: string;
    available?: boolean;
  }>;
  available?: boolean;
  [key: string]: any;
}

export interface StandaloneConfig {
  siteId?: string;
  apiToken?: string;
  apiUrl?: string;
  vertical?: string;
  shopperId?: string;
  theme?: 'dark' | 'light' | any;
  buttonLabel?: string;
  title?: string;
  placeholder?: string;
  defaultCurrency?: string;
  chips?: string[];
  enableVoice?: boolean;
  voiceLang?: string;
  enableVision?: boolean;
  visionCategoryHint?: string;
  enableAudioResponse?: boolean;
  ttsVoice?: string;
  autoSpeakResponses?: boolean;
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' | 'inline' | 'hidden' | 'custom';
  containerId?: string;
  containerSelector?: string;
  dockable?: boolean;
  product?: ShopifyProduct;
  onAddToCart?: (items: ChatSource[]) => void;
  onAction?: (action: any) => void;
  [key: string]: any;
}

declare global {
  interface Window {
    AkropolysConfig?: StandaloneConfig;
    Kiku?: {
      version: string;
      open: () => void;
      close: () => void;
      toggle: () => void;
      ingest: (product: ShopifyProduct) => Promise<void>;
      resetPosition: () => void;
      getClient: () => any;
      config: StandaloneConfig;
    };
  }
}

/**
 * Normalizes a Shopify product object into Akropolys entity format.
 */
export function normalizeShopifyProduct(p: ShopifyProduct): Record<string, any> {
  if (!p || typeof p !== 'object') return {};

  const id = String(p.id ?? p.handle ?? p.url ?? '');
  const title = p.title || p.name || '';
  
  let priceStr: string | undefined;
  if (typeof p.price === 'number') {
    priceStr = p.price >= 100 && Number.isInteger(p.price) 
      ? (p.price / 100).toFixed(2) 
      : p.price.toString();
  } else if (typeof p.price === 'string') {
    priceStr = p.price;
  }

  let image = p.featured_image || p.image;
  if (!image && Array.isArray(p.images) && p.images.length > 0) {
    const first = p.images[0];
    image = typeof first === 'string' ? first : first?.src;
  }
  if (typeof image === 'string' && image.startsWith('//')) {
    image = 'https:' + image;
  }

  let url = p.url || '';
  if (!url && p.handle) {
    url = `/products/${p.handle}`;
  }
  if (url && typeof window !== 'undefined' && !url.startsWith('http')) {
    try {
      url = new URL(url, window.location.origin).href;
    } catch {
      // keep relative if URL parsing fails
    }
  }

  const category = p.type || p.product_type || p.category || '';
  const brand = p.vendor || p.brand || '';
  
  const tags = Array.isArray(p.tags) 
    ? p.tags 
    : typeof p.tags === 'string' 
      ? p.tags.split(',').map(t => t.trim()).filter(Boolean)
      : [];

  const rawDescription = p.description || p.body_html || '';
  const cleanDescription = typeof rawDescription === 'string' 
    ? rawDescription.replace(/<[^>]*>?/gm, '').trim()
    : '';

  const defaultVariant = Array.isArray(p.variants) && p.variants.length > 0 ? p.variants[0] : null;
  const variantId = defaultVariant ? defaultVariant.id : undefined;

  return {
    id,
    name: title,
    title,
    price: priceStr,
    image,
    url: url || (typeof window !== 'undefined' ? window.location.href : ''),
    category,
    brand,
    tags,
    description: cleanDescription,
    availability: p.available !== false ? 'in_stock' : 'out_of_stock',
    variant_id: variantId ? String(variantId) : undefined,
    shopify_product_id: p.id ? String(p.id) : undefined,
    handle: p.handle || undefined,
  };
}

/**
 * Native Shopify Cart Integration.
 */
export function shopifyAddToCart(items: ChatSource[]): Promise<any> {
  if (!items || items.length === 0) return Promise.resolve();

  const cartItems = items.map(item => {
    const variantId = item.fields?.variant_id || item.fields?.shopify_variant_id || item.id;
    return {
      id: variantId,
      quantity: 1,
    };
  });

  return fetch('/cart/add.js', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({ items: cartItems }),
  })
    .then(async res => {
      if (!res.ok) {
        console.warn('[Akropolys Shopify] /cart/add.js returned error status:', res.status);
      }
      const data = await res.json().catch(() => null);
      
      if (typeof document !== 'undefined') {
        document.dispatchEvent(new CustomEvent('cart:updated', { bubbles: true, detail: { items: data } }));
        document.dispatchEvent(new CustomEvent('cart:refresh', { bubbles: true, detail: { items: data } }));
        document.dispatchEvent(new CustomEvent('cart:build', { bubbles: true }));
        window.dispatchEvent(new CustomEvent('cart:updated', { detail: { items: data } }));
      }
      return data;
    })
    .catch(err => {
      console.warn('[Akropolys Shopify] Add to cart network error:', err);
    });
}

/**
 * Native Shopify Get Cart.
 */
export function shopifyGetCart(): Promise<any> {
  return fetch('/cart.js', {
    headers: { 'Accept': 'application/json' },
  })
    .then(res => (res.ok ? res.json() : null))
    .catch(() => null);
}

/**
 * Draggable and Dockable container for Kiku floating launcher button.
 */
function DraggableDockWrapper({
  children,
  position = 'bottom-right',
  dockable = true,
  isInline = false,
}: {
  children: React.ReactNode;
  position?: StandaloneConfig['position'];
  dockable?: boolean;
  isInline?: boolean;
}) {
  if (isInline || position === 'inline' || position === 'custom' || position === 'hidden' || dockable === false) {
    return (
      <div className="akropolys-kiku-inline-wrapper" style={{ display: 'inline-flex', alignItems: 'center' }}>
        {children}
      </div>
    );
  }

  const [coords, setCoords] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ startX: number; startY: number; initX: number; initY: number; moved: boolean } | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const computeDefault = () => {
      const margin = 20;
      const btnWidth = 140;
      const btnHeight = 44;
      let defX = window.innerWidth - btnWidth - margin;
      let defY = window.innerHeight - btnHeight - margin;

      if (position === 'bottom-left') {
        defX = margin;
        defY = window.innerHeight - btnHeight - margin;
      } else if (position === 'top-right') {
        defX = window.innerWidth - btnWidth - margin;
        defY = margin;
      } else if (position === 'top-left') {
        defX = margin;
        defY = margin;
      }

      try {
        const saved = localStorage.getItem('akropolys_dock_pos');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
            const clampedX = Math.max(10, Math.min(window.innerWidth - 60, parsed.x));
            const clampedY = Math.max(10, Math.min(window.innerHeight - 60, parsed.y));
            return { x: clampedX, y: clampedY };
          }
        }
      } catch {}

      return { x: Math.max(10, defX), y: Math.max(10, defY) };
    };

    setCoords(computeDefault());

    const onResize = () => {
      setCoords(prev => {
        if (!prev) return computeDefault();
        const clampedX = Math.max(10, Math.min(window.innerWidth - 60, prev.x));
        const clampedY = Math.max(10, Math.min(window.innerHeight - 60, prev.y));
        return { x: clampedX, y: clampedY };
      });
    };

    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [position]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!wrapperRef.current) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initX: rect.left,
      initY: rect.top,
      moved: false,
    };
    try {
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    } catch {}
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragStartRef.current) return;
    const dx = e.clientX - dragStartRef.current.startX;
    const dy = e.clientY - dragStartRef.current.startY;
    if (!dragStartRef.current.moved && Math.hypot(dx, dy) > 6) {
      dragStartRef.current.moved = true;
      setIsDragging(true);
    }
    if (dragStartRef.current.moved) {
      const width = wrapperRef.current?.offsetWidth || 140;
      const height = wrapperRef.current?.offsetHeight || 44;
      const newX = Math.max(8, Math.min(window.innerWidth - width - 8, dragStartRef.current.initX + dx));
      const newY = Math.max(8, Math.min(window.innerHeight - height - 8, dragStartRef.current.initY + dy));
      setCoords({ x: newX, y: newY });
    }
  };

  const onPointerUp = () => {
    if (!dragStartRef.current) return;
    const hadMoved = dragStartRef.current.moved;
    dragStartRef.current = null;
    setIsDragging(false);

    if (hadMoved && coords) {
      try {
        localStorage.setItem('akropolys_dock_pos', JSON.stringify(coords));
      } catch {}

      const clickCapturer = (ev: MouseEvent) => {
        ev.stopPropagation();
        ev.preventDefault();
        window.removeEventListener('click', clickCapturer, true);
      };
      window.addEventListener('click', clickCapturer, true);
      setTimeout(() => window.removeEventListener('click', clickCapturer, true), 120);
    }
  };

  if (!coords) return null;

  return (
    <div
      ref={wrapperRef}
      className="akropolys-kiku-dock-wrapper"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      title="Drag to dock anywhere"
      style={{
        position: 'fixed',
        left: `${coords.x}px`,
        top: `${coords.y}px`,
        zIndex: 2147483640,
        touchAction: 'none',
        cursor: isDragging ? 'grabbing' : 'grab',
        transition: isDragging ? 'none' : 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s ease',
        transform: isDragging ? 'scale(1.05)' : 'scale(1)',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      {children}
    </div>
  );
}

function StandaloneKikuApp({ config, isInline }: { config: StandaloneConfig; isInline: boolean }) {
  useEffect(() => {
    const client = getAkropolysClient();
    if (!client) return;

    let prod = config.product;
    if (!prod && typeof (window as any).meta?.product === 'object') {
      prod = (window as any).meta.product;
    }

    if (prod) {
      const normalized = normalizeShopifyProduct(prod);
      if (normalized.id || normalized.url) {
        client.ingest(normalized).catch((err) => {
          console.debug('[Akropolys Shopify] Auto-ingest notice:', err);
        });
      }
    }
  }, [config.product]);

  const defaultOnAddToCart = (items: ChatSource[]) => {
    if (config.onAddToCart) {
      config.onAddToCart(items);
      return;
    }
    shopifyAddToCart(items);
  };

  return (
    <AkropolysProvider
      siteId={config.siteId}
      apiUrl={config.apiUrl}
      apiToken={config.apiToken}
      vertical={config.vertical || 'commerce'}
      shopperId={config.shopperId}
      onAddToCart={defaultOnAddToCart}
      onAction={config.onAction}
      getCart={shopifyGetCart}
    >
      <DraggableDockWrapper
        position={config.position}
        dockable={config.dockable !== false}
        isInline={isInline}
      >
        <KikuButton
          label={config.buttonLabel}
          title={config.title || 'kiku'}
          placeholder={config.placeholder}
          defaultCurrency={config.defaultCurrency || '$'}
          chips={config.chips}
          theme={config.theme || 'dark'}
          enableVoice={config.enableVoice !== false}
          voiceLang={config.voiceLang}
          enableVision={config.enableVision !== false}
          visionCategoryHint={config.visionCategoryHint}
          enableAudioResponse={config.enableAudioResponse !== false}
          ttsVoice={config.ttsVoice || 'Puck'}
          autoSpeakResponses={config.autoSpeakResponses !== false}
        />
      </DraggableDockWrapper>
    </AkropolysProvider>
  );
}

/**
 * Attaches global click listeners for any element with [data-kiku-open] or [data-kiku-toggle]
 */
function setupGlobalTriggers() {
  if (typeof document === 'undefined') return;

  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement | null;
    const trigger = target?.closest('[data-kiku-open], [data-kiku-toggle], .kiku-trigger');
    if (trigger) {
      e.preventDefault();
      window.Kiku?.open();
    }
  });
}

export function initKiku(customConfig?: StandaloneConfig): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  let scriptConfig: Partial<StandaloneConfig> = {};
  const scriptTag = document.getElementById('akropolys-kiku-script') as HTMLScriptElement | null;
  if (scriptTag) {
    const ds = scriptTag.dataset;
    scriptConfig = {
      siteId: ds.siteId,
      apiToken: ds.apiToken,
      apiUrl: ds.apiUrl,
      theme: ds.theme as any,
      buttonLabel: ds.buttonLabel,
      position: ds.position as any,
      containerId: ds.containerId,
      containerSelector: ds.containerSelector,
      dockable: ds.dockable !== 'false',
      enableVoice: ds.enableVoice === 'true' || ds.enableVoice === '1',
      enableVision: ds.enableVision === 'true' || ds.enableVision === '1',
    };
  }

  const mergedConfig: StandaloneConfig = {
    ...scriptConfig,
    ...(window.AkropolysConfig || {}),
    ...(customConfig || {}),
  };

  if (!mergedConfig.siteId || !mergedConfig.apiToken) {
    console.warn(
      '[Akropolys] Missing siteId or apiToken. Configure window.AkropolysConfig = { siteId: "...", apiToken: "..." }'
    );
  }

  // Determine container and mounting mode
  let container: HTMLElement | null = null;
  let isInline = false;

  if (mergedConfig.containerSelector) {
    container = document.querySelector(mergedConfig.containerSelector);
    if (container) isInline = true;
  }
  if (!container && mergedConfig.containerId) {
    container = document.getElementById(mergedConfig.containerId);
    if (container) isInline = true;
  }
  if (!container) {
    container = document.getElementById('kiku-mount') || document.querySelector('[data-kiku-mount]');
    if (container) isInline = true;
  }

  // If no custom inline container was provided and not positioned inline, create floating host
  if (!container) {
    container = document.createElement('div');
    container.id = 'akropolys-kiku-host';
    document.body.appendChild(container);
  }

  const root = createRoot(container);
  root.render(<StandaloneKikuApp config={mergedConfig} isInline={isInline} />);

  setupGlobalTriggers();

  window.Kiku = {
    version: '1.7.19',
    open: () => {
      const btn = document.querySelector('.hsk-cb-btn') as HTMLButtonElement | null;
      btn?.click();
    },
    close: () => {
      const closeBtn = document.querySelector('.hsk-cb-topbar-btn[aria-label="Close"]') as HTMLButtonElement | null;
      closeBtn?.click();
    },
    toggle: () => {
      const modal = document.querySelector('.hsk-cb-overlay');
      if (modal) {
        window.Kiku?.close();
      } else {
        window.Kiku?.open();
      }
    },
    resetPosition: () => {
      try {
        localStorage.removeItem('akropolys_dock_pos');
        window.location.reload();
      } catch {}
    },
    ingest: async (product: ShopifyProduct) => {
      const client = getAkropolysClient();
      if (client && product) {
        const normalized = normalizeShopifyProduct(product);
        await client.ingest(normalized);
      }
    },
    getClient: () => getAkropolysClient(),
    config: mergedConfig,
  };
}

if (typeof window !== 'undefined') {
  const shouldAutoInit = () => {
    return Boolean(
      window.AkropolysConfig ||
      document.getElementById('akropolys-kiku-script') ||
      document.getElementById('kiku-mount') ||
      document.querySelector('[data-kiku-mount]')
    );
  };

  const autoRun = () => {
    if (shouldAutoInit()) initKiku();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoRun);
  } else {
    setTimeout(autoRun, 0);
  }
}
