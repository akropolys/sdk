import { actionAuthorization, ActionAuthError, type ActionAuth } from './actionAuth';

export interface BrowserActionRequest {
  id?: string;
  name: string;
  url: string;
  method: string;
  body?: Record<string, unknown>;
  requiresSignIn?: boolean;
}

export interface BrowserActionResult {
  status: 'sent' | 'failed' | 'needs_sign_in';
  httpStatus?: number;
  response?: unknown;
  error?: string;
}

/** Optional adapter for apps whose API needs a bearer or CSRF token. */
export type ActionHeaders = (action: { name: string; url: string; method: string }, signal: AbortSignal) =>
  HeadersInit | Promise<HeadersInit>;

// The backend supplies the URL from a registered definition. No platform
// credentials, shopper id or model-selected headers are forwarded to the site.
export async function executeBrowserAction(
  action: BrowserActionRequest,
  signal?: AbortSignal,
  actionHeaders?: ActionHeaders,
  actionAuth?: ActionAuth,
): Promise<BrowserActionResult> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timer = setTimeout(abort, 20_000);
  try {
    const method = String(action.method || 'POST').toUpperCase();
    if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) throw new Error('Unsupported action method.');
    const page = new URL(window.location.href);
    const relative = action.url.startsWith('/') && !action.url.startsWith('//');
    if (action.url.includes('\\') || /[\u0000-\u0020]/.test(action.url)) throw new Error('Invalid action endpoint.');
    const url = new URL(action.url, page.origin);
    if ((!relative && !/^https?:\/\//i.test(action.url)) ||
        !['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash ||
        (relative && url.origin !== page.origin)) throw new Error('Invalid action endpoint.');
    if (page.protocol === 'https:' && url.protocol !== 'https:') throw new Error('Use an HTTPS action endpoint on this site.');
    const suppliedHeaders = await Promise.race([
      Promise.resolve().then(async () => {
        const authorization = actionAuth
          ? await actionAuthorization(actionAuth, url.href, action.requiresSignIn === true, controller.signal)
          : undefined;
        const extra = new Headers(actionHeaders ? await actionHeaders({ name: action.name, url: url.href, method }, controller.signal) : undefined);
        if (authorization) {
          if (extra.has('Authorization')) throw new ActionAuthError('Use actionAuth or a custom Authorization header for this action, not both.');
          extra.set('Authorization', authorization);
        }
        return extra;
      }),
      new Promise<never>((_, reject) => {
        const aborted = () => reject(new DOMException('Aborted', 'AbortError'));
        if (controller.signal.aborted) aborted();
        else controller.signal.addEventListener('abort', aborted, { once: true });
      }),
    ]);
    const headers = new Headers(suppliedHeaders);
    headers.set('Accept', 'application/json');
    const body = method !== 'GET' && (method !== 'DELETE' || Object.keys(action.body || {}).length > 0)
      ? JSON.stringify(action.body || {}) : undefined;
    if (body !== undefined) headers.set('Content-Type', 'application/json');
    const response = await fetch(url.href, {
      method, headers, body, credentials: 'include', redirect: 'error', signal: controller.signal,
    });
    // Read a bounded result before returning it to the model.
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let text = '', bytes = 0;
    if (reader) {
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          bytes += part.value.byteLength;
          if (bytes > 8192) {
            await reader.cancel();
            return { status: response.ok ? 'sent' : response.status === 401 ? 'needs_sign_in' : 'failed', httpStatus: response.status,
              response: { message: 'The API response was too large to include. Check the site for the full result.' } };
          }
          text += decoder.decode(part.value, { stream: true });
        }
        text += decoder.decode();
      } finally { reader.releaseLock(); }
    }
    let result: unknown = text || undefined;
    try { result = JSON.parse(text); } catch { /* Plain text is valid API data. */ }
    if (new TextEncoder().encode(JSON.stringify(result) || '').length > 8192) result = { message: 'The API response was too large to include. Check the site for the full result.' };
    return { status: response.ok ? 'sent' : response.status === 401 ? 'needs_sign_in' : 'failed',
      httpStatus: response.status, ...(result === undefined ? {} : { response: result }) };
  } catch (error) {
    if (error instanceof ActionAuthError && error.needsSignIn) return { status: 'needs_sign_in', httpStatus: 401, error: error.message };
    return { status: 'failed', error: controller.signal.aborted
      ? 'The action was cancelled or timed out. Its outcome is unknown; check the site before retrying.'
      : error instanceof TypeError
        ? 'The browser could not read the action response. Check the endpoint and its CORS settings. The outcome is unknown; check the site before retrying.'
        : error instanceof Error ? error.message : 'The action failed.' };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}
