# @akropolys/kiku

Chat, voice, photos and room previews for your website, answered from your own products.

## Any website

```html
<kiku-button></kiku-button>

<script src="https://cdn.akropolys.cloud/kiku/2.3.1/kiku.js"
        data-key="YOUR_PUBLIC_KEY" data-voice="true" data-vision="true" defer></script>
```

## React and Next.js

```bash
npm install @akropolys/kiku @akropolys/sdk
```

```jsx
import { AkropolysProvider } from '@akropolys/sdk';
import { KikuButton } from '@akropolys/kiku';
import '@akropolys/kiku/styles.css';

<AkropolysProvider apiToken={process.env.NEXT_PUBLIC_AKROPOLYS_API_TOKEN}>
  <KikuButton />
</AkropolysProvider>
```

Use your site's public key in the page. Keep private keys and server credentials on your server: never put them in browser code or in a committed `.env` file.

## What kiku sends and stores

kiku contains no analytics, advertising or tracking code, and loads nothing from third parties. It talks only to Akropolys (`api.akropolys.cloud`, `voice.akropolys.cloud`, `cdn.akropolys.cloud`) and, for actions you set up, to your own site.

**Stored in the visitor's browser**
- A session id for the open tab (`sessionStorage`, gone when the tab closes).
- A device id (`localStorage`), created the first time the visitor chats — not for just visiting the page.
- A kiku identity (a key in `localStorage` and a one-year `akropolys_kiku_pub` cookie), created only when the visitor uses kiku features that remember them, such as returning to a conversation with your team.
- A conversation with your team they can return to (its id and access token), and the name and language they gave.
- Cached interface text and, when your site sends product records from the page, a copy of those records.

**Sent with each message**
- What the visitor types, says (voice) or photographs, when they use those features, and the earlier turns of the chat.
- The page's address (without its `#` part or ad-tracking parameters such as `utm_*`), the page title, and the product record and live values your site provides for the page.
- The session, device and kiku identity ids, and the visitor's name and language if they gave them.
- For actions you configure: up to 8 KB of your site's reply to the action, so kiku can answer from it.

Messages are answered by the AI model your site uses (Akropolys's, or your own if you connect one). With the script tag, nothing loads until the visitor opens kiku, unless you add `data-eager`.

Get your key in [Shell](https://shell.akropolys.cloud). Full guide: [akropolys.cloud/docs](https://akropolys.cloud/docs/javascript/).

MIT
