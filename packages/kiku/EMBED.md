# JavaScript embed

Add Kiku to any website with the published CDN script before your closing
`</body>` tag. The same embed works with JavaScript frameworks, plain HTML, and
HTMX. On each page the loader draws only a small Kiku button (about 2 KB
gzipped, no API calls or cookies). It fetches the widget and its stylesheet when a
shopper points at, focuses or touches the button, and mounts it on click. Add
`data-eager="true"` to load the widget straight away instead.

Put `<kiku-button></kiku-button>` wherever kiku should appear: a header, a
product page, a sidebar. Use it as many times as you like; each opens the same
kiku, and `label="Ask about this sofa"` sets its text. Tags your framework adds
later work too. A page with no tag shows kiku in the bottom-right corner.
`data-container="#selector"` and `Kiku.mount({ container })` also place it.

```html
<kiku-button></kiku-button>

<script src="https://cdn.akropolys.cloud/kiku/2.3.6/kiku.js" data-key="YOUR_KEY"
  data-voice="true" data-vision="true" defer></script>
```

`data-key` is your public key from Shell. It is safe in your pages.

## Your brand's name and icon

The chat shows a name in a small pill at the top. Set it to your shop's name with
`data-title`. Add `data-brand-icon` with an image URL to put your icon before the
name, at about 14px tall. To show a wordmark instead of the name, use `data-logo`;
when a logo is set, the icon is not shown.

```html
<script src="https://cdn.akropolys.cloud/kiku/2.3.6/kiku.js" data-key="YOUR_KEY"
  data-title="Harbour Home" data-brand-icon="https://example.com/icon.svg" defer></script>
```

In JavaScript, pass the same values as `button: { title, logo, brandIcon }`.

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
  button: { label: 'Ask us', enableVoice: true, enableVision: true },
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

**Protect your catalogue: turn on "Require signed ingestion" in Shell once your server sends your products.** Unsigned ingestion is authorised by the public key, which anyone can copy from your page, so anyone could also send records to your catalogue (a changed price, or text kiku would then repeat). It stays optional only so a site can start from the browser alone. Once your server signs its records with your private key (kept on the server, never in the page), requiring signatures means only your server can change your catalogue.

For a useful minimal record, send `{ id: 'chair-123', title: 'Linen lounge chair' }`.
Add facts in `fields`. Use `image` for a cover and `images` for an ordered gallery
of URLs or `{ url, alt?, caption? }` objects. Each record owns its own photos.
Prefer absolute HTTPS image URLs; without a record webpage, use absolute URLs.
The first gallery image is the cover unless `image` overrides it. Re-ingest the
same ID to update the record or use `images: []` to clear its gallery.

Reuse loaded data instead of fetching it again just for ingestion. Await
`Kiku.ready` after automatic setup and catch errors from `Kiku.ingest`. Reading
`Kiku.ready` or calling any `Kiku` method loads the widget, so leave them out of
pages that do not need them. An await
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
issued by your server. On logout pass `{}`. Identity set before the widget has loaded is
kept and applied when it opens, so it does not load the widget early. `Kiku.destroy()` removes the widget
and cleans up its client; call `mount()` again to restart. Automatic mounting
exposes `Kiku.ready`. Repeated script tags or mount calls reuse the same widget.

For a restrictive CSP, permit the script origin, existing API/voice endpoints,
and the styles/fonts already needed by Kiku. Voice still requires HTTPS and
microphone permission. Kiku loads its audio processor as a version-matched JavaScript file; allow its origin in `script-src` when using a restrictive CSP.

## CDN files and self-hosting

- [Loader](https://cdn.akropolys.cloud/kiku/2.3.6/kiku.js)
- [Stylesheet](https://cdn.akropolys.cloud/kiku/2.3.6/styles.css)
- [Embed module](https://cdn.akropolys.cloud/kiku/2.3.6/embed/embed.js)
- [Voice audio processor](https://cdn.akropolys.cloud/kiku/2.3.6/voice-worklet.js)

To self-host this release, copy `dist/kiku.js`, `dist/styles.css`,
`dist/voice-worklet.js`, and the entire `dist/embed` directory to your server. Preserve
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

For a self-hosted React package, copy `dist/voice-worklet.js` to your site and set `voiceWorkletUrl` on `KikuButton` to its URL. Without an override, React uses the version-matched CDN file.
