import type { IngestResponse, IngestRecord } from './types';
import { normalizeIngestRecord } from './ingestionRecord';
export type { IngestRecord } from './types';
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

interface SignIngestOptions {
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

function normalisePem(pem: string): string {
  return (pem ?? '')
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .replace(/\\r/g, '')
    .replace(/\\n/g, '')
    .replace(/-----BEGIN [^-]+-----/, '')
    .replace(/-----END [^-]+-----/, '')
    .replace(/\s+/g, '');
}

async function createSignedIngestEnvelope<T extends Record<string, any>>(
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

  const pemContents = normalisePem(privateKeyPem);

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

export interface SignUserOptions {
  siteId: string;
  kid: string;
  /** How long the proof stays valid. Defaults to a day. */
  ttlSeconds?: number;
}

/**
 * Proves to Akropolys that your server vouches for this user id. Call it on your server for a signed-in user
 * and pass the result to AkropolysProvider as userProof. Only needed when your site requires signed user ids.
 */
export async function signUser(
  userId: string,
  privateKeyPem: string,
  options: SignUserOptions
): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + (options.ttlSeconds ?? 86400);
  const canonical = stableStringify({ v: 1, kid: options.kid, siteId: options.siteId, shopperId: userId, exp });
  const bytes = new TextEncoder().encode(canonical);

  const binaryString = decodeBase64(normalisePem(privateKeyPem));
  const binaryDer = Uint8Array.from(binaryString, (c: string) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    'pkcs8',
    binaryDer.buffer,
    { name: 'RSA-PSS', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign({ name: 'RSA-PSS', saltLength: 32 }, key, bytes);

  return base64UrlEncode(bytes.buffer) + '.' + base64UrlEncode(signature);
}

export interface LiveRecordInput {
  /** Stable identity for this thing. The publisher composes it; we never parse it. */
  key: string;
  /** The payload, as the publisher has it. */
  fields: Record<string, unknown>;
}

export interface SignedLiveEnvelope {
  v: 1;
  alg: 'PS256';
  kid: string;
  nonce: string;
  timestamp: number;
  records: LiveRecordInput[];
}

export interface SignedLivePayload {
  envelope: SignedLiveEnvelope;
  sig: string;
}

async function createSignedLiveEnvelope(
  records: LiveRecordInput[],
  privateKeyPem: string,
  options: { kid: string }
): Promise<SignedLivePayload> {
  const envelope: SignedLiveEnvelope = {
    v: 1,
    alg: 'PS256',
    kid: options.kid,
    nonce: generateNonce(),
    timestamp: Math.floor(Date.now() / 1000),
    records,
  };

  const canonical = stableStringify(envelope);
  const sortedEnvelope = JSON.parse(canonical) as SignedLiveEnvelope;

  const pemContents = normalisePem(privateKeyPem);

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

  return { envelope: sortedEnvelope, sig: base64UrlEncode(signature) };
}


export interface IngestClientOptions {
  siteId: string;
  apiToken: string;
  apiUrl?: string;
  timeoutMs?: number;
  /** Server-only PKCS#8 private key, used when the signed option is passed. */
  privateKey?: string;
  kid?: string;
}

export interface IngestRequestOptions {
  signed?: boolean;
}

/** Pass as the second argument to ingest or ingestBatch to sign on the server. */
export const signed: Readonly<{ signed: true }> = Object.freeze({ signed: true });

export class IngestError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'IngestError';
  }
}

export interface IngestBatchOptions {
  /** Maximum records per request. Defaults to 10; requests run sequentially. */
  batchSize?: number;
}

/** Earlier groups were accepted; retry from nextIndex in the original input. */
export class IngestBatchError extends IngestError {
  public readonly cause: unknown;
  constructor(cause: unknown, public readonly nextIndex: number, public readonly partialResult: IngestResponse) {
    super(cause instanceof Error ? cause.message : 'Batch ingestion failed', cause instanceof IngestError ? cause.status : 0);
    this.name = 'IngestBatchError';
    this.cause = cause;
  }
}


export interface LiveIngestSkipped {
  key: string;
  reason: string;
  detail?: string;
}

export interface LiveIngestResponse {
  success: boolean;
  count: number;
  skipped?: LiveIngestSkipped[];
}

export class LiveBatchError extends IngestError {
  public readonly cause: unknown;
  constructor(cause: unknown, public readonly nextIndex: number, public readonly partialResult: LiveIngestResponse) {
    super(cause instanceof Error ? cause.message : 'Live ingestion failed', cause instanceof IngestError ? cause.status : 0);
    this.name = 'LiveBatchError';
    this.cause = cause;
  }
}

/** Configure once on the server, then await ingest(entity) or ingestBatch(entities). */
export function createIngestClient(options: IngestClientOptions) {
  const config = { ...options };
  async function send(entities: Record<string, unknown>[], batch: boolean, options?: IngestRequestOptions): Promise<IngestResponse> {
    if (entities.length === 0) return { success: true, count: 0, indexed: 0, updated: 0, queued: 0 };
    if (!config.siteId?.trim() || !config.apiToken?.trim()) throw new Error('Ingestion requires siteId and apiToken');
    if (options !== undefined && (options === null || typeof options !== 'object' || (options.signed !== undefined && typeof options.signed !== 'boolean'))) {
      throw new Error('Pass signed or { signed: true } as the second argument');
    }
    if (options?.signed && (!config.privateKey?.trim() || !config.kid?.trim())) {
      throw new Error('Signed ingestion requires a privateKey and kid');
    }
    const timeoutMs = config.timeoutMs ?? 20_000;
    if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) throw new Error('timeoutMs must be a positive integer');
    entities = entities.map(normalizeIngestRecord);
    const entity = batch ? { entities } : entities[0];
    const body = options?.signed
      ? await createSignedIngestEnvelope(entity, config.privateKey!, { siteId: config.siteId, kid: config.kid })
      : { siteId: config.siteId, ...(batch ? { entities } : { entity }) };
    const base = (config.apiUrl || 'https://api.akropolys.cloud/v1').replace(/\/+$/, '');
    const response = await fetch(`${base}${batch ? '/ingest/batch' : '/ingest'}`, {
      method: 'POST',
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        'Content-Type': 'application/json',
        'X-Akropolys-Token': config.apiToken,
        'X-Akropolys-Site': config.siteId,
      },
      body: JSON.stringify(body),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || result?.success === false) {
      const message = typeof result?.message === 'string' ? result.message :
        typeof result?.error === 'string' ? result.error : `Ingestion failed (${response.status})`;
      throw new IngestError(message, response.status);
    }
    if (result?.success !== true) throw new IngestError('Invalid ingestion response', response.status);
    // HTTP 202 is durable queue acceptance; retain queued/code/message for the caller.
    return result as IngestResponse;
  }
  async function ingestBatch(
    entities: IngestRecord[],
    options?: IngestRequestOptions,
    batching: IngestBatchOptions = {},
  ): Promise<IngestResponse> {
    if (!batching || typeof batching !== 'object' || Array.isArray(batching)) {
      throw new Error('Pass { batchSize: 10 } as the third argument');
    }
    const batchSize = batching.batchSize ?? 10;
    if (!Number.isSafeInteger(batchSize) || batchSize <= 0) {
      throw new Error('batchSize must be a positive safe integer');
    }
    // Validate every record before the first group is sent or signed.
    entities = entities.map(normalizeIngestRecord);
    if (entities.length <= batchSize) return send(entities, true, options);

    const total: IngestResponse = { success: true, count: 0, indexed: 0, updated: 0, skipped: 0, queued: 0 };
    for (let offset = 0; offset < entities.length; offset += batchSize) {
      const group = entities.slice(offset, offset + batchSize);
      let result: IngestResponse;
      try {
        // Signing happens separately for each group, with a fresh nonce.
        result = await send(group, true, options);
      } catch (cause) {
        // Do not submit later groups or silently replay accepted groups.
        throw new IngestBatchError(cause, offset, { ...total });
      }
      total.count! += group.length;
      for (const key of ['indexed', 'updated', 'skipped', 'queued'] as const) {
        total[key]! += result[key] ?? 0;
      }
      if (result.code === 'reindex_queued' || total.queued! > 0) total.code = 'reindex_queued';
      total.message = total.code === 'reindex_queued' ? 'Batch accepted; updates queued for re-indexing' : 'Batch ingested';
    }
    return total;
  }

  async function ingestLive(
    input: LiveRecordInput | LiveRecordInput[],
    options?: IngestRequestOptions,
    batching: IngestBatchOptions = {},
  ): Promise<LiveIngestResponse> {
    const records = Array.isArray(input) ? input : [input];
    const batchSize = batching?.batchSize ?? 100;
    if (!batching || typeof batching !== 'object' || Array.isArray(batching) || !Number.isSafeInteger(batchSize) || batchSize <= 0) {
      throw new Error('batchSize must be a positive safe integer');
    }
    const total: LiveIngestResponse = { success: true, count: 0, skipped: [] };
    let offset = 0;
    while (offset < records.length) {
      try {
        if (!config.siteId?.trim() || !config.apiToken?.trim()) throw new Error('Ingestion requires siteId and apiToken');
        if (options !== undefined && (options === null || typeof options !== 'object' || (options.signed !== undefined && typeof options.signed !== 'boolean'))) {
          throw new Error('Pass signed or { signed: true } as the second argument');
        }
        if (options?.signed && (!config.privateKey?.trim() || !config.kid?.trim())) throw new Error('Signed ingestion requires a privateKey and kid');
        const timeoutMs = config.timeoutMs ?? 20_000;
        if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) throw new Error('timeoutMs must be a positive integer');
        // Leave room for the envelope and signature under the live endpoint's 2 MiB limit.
        const group: LiveRecordInput[] = [];
        let bytes = 0;
        for (let i = offset; i < records.length && group.length < batchSize; i++) {
          const size = new TextEncoder().encode(JSON.stringify(records[i])).length + 1;
          if (size > 1_900_000) {
            if (group.length) break;
            throw new IngestError('Live record exceeds the request size limit', 413);
          }
          if (bytes + size > 1_900_000) break;
          bytes += size; group.push(records[i]);
        }
        const payload = options?.signed
          ? await createSignedLiveEnvelope(group, config.privateKey!, { kid: config.kid! })
          : { records: group };
        const base = (config.apiUrl || 'https://api.akropolys.cloud/v1').replace(/\/+$/, '');
        const response = await fetch(`${base}/live`, {
          method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(timeoutMs),
          headers: { 'Content-Type': 'application/json', 'X-Akropolys-Token': config.apiToken, 'X-Akropolys-Site': config.siteId },
          body: JSON.stringify(payload),
        });
        const result = await response.json().catch(() => null);
        if (!response.ok || result?.success === false) {
          throw new IngestError(typeof result?.error === 'string' ? result.error : typeof result?.message === 'string' ? result.message : `Live ingestion failed (${response.status})`, response.status);
        }
        if (result?.success !== true || !Number.isInteger(result.count) || result.count < 0 || result.count > group.length || (result.skipped !== undefined && !Array.isArray(result.skipped)) || result.count + (result.skipped?.length ?? 0) !== group.length) {
          throw new IngestError('Invalid live ingestion response', response.status);
        }
        total.count += result.count;
        total.skipped!.push(...(result.skipped ?? []));
        offset += group.length;
      } catch (cause) {
        throw new LiveBatchError(cause, offset, { ...total, skipped: [...total.skipped!] });
      }
    }
    return total;
  }

  return {
    ingest: (entity: IngestRecord, options?: IngestRequestOptions) => send([entity], false, options),
    ingestBatch,
    ingestLive,
  };
}
