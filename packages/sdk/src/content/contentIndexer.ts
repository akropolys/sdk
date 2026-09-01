import { AkropolysClient } from '../client';

const indexedUrls = new Set<string>();

export function initContentIndexer(client: AkropolysClient): () => void {
  let debounceTimer: ReturnType<typeof setTimeout>;
  let maxWaitTimer: ReturnType<typeof setTimeout>;
  let lastUrl = typeof location !== 'undefined' ? location.href : '';

  const originalPushState = typeof history !== 'undefined' ? history.pushState.bind(history) : null;
  const originalReplaceState = typeof history !== 'undefined' ? history.replaceState.bind(history) : null;

  const extractAndIngest = () => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const url = location.href;

    if (indexedUrls.has(url)) return;
    indexedUrls.add(url);

    const target =
      document.querySelector('main') ??
      document.querySelector('article') ??
      document.querySelector('[role="main"]') ??
      document.querySelector('#content') ??
      document.querySelector('.entry-content') ??
      document.querySelector('#main') ??
      document.body; // Guaranteed fallback

    if (!target) return;

    const clone = target.cloneNode(true) as HTMLElement;

    const noiseSelectors = [
      'nav',
      'header',
      'footer',
      'script',
      'style',
      'noscript',
      'iframe',
      '[role="navigation"]',
      '[role="banner"]',
      '[role="contentinfo"]',
      '[aria-hidden="true"]',
      'template',
      '.hidden',
      '[style*="display:none"]',
      '[style*="display: none"]'
    ];

    noiseSelectors.forEach(selector => {
      clone.querySelectorAll(selector).forEach(el => el.remove());
    });

    const raw = clone.textContent?.replace(/\s+/g, ' ').trim() ?? '';

    if (!raw || raw.length < 50) return;

    const MAX_PAGE_CHARS = 120_000;
    const text = raw.length > MAX_PAGE_CHARS ? raw.slice(0, MAX_PAGE_CHARS) : raw;

    client.queueContentIngest({
      url,
      title: document.title,
      text,
      capturedAt: Date.now()
    });
  };

  const scheduleExtraction = () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      clearTimeout(maxWaitTimer);
      extractAndIngest();
    }, 1000); // Wait 1 second for mutations to settle
  };

  const startMaxWait = () => {
    clearTimeout(maxWaitTimer);
    maxWaitTimer = setTimeout(() => {
      clearTimeout(debounceTimer);
      extractAndIngest();
    }, 4000); // Force execution after 4 seconds regardless of active mutations
  };

  let observer: MutationObserver | null = null;

  const startObserving = () => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    if (typeof MutationObserver === 'undefined') return;

    observer = new MutationObserver(() => {
      scheduleExtraction();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  };

  const onRouteChange = () => {
    if (typeof location === 'undefined') return;
    if (location.href === lastUrl) return;
    lastUrl = location.href;

    scheduleExtraction();
    startMaxWait();
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('popstate', onRouteChange);

    if (history && originalPushState) {
      history.pushState = (...args) => {
        originalPushState(...args);
        onRouteChange();
      };
    }

    if (history && originalReplaceState) {
      history.replaceState = (...args) => {
        originalReplaceState(...args);
        onRouteChange();
      };
    }

    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => {
        extractAndIngest();
        startObserving();
      }, { timeout: 3000 });
    } else {
      setTimeout(() => {
        extractAndIngest();
        startObserving();
      }, 1000);
    }
  }

  const cleanup = () => {
    if (observer) {
      observer.disconnect();
    }
    clearTimeout(debounceTimer);
    clearTimeout(maxWaitTimer);
    if (typeof window !== 'undefined') {
      window.removeEventListener('popstate', onRouteChange);
      if (history && originalPushState) {
        history.pushState = originalPushState;
      }
      if (history && originalReplaceState) {
        history.replaceState = originalReplaceState;
      }
    }
  };

  (client as any).contentIndexerCleanup = cleanup;

  return cleanup;
}
