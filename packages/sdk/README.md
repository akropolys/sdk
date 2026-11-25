# @akropolys/sdk

Connects your site to Akropolys and kiku: send your products, search them, and chat about them.

```bash
npm install @akropolys/sdk
```

## Send your products (on your server)

```js
import { createIngestClient, signed } from '@akropolys/sdk/server';

const kiku = createIngestClient({
  apiToken: process.env.AKROPOLYS_API_TOKEN,    // your public key
  privateKey: process.env.AKROPOLYS_PRIVATE_KEY, // keep this secret
});

await kiku.ingestBatch(products.map(p => ({
  id: p.id, title: p.name, image: p.image, fields: { price: p.price, url: p.url },
})), signed);
```

## In React

```jsx
import { AkropolysProvider, useKiku } from '@akropolys/sdk';

<AkropolysProvider apiToken={process.env.NEXT_PUBLIC_AKROPOLYS_API_TOKEN}>
  <App />
</AkropolysProvider>
```

Get your keys in [Shell](https://shell.akropolys.cloud). Full guide: [akropolys.cloud/docs](https://akropolys.cloud/docs/).

MIT
