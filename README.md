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

### 2. Index your records (Server)

```typescript
import { createIngestClient, signed } from '@akropolys/sdk/server';

const akropolys = createIngestClient({
  siteId: process.env.AKROPOLYS_SITE_ID!,
  apiToken: process.env.AKROPOLYS_API_TOKEN!,
  privateKey: process.env.AKROPOLYS_PRIVATE_KEY!,
  kid: process.env.AKROPOLYS_KID!,
});

await akropolys.ingest({
  id: product.id,
  title: product.name,
  fields: { price: product.price, url: product.url },
}, signed);
```

Use your source record's stable `id`. `fields.url` is optional but recommended for records with a webpage. ID-only records can be searched, shown and saved in Kiku; a supplied link is retained in saved history. Fingerprints skip unchanged content. On Pro or Business, pass an ID-bearing array to `ingestBatch(records, signed)`.

### 3. Stream live values (Server)

```typescript
await akropolys.ingestLive([
  { key: 'product-123', fields: { price: '$348.00', stock: '3 left' } },
], signed);
```

Catalogue records use `id`; the separate live-value API uses its existing stable `key`. The server client handles signing and sending for both APIs. Keep its private key on your server.

---

## Monorepo Packages

| Package | Purpose |
|---|---|
| [`@akropolys/sdk`](./packages/sdk) | Core client, streaming hooks, and signed server telemetry. |
| [`@akropolys/kiku`](./packages/kiku) | Multi-modal UI widget with Live Voice, Vision, and comparative tables. |
| [`@akropolys/cli`](./packages/cli) | CLI diagnostics, environment scaffolding, and payload linting. |

---

## License

MIT © [Akropolys](https://akropolys.cloud)

