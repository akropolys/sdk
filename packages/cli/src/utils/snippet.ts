import type { Framework } from './detect';

const env = (prefix: string, name: string, framework: Framework) =>
  framework.id === 'vite' || framework.id === 'astro'
    ? `import.meta.env.${prefix}${name}`
    : `process.env.${prefix}${name}!`;

export function snippetFor(framework: Framework): string {
  const p = framework.envPrefix;
  const siteId = env(p, 'AKROPOLYS_SITE_ID', framework);
  const apiUrl = env(p, 'AKROPOLYS_API_URL', framework);
  const apiKey = env(p, 'AKROPOLYS_API_KEY', framework);

  const provider = `<AkropolysProvider
  siteId={${siteId}}
  apiUrl={${apiUrl}}
  apiToken={${apiKey}}
>
  {children}
  <KikuButton label="Ask me anything" enableVoice enableVision />
</AkropolysProvider>`;

  const imports = `import { AkropolysProvider } from '@akropolys/sdk';
import { KikuButton } from '@akropolys/kiku';
import '@akropolys/kiku/styles.css';`;

  if (framework.id === 'next-app') {
    return `${imports}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        ${provider.split('\n').join('\n        ')}
      </body>
    </html>
  );
}`;
  }

  if (framework.id === 'next-pages') {
    return `${imports}

export default function App({ Component, pageProps }) {
  return (
    <AkropolysProvider
      siteId={${siteId}}
      apiUrl={${apiUrl}}
      apiToken={${apiKey}}
    >
      <Component {...pageProps} />
      <KikuButton label="Ask me anything" enableVoice enableVision />
    </AkropolysProvider>
  );
}`;
  }

  return `${imports}

// Wrap your app's root with the provider:
${provider.replace('{children}', '<App />')}`;
}
