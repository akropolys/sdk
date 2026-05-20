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
interface HuskelConfig {
    siteId?: string;
    apiUrl?: string;
    apiToken?: string;
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

declare class HuskelAPI {
    private apiUrl;
    private siteId;
    private apiToken;
    constructor(apiUrl: string, siteId: string, apiToken: string);
    private post;
    ingest(product: Product): Promise<IngestResponse>;
    ingestBatch(products: Product[]): Promise<IngestResponse>;
    search(query: string, limit?: number): Promise<SearchResponse>;
}

declare class HuskelClient {
    readonly api: HuskelAPI;
    private ingestQueue;
    private ingestTimer;
    private ingestedUrls;
    private onlineHandler;
    constructor(config: HuskelConfig);
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

interface SearchBarProps {
    placeholder?: string;
    limit?: number;
    debounceMs?: number;
    onSelect?: (result: SearchResult) => void;
    className?: string;
    inputClassName?: string;
    dropdownClassName?: string;
    renderResult?: (result: SearchResult) => React.ReactNode;
}
declare function SearchBar({ placeholder, limit, debounceMs, onSelect, className, inputClassName, dropdownClassName, renderResult, }: SearchBarProps): react_jsx_runtime.JSX.Element;

interface SparkleProps {
    productName: string;
    limit?: number;
    onResult?: (results: SearchResult[]) => void;
    className?: string;
}
declare function Sparkle({ productName, limit, onResult, className }: SparkleProps): react_jsx_runtime.JSX.Element;

interface HuskelProviderProps extends HuskelConfig {
    children: React.ReactNode;
}
declare function HuskelProvider({ siteId, apiUrl, apiToken, children }: HuskelProviderProps): react_jsx_runtime.JSX.Element;

export { HuskelAPI, HuskelClient, type HuskelConfig, type HuskelError, HuskelProvider, type IngestResponse, type Product, type RawProductInput, SearchBar, type SearchRequest, type SearchResponse, type SearchResult, Sparkle, getHuskelClient, initHuskel, useHuskel, useIngest, useSearch };
