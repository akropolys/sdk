import * as react_jsx_runtime from 'react/jsx-runtime';
import React from 'react';

interface Product {
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
}
interface RawProductInput {
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
}
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
    onCheckout?: (cart: CartPayload) => void;
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
    constructor(apiUrl: string, siteId: string, apiToken: string, getShopperId?: (() => string | undefined) | undefined, getSessionId?: (() => string | undefined) | undefined);
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
        checkout?: CartPayload;
        action?: any;
    }>;
    private buildHeaders;
    getCart(): Promise<CartPayload>;
    clearCart(): Promise<CartPayload>;
    checkoutCart(): Promise<CartPayload>;
    getCheckoutConfig(): Promise<any>;
}

declare class HuskelClient {
    readonly api: HuskelAPI;
    private ingestQueue;
    private ingestTimer;
    private ingestedUrls;
    private onlineHandler;
    private shopperId?;
    private sessionId;
    onCheckout?: (cart: CartPayload) => void;
    private static INGEST_CACHE_KEY;
    private static INGEST_CACHE_TTL;
    private loadIngestedCache;
    private saveIngestedCache;
    constructor(config: HuskelConfig);
    setShopperId(id: string | undefined): void;
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
    ingest: (product: RawProductInput) => Promise<void>;
    ingestBatch: (products: RawProductInput[]) => Promise<void>;
    loading: boolean;
    error: string | null;
}
declare function useIngest(): UseIngestReturn;

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
}
interface ChatSource {
    id?: string;
    name: string;
    price?: string;
    currency?: string;
    category?: string;
    url?: string;
    image?: string;
}
interface UseChatReturn {
    messages: ChatMessage[];
    sources: ChatSource[];
    loading: boolean;
    error: string | null;
    send: (query: string, displayQuery?: string) => Promise<void>;
    reset: () => void;
}
declare function useChat(): UseChatReturn;

declare function useCart(): {
    cart: CartPayload | null;
    loading: boolean;
    fetchCart: () => Promise<void>;
};

interface SearchBarProps {
    placeholder?: string;
    limit?: number;
    /** Debounce in ms — default 80 for near-instant feel */
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
    theme?: HuskelTheme;
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
declare function HuskelProvider({ siteId, apiUrl, apiToken, shopperId, children }: HuskelProviderProps): react_jsx_runtime.JSX.Element;

export { AIChatButton, CartBadge, CartDrawer, type ChatMessage, type ChatSource, ChatWidget, HuskelAPI, HuskelClient, type HuskelConfig, type HuskelError, HuskelProvider, type IngestResponse, type Product, type RawProductInput, SearchBar, type SearchRequest, type SearchResponse, type SearchResult, Sparkle, getHuskelClient, initHuskel, useCart, useChat, useHuskel, useIngest, usePageIngest, useSearch };
