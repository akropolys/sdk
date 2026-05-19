# @huskel/sdk

AI-powered vector search SDK. You own your data — pass it in, we handle the rest.

## Install

```bash
npm install @huskel/sdk
```

## Setup

```tsx
// app/layout.tsx (Next.js) or _app.tsx
'use client';
import { useHuskel } from '@huskel/sdk';

export default function RootLayout({ children }) {
  useHuskel({
    siteId: 'your-site-id',
    apiUrl: 'https://your-huskel-backend.com',
    apiToken: 'your-api-token',
  });
  return <html><body>{children}</body></html>;
}
```

## Ingest products (you pass your own data)

```tsx
import { useIngest } from '@huskel/sdk';

// Single product page
export function ProductPage({ product }) {
  const { ingest } = useIngest();

  useEffect(() => {
    ingest({
      name: product.title,
      price: product.price,
      url: window.location.href,
      images: product.images,
      category: product.category,
      currency: 'KES',
    });
  }, [product.id]);
}

// Listing / category page
export function ProductGrid({ products }) {
  const { ingestBatch } = useIngest();

  useEffect(() => {
    ingestBatch(products.map(p => ({
      name: p.title,
      price: p.price,
      url: `/products/${p.slug}`,
      images: [p.thumbnail],
      currency: 'KES',
    })));
  }, [products]);
}
```

## Search

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

```tsx
// Headless
import { useSearch } from '@huskel/sdk';

const { results, loading, search } = useSearch();
<input onChange={e => search(e.target.value)} />
```

## Sparkle (similar products)

```tsx
import { Sparkle } from '@huskel/sdk';

<Sparkle
  productName={product.name}
  onResult={(similar) => setSimilar(similar)}
/>
```
