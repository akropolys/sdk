# @akropolys/sdk

Blindly agnostic TypeScript client, real-time timeseries streaming layer, and optional signing utilities for [Akropolys](https://akropolys.cloud).

[![npm](https://img.shields.io/npm/v/@akropolys/sdk?color=orange)](https://www.npmjs.com/package/@akropolys/sdk) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT) [![TypeScript](https://img.shields.io/badge/types-included-blue)](https://www.typescriptlang.org/)

---

## Install

```bash
npm install @akropolys/sdk@2.0.3
# or
pnpm add @akropolys/sdk@2.0.3
```

---

## CDN modules

The published SDK modules are available at:

- [Client and React exports](https://cdn.akropolys.cloud/sdk/2.0.3/index.mjs)
- [Ingestion and signing utilities](https://cdn.akropolys.cloud/sdk/2.0.3/server.mjs)

Use these package modules with a bundler that resolves their peer dependencies.
For a ready-made browser widget, use the [Kiku script embed](https://akropolys.cloud/docs/javascript/).

## Client Usage (React / Next.js)

```tsx
'use client';

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

Register your existing API endpoints, HTTP methods and JSON Schemas in Shell. Kiku calls them from the visitor's browser in text and voice. Cookie-based APIs need no authentication option. Your API checks permissions and owns the resulting state.

For Clerk, Auth0 or Supabase bearer APIs, connect your existing client once. Plain JavaScript/CDN uses no application wrapper:

```js
await Kiku.mount({
  siteId,
  apiToken,
  actionAuth: { provider: "supabase", client: supabase },
});
```

React can add the same option to its existing provider:

```tsx
<AkropolysProvider siteId={siteId} apiToken={apiToken}
  actionAuth={{ provider: "supabase", client: supabase }}>
  <YourApp />
</AkropolysProvider>
```

Use `provider: "clerk"` with the existing Clerk client (or React `useAuth()` value), `provider: "auth0"` with the SPA client (or `useAuth0()` value), or `provider: "supabase"` with the Supabase client. The adapter reads the current token through that client's token/session getter before each action; the auth SDK handles renewal. Kiku constructs the Authorization header internally. Tokens go directly to your API, and only the action result returns to Akropolys.

Adapters default to the page's origin. For a separate API domain, add `origins: ["https://api.your-site.com"]` to `actionAuth` and configure normal browser CORS. Auth0 `authorizationParams` and Clerk `tokenOptions` are optional when your API needs an audience/scope or JWT template. `actionHeaders` remains the advanced custom-auth/CSRF option; do not add another Authorization header alongside an adapter.

Use relative endpoints such as `/api/cart/items` across localhost and production. `shopperId`/`userProof` establish identity to Akropolys and do not replace your API's session or access token. Return HTTP 401 JSON when sign-in is needed. The widget refuses redirects and does not automatically retry mutations after an unknown outcome. Shell's server tester does not share the shopper's cookies. See the [site actions guide](https://akropolys.cloud/docs/actions/) for brief examples and troubleshooting.

A custom `actionHeaders(action, signal)` callback may return `{}` or Fetch-compatible headers, directly or asynchronously. It runs for same-origin requests too. Throwing/rejecting stops the API request and returns a failure for Kiku to explain. See the [callback contract](https://akropolys.cloud/docs/actions/#callback-contract) and the complete [cookie-based example](https://akropolys.cloud/docs/actions/#cookies-do-nothing-extra).

**Standalone batch ingestion is unchanged:** `createIngestClient(...).ingestBatch(records)` needs no application wrapper, Kiku widget or `actionAuth`.

## Normal and batch ingestion

Use the records your website already loads. Normal ingestion sends one record to `/ingest` and is available on every plan. Batch ingestion sends an array to `/ingest/batch` and requires Growth, Pro or Business. Signing is optional unless the site requires it in Shell; it does not change the batch plan requirement.

Use the ingestion client's `ingestBatch(records)` for arrays across JavaScript frameworks. Connect it to your existing data-loading or refresh callback. React's `usePageIngest(record)` handles a single page record; `useIngest` exposes hook submission status and errors. With the JavaScript embed, `Kiku.ingest(record)` and `Kiku.ingest(records)` select normal and batch ingestion respectively. Choose one publishing path per dataset.

### Batch ingestion client

The JavaScript ingestion utility uses the existing site ID and API token. Its `/server` import is a package path, not a separate ingestion service or framework requirement:

```ts
import { createIngestClient } from '@akropolys/sdk/server';

const akropolys = createIngestClient({
  siteId: process.env.AKROPOLYS_SITE_ID!,
  apiToken: process.env.AKROPOLYS_API_TOKEN!,
});
```

Send the loaded array:

```ts
await akropolys.ingestBatch(records);
```

Each record requires a stable top-level `id` from your API or database. Use a non-empty string or a safe integer; use a string for larger numeric IDs. `fields.url` is optional but recommended when the record has a webpage. Use `title`, `fields` and optional top-level `content` for the data you want indexed. Explicit batches require Growth, Pro or Business. For one record use `await akropolys.ingest(record)`.

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

Configure the private key and its matching key ID once in the ingestion client, where the key can stay private. Passing `signed` to ingestion then handles signing and sending automatically; no separate signing function is needed. The SDK uses the values you supply and does not discover environment variables or require particular names.

The site API token used by the browser integration is public. In Next.js, the site ID, site API token, API URL and public key ID may use `NEXT_PUBLIC_`. The private signing key must remain server-only and must never use `NEXT_PUBLIC_`. Dashboard session tokens and other server credentials are also private.

Signing uses the same record format in plain JavaScript and Next.js; keep the private key outside browser code. Enable **Require signed ingestion** in Shell to make the backend reject unsigned writes; passing `signed` does not change that site setting.

For larger arrays, grouping records is recommended instead of issuing one ingestion request per item. The current client uses 10 when `batchSize` is omitted; that fallback belongs to this method, not single-record ingestion or the embed/hooks. `batchSize` is a third-argument parameter on this client’s `ingestBatch` method, not on single-record `ingest`. Choose the number of records per batch request explicitly:

```js
await akropolys.ingestBatch(records, signed, { batchSize: 10 });
// Unsigned:
await akropolys.ingestBatch(records, undefined, { batchSize: 10 });
```

Every group uses the batch endpoint and the same plan/signature checks. Each signed group gets its own signature. The result combines indexed, updated, skipped, and queued counts; `count` on a split submission is the number of records submitted in accepted groups. A group can be accepted into the backend queue without finishing indexing.

If a split submission fails, later groups are not sent. `IngestBatchError` preserves the error message and HTTP status (`0` for local/network errors), with `partialResult` for accepted groups and `nextIndex` pointing to the start of the failed group. Resume with `records.slice(error.nextIndex)` using the same ordered input. The failed group may have been saved before a connection failure; the backend handles retries of an unchanged saved version without another re-index charge. There are no automatic retries or parallel requests within a batch call.

The promise waits for all submitted groups to be accepted. Awaiting ingestion in an async callback pauses that callback, not browser rendering or interaction. Reuse data already loaded by the website, catch submission errors, and avoid making the page’s own rendering depend on ingestion. `batchSize` is not an argument on the embed or React hooks; unsigned arrays passed through those methods are sent as one batch request.

`signed` is an option, not a function. The helper uses Fetch and Web Crypto. Use signing only where the private key remains private; never put that key in a browser bundle. Next.js Server Components and Client Components do not define different ingestion formats.

Enable **Require signed ingestion** for the site in Shell to reject unsigned requests. The backend enforces that setting for both methods; the SDK does not change the setting. Register the matching public key with the site and keep the private key on your server.

Migration: the separate `signIngest` export has been removed. Replace signing followed by a manual request with `ingest(record, signed)` or `ingestBatch(records, signed)`.

Keep this configuration on the server. The ingestion methods create and send the signature internally. No separate signing call or request wrapper is needed. `apiUrl` and `timeoutMs` are optional; the request timeout defaults to 20 seconds.

The promise resolves after backend acceptance. A result with `queued > 0` means the backend retained updates for later re-indexing; it does not mean indexing has finished. Errors throw `IngestError` with the backend's `status` and message. Signing errors fail before sending a request, and rejected signed requests are never retried unsigned.

Use the records available in your existing data-loading flow. A browser can submit a complete catalogue array, including records not rendered on screen; visitors do not need to open those items' pages. A paginated result covers only the supplied records. Ingestion does not fetch other API pages, and full coverage does not require a server-side import or scheduled job. Handle errors at the call site and check submission activity in Shell.

---

### Minimal record and IDs

Every normal or batch record requires a stable top-level `id`. A useful minimal record also supplies its name:

```json
{ "id": "chair-123", "title": "Linen lounge chair" }
```

Add attributes to `fields` so Kiku has facts to answer questions about. Keep the same ID across updates; a URL, title, signature, or newly generated ID must not replace it. IDs are site-scoped strings of at most 512 UTF-8 bytes, without surrounding whitespace or control characters. Safe integers including `0` are accepted; use strings for larger numeric IDs. `fields.url` is an optional navigation link. Put long text in top-level `content`.

### Updating records

Call `ingestBatch` whenever your loading or refresh flow receives fresh records. It does not watch API requests or detect source changes automatically. It submits the array you pass; the backend skips unchanged records and updates changed records under the same IDs.

The catalogue is shared by site ID. Once indexing finishes, new questions from every visitor can use those updates, regardless of which visitor triggered ingestion or where they are located. A queued result confirms acceptance, not completed indexing.

Publish the complete record and gallery to retain under the same ID; do not assume arbitrary partial `fields` are merged. Changes to persisted fields or image URLs can use re-index allowance; unchanged records are skipped. Avoid incidental per-view timestamps and counters. Use live data for frequently changing prices, stock, or availability when repeated catalogue updates would be unnecessary. A cached source can still supply stale data; ingestion does not refresh it automatically.

Loaded listing-page arrays are valid batch inputs. There is no detail-page-only rule. Signing is optional unless required in Shell; that policy rejects unsigned payloads, rather than disabling browser transport of valid signed records.

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

## Live entities

Use the same ingestion client and optional `signed` setting for rapidly changing data:

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


## Version 2 migration

`signIngest` and `signLiveRecords` are no longer separate public functions. Configure `createIngestClient` on your server and pass the exported `signed` option as the second argument to `ingest`, `ingestBatch`, or `ingestLive`. Never place the private key in browser code. Live browser updates report errors and skipped records through callbacks and `useLiveData` status.
