export type Entity<T extends Record<string, any> = Record<string, any>> = {
  url?: string;
  id?: string;
} & T;

/** @deprecated Use Entity<T> instead */
export type Product<T extends Record<string, any> = Record<string, any>> = {
  name?: string;
  price?: string;
  url?: string;
  brand?: string;
  description?: string;
  originalPrice?: string;
  discount?: string;
  currency?: string;
  stock?: string;
  availability?: string;
  rating?: string;
  reviewCount?: number;
  category?: string;
  subCategory?: string;
  tags?: string[];
  images?: string[];
  specs?: Record<string, string>;
  priceNumeric?: number;
  slug?: string;
  metadata?: Record<string, any>;
} & T;

/** @deprecated Use Entity<T> instead */
export type RawProductInput<T extends Record<string, any> = Record<string, any>> = {
  name?: string;
  title?: string;
  productName?: string;
  price?: string | number;
  priceNumeric?: number;
  url?: string;
  image?: string;
  thumbnail?: string;
  images?: string[];
  slug?: string;
  id?: string;
  productId?: string;
  brand?: string;
  description?: string;
  originalPrice?: string;
  discount?: string;
  currency?: string;
  stock?: string;
  availability?: string;
  rating?: string;
  reviewCount?: number;
  category?: string;
  subCategory?: string;
  tags?: string[];
  specs?: Record<string, string>;
  metadata?: Record<string, any>;
} & T;

export type DisplayConfig = Record<string, string>;

export interface AkropolysConfig {

  siteId?: string;

  apiUrl?: string;
  voiceUrl?: string;

  apiToken?: string;

  shopperId?: string;

  vertical?: 'commerce' | 'property' | 'motor' | 'blog' | string;

  onAction?: (action: ChatAction) => void;

  onAddToCart?: (items: import('./stream').ChatSource[]) => void;

  getCart?: () => unknown;

  onError?: (error: AkropolysError) => void;

  authLoading?: boolean;

  indexContent?: boolean;

  display?: DisplayConfig;

  kikuKey?: string;
}

export interface SearchRequest {
  query: string;
  siteId: string;
  limit?: number;
}

export interface SearchResult {
  id: string;
  score: number;
  entity: Entity;
}

export interface SearchResponse {
  results: SearchResult[];
  query: string;
}

export interface IngestResponse {
  success: boolean;
  message?: string;
  count?: number;
}

export interface AkropolysError {
  status: number;
  message: string;
}

export interface AkropolysTheme {
  primaryColor?: string;
  backgroundColor?: string;
  textColor?: string;
  fontFamily?: string;

  fontUrl?: string | { normal?: string; bold?: string; variable?: string };

  fontSize?: string;

  mobileFontSize?: string;
  borderRadius?: string;
}

export type ChatAction =
  | { type: 'request_kiku_key'; [key: string]: any }
  | { type: string; url?: string; [key: string]: any };

export interface ChatAttachment {
  type: 'image';

  data: string;

  annotated?: boolean;

  marks?: ImageMarkRegion[];

  instructed?: boolean;

  preview?: string;
}

export interface ImageMarkRegion {
  gesture: 'ring' | 'cross' | 'scribble' | 'arrow' | 'text';
  box: [number, number, number, number];
  to?: [number, number];
  text?: string;
}

export interface CaptureTarget {
  name: string;
  url: string;
  image?: string;
  price?: string;
  currency?: string;
}

export interface ContentIngestPayload {
  url: string;
  title: string;
  text: string;
  capturedAt: number;
}

export interface StyleDNA {
  dominant_colors: string[];
  color_palette: string;
  aesthetic: string[];
  texture: string;
  formality: string;
  season: string;
  style_tags: string[];

  match_query: string;
}

export interface VisualSearchResponse extends SearchResponse {
  style_dna?: StyleDNA;
  match_query?: string;
}

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

// 'idle' is a paid avatar that has not been told what to watch yet.
export type ScoutStatus = 'idle' | 'active' | 'paused' | 'triggered' | 'expired' | 'canceled';

// One check a scout makes against a record. Compiled from the shopper's
// words when the scout is briefed, and never shown to them.
export interface ScoutRule {
  field: string;
  op: string;
  value: string;
}

export interface Scout {
  id: string;
  siteId: string;
  shopperId: string;
  name: string;
  // What the shopper asked for, in their words. The fields below are what it
  // compiled to.
  brief: string;
  // The entity being watched. Empty for a watch over a set.
  subject: string;
  rules: ScoutRule[];
  actionType: string;
  status: ScoutStatus;
  // Which animal the shopper put on this scout. Empty means "derive one".
  avatar: string;
  dedicatedMinutes: number;
  // Minutes this scout has burned, written in the same tick that spends them.
  minutesUsed: number;
  initialValue?: string;
  triggerValue?: string;
  createdAt: string;
  updatedAt: string;
  triggeredAt?: string;
}

export interface ScoutQuote {
  minutes: number;
  priceUSD: number;
  unitPriceUSD: number;
  // The gateway will not take less than minChargeUSD, whatever the quote says.
  minChargeableMinutes: number;
  minChargeUSD: number;
}

export interface ScoutCheckout {
  url: string;
  minutes: number;
  priceUSD: number;
}

export interface ScoutEvent {
  id: string;
  scoutId: string;
  eventType: string;
  message: string;
  payload?: Record<string, any>;
  createdAt: string;
}

export interface CreateScoutInput {
  name?: string;
  brief: string;
  subject: string;
  rules: ScoutRule[];
  actionType?: string;
  dedicatedMinutes?: number;
  initialValue?: string;
  siteId?: string;
  kikuKey?: string;
}

export interface ListScoutsResponse {
  count: number;
  scouts: Scout[];
  balance: number;
}

export interface GetScoutResponse {
  scout: Scout;
  events: ScoutEvent[];
}

export interface ScoutActionResponse {
  ok: boolean;
  id: string;
  status: ScoutStatus;
}
