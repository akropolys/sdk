# @akropolys/kiku

Chat, search, voice, and photo input for your website. Kiku connects visitors to your content and the API actions you configure in Akropolys.

[![npm](https://img.shields.io/npm/v/@akropolys/kiku?color=orange)](https://www.npmjs.com/package/@akropolys/kiku) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT) [![TypeScript](https://img.shields.io/badge/types-included-blue)](https://www.typescriptlang.org/)

## Install

```bash
npm install @akropolys/kiku@2.2.29 @akropolys/sdk@2.0.1
```

Requires React and React DOM 17 or later. For websites without React, use the [script embed](https://github.com/akropolys/sdk/blob/HEAD/packages/kiku/EMBED.md).

## JavaScript embed

Add Kiku to any website with the published CDN script:

```html
<script
  src="https://cdn.akropolys.cloud/kiku/2.2.29/kiku.js"
  data-site-id="YOUR_SITE_ID"
  data-api-token="YOUR_PUBLIC_BROWSER_TOKEN"
  data-label="Ask Kiku"
  defer
></script>
```

The script loads its styles and runtime automatically. See the [embed guide](https://github.com/akropolys/sdk/blob/HEAD/packages/kiku/EMBED.md) for configuration, ingestion, and self-hosting.

## React and Next.js

```tsx
'use client';

import { AkropolysProvider } from '@akropolys/sdk';
import { KikuButton } from '@akropolys/kiku';
import '@akropolys/kiku/styles.css';

export default function WebsiteAssistant() {
  return (
    <AkropolysProvider
      siteId={process.env.NEXT_PUBLIC_AKROPOLYS_SITE_ID!}
      apiUrl={process.env.NEXT_PUBLIC_AKROPOLYS_API_URL!}
      apiToken={process.env.NEXT_PUBLIC_AKROPOLYS_API_TOKEN!}
    >
      <KikuButton label="Ask us" enableVoice enableVision />
    </AkropolysProvider>
  );
}
```

Mount the component once in your app or layout. In Next.js App Router, import the stylesheet in your root layout if that is where your project keeps global CSS.

Use your site's public browser token. Keep private keys and server credentials on your server. Enable the corresponding voice and vision features for your site in Shell.

## What visitors can do

- Ask about your content and compare records in tables.
- Talk using live voice or include photos in a conversation.
- Open source records and save items for later.
- Long-press or right-click a message to access its actions.
- Use translated controls, right-to-left layouts, and chat themes.

## Components

| Component | Purpose |
| --- | --- |
| `KikuButton` | A launcher that opens the chat window. |
| `SearchBar` | Inline search with streamed results. |

Both components use `AkropolysProvider` from `@akropolys/sdk`.

## Customize the launcher

```tsx
<KikuButton
  label="Ask about this property"
  title="Your assistant"
  placeholder="What would you like to know?"
  chips={['Show available properties', 'Compare my options']}
  theme="dark"
  enableVoice
  enableVision
/>
```

`theme` accepts `light`, `dark`, or an `AkropolysTheme` object from `@akropolys/sdk`. Use `onSelectSource` to handle a visitor selecting a source record.

## Your content and actions

Give each catalogue record a stable top-level `id`. A webpage link in `fields.url` is optional; Kiku can show and save records without one. See the [SDK ingestion guide](https://github.com/akropolys/sdk/blob/HEAD/packages/sdk/README.md#batch-ingestion-on-your-server).

Configure action endpoints, HTTP methods, and request fields in Shell. Kiku collects the required values and presents the result returned by your backend. Your endpoint validates the request and performs the operation. See the [site actions guide](https://github.com/akropolys/sdk/blob/HEAD/packages/sdk/README.md#site-actions).

## Links

- [Akropolys](https://akropolys.cloud)
- [Source code](https://github.com/akropolys/sdk)
- [Plain HTML embed guide](https://github.com/akropolys/sdk/blob/HEAD/packages/kiku/EMBED.md)
- [Headless SDK](https://www.npmjs.com/package/@akropolys/sdk)

## License

MIT © [Akropolys](https://akropolys.cloud)
