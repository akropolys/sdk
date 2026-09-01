/**
 * Generic ingested entity schema with optional URL and ID identifiers.
 */
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

