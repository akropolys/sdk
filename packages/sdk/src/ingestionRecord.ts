import { stableStringify } from './utils/stableStringify';
import type { IngestRecord } from './types';

/** IDs come from the publisher. A link, title or signature never substitutes for one. */
export function recordID(record: Record<string, any>): string {
  const id = record?.id;
  if (typeof id === 'number' && Number.isSafeInteger(id)) return String(id);
  if (typeof id === 'string' && id.length > 0 && id.trim() === id && !/[\u0000-\u001f\u007f-\u009f]/.test(id) && new TextEncoder().encode(id).length <= 512) return id;
  throw new Error('Each ingestion record requires an id: a non-empty string (at most 512 bytes) or a safe integer');
}

export function ingestionEntity(payload: Record<string, any>): Record<string, any> {
  return payload?.envelope?.entity ?? payload;
}

/** Retain raw API fields; move the legacy top-level link into optional metadata. */
export function normalizeIngestRecord(record: Record<string, any>): IngestRecord {
  recordID(record);
  const { url, ...copy } = record;
  if (url !== undefined || record.fields !== undefined) {
    const fields = { ...(record.fields ?? {}) };
    if (!Object.prototype.hasOwnProperty.call(fields, 'url') && url !== undefined) fields.url = url;
    copy.fields = fields;
  }
  return copy as IngestRecord;
}

export function ingestionKey(payload: Record<string, any>): string {
  return 'record:' + recordID(ingestionEntity(payload));
}

export function ingestionFingerprint(payload: Record<string, any>): string {
  return stableStringify(normalizeIngestRecord(ingestionEntity(payload)));
}
