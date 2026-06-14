# @akropolys/sdk

AI-powered vector search for any storefront. Your customers browse → products index automatically. Zero scraping, zero manual uploads.

## Install

```bash
npm install @akropolys/sdk
# or
pnpm add @akropolys/sdk
```

---


## Next.js (App Router)

Next.js App Router uses **Server Components** by default. The SDK is client-only, so follow this pattern:

### 1. Enable Package Transpilation (CRITICAL)

In your `next.config.ts` (or `next.config.js`), you must add `@akropolys/sdk` to `transpilePackages` to ensure Next.js can transpile the SDK components properly:

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@akropolys/sdk"],
};

export default nextConfig;
```

*Note: Without this, importing SDK UI components like `SearchBar` will fail during compilation.*

### 2. Create a client provider wrapper

```tsx
// app/components/AkropolysClientProvider.tsx
'use client';

import { AkropolysProvider } from '@akropolys/sdk';

export default function AkropolysClientProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AkropolysProvider>{children}</AkropolysProvider>;
}
```

### 3. Add it to your root layout

```tsx
// app/layout.tsx  ← this is a Server Component, no 'use client' needed
import AkropolysClientProvider from './components/AkropolysClientProvider';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AkropolysClientProvider>
          {children}
        </AkropolysClientProvider>
      </body>
    </html>
  );
}
```

### 4. Auto-ingest on product pages

```tsx
// app/products/[slug]/page.tsx
import { getProduct } from '@/lib/db'; // your own data fetching

// ProductView is a Client Component — handles ingestion
'use client';
import { usePageIngest } from '@akropolys/sdk';

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

### 5. Add the search bar

```tsx
// app/components/Header.tsx
'use client';
import { SearchBar } from '@akropolys/sdk';
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
import { AkropolysProvider } from '@akropolys/sdk';

function App() {
  return (
    <AkropolysProvider>
      <Router>
        <Routes />
      </Router>
    </AkropolysProvider>
  );
}
```

### 2. Ingest on product pages

```tsx
// src/pages/ProductPage.tsx
import { usePageIngest } from '@akropolys/sdk';

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
import { SearchBar } from '@akropolys/sdk';

<SearchBar onSelect={(result) => navigate(result.product.url)} />
```

---

## Batch ingest (listing pages)

When rendering a catalog or grid of products, use the `useListIngest` hook. It handles React render cycles, deduplication, and component lifecycles internally:

```tsx
'use client';
import { useListIngest } from '@akropolys/sdk';

export function ProductGrid({ products }) {
  useListIngest(
    products.map((p) => ({
      name: p.title,
      price: p.price,
      url: `/products/${p.slug}`,
      images: [p.thumbnail],
      category: p.category,
      currency: 'KES',
    }))
  );

  return <ul>{/* render cards */}</ul>;
}
```

---

## API Reference

| Export | Type | Description |
|--------|------|-------------|
| `AkropolysProvider` | Component | Wraps your app. Accepts config, handles lifecycle. |
| `usePageIngest(product)` | Hook | Ingest one product automatically on page mount. |
| `useListIngest(products)` | Hook | Batch ingest products. Handles mounting lifecycle & caching. |
| `useIngest()` | Hook | Returns `{ ingest, ingestBatch }` with built-in cache deduplication. |
| `useSearch()` | Hook | Returns `{ search, results, loading }` for headless search. |
| `SearchBar` | Component | Plug-and-play autocomplete search UI. |
| `Sparkle` | Component | "Similar products" button powered by vector similarity. |
| `getAkropolysClient()` | Function | Get the singleton client instance imperatively. |
| `initAkropolys(config)` | Function | Initialize manually (non-React environments). |

### AkropolysProvider Configuration

You can pass the following properties to `<AkropolysProvider>` (or set their corresponding environment variables):

| Property | Environment Variable | Type | Description |
|---|---|---|---|
| `siteId` | `NEXT_PUBLIC_HUSKEL_SITE_ID` | `string` | Unique site identifier. |
| `apiUrl` | `NEXT_PUBLIC_HUSKEL_API_URL` | `string` | The endpoint of the Akropolys backend. |
| `apiToken` | `NEXT_PUBLIC_HUSKEL_API_TOKEN` | `string` | API access token. |
| `shopperId` | - | `string` | Current customer's user ID. Set dynamically to sync search preferences. |
| `authLoading` | - | `boolean` | Set to `true` while auth resolves (e.g. `!user` or `!isLoaded` in Clerk) to buffer/hold early ingests, avoiding guest session tagging. |
| `onError` | - | `(error: AkropolysError) => void` | Event handler called when search or ingestion fails, or on initialization errors. |
