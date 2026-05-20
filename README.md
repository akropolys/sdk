# @huskel/sdk

AI-powered vector search SDK. You own your data — pass it in, we handle the rest.

## Install

```bash
npm install @huskel/sdk
```

## Setup

Wrap your application in the `<HuskelProvider>` (it uses `"use client"` internally, allowing your root layout to remain a Next.js Server Component):

```tsx
// app/layout.tsx (Next.js Root Layout - Server Component)
import { HuskelProvider } from '@huskel/sdk';

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {/* siteId, apiUrl, and apiToken are read automatically from NEXT_PUBLIC_HUSKEL_* env variables */}
        <HuskelProvider>
          {children}
        </HuskelProvider>
      </body>
    </html>
  );
}
```

*Or pass configuration explicitly if you are not using environment variables:*

```tsx
<HuskelProvider
  siteId="your-site-id"
  apiUrl="https://your-huskel-backend.com"
  apiToken="your-api-token"
>
  {children}
</HuskelProvider>
```

## Ingest products (forgiving schema mapping)

Pass your raw database or CMS objects directly. The SDK automatically validates, dedupes, batches, and resolves common field naming variations (e.g. `title`/`name`, `thumbnail`/`image`/`images`, `slug`/`id`/`productId`):

```tsx
import { useEffect } from 'react';
import { useIngest } from '@huskel/sdk';

// Single product page
export function ProductPage({ product }) {
  const { ingest } = useIngest();

  useEffect(() => {
    // Passes raw product object directly.
    // Handles background batching, client-side deduplication, and offline recovery automatically.
    ingest(product);
  }, [product.id, ingest]);
}

// Listing / category page
export function ProductGrid({ products }) {
  const { ingestBatch } = useIngest();

  useEffect(() => {
    // Ingest array of products in a single debounced batch
    ingestBatch(products);
  }, [products, ingestBatch]);
}
```

## Search

### SearchBar Dropdown Component

```tsx
import { SearchBar } from '@huskel/sdk';

export function Header() {
  return (
    <SearchBar
      onSelect={(result) => router.push(result.product.url)}
    />
  );
}
```

### Headless Search Hook

```tsx
import { useSearch } from '@huskel/sdk';

export function CustomSearch() {
  const { results, loading, search } = useSearch();

  return (
    <div>
      <input onChange={e => search(e.target.value)} />
      <ul>
        {results.map(r => (
          <li key={r.id}>{r.product.name}</li>
        ))}
      </ul>
    </div>
  );
}
```

## Sparkle (similar products)

```tsx
import { Sparkle } from '@huskel/sdk';

<Sparkle
  productName={product.name}
  onResult={(similar) => setSimilar(similar)}
/>
```
