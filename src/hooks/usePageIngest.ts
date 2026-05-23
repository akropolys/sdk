import { useEffect, useRef } from 'react';
import { RawProductInput } from '../types';
import { getHuskelClient } from '../client';

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
export function usePageIngest(product: RawProductInput | null | undefined): void {
  // Use url as the stable key — avoids re-ingesting on unrelated re-renders
  const ingestedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!product) return;

    // Resolve URL — falls back to window.location if not provided
    const url =
      product.url ||
      (typeof window !== 'undefined' ? window.location.href : '');

    // Guard: only ingest once per URL per component lifecycle
    if (ingestedRef.current === url) return;
    ingestedRef.current = url;

    try {
      getHuskelClient().queueIngest({ ...product, url });
    } catch {
      // Client not initialised — silently skip
    }
  }, [product?.url ?? product?.name]);
}
