# @akropolys/sdk

Blindly agnostic TypeScript client, real-time timeseries streaming layer, and cryptographic server utilities for [Akropolys](https://akropolys.cloud).

[![npm](https://img.shields.io/npm/v/@akropolys/sdk?color=orange)](https://www.npmjs.com/package/@akropolys/sdk) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT) [![TypeScript](https://img.shields.io/badge/types-included-blue)](https://www.typescriptlang.org/)

---

## Install

```bash
npm install @akropolys/sdk@2.0.1
# or
pnpm add @akropolys/sdk@2.0.1
```

---

## CDN modules

The published SDK modules are available at:

- [Client and React exports](https://cdn.akropolys.cloud/sdk/2.0.1/index.mjs)
- [Server utilities](https://cdn.akropolys.cloud/sdk/2.0.1/server.mjs)

Use these package modules with a bundler that resolves their peer dependencies.
For a ready-made browser widget, use the [Kiku script embed](https://akropolys.cloud/docs/javascript/).

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
      apiToken={process.env.NEXT_PUBLIC_AKROPOLYS_API_TOKEN!}
    >
      <ChatInterface />
    </AkropolysProvider>
  );
}
```

---

## Site actions

Configure an action's endpoint, HTTP method, and request fields in Shell. Kiku collects the values, Akropolys calls your endpoint, and your backend performs the operation and returns the result. For example, a cart endpoint can accept a product ID and quantity; a booking endpoint can accept a service and date.

The SDK does not maintain a separate cart or require a state library. Your endpoint must identify the customer and validate the request. Server-to-server action calls do not automatically include the visitor's browser cookies.

Migration: `onAction`, `onAddToCart`, `getCart`, and the `akropolys:action` browser event have been removed. Configure operations as site actions in Shell and remove the old provider props and action listeners. If Kiku needs current cart contents, expose a read action through the same mechanism. Your website can refresh its displayed state through its existing data-fetching mechanism.

## Batch ingestion on your server

Configure once:

```ts
import { createIngestClient } from '@akropolys/sdk/server';

const akropolys = createIngestClient({
  siteId: process.env.AKROPOLYS_SITE_ID!,
  apiToken: process.env.AKROPOLYS_API_TOKEN!,
});
```

Send the records you already have:

```ts
await akropolys.ingestBatch(records);
```

Each record requires a stable top-level `id` from your API or database. Use a non-empty string or a safe integer; use a string for larger numeric IDs. `fields.url` is optional but recommended when the record has a webpage. Use `title`, `fields` and optional top-level `content` for the data you want indexed. Explicit batches require Pro or Business. For one record use `await akropolys.ingest(record)`.

```ts
await akropolys.ingest({
  id: product.id,
  title: product.name,
  fields: { price: product.price, url: product.url },
});

// Records without a webpage work too.
await akropolys.ingest({ id: 'stockroom-42', title: 'Stockroom inventory', fields: { available: 12 } });
```

If your source records already have an `id`, pass the array directly without mapping. Keep the same ID for later updates. Changing `fields.url` does not create a second record. The SDK validates the entire batch before sending its first group; a URL, title, slug or signature cannot substitute for an ID. Content fingerprints still skip unchanged versions, independently of each request's nonce and signature.

Kiku can show and save records without a URL, retaining a supplied link in saved history. When adopting an existing URL-keyed record, supply its previous URL in `fields.url` on the first ID-bearing submission so the backend can preserve its existing identity. URL-only clients must add IDs before moving to the new backend contract.

For signed ingestion, configure the key once and pass `signed` as the second argument. This is plain JavaScript and also works in TypeScript:

```js
import { createIngestClient, signed } from '@akropolys/sdk/server';

const akropolys = createIngestClient({
  siteId: process.env.AKROPOLYS_SITE_ID,
  apiToken: process.env.AKROPOLYS_API_TOKEN,
  privateKey: process.env.AKROPOLYS_PRIVATE_KEY,
  kid: process.env.AKROPOLYS_PUBLIC_KEY_ID,
});

await akropolys.ingest(record, signed);
await akropolys.ingestBatch(records, signed);
// Equivalent without importing the option:
await akropolys.ingest(record, { signed: true });
```

### Environment names and the `signed` option

Configure the private key and its matching key ID once in the server client. Passing `signed` to ingestion then handles signing and sending automatically; no separate signing function is needed. The SDK uses the values you supply and does not discover environment variables or require particular names.

The site API token used by the browser integration is public. In Next.js, the site ID, site API token, API URL and public key ID may use `NEXT_PUBLIC_`. The private signing key must remain server-only and must never use `NEXT_PUBLIC_`. Dashboard session tokens and other server credentials are also private.

Signed ingestion runs on the server in both plain JavaScript and Next.js. Enable **Require signed ingestion** in Shell to make the backend reject unsigned writes; passing `signed` does not change that site setting.

Batch calls send groups of 10 by default, one request at a time. Change the group size with the third argument:

```js
await akropolys.ingestBatch(records, signed, { batchSize: 10 });
// Unsigned:
await akropolys.ingestBatch(records, undefined, { batchSize: 10 });
```

Every group uses the batch endpoint and the same plan/signature checks. Each signed group gets its own signature. The result combines indexed, updated, skipped, and queued counts; `count` on a split submission is the number of records submitted in accepted groups. A group can be accepted into the backend queue without finishing indexing.

If a split submission fails, later groups are not sent. `IngestBatchError` preserves the error message and HTTP status (`0` for local/network errors), with `partialResult` for accepted groups and `nextIndex` pointing to the start of the failed group. Resume with `records.slice(error.nextIndex)` using the same ordered input. The failed group may have been saved before a connection failure; the backend handles retries of an unchanged saved version without another re-index charge. There are no automatic retries or parallel requests within a batch call.

The promise waits for all groups to be accepted. Splitting requests does not itself make a page load faster. Run full inventory imports in a background job, independently of page requests. For small updates discovered while serving a Next.js page, use its `after` scheduler to start ingestion after the response; that work is still subject to the hosting request-duration limit. Do not rely on an unawaited promise surviving the end of a serverless request. A larger `batchSize` must still fit the backend request-size limit.

`signed` is an option, not a function. These signed calls run on your server (Node.js or a compatible runtime with Fetch and Web Crypto). Browser JavaScript calls your server; never put the private key in a browser bundle. Unsigned browser ingestion continues to use the existing client API.

Enable **Require signed ingestion** for the site in Shell to reject unsigned requests. The backend enforces that setting for both methods; the SDK does not change the setting. Register the matching public key with the site and keep the private key on your server.

Migration: the separate `signIngest` export has been removed. Replace signing followed by a manual request with `ingest(record, signed)` or `ingestBatch(records, signed)`.

Keep this configuration on the server. The ingestion methods create and send the signature internally. No separate signing call or request wrapper is needed. `apiUrl` and `timeoutMs` are optional; the request timeout defaults to 20 seconds.

The promise resolves after backend acceptance. A result with `queued > 0` means the backend retained updates for later re-indexing; it does not mean indexing has finished. Errors throw `IngestError` with the backend's `status` and message. Signing errors fail before sending a request, and rejected signed requests are never retried unsigned.

Use this call in your import job, data-loading code, or update handler. It ingests the records you pass; it does not crawl the remaining inventory. Handle errors at the call site if page rendering should continue when ingestion is unavailable.

---

## Live entities

Use the same server client and `signed` option for rapidly changing data:

```js
await akropolys.ingestLive([
  { key: 'product-123', fields: { price: 348, stock: 2 } },
], signed, { batchSize: 100 });
```

One record or an array is accepted. Live groups default to 100 records and are also split by payload bytes; they run sequentially. The SDK signs each group internally. The former `signLiveRecords` export has been replaced by this method. Keep the private key on the server. A successful response returns accepted `count` and `skipped` records with reasons, including `key_quota_reached`. A partial transport failure throws `LiveBatchError` with `nextIndex` and `partialResult`; it does not silently retry or remove the signature.

Live updates do not consume catalogue re-index credits. Distinct live keys use their existing plan allowance; repeated updates to a key do not add slots. Group size does not change that accounting. Live HTTP 202 means the accepted values have reached the current-value store; it is different from queued catalogue re-indexing.

Browser integrations that permit unsigned updates can use:

```jsx
const { status, error, skipped, retrying, retry } = useLiveData(key, fields);
```

The hook exposes pending, accepted, skipped, and error states. `retry()` resubmits the latest fields. Browser updates coalesce by key, send bounded groups, and back off after temporary failures; permanent rejection is surfaced rather than retried continuously. Signed sites publish from their server.

Live previews in chat and voice are bounded. The assistant can use `read_live` to search the complete stored live inventory and page through every field, including large values and identifiers. Models without tool support receive a question-prioritised chat snapshot and an explicit notice when records were omitted; they cannot fetch further pages automatically. Old keys expire individually after seven days without an update.

---

## License

MIT © [Akropolys](https://akropolys.cloud)


### Entity image galleries

Supply a dedicated top-level `images` list. Each entity in a batch owns its own list:

```json
{
  "id": "listing-123",
  "title": "Example listing",
  "images": [
    { "url": "https://example.com/front.jpg", "alt": "Front entrance", "caption": "Exterior" },
    { "url": "https://example.com/inside.jpg", "caption": "Interior" }
  ],
  "fields": { "bedrooms": 2, "url": "https://example.com/listings/123" }
}
```

Order is preserved; the first image is the cover unless the existing single `image` property explicitly overrides it. `alt` and `caption` are optional. URL-string arrays remain accepted for compatibility, including legacy `fields.images`. Prefer absolute HTTPS URLs; relative image paths resolve against `fields.url` when supplied. Use absolute image URLs for records without a webpage. Top-level `images` takes precedence over `fields.images`. An empty array clears the gallery on re-ingestion. Malformed top-level galleries are rejected rather than flattened into another entity. Existing single-image payloads continue to work.

Kiku displays one card per entity with an image count. Open it to navigate using buttons, arrow keys or swipe; Escape closes it. Only the selected gallery image is loaded. Captions are supplied metadata, not evidence that the model inspected every image. This requires compatible backend, SDK and Kiku releases.

## Version 2 migration

`signIngest` and `signLiveRecords` are no longer separate public functions. Configure `createIngestClient` on your server and pass the exported `signed` option as the second argument to `ingest`, `ingestBatch`, or `ingestLive`. Never place the private key in browser code. Live browser updates report errors and skipped records through callbacks and `useLiveData` status.
