# Akropolys

**The real-time conversational layer for the living web.**

Domain-blind to any catalog or live data stream — from retail inventory, cars, and real estate to financial markets, travel fares, and live sports.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178c6.svg)](https://www.typescriptlang.org/)
[![Documentation](https://img.shields.io/badge/Docs-akropolys.cloud-black)](https://akropolys.cloud)

---

## Why Akropolys

Building end-to-end RAG is **exhausting** — vector databases, chunking strategies, stale embeddings, and synchronization jobs that take weeks to build and maintain.

Akropolys replaces the custom RAG pipeline with a unified, real-time retrieval and conversational layer.

### What you get out of the box

- **Domain-Blind Grounding** — Index any asset (products, properties, contracts, or live odds) without custom schema engineering.
- **Sub-50ms Live Telemetry** — Stream fast-changing state directly into model context without re-indexing or re-embedding.
- **Multi-Modal Native** — Duplex voice streaming, photo/visual search, and comparison tables out of the box.
- **Deterministic Precision** — Zero-hallucination math for real-time prices, inventories, and calculations.
- **Drop-In Embed** — Headless SDK (`@akropolys/sdk`) and pre-built UI (`@akropolys/kiku`) ready in minutes.

---

## 30-Second Integration

### 1. React & Next.js

```bash
npm install @akropolys/sdk @akropolys/kiku
```

```tsx
import { AkropolysProvider } from '@akropolys/sdk';
import { KikuButton } from '@akropolys/kiku';
import '@akropolys/kiku/styles.css';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AkropolysProvider
          siteId={process.env.NEXT_PUBLIC_AKROPOLYS_SITE_ID!}
          apiUrl={process.env.NEXT_PUBLIC_AKROPOLYS_API_URL!}
          apiToken={process.env.NEXT_PUBLIC_AKROPOLYS_API_TOKEN!}
        >
          {children}
          <KikuButton label="Ask me anything" enableVoice enableVision />
        </AkropolysProvider>
      </body>
    </html>
  );
}
```

### 2. Publish your loaded records

```jsx
'use client';

import { usePageIngest } from '@akropolys/sdk';

export function PublishRecord({ record }) {
  usePageIngest(record);
  return null;
}
```

Use this inside your provider with data the website already loaded. Normal ingestion submits one record and works on every plan. For arrays, use the ingestion client's `ingestBatch(records)`, available on Growth, Pro and Business:

```js
import { createIngestClient } from '@akropolys/sdk/server';

const akropolys = createIngestClient({
  siteId: 'YOUR_SITE_ID',
  apiToken: 'YOUR_PUBLIC_API_TOKEN',
});

await akropolys.ingestBatch(records);
```

Connect the batch call to your website's existing data-loading or refresh callback. It submits the array you pass; unchanged records are skipped and changed records update under the same IDs. Once indexing finishes, the updates are available to every visitor on that site, regardless of who triggered ingestion. The SDK does not watch API requests automatically. A browser can publish a complete catalogue array, including items not rendered on the page; coverage depends on the supplied records, not visits to their pages or where ingestion runs.

The [JavaScript embed](https://akropolys.cloud/docs/javascript/) also accepts one record or an array through `Kiku.ingest`. Choose one publishing path per dataset.

Each record requires a stable `id`. A useful minimal record is `{ id: 'chair-123', title: 'Linen lounge chair' }`; add descriptive facts in `fields`. Keep the ID across updates. `fields.url` is optional. Use `image` for a cover and `images` for an ordered gallery of URL strings or `{ url, alt?, caption? }` objects belonging to that record.

[Signing](https://akropolys.cloud/docs/signed-ingestion/) is optional unless your site requires it in Shell. [Request grouping](https://akropolys.cloud/docs/batch-ingestion/#batch-size-and-retries) is a parameter on the ingestion client's batch method, not single-record ingestion.

### 3. Publish changing values

```jsx
'use client';

import { useLiveData } from '@akropolys/sdk';

export function PublishAvailability({ product }) {
  useLiveData(product.id, { price: product.price, stock: product.stock });
  return null;
}
```

Catalogue records use `id`; live-value updates use a stable `key`. See the [live-data guide](https://akropolys.cloud/docs/live-data/) for signing and allowances.

---

## Monorepo Packages

| Package | Purpose |
|---|---|
| [`@akropolys/sdk`](./packages/sdk) | Data ingestion, search, streaming hooks, and optional signing. |
| [`@akropolys/kiku`](./packages/kiku) | Multi-modal UI widget with Live Voice, Vision, and comparative tables. |
| [`@akropolys/cli`](./packages/cli) | CLI diagnostics, environment scaffolding, and payload linting. |

---

## License

MIT © [Akropolys](https://akropolys.cloud)

