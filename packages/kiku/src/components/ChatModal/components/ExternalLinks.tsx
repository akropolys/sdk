import React from 'react';
import { ExternalLinkGlass } from './ExternalLinkGlass';
import type { UIStringKey } from '../types';
import type { ExternalLink } from '../../../utils/externalLinks';

const ICON_ORIGINS = new Set([
  'https://youtube.com', 'https://www.youtube.com', 'https://youtu.be',
  'https://mail.google.com', 'https://gmail.com', 'https://slack.com',
  'https://mpesa.com', 'https://m-pesa.com', 'https://safaricom.co.ke',
  'https://checkout.stripe.com',
]);

// Model-provided links must not cause automatic requests to arbitrary hosts.
export function safeLogoSource(link: ExternalLink, pageOrigin?: string): string | undefined {
  if (link.logo && pageOrigin) {
    try {
      const logo = new URL(link.logo, pageOrigin);
      if (logo.protocol === 'https:' && !logo.username && !logo.password && logo.origin === pageOrigin) return logo.href;
    } catch { /* Ignore invalid logo URLs. */ }
  }
  if (link.favicon) {
    try {
      const icon = new URL(link.favicon);
      if (ICON_ORIGINS.has(icon.origin) && !icon.username && !icon.password && icon.pathname === '/favicon.ico' && !icon.search && !icon.hash) return icon.href;
    } catch { /* Ignore invalid icon URLs. */ }
  }
  return undefined;
}

function LinkLogo({ link }: { link: ExternalLink }) {
  const [failed, setFailed] = React.useState(false);
  const src = safeLogoSource(link, typeof location === 'undefined' ? undefined : location.origin);
  return <span className="hsk-cb-external-logo" aria-hidden="true">
    {src && !failed ? <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} /> : <span>{link.destination.charAt(0)}</span>}
  </span>;
}

export function ExternalLinks({ links, t, onOpen }: { links: ExternalLink[]; t: (key: UIStringKey, vars?: Record<string, string>) => string; onOpen?: (link: ExternalLink) => void }) {
  if (!links.length) return null;
  const label = (link: ExternalLink) => link.label ?? t(link.service === 'youtube' ? 'externalWatchVideo'
    : link.service === 'checkout' ? 'externalCheckout'
    : link.service === 'email' || link.service === 'gmail' ? 'externalOpenEmail'
    : 'externalOpenLink', { destination: link.destination });
  const amount = (link: ExternalLink) => {
    if (link.amount === undefined || !link.currency) return;
    try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: link.currency }).format(link.amount); } catch { return; }
  };
  return <div className="hsk-cb-external-links">
    {links.map(link => <a key={link.url} className="hsk-cb-external-card" href={link.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" onClick={() => onOpen?.(link)} onAuxClick={event => { if (event.button === 1) onOpen?.(link); }}>
      <ExternalLinkGlass />
      <span className="hsk-cb-external-brand">
        <LinkLogo link={link} />
        <span dir="auto">{link.destination}</span>
      </span>
      <span className="hsk-cb-external-identity"><strong dir="auto">{label(link)}</strong></span>
      {amount(link) && <span className="hsk-cb-external-amount">{amount(link)}</span>}
    </a>)}
    <div className="hsk-cb-external-notice" role="note">
      <svg viewBox="0 0 44 48" fill="none" aria-hidden="true"><path pathLength="1" d="M36 43C14 46 8 27 20 23C32 18 36 31 24 31C11 31 9 15 18 6M10 10L18 5L23 14" /></svg>
      <span>{t('externalOpensOutside')}</span>
    </div>
  </div>;
}
