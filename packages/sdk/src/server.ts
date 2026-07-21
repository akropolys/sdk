import { stableStringify } from './utils/stableStringify';

declare const globalThis: any;

export interface SignedEnvelope<T = Record<string, any>> {
  v: 1;
  alg: 'PS256';
  kid: string;
  nonce: string;
  timestamp: number;
  entity: T;
}

export interface SignedPayload<T = Record<string, any>> {
  siteId?: string;
  envelope: SignedEnvelope<T>;
  sig: string;
}

export interface SignIngestOptions {
  kid?: string;
  siteId?: string;
}

function encodeBase64(binary: string): string {
  if (typeof btoa !== 'undefined') {
    return btoa(binary);
  }
  const g = globalThis as any;
  if (g.Buffer) {
    return g.Buffer.from(binary, 'binary').toString('base64');
  }
  throw new Error('No base64 encoder available in environment');
}

function decodeBase64(base64: string): string {
  if (typeof atob !== 'undefined') {
    return atob(base64);
  }
  const g = globalThis as any;
  if (g.Buffer) {
    return g.Buffer.from(base64, 'base64').toString('binary');
  }
  throw new Error('No base64 decoder available in environment');
}

function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = encodeBase64(binary);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function generateNonce(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) {
      bytes[i] = (Math.random() * 256) | 0;
    }
  }
  return base64UrlEncode(bytes.buffer);
}

/**
 * HSEP v1 signIngest — signs an ingestion entity using RSA-PSS SHA-256.
 * Zero-dependency Web Crypto API implementation suitable for Node 18+, Vercel Edge, Cloudflare Workers, Deno, and Bun.
 */
export async function signIngest<T extends Record<string, any>>(
  entity: T,
  privateKeyPem: string,
  options: SignIngestOptions = {}
): Promise<SignedPayload<T>> {
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = generateNonce();
  const kid = options.kid || 'pk_live_default';

  const envelope: SignedEnvelope<T> = {
    v: 1,
    alg: 'PS256',
    kid,
    nonce,
    timestamp,
    entity,
  };

  const canonical = stableStringify(envelope);
  const sortedEnvelope = JSON.parse(canonical) as SignedEnvelope<T>;

  // Clean PKCS#8 PEM formatting
  const pemContents = privateKeyPem
    .replace(/-----BEGIN (.*)-----/, '')
    .replace(/-----END (.*)-----/, '')
    .replace(/\s+/g, '');

  const binaryString = decodeBase64(pemContents);
  const binaryDer = Uint8Array.from(binaryString, (c: string) => c.charCodeAt(0));

  const key = await crypto.subtle.importKey(
    'pkcs8',
    binaryDer.buffer,
    { name: 'RSA-PSS', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    { name: 'RSA-PSS', saltLength: 32 },
    key,
    new TextEncoder().encode(canonical)
  );

  const sig = base64UrlEncode(signature);

  return {
    siteId: options.siteId,
    envelope: sortedEnvelope,
    sig,
  };
}
