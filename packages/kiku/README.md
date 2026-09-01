# @akropolys/kiku

Pre-built, blindly agnostic multi-modal conversational AI widget with duplex Live Voice, Computer Vision, and real-time comparative tables for any website or transactional platform.

[![npm](https://img.shields.io/npm/v/@akropolys/kiku?color=orange)](https://www.npmjs.com/package/@akropolys/kiku) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT) [![TypeScript](https://img.shields.io/badge/types-included-blue)](https://www.typescriptlang.org/)

---

## Install

```bash
npm install @akropolys/kiku @akropolys/sdk
# or
pnpm add @akropolys/kiku @akropolys/sdk
```

---

## Usage (React / Next.js)

```tsx
import { AkropolysProvider } from '@akropolys/sdk';
import { KikuButton } from '@akropolys/kiku';
import '@akropolys/kiku/styles.css';

export default function App() {
  return (
    <AkropolysProvider
      siteId={process.env.NEXT_PUBLIC_AKROPOLYS_SITE_ID!}
      apiUrl={process.env.NEXT_PUBLIC_AKROPOLYS_API_URL!}
      apiToken={process.env.NEXT_PUBLIC_AKROPOLYS_API_KEY!}
    >
      <KikuButton
        label="Ask me anything"
        enableVoice={true}
        enableVision={true}
        enableAudioResponse={true}
        theme={{
          borderRadius: "24px",
        }}
      />
    </AkropolysProvider>
  );
}
```

---

## Components

| Component | Description |
|---|---|
| `<KikuButton />` | Floating trigger button and full-screen modal with multi-modal voice & vision. |
| `<KikuChat />` | Embedded inline conversational chat container. |
| `<VoiceOverlay />` | Duplex live spoken voice assistant with Apple Siri chromatic animation and real-time audio visualization. |
| `<LiveTable />` | High-precision comparative financial and sports odds table. |

---

## Standalone Script Tag / Shopify Embed

```html
<script>
  window.AkropolysConfig = {
    siteId: "YOUR_SITE_ID",
    apiToken: "YOUR_PUBLIC_KEY",
    buttonLabel: "Ask Kiku",
    theme: "dark",
    enableVoice: true,
    enableVision: true,
  };
</script>
<script src="https://cdn.akropolys.cloud/kiku.iife.js" async></script>
```

---

## License

MIT © [Akropolys](https://akropolys.cloud)
