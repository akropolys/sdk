# Akropolys

**The real-time conversational intelligence layer for the living web.**

Domain-blind to any catalog entity or live telemetry stream — from retail inventory, cars, and real estate to financial markets, travel fares, and live sports.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178c6.svg)](https://www.typescriptlang.org/)
[![Documentation](https://img.shields.io/badge/Docs-akropolys.cloud-black)](https://akropolys.cloud)

---

## What It Represents

Most AI assistants are trapped in static history — scraping pages once a week and hallucinating outdated information.

Akropolys is **Living AI**:
* 🌐 **Domain-Blind Entity Grounding**: Treat any asset — products, vehicles, properties, flights, contracts, or events — as an indexed entity.
* ⚡ **Sub-50ms Live Telemetry**: Ingest high-frequency moving state (`signLiveRecords`) directly into in-memory model context.
* 🎙️ **Multi-Modal Native**: Spoken duplex Live Voice, Computer Vision reverse search, and interactive comparison tables.
* 📐 **Zero Hallucination Math**: Live deterministic calculation of prices, discounts, margins, risk, and payoff structures.
* 🔒 **One Drop-In Embed**: Single line of code for any website, app, or storefront.

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

### 2. Standalone HTML / Storefront Embed

```html
<script>
  window.AkropolysConfig = {
    siteId: "YOUR_SITE_ID",
    apiToken: "YOUR_PUBLIC_KEY",
    buttonLabel: "Ask me anything",
    theme: "dark",
    enableVoice: true,
    enableVision: true,
  };
</script>
<script src="https://cdn.akropolys.cloud/kiku.iife.js" async></script>
```

### 3. Stream Live Telemetry (Server)

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

