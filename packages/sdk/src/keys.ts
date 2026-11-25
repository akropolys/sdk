function base64UrlDecode(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  if (typeof atob !== 'undefined') return atob(b64);
  const g = globalThis as any;
  if (g.Buffer) return g.Buffer.from(b64, 'base64').toString('binary');
  throw new Error('No base64 decoder available in environment');
}

/** The site a public key belongs to. */
export function siteFromKey(key?: string | null): string {
  const k = (key ?? '').trim();
  const dot = k.lastIndexOf('.');
  if (!/^sk_(live|test)_/.test(k) || dot < 0 || dot === k.length - 1) return '';
  try {
    const bytes = Uint8Array.from(base64UrlDecode(k.slice(dot + 1)), c => c.charCodeAt(0));
    const site = new TextDecoder().decode(bytes);
    return /^[\x21-\x7e]{1,200}$/.test(site) ? site : '';
  } catch {
    return '';
  }
}

export function warnSiteMismatch(siteId?: string, key?: string | null): void {
  const fromKey = siteFromKey(key);
  if (siteId && fromKey && siteId !== fromKey) {
    console.warn(`[Akropolys] siteId "${siteId}" overrides the site in your key ("${fromKey}"). Remove the siteId setting unless that is intended.`);
  }
}

function pemBytes(pem: string): Uint8Array {
  if (/BEGIN (RSA|ENCRYPTED) PRIVATE KEY/.test(pem ?? '')) {
    throw new Error('kiku needs the private key it issued (it starts with BEGIN PRIVATE KEY)');
  }
  const body = (pem ?? '')
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .replace(/\\r/g, '')
    .replace(/\\n/g, '')
    .replace(/-----BEGIN [^-]+-----/, '')
    .replace(/-----END [^-]+-----/, '')
    .replace(/\s+/g, '');
  const bin = base64UrlDecode(body.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

const kidCache = new Map<string, Promise<string>>();

/** The public key ID for a private key kiku issued. */
export function kidFromPrivateKey(privateKeyPem: string, apiToken: string): Promise<string> {
  const token = (apiToken ?? '').trim();
  const kind = /^sk_test_/.test(token) ? 'test' : /^sk_live_/.test(token) ? 'live' : '';
  if (!kind) return Promise.reject(new Error('Pass the kid, or the apiToken so it can be worked out'));
  const cacheKey = kind + '|' + (privateKeyPem ?? '');
  let kid = kidCache.get(cacheKey);
  if (!kid) {
    kid = computeKid(privateKeyPem, kind);
    kidCache.set(cacheKey, kid);
    kid.catch(() => kidCache.delete(cacheKey));
  }
  return kid;
}

async function computeKid(privateKeyPem: string, kind: string): Promise<string> {
  const alg = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };
  const der = pemBytes(privateKeyPem);
  const priv = await crypto.subtle.importKey('pkcs8', der.buffer.slice(der.byteOffset, der.byteOffset + der.byteLength) as ArrayBuffer, alg, true, ['sign']);
  const jwk = await crypto.subtle.exportKey('jwk', priv);
  const pub = await crypto.subtle.importKey('jwk', { kty: 'RSA', n: jwk.n, e: jwk.e, ext: true }, alg, true, ['verify']);
  const spki = await crypto.subtle.exportKey('spki', pub);
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', spki));
  const hex = Array.from(hash, b => b.toString(16).padStart(2, '0')).join('');
  return `pk_${kind}_${hex.slice(0, 12)}`;
}
