# Plain HTML embed

Add the published CDN script before your closing `</body>` tag. The loader fetches
its stylesheet and embed module automatically.

```html
<script src="https://cdn.akropolys.cloud/kiku/2.2.29/kiku.js" data-site-id="YOUR_SITE_ID"
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
website's schema. Every catalogue record requires its source record's stable top-level `id`. `fields.url` is optional but recommended when a webpage is available; Kiku can show and save records without one. A supplied URL is kept in saved history. URLs, names and signatures do not replace IDs. Existing server records must also include an ID.

After login, call `Kiku.updateIdentity({ shopperId, userProof })` with a proof
issued by your server. On logout pass `{}`. `Kiku.destroy()` removes the widget
and cleans up its client; call `mount()` again to restart. Automatic mounting
exposes `Kiku.ready`. Repeated script tags or mount calls reuse the same widget.

For a restrictive CSP, permit the script origin, existing API/voice endpoints,
and the styles/fonts already needed by Kiku. Voice still requires HTTPS and
microphone permission.

## CDN files and self-hosting

- [Loader](https://cdn.akropolys.cloud/kiku/2.2.29/kiku.js)
- [Stylesheet](https://cdn.akropolys.cloud/kiku/2.2.29/styles.css)
- [Embed module](https://cdn.akropolys.cloud/kiku/2.2.29/embed/embed.js)

To self-host, install `@akropolys/kiku@2.2.29` and copy `dist/kiku.js`,
`dist/styles.css`, and the entire `dist/embed` directory to your server. Preserve
their relative paths and use your hosted loader URL in the script tag. Serve
JavaScript with the correct MIME type and allow CORS across origins.

When building from this repository, run `pnpm --filter @akropolys/kiku build`
to generate those files.
