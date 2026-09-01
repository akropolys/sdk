# @akropolys/sdk

Blindly agnostic TypeScript client, real-time timeseries streaming layer, and cryptographic server utilities for [Akropolys](https://akropolys.cloud).

[![npm](https://img.shields.io/npm/v/@akropolys/sdk?color=orange)](https://www.npmjs.com/package/@akropolys/sdk) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT) [![TypeScript](https://img.shields.io/badge/types-included-blue)](https://www.typescriptlang.org/)

---

## Install

```bash
npm install @akropolys/sdk
# or
pnpm add @akropolys/sdk
```

---

## Client Usage (React / Next.js)

```tsx
import { AkropolysProvider, useKiku, useAkropolys } from '@akropolys/sdk';

export function ChatInterface() {
  const { messages, send, loading, streaming } = useKiku();

  return (
    <div>
      <div className="chat-log">
        {messages.map((m, i) => (
          <div key={i} className={`msg msg-${m.role}`}>
            {m.content}
          </div>
        ))}
      </div>
      <button onClick={() => send("Show me lightweight running shoes under $120")} disabled={loading}>
        Ask AI
      </button>
    </div>
  );
}

export default function App() {
  return (
    <AkropolysProvider
      siteId={process.env.NEXT_PUBLIC_AKROPOLYS_SITE_ID!}
      apiUrl={process.env.NEXT_PUBLIC_AKROPOLYS_API_URL!}
      apiToken={process.env.NEXT_PUBLIC_AKROPOLYS_API_KEY!}
    >
      <ChatInterface />
    </AkropolysProvider>
  );
}
```

---

## Server-Side Telemetry Ingestion (`@akropolys/sdk/server`)

Stream live inventory, fluctuating prices, financial spreads, or dynamic rates signed with PKCS#8 RSA keys:

```typescript
import { signLiveRecords } from '@akropolys/sdk/server';

const records = [
  {
    key: 'Sony WH-1000XM5',
    fields: {
      price: '$348.00',
      stock: '2 left in stock',
      promo: 'FLASH15',
    },
  },
];

const payload = await signLiveRecords(records, process.env.AKROPOLYS_PRIVATE_KEY!, {
  kid: process.env.AKROPOLYS_KID!,
});

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

## License

MIT © [Akropolys](https://akropolys.cloud)
