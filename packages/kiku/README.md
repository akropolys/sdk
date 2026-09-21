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
import '@akropolys/kiku/styles.css'; // required: the chat window copies its rules from this sheet (serve it same-origin, or with crossorigin="anonymous")

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
        theme={{
          borderRadius: "24px",
        }}
      />
    </AkropolysProvider>
  );
}
```

> **Next.js Note**: If running an experimental Next.js 15/16 canary with Tailwind CSS v4 on Windows, run `next dev --webpack` if Turbopack experiences resolver latency on Windows ([tracked upstream](https://github.com/vercel/next.js/issues)).

---

## Components

| Component | Description |
|---|---|
| `<KikuButton />` | Launcher pill that opens the full-screen chat, with live voice and vision. |
| `<SearchBar />` | Inline catalogue search with streamed results. |
| `<ScoutRail />` | Dock for the shopper's scouts: send one out, check on it, buy time. |
| `<ScoutCharacter />` | A single animated scout avatar. |


---

## License

MIT © [Akropolys](https://akropolys.cloud)
