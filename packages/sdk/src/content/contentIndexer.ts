import { AkropolysClient } from '../client';

// Scoped at the module/session level to prevent duplicate indexing
const indexedUrls = new Set<string>();

export function initContentIndexer(client: AkropolysClient): () => void {
  let debounceTimer: ReturnType<typeof setTimeout>;
  let maxWaitTimer: ReturnType<typeof setTimeout>;
  let lastUrl = typeof location !== 'undefined' ? location.href : '';

  // Track original history methods for cleanup
  const originalPushState = typeof history !== 'undefined' ? history.pushState.bind(history) : null;
  const originalReplaceState = typeof history !== 'undefined' ? history.replaceState.bind(history) : null;

  // 1. EXTRACT & INGEST LOGIC
  const extractAndIngest = () => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const url = location.href;

    // Deduplicate: Never index the same URL twice in a single session
    if (indexedUrls.has(url)) return;
    indexedUrls.add(url);

    // Identify target container using hierarchical heuristics
    const target =
      document.querySelector('main') ??
      document.querySelector('article') ??
      document.querySelector('[role="main"]') ??
      document.querySelector('#content') ??
      document.querySelector('.entry-content') ??
      document.querySelector('#main') ??
      document.body; // Guaranteed fallback

    if (!target) return;

    // Clone node in memory to avoid mutating the live DOM
    const clone = target.cloneNode(true) as HTMLElement;

    // Strip structural and hidden elements from the clone
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

    // Extract text layout-unaware (since node is detached) and normalize spaces
    const text = clone.textContent?.replace(/\s+/g, ' ').trim() ?? '';

    // Skip empty or near-empty pages (short boilerplate/routing transitions)
    if (!text || text.length < 50) return;

    // Dispatch raw content payload to separate queue
    client.queueContentIngest({
      url,
      title: document.title,
      text,
      capturedAt: Date.now()
    });
  };

  // 2. TIMING & DEBOUNCE SCHEDULER
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

  // 3. DOM OBSERVATION
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

  // 4. ROUTING DETECTORS
  const onRouteChange = () => {
    if (typeof location === 'undefined') return;
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    
    // Reset timers and restart racing extraction on new route
    scheduleExtraction();
    startMaxWait();
  };

  if (typeof window !== 'undefined') {
    // Listen to popstate (back/forward navigation)
    window.addEventListener('popstate', onRouteChange);

    // Monkey-patch pushState (standard SPA routing)
    if (history && originalPushState) {
      history.pushState = (...args) => {
        originalPushState(...args);
        onRouteChange();
      };
    }

    // Monkey-patch replaceState (tab switches & soft redirection)
    if (history && originalReplaceState) {
      history.replaceState = (...args) => {
        originalReplaceState(...args);
        onRouteChange();
      };
    }

    // 5. FIRST PAGE LOAD TRIGGER
    // Fires safely after browser has completed rendering the initial view
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

  // 6. DETACH & CLEANUP HOOK
  // Scoped function returned back to the main client context
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

  // Bind cleanup reference to client for destruction phase
  (client as any).contentIndexerCleanup = cleanup;

  return cleanup;
}
