# @akropolys/kiku

> Plug-and-play React AI chat, search, and commerce UI components.

Kiku is the ready-made UI layer for Akropolys. Drop in a floating chat button, a search bar with AI-powered results, a product comparison matrix, or a full checkout modal — all styled, animated, and wired to the Akropolys backend out of the box.

If you want full control over the UI, use [`@akropolys/sdk`](https://www.npmjs.com/package/@akropolys/sdk) directly.

---

## Install

```bash
npm install @akropolys/kiku @akropolys/sdk
# or
pnpm add @akropolys/kiku @akropolys/sdk
```

**Import the stylesheet once in your app entry point:**

```ts
import '@akropolys/kiku/styles.css';
```

---

## Quick start

```tsx
import { AkropolysProvider } from '@akropolys/sdk';
import { KikuButton } from '@akropolys/kiku';
import '@akropolys/kiku/styles.css';

export default function App() {
  return (
    <AkropolysProvider
      siteId="your-site-id"
      apiUrl="https://api.akropolys.io"
      apiToken="your-api-token"
    >
      {/* Floating chat button — renders the full AI shopping assistant */}
      <KikuButton label="Chat with Kiku" />
    </AkropolysProvider>
  );
}
```

---

## Components

### `<KikuButton />` — Floating AI chat assistant

```tsx
import { KikuButton } from '@akropolys/kiku';

<KikuButton
  label="Ask Kiku"
  title="Shopping Assistant"
  placeholder="What are you looking for?"
  theme="dark"              // 'light' | 'dark' | AkropolysTheme
  chips={['Best phones', 'Laptops under KSh 50K']}
  onSelectSource={(src) => console.log(src)}
/>
```

---

### `<KikuChat />` — Inline embedded chat widget

```tsx
import { KikuChat } from '@akropolys/kiku';

<KikuChat
  title="AI Shopping Assistant"
  placeholder="Ask about anything in our store…"
  defaultCurrency="KES"
/>
```

---

### `<SearchBar />` — Debounced AI search with dropdown

```tsx
import { SearchBar } from '@akropolys/kiku';

<SearchBar
  placeholder="Search products…"
  limit={8}
  debounceMs={300}
  onSelect={(result) => {
    window.location.href = result.product.url;
  }}
/>
```

---

### `<Sparkle />` — Per-product AI assistant button

```tsx
import { Sparkle } from '@akropolys/kiku';

// Place next to any product on a listing or detail page
<Sparkle productName="Samsung Galaxy S24" />
```

---

### `<ComparisonMatrix />` — Side-by-side product comparison table

```tsx
import { ComparisonMatrix } from '@akropolys/kiku';

// sources come from useKiku() or useSearch()
<ComparisonMatrix sources={sources} defaultCurrency="KES" />
```

---

### `<CartBadge />` — Cart item count badge

```tsx
import { CartBadge } from '@akropolys/kiku';

<CartBadge className="my-badge" />
```

---

### `<CartDrawer />` — Slide-out cart drawer

```tsx
import { CartDrawer } from '@akropolys/kiku';

<CartDrawer trigger={<button>🛒 Cart</button>} theme="dark" />
```

---

### `<CheckoutModal />` — Full checkout modal (M-Pesa + extensible)

```tsx
import { CheckoutModal } from '@akropolys/kiku';

<CheckoutModal onClose={() => setOpen(false)} theme="dark" />
```

---

## Theming

All components accept a `theme` prop. Pass `'light'` | `'dark'` for the built-in modes, or pass an `AkropolysTheme` object for full control:

```tsx
<KikuButton
  theme={{
    primaryColor: '#6d28d9',
    backgroundColor: '#0f0f0f',
    textColor: '#f5f5f5',
    fontFamily: 'Inter, sans-serif',
    borderRadius: '12px',
  }}
/>
```

Alternatively, override CSS variables globally in your stylesheet:

```css
:root {
  --hsk-primary: #6d28d9;
  --hsk-bg: #0f0f0f;
  --hsk-text: #f5f5f5;
  --hsk-font: 'Inter', sans-serif;
  --hsk-border-radius: 12px;
}
```

---

## Using the headless SDK instead

If you want to build your own UI from scratch, install only the core:

```bash
npm install @akropolys/sdk
```

```tsx
import { useKiku } from '@akropolys/sdk';

const { send, messages, loading, streaming } = useKiku({
  onToken: (token) => appendToMyUI(token),
  onMeta: (meta) => showProducts(meta.sources),
  onDone: (full) => saveToDatabase(full),
});
```

---

## License

MIT © Akropolys
