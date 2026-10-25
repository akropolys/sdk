# JavaScript embed

Add Kiku to any website with the published CDN script before your closing
`</body>` tag. The same embed works with JavaScript frameworks, plain HTML, and
HTMX. The loader fetches its stylesheet and embed module automatically.

```html
<script src="https://cdn.akropolys.cloud/kiku/2.2.30/kiku.js" data-site-id="YOUR_SITE_ID"
  data-api-token="YOUR_PUBLIC_BROWSER_TOKEN" defer></script>
```

Use the same public browser token as your existing frontend integration. Never
put secret keys or signing keys in HTML. The embed uses the same domain and
authentication checks as the React integration. React is bundled privately;
the host website does not install it. One widget is supported per page.

For configuration in JavaScript, omit the data attributes and call this after
the script loads:

```js
await Kiku.mount({
  siteId: 'YOUR_SITE_ID',
  apiToken: 'YOUR_PUBLIC_BROWSER_TOKEN',
  button: { label: 'Ask us', enableVoice: true },
});
await Kiku.open();
await Kiku.ingest({
  id: 'example', title: 'Example',
  fields: { description: 'Your page data', url: location.href },
});
```

`Kiku.ingest()` accepts one entity, an array, or signed ingestion records and
returns the API response. Supply data explicitly; the embed does not guess a
website's schema. Every catalogue record requires its source record's stable top-level `id`. `fields.url` is optional but recommended when a webpage is available; Kiku can show and save records without one. A supplied URL is kept in saved history. URLs, names and signatures do not replace IDs. Normal ingestion sends one record and works on every plan. An unsigned array uses the batch endpoint and requires Growth, Pro or Business. Signing is optional unless the site requires it in Shell; it is independent of normal versus batch ingestion.

For a useful minimal record, send `{ id: 'chair-123', title: 'Linen lounge chair' }`.
Add facts in `fields`. Use `image` for a cover and `images` for an ordered gallery
of URLs or `{ url, alt?, caption? }` objects. Each record owns its own photos.
Prefer absolute HTTPS image URLs; without a record webpage, use absolute URLs.
The first gallery image is the cover unless `image` overrides it. Re-ingest the
same ID to update the record or use `images: []` to clear its gallery.

Reuse loaded data instead of fetching it again just for ingestion. Await
`Kiku.ready` after automatic setup and catch errors from `Kiku.ingest`. An await
inside an async callback does not block browser rendering. If the embed is
loaded dynamically, wait for its script load before accessing `window.Kiku`.
The embed does not accept the ingestion client's `batchSize` parameter.

Update a record using the same ID and the full attributes/gallery to retain.
Avoid per-view timestamps or counters in catalogue fields; repeated changes can
use re-index allowance. Use live data for rapidly changing values when appropriate.
Listing pages can publish loaded arrays with batch access. Call ingestion from
your existing data-loading or refresh callback whenever fresh records arrive;
the embed does not watch API requests automatically. Once indexed, updates are
shared by every visitor using the same site ID, regardless of who triggered them.
A browser can publish a complete catalogue array, including items not rendered
on the page, without visits to each item's page. A paginated result covers only
its supplied records. Ingestion does not fetch other API pages or refresh stale
cached source data; full coverage does not require a server-side import.

After login, call `Kiku.updateIdentity({ shopperId, userProof })` with a proof
issued by your server. On logout pass `{}`. `Kiku.destroy()` removes the widget
and cleans up its client; call `mount()` again to restart. Automatic mounting
exposes `Kiku.ready`. Repeated script tags or mount calls reuse the same widget.

For a restrictive CSP, permit the script origin, existing API/voice endpoints,
and the styles/fonts already needed by Kiku. Voice still requires HTTPS and
microphone permission.

## CDN files and self-hosting

- [Loader](https://cdn.akropolys.cloud/kiku/2.2.30/kiku.js)
- [Stylesheet](https://cdn.akropolys.cloud/kiku/2.2.30/styles.css)
- [Embed module](https://cdn.akropolys.cloud/kiku/2.2.30/embed/embed.js)

To self-host, install `@akropolys/kiku@2.2.30` and copy `dist/kiku.js`,
`dist/styles.css`, and the entire `dist/embed` directory to your server. Preserve
their relative paths and use your hosted loader URL in the script tag. Serve
JavaScript with the correct MIME type and allow CORS across origins.

When building from this repository, run `pnpm --filter @akropolys/kiku build`
to generate those files.

## Site actions

Register your API endpoints and JSON Schemas in Shell. Cookie-based APIs need no extra authentication configuration. Relative paths such as `/api/cart/items` resolve against the host website, including on localhost.

For an API using Clerk, Auth0 or Supabase bearer tokens, manually mount with the website's existing login client:

```js
await Kiku.mount({
  siteId,
  apiToken,
  actionAuth: { provider: "supabase", client: supabase },
});
```

For Clerk use `{ provider: "clerk", client: clerk }`; for Auth0 use `{ provider: "auth0", client: auth0 }`. Remove `data-site-id` and `data-api-token` from the loader script when calling `Kiku.mount(options)`; pass them in the options instead. See [manual mounting](https://akropolys.cloud/docs/javascript/#manual-mounting). No application wrapper or React installation is needed. This configuration does not affect standalone batch ingestion.

The SDK reads the current token through the existing auth client before every action in text and voice, and adds Authorization internally. The auth client owns renewal. Tokens go directly to the site's API. Adapters default to the page's origin; for a separate API, add `origins: ["https://api.your-site.com"]` and configure browser CORS. `actionHeaders` remains available for custom auth/CSRF headers.

The API must validate the session/token and permissions. A `shopperId` or `userProof` does not authorize it. Return HTTP 401 JSON when sign-in is needed, rather than redirecting to a login screen. Shell's server tester does not share shopper cookies. After a timeout, check the actual site state before retrying a mutation. Read the [site actions guide](https://akropolys.cloud/docs/actions/) for both JavaScript and React examples and troubleshooting.
