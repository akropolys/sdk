# @akropolys/kiku

[![npm](https://img.shields.io/npm/v/@akropolys/kiku?color=orange)](https://www.npmjs.com/package/@akropolys/kiku) [![License](https://img.shields.io/npm/l/@akropolys/kiku)](https://github.com/akropolys/sdk/blob/main/LICENSE) [![TypeScript](https://img.shields.io/badge/types-included-blue)](https://www.typescriptlang.org/)

**[Docs](https://akropolys.io/docs)** &nbsp;•&nbsp; **[GitHub](https://github.com/akropolys/sdk)**

---

## The pre-built UI for a smarter search bar.

`@akropolys/kiku` is the ready-made front end for [`@akropolys/sdk`](https://www.npmjs.com/package/@akropolys/sdk) — a chat button, a search bar, a per-product "ask about this" prompt — so you don't have to design a search experience from scratch. Drop one in and it's already wired up to plain-language search.

Want to build your own UI instead? Use `@akropolys/sdk` directly and skip this package.

```tsx
import { AkropolysProvider } from '@akropolys/sdk';
import { KikuButton } from '@akropolys/kiku';
import '@akropolys/kiku/styles.css';

export default function App() {
  return (
    <AkropolysProvider
      siteId={process.env.NEXT_PUBLIC_AKROPOLYS_SITE_ID}
      apiToken={process.env.NEXT_PUBLIC_AKROPOLYS_API_TOKEN}
    >
      <KikuButton />
    </AkropolysProvider>
  );
}
```

## Components

| Component | What it does |
|---|---|
| `<KikuButton />` | Floating chat assistant |
| `<KikuChat />` | Chat widget embedded inline on the page |
| `<SearchBar />` | Search box with a live results dropdown |
| `<Sparkle />` | Small "ask about this" button next to a product |
| `<ComparisonMatrix />` | Side-by-side product comparison |
| `<VoiceButton />` | Speak a query instead of typing it |
| `<VisualSearch />` | Search by uploading a photo |

## Install

```bash
npm install @akropolys/kiku @akropolys/sdk
```

```ts
import '@akropolys/kiku/styles.css';
```

[Read the full docs →](https://akropolys.io/docs)

---

## License

MIT © Akropolys
