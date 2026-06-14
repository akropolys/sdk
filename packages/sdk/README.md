# @akropolys/sdk

> Headless AI search, chat, and commerce SDK — the engine behind Kiku.

`@akropolys/sdk` is the zero-UI core of the Akropolys platform. It gives you raw data streams, React hooks, and a typed API client that you wire up however you like — chat bubbles, spreadsheets, Remotion videos, analytics pipelines. Your call.

---

## Install

```bash
npm install @akropolys/sdk
# or
pnpm add @akropolys/sdk
```

React and react-dom are optional peer dependencies. Only required if you use the React hooks or `<AkropolysProvider>`.

---

## Quick start (React)

```tsx
import { AkropolysProvider, useKiku } from '@akropolys/sdk';

function App() {
  return (
    <AkropolysProvider
      siteId="your-site-id"
      apiUrl="https://api.akropolys.io"
      apiToken="your-api-token"
    >
      <Chat />
    </AkropolysProvider>
  );
}

function Chat() {
  const { send, messages, loading } = useKiku();

  return (
    <div>
      {messages.map((m, i) => <p key={i}><b>{m.role}:</b> {m.content}</p>)}
      <button onClick={() => send('What is the cheapest phone?')} disabled={loading}>
        Ask
      </button>
    </div>
  );
}
```

---

## Vanilla JS — event-driven streaming

```ts
import { AkropolysClient } from '@akropolys/sdk';

const client = new AkropolysClient({
  siteId: 'your-site-id',
  apiUrl: 'https://api.akropolys.io',
  apiToken: 'your-api-token',
});

const stream = client.chat('Best laptop under KSh 80,000?');

stream
  .on('token', (token: string) => process.stdout.write(token))
  .on('meta', (meta) => console.log('Sources:', meta.sources))
  .on('done', (full: string) => console.log('\nFinished:', full))
  .on('error', (err: Error) => console.error(err));
```

---

## Hooks

| Hook | Description |
|---|---|
| `useKiku(options?)` | Chat hook — streams AI responses, manages message history |
| `useSearch()` | Real-time vector product search |
| `useIngest()` | Fire-and-forget product ingestion |
| `usePageIngest(product)` | Auto-ingest current product page on mount |
| `useListIngest(products)` | Auto-ingest a catalog list on mount |
| `useCart()` | Read shopper cart state |
| `usePaymentPolling(props)` | Poll for M-Pesa / payment confirmation |
| `useAkropolysContext()` | Access the `AkropolysClient` from context |

---

## Environment variables

Set these instead of passing props to `<AkropolysProvider>`:

```env
NEXT_PUBLIC_AKROPOLYS_SITE_ID=your-site-id
NEXT_PUBLIC_AKROPOLYS_API_URL=https://api.akropolys.io
NEXT_PUBLIC_AKROPOLYS_API_TOKEN=your-api-token
```

Vite equivalents (`VITE_AKROPOLYS_*`) are also supported.

---

## Sub-paths

```ts
// Commerce-specific helpers
import { ... } from '@akropolys/sdk/commerce';

// Property vertical helpers
import { ... } from '@akropolys/sdk/property';
```

---

## KikuStream events

| Event | Payload | Description |
|---|---|---|
| `token` | `string` | Each word/token as it streams |
| `meta` | `ChatMetadata` | Sources, intent, cart updates |
| `done` | `string` | Full assembled message |
| `error` | `Error` | Stream or network error |

---

## License

MIT © Akropolys
