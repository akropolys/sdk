import * as react_jsx_runtime from 'react/jsx-runtime';
import React from 'react';

type Product<T extends Record<string, any> = Record<string, any>> = {
    name: string;
    price: string;
    url: string;
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
type RawProductInput<T extends Record<string, any> = Record<string, any>> = {
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
interface CartItem {
    id: string;
    cart_id: string;
    external_id?: string;
    product_url: string;
    name: string;
    price: string;
    price_numeric: number;
    currency: string;
    image: string;
    brand: string;
    category: string;
    quantity: number;
}
interface CartPayload {
    cart_id: string;
    shopper_id: string;
    site_id: string;
    status: string;
    items: CartItem[];
    total: number;
    currency: string;
    item_count: number;
}
interface HuskelConfig {
    siteId?: string;
    apiUrl?: string;
    apiToken?: string;
    shopperId?: string;
    vertical?: 'commerce' | 'property' | 'motor' | 'blog' | string;
    onCheckout?: (cart: CartPayload) => void;
    onError?: (error: HuskelError) => void;
    authLoading?: boolean;
}
interface SearchRequest {
    query: string;
    siteId: string;
    limit?: number;
}
interface SearchResult {
    id: string;
    score: number;
    product: Product;
}
interface SearchResponse {
    results: SearchResult[];
    query: string;
}
interface IngestResponse {
    success: boolean;
    message?: string;
    count?: number;
}
interface HuskelError {
    status: number;
    message: string;
}
interface HuskelTheme {
    primaryColor?: string;
    backgroundColor?: string;
    textColor?: string;
    fontFamily?: string;
    borderRadius?: string;
}

declare class HuskelAPI {
    private apiUrl;
    private siteId;
    private apiToken;
    private getShopperId?;
    private getSessionId?;
    private vertical?;
    constructor(apiUrl: string, siteId: string, apiToken: string, getShopperId?: (() => string | undefined) | undefined, getSessionId?: (() => string | undefined) | undefined, vertical?: string | undefined);
    private post;
    ingest(product: Product): Promise<IngestResponse>;
    ingestBatch(products: Product[]): Promise<IngestResponse>;
    search(query: string, limit?: number): Promise<SearchResponse>;
    searchVector(query: string, limit?: number): Promise<SearchResponse>;
    searchAutocomplete(query: string, limit?: number): Promise<SearchResponse>;
    chat(query: string, history?: Array<{
        role: 'user' | 'assistant';
        content: string;
    }>): Promise<{
        answer: string;
        sources: any[];
        intent?: string;
        checkout?: CartPayload;
        action?: any;
    }>;
    chatStream(query: string, history?: Array<{
        role: 'user' | 'assistant';
        content: string;
    }>, signal?: AbortSignal): Promise<Response>;
    private buildHeaders;
    getCart(): Promise<CartPayload>;
    clearCart(): Promise<CartPayload>;
    checkoutCart(): Promise<CartPayload>;
    getCheckoutConfig(): Promise<any>;
    initiatePayment(phoneNumber: string, email?: string, firstName?: string, lastName?: string): Promise<any>;
    getPaymentStatus(ref: string): Promise<any>;
}

declare class HuskelClient {
    readonly api: HuskelAPI;
    readonly vertical: string;
    private ingestQueue;
    private ingestTimer;
    private ingestedUrls;
    private onlineHandler;
    private shopperId?;
    private sessionId;
    private authLoading?;
    onCheckout?: (cart: CartPayload) => void;
    onError?: (error: HuskelError) => void;
    private static INGEST_CACHE_KEY;
    private static INGEST_CACHE_TTL;
    private loadIngestedCache;
    private saveIngestedCache;
    constructor(config: HuskelConfig);
    reRegister(): void;
    setShopperId(id: string | undefined): void;
    setAuthLoading(loading: boolean): void;
    getShopperId(): string | undefined;
    getSessionId(): string;
    private initSession;
    destroy(): void;
    queueIngest(rawProduct: RawProductInput): Promise<void>;
    queueIngestBatch(rawProducts: RawProductInput[]): Promise<void>;
    private scheduleFlush;
    private flushQueue;
}
declare function initHuskel(config: HuskelConfig): HuskelClient;
declare function getHuskelClient(): HuskelClient;

/**
 * @deprecated Use <HuskelProvider> instead to avoid SSR issues.
 */
declare function useHuskel(config: HuskelConfig): HuskelClient;

interface UseSearchReturn {
    results: SearchResult[];
    loading: boolean;
    error: string | null;
    search: (query: string, limit?: number) => Promise<void>;
    clear: () => void;
}
declare function useSearch(): UseSearchReturn;

interface UseIngestReturn {
    ingest: (product: RawProductInput) => void;
    ingestBatch: (products: RawProductInput[]) => void;
    /**
     * @deprecated Ingest is fire-and-forget. This is always `false` and will be
     * removed in the next major version. Remove it from your destructuring.
     */
    loading: false;
    /**
     * @deprecated Ingest is fire-and-forget. This is always `null` and will be
     * removed in the next major version. Remove it from your destructuring.
     */
    error: null;
}
declare function useIngest(): UseIngestReturn;

/**
 * useListIngest — drop this into any catalog or list page.
 * It automatically ingests all items in the array, using a built-in
 * component-lifecycle ref guard to prevent duplicate calls during mounts.
 *
 * @example
 * export function CategoryPage({ products }) {
 *   useListIngest(products);
 *   return <ProductGrid products={products} />;
 * }
 */
declare function useListIngest(products: RawProductInput[] | null | undefined): void;

/**
 * usePageIngest — drop this into any product page component.
 * The moment a customer's browser renders the page, the product is
 * automatically captured and queued for ingestion into the vector index.
 *
 * No configuration needed beyond <HuskelProvider> in your layout.
 *
 * @example
 * // Product detail page — Next.js or React
 * export function ProductPage({ product }) {
 *   usePageIngest({
 *     name: product.title,
 *     price: product.price,
 *     url: window.location.href,
 *     images: [product.thumbnail],
 *     category: product.category,
 *   });
 *   return <div>...</div>;
 * }
 */
declare function usePageIngest(product: RawProductInput | null | undefined): void;

interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    /** Cart snapshot attached to assistant messages that mutated the cart */
    cartSnapshot?: CartPayload;
    /** The action type that triggered this message (for pill rendering) */
    actionType?: string;
}
interface ChatSource {
    id?: string;
    name: string;
    price?: string;
    currency?: string;
    category?: string;
    url?: string;
    image?: string;
    brand?: string;
    availability?: string;
}
interface UseChatReturn {
    messages: ChatMessage[];
    sources: ChatSource[];
    loading: boolean;
    /** True while real tokens are arriving from the server */
    streaming: boolean;
    error: string | null;
    lastAction: any | null;
    lastIntent: string | null;
    send: (query: string, displayQuery?: string) => Promise<void>;
    reset: () => void;
}
declare function useChat(): UseChatReturn;

declare function useCart(): {
    cart: CartPayload | null;
    loading: boolean;
    fetchCart: () => Promise<void>;
};

interface UsePaymentPollingProps {
    client: HuskelAPI;
    merchantReference: string | null;
    onSuccess?: () => void;
    onFailure?: (errorMsg?: string) => void;
    intervalMs?: number;
    timeoutMs?: number;
}
declare function usePaymentPolling({ client, merchantReference, onSuccess, onFailure, intervalMs, timeoutMs, }: UsePaymentPollingProps): {
    status: "IDLE" | "PENDING" | "COMPLETED" | "FAILED";
    error: string | null;
};

interface SearchBarProps {
    placeholder?: string;
    limit?: number;
    /** Debounce in ms — default 300 for smooth type-ahead */
    debounceMs?: number;
    onSelect?: (result: SearchResult) => void;
    className?: string;
    inputClassName?: string;
    dropdownClassName?: string;
    renderResult?: (result: SearchResult) => React.ReactNode;
    theme?: HuskelTheme;
    classNames?: {
        root?: string;
        input?: string;
        dropdown?: string;
        row?: string;
    };
}
declare function SearchBar({ placeholder, limit, debounceMs, onSelect, className, inputClassName, dropdownClassName, renderResult, theme, classNames, }: SearchBarProps): react_jsx_runtime.JSX.Element;

interface SparkleProps {
    productName: string;
    limit?: number;
    onResult?: (results: SearchResult[]) => void;
    /** Override the backdrop colour (any CSS colour/gradient) */
    backdropColor?: string;
    /** Override backdrop blur — e.g. "8px" or 8 */
    backdropBlur?: string | number;
    /** Extra classes on the trigger button */
    className?: string;
    /** Called when user clicks a result — return false to prevent default navigation */
    onNavigate?: (result: SearchResult) => boolean | void;
    theme?: HuskelTheme;
    classNames?: {
        button?: string;
        backdrop?: string;
        card?: string;
        item?: string;
    };
    product?: Product;
}
declare function Sparkle({ productName, limit, onResult, backdropColor, backdropBlur, className, onNavigate, theme, classNames, product, }: SparkleProps): react_jsx_runtime.JSX.Element;

interface ChatWidgetProps {
    title?: string;
    placeholder?: string;
    emptyStateText?: string;
    emptyStateSuggestions?: string;
    defaultCurrency?: string;
    className?: string;
    theme?: HuskelTheme;
    classNames?: {
        root?: string;
        header?: string;
        messageBubble?: string;
        input?: string;
    };
    onSelectSource?: (source: ChatSource) => void;
}
declare function ChatWidget({ title, placeholder, emptyStateText, emptyStateSuggestions, defaultCurrency, className, theme, classNames, onSelectSource }: ChatWidgetProps): react_jsx_runtime.JSX.Element;

interface AIChatButtonProps {
    label?: string;
    title?: string;
    placeholder?: string;
    backdropColor?: string;
    backdropBlur?: string | number;
    className?: string;
    onSelectSource?: (source: ChatSource) => void;
    defaultCurrency?: string;
    chips?: string[];
    theme?: 'light' | 'dark' | HuskelTheme;
    classNames?: {
        button?: string;
        overlay?: string;
        panel?: string;
        input?: string;
        sendButton?: string;
    };
}
declare function AIChatButton({ label, title, placeholder, backdropColor, backdropBlur, className, onSelectSource, defaultCurrency, chips, theme, classNames, }: AIChatButtonProps): react_jsx_runtime.JSX.Element;

declare function CartBadge({ className }: {
    className?: string;
}): react_jsx_runtime.JSX.Element | null;

declare function CartDrawer({ trigger, className, theme }: {
    trigger?: React.ReactNode;
    className?: string;
    theme?: 'light' | 'dark' | HuskelTheme;
}): react_jsx_runtime.JSX.Element;

interface HuskelProviderProps extends HuskelConfig {
    children: React.ReactNode;
}
declare function HuskelProvider({ siteId, apiUrl, apiToken, shopperId, vertical, authLoading, onCheckout, onError, children }: HuskelProviderProps): react_jsx_runtime.JSX.Element;
declare function useHuskelContext(): HuskelClient;

export { AIChatButton, CartBadge, CartDrawer, type ChatMessage, type ChatSource, ChatWidget, HuskelAPI, HuskelClient, type HuskelConfig, type HuskelError, HuskelProvider, type IngestResponse, type Product, type RawProductInput, SearchBar, type SearchRequest, type SearchResponse, type SearchResult, Sparkle, type UsePaymentPollingProps, getHuskelClient, initHuskel, useCart, useChat, useHuskel, useHuskelContext, useIngest, useListIngest, usePageIngest, usePaymentPolling, useSearch };
