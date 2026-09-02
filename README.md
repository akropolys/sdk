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
          apiToken={process.env.NEXT_PUBLIC_AKROPOLYS_API_KEY!}
        >
          {children}
          <KikuButton label="Ask me anything" enableVoice enableVision />
        </AkropolysProvider>
      </body>
    </html>
  );
}
```

### 2. Stream Live Telemetry (Server)

```typescript
import { signLiveRecords } from '@akropolys/sdk/server';

const payload = await signLiveRecords([
  {
    key: 'Sony WH-1000XM5',
    fields: { price: '$348.00', stock: '3 left', promo: 'FLASH15' }
  },
  {
    key: '2023 BMW M340i',
    fields: { price: '$54,900', status: 'Available', location: 'Downtown Lot' }
  }
], process.env.AKROPOLYS_PRIVATE_KEY!, { kid: process.env.AKROPOLYS_KID! });

await fetch(`${process.env.AKROPOLYS_API_URL}/live`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': process.env.AKROPOLYS_API_KEY!,
    'X-Akropolys-Site': process.env.AKROPOLYS_SITE_ID!,
  },
  body: JSON.stringify(payload),
});
```

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

