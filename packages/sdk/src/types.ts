/**
 * Pass any object. The only requirement is a stable identifier for dedup
 * (`url`, `id`, or `slug`). Map title/image once via `display: { cardTitle,
 * cardImage }` only if your keys are unusual. Every field is stored and
 * shown to the assistant verbatim.
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
  /** Site identifier from the dashboard. Falls back to `NEXT_PUBLIC_AKROPOLYS_SITE_ID`. */
  siteId?: string;
  /** API base URL. Defaults to the managed backend; override for self-hosted. Falls back to `NEXT_PUBLIC_AKROPOLYS_API_URL`. */
  apiUrl?: string;
  /** Publishable token from the dashboard. Falls back to `NEXT_PUBLIC_AKROPOLYS_API_TOKEN`. */
  apiToken?: string;
  /** Signed-in shopper id; enables per-user memory. Omit for anonymous visitors. */
  shopperId?: string;
  /** Domain preset that tunes query interpretation. Defaults to `'commerce'`. */
  vertical?: 'commerce' | 'property' | 'motor' | 'blog' | string;
  /** Invoked when the assistant resolves a registered action (also dispatched as the `akropolys:action` DOM event). */
  onAction?: (action: ChatAction) => void;
  /** Invoked when the assistant resolves an add-to-cart intent. You add the items to YOUR store, however you like — the SDK never touches it. Items are the entities you already ingested; no new fields. */
  onAddToCart?: (items: import('./stream').ChatSource[]) => void;
  /** Optional read-through to your live cart so the assistant can reason over it. Return your cart items in any shape; the SDK only reads what you hand back. */
  getCart?: () => unknown;
  /** Invoked on ingestion, search, or chat errors. */
  onError?: (error: AkropolysError) => void;
  /** Defer ingestion until auth resolves so events aren't attributed to a guest. */
  authLoading?: boolean;
  /** Auto-index readable page text as the visitor scrolls. */
  indexContent?: boolean;
  /** Override display-slot field mapping, e.g. `{ cardTitle: 'headline' }`. */
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
  /**
   * Web font for the first family in `fontFamily`, loaded by the widget itself.
   * Without this, `fontFamily` only resolves if the host page already loaded
   * that font — which is the common reason a non-Latin font silently does not
   * apply. Pass both weights where you have them: a single file leaves bold
   * text to be synthesised, which looks smeared in scripts that stack marks.
   * `variable` takes a variable font and declares the whole 100–900 axis, so
   * the browser instances real weights instead of faking them.
   *
   * The file must be served with CORS headers allowing your origin — cross-origin
   * font fetches are CORS-checked, and without them the browser refuses the font
   * and falls back silently.
   */
  fontUrl?: string | { normal?: string; bold?: string; variable?: string };
  /** Base font size for chat message text on desktop, e.g. "15px" or "1rem". */
  fontSize?: string;
  /** Base font size for chat message text on mobile screens, e.g. "13.5px" or "0.9rem". */
  mobileFontSize?: string;
  borderRadius?: string;
}

/**
 * An action resolved from the shopper's intent. `request_kiku_key` is the only
 * built-in the widget handles itself; every other type is a developer-registered
 * action name (dashboard → Actions) carrying its registered `url`. The platform
 * interprets and routes — the site executes.
 */
export type ChatAction =
  | { type: 'request_kiku_key'; [key: string]: any }
  | { type: string; url?: string; [key: string]: any };

export interface ChatAttachment {
  type: 'image';
  /** base64 data URL, e.g. "data:image/jpeg;base64,..." */
  data: string;
  /** true when the image is the current scene marked up by the shopper to show WHERE an edit goes */
  annotated?: boolean;
  /** Drawn marks as geometry; `data` stays a clean copy of the scene. */
  marks?: ImageMarkRegion[];
  /** true when the shopper typed the change themselves, so the marks only point. */
  instructed?: boolean;
  /** The scene with the marks drawn on, shown back to the shopper. Never uploaded. */
  preview?: string;
}

/** One drawn gesture; box is [ymin, xmin, ymax, xmax] normalised 0-1000. */
export interface ImageMarkRegion {
  gesture: 'ring' | 'cross' | 'scribble' | 'arrow' | 'text';
  box: [number, number, number, number];
  to?: [number, number];
  text?: string;
}

/** A single product to be captured via @kiku capture_all. */
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

/**
 * Style attributes extracted from a product or user-uploaded image.
 * Used for complementary-product matching ("find a dress to match my shoes").
 */
export interface StyleDNA {
  dominant_colors: string[];
  color_palette: string;
  aesthetic: string[];
  texture: string;
  formality: string;
  season: string;
  style_tags: string[];
  /** Natural-language query generated by Gemini for vector search */
  match_query: string;
}

/** Response from POST /search/visual — extends SearchResponse with style context */
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


