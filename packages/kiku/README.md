# @akropolys/kiku

Chat, search, voice, and photo input for your website. Kiku connects visitors to your content and the API actions you configure in Akropolys. For React and Next.js, use the React package below. For other websites, use the CDN embed; it also works in React when you prefer a script integration.

[![npm](https://img.shields.io/npm/v/@akropolys/kiku?color=orange)](https://www.npmjs.com/package/@akropolys/kiku) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT) [![TypeScript](https://img.shields.io/badge/types-included-blue)](https://www.typescriptlang.org/)

## JavaScript embed

Add Kiku to any website with the published CDN script:

```html
<script
  src="https://cdn.akropolys.cloud/kiku/2.2.30/kiku.js"
  data-site-id="YOUR_SITE_ID"
  data-api-token="YOUR_PUBLIC_BROWSER_TOKEN"
  data-label="Ask Kiku"
  defer
></script>
```

The embed includes its own React runtime, styles, and mounting. Your website needs no React installation or provider, including when it uses React or Next.js. See the [embed guide](https://github.com/akropolys/sdk/blob/HEAD/packages/kiku/EMBED.md) for configuration, ingestion, and self-hosting.

## Install

Recommended for React and Next.js apps:

```bash
npm install @akropolys/kiku@2.2.30 @akropolys/sdk@2.0.3
```

This package integration requires React and React DOM 17 or later.

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

Give each catalogue record a stable top-level `id`. A webpage link in `fields.url` is optional; Kiku can show and save records without one. See the [SDK ingestion guide](https://github.com/akropolys/sdk/blob/HEAD/packages/sdk/README.md#batch-ingestion-client).

Configure action endpoints, methods and request fields in Shell. The widget calls your API from the visitor's browser in chat and voice. Cookie authentication works automatically. For Clerk, Auth0 or Supabase bearer APIs, add one option such as `actionAuth: { provider: "supabase", client: supabase }` to `Kiku.mount(...)`, or use the `actionAuth` prop on your existing React provider. The existing auth client handles token renewal; Kiku adds the header internally. The CDN embed needs no application wrapper. Your API validates permissions and performs the operation. See the [site actions guide](https://akropolys.cloud/docs/actions/).

## Links

- [Akropolys](https://akropolys.cloud)
- [Source code](https://github.com/akropolys/sdk)
- [JavaScript embed guide](https://github.com/akropolys/sdk/blob/HEAD/packages/kiku/EMBED.md)
- [Headless SDK](https://www.npmjs.com/package/@akropolys/sdk)

## License

MIT © [Akropolys](https://akropolys.cloud)
