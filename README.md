# @huskel/sdk

AI-powered vector search for any storefront. Your customers browse → products index automatically. Zero scraping, zero manual uploads.

## Install

```bash
npm install @huskel/sdk
# or
pnpm add @huskel/sdk
```

---


## Next.js (App Router)

Next.js App Router uses **Server Components** by default. The SDK is client-only, so follow this pattern:

### 1. Create a client provider wrapper

```tsx
// app/components/HuskelClientProvider.tsx
'use client';

import { HuskelProvider } from '@huskel/sdk';

export default function HuskelClientProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return <HuskelProvider>{children}</HuskelProvider>;
}
```

### 2. Add it to your root layout

```tsx
// app/layout.tsx  ← this is a Server Component, no 'use client' needed
import HuskelClientProvider from './components/HuskelClientProvider';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <HuskelClientProvider>
          {children}
        </HuskelClientProvider>
      </body>
    </html>
  );
}
```

### 3. Auto-ingest on product pages

```tsx
// app/products/[slug]/page.tsx
import { getProduct } from '@/lib/db'; // your own data fetching

// ProductView is a Client Component — handles ingestion
'use client';
import { usePageIngest } from '@huskel/sdk';

export function ProductView({ product }) {
  // One line — fires automatically when the customer's browser loads the page
  usePageIngest({
    name: product.title,
    price: product.price,
    url: window.location.href,
    images: [product.thumbnail],
    category: product.category,
    description: product.description,
  });

  return <div>{/* your product UI */}</div>;
}
```

> **Why a separate client component?**  
> `usePageIngest` uses `useEffect` which runs only in the browser. Server Components can't call hooks. The wrapper pattern keeps your data-fetching in Server Components (fast, cached) while the SDK fires client-side.

### 4. Add the search bar

```tsx
// app/components/Header.tsx
'use client';
import { SearchBar } from '@huskel/sdk';
import { useRouter } from 'next/navigation';

export function Header() {
  const router = useRouter();
  return (
    <SearchBar
      placeholder="Search products..."
      onSelect={(result) => router.push(result.product.url)}
    />
  );
}
```

---

## React (CRA / Vite)

With a standard SPA, everything is already a client component. Much simpler:

### 1. Wrap your app

```tsx
// src/main.tsx or src/App.tsx
import { HuskelProvider } from '@huskel/sdk';

function App() {
  return (
    <HuskelProvider>
      <Router>
        <Routes />
      </Router>
    </HuskelProvider>
  );
}
```

### 2. Ingest on product pages

```tsx
// src/pages/ProductPage.tsx
import { usePageIngest } from '@huskel/sdk';

export function ProductPage({ product }) {
  usePageIngest({
    name: product.title,
    price: product.price,
    url: window.location.href,
    images: [product.thumbnail],
    category: product.category,
  });

  return <div>{/* your product UI */}</div>;
}
```

### 3. Add search

```tsx
import { SearchBar } from '@huskel/sdk';

<SearchBar onSelect={(result) => navigate(result.product.url)} />
```

---

## Batch ingest (listing pages)

When rendering a grid of products, ingest them all at once:

```tsx
'use client';
import { useIngest } from '@huskel/sdk';
import { useEffect } from 'react';

export function ProductGrid({ products }) {
  const { ingestBatch } = useIngest();

  useEffect(() => {
    ingestBatch(
      products.map((p) => ({
        name: p.title,
        price: p.price,
        url: `/products/${p.slug}`,
        images: [p.thumbnail],
        category: p.category,
        currency: 'KES',
      }))
    );
  }, [products]);

  return <ul>{/* render cards */}</ul>;
}
```

---

## API Reference

| Export | Type | Description |
|--------|------|-------------|
| `HuskelProvider` | Component | Wraps your app. Reads env vars automatically. |
| `usePageIngest(product)` | Hook | Ingest one product. Call on any product detail page. |
| `useIngest()` | Hook | Returns `{ ingest, ingestBatch }` for manual control. |
| `useSearch()` | Hook | Returns `{ search, results, loading }` for headless search. |
| `SearchBar` | Component | Plug-and-play autocomplete search UI. |
| `Sparkle` | Component | "Similar products" button powered by vector similarity. |
| `getHuskelClient()` | Function | Get the singleton client instance imperatively. |
| `initHuskel(config)` | Function | Initialize manually (non-React environments). |
