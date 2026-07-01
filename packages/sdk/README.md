# @akropolys/sdk

[![npm](https://img.shields.io/npm/v/@akropolys/sdk?color=orange)](https://www.npmjs.com/package/@akropolys/sdk) [![License](https://img.shields.io/npm/l/@akropolys/sdk)](https://github.com/akropolys/sdk/blob/main/LICENSE) [![TypeScript](https://img.shields.io/badge/types-included-blue)](https://www.typescriptlang.org/)

**[Docs](https://akropolys.io/docs)** &nbsp;•&nbsp; **[GitHub](https://github.com/akropolys/sdk)**

---

## Search bar just got smarter — for any website.

Drop this on a product page and people can search your catalog by typing what they actually want — "family SUV under £28k, not diesel" — instead of clicking through filters. AI agents can search it the same way. There's no search index to build and no product feed to upload: the SDK watches pages as people browse and builds the index itself.

Seven lines of code:

```tsx
import { usePageIngest, useKiku } from '@akropolys/sdk';

// Index this page as the visitor lands on it
usePageIngest({
  id:     product.id,
  title:  product.title,
  url:    window.location.href,
  fields: { price: product.price, category: product.category },
});

// Search the catalog in plain language
const { send, messages } = useKiku();
send('family SUV under £28k, not diesel');
```

## What you get

Every page visited gets indexed automatically, so there's no batch job or sync pipeline to maintain. Search understands plain language rather than matching exact keywords, so "cheap running shoes for flat feet" actually returns something useful. AI agents like Claude can query the same catalog through MCP, using the same interface a shopper would. There's a built-in LLM to get started with, or bring your own provider. Everything is typed, and it works with React hooks or plain JS if you're not on React.

## Install

```bash
npm install @akropolys/sdk
```

`react` and `react-dom` are optional peer dependencies — only needed if you use the hooks.

## Setup

```tsx
import { AkropolysProvider } from '@akropolys/sdk';

export default function App({ children }) {
  return (
    <AkropolysProvider
      siteId={process.env.NEXT_PUBLIC_AKROPOLYS_SITE_ID}
      apiToken={process.env.NEXT_PUBLIC_AKROPOLYS_API_TOKEN}
    >
      {children}
    </AkropolysProvider>
  );
}
```

That's the whole setup — no API URL to look up, it points at the managed backend by default.

[Read the full docs →](https://akropolys.io/docs)

---

## License

MIT © Akropolys
