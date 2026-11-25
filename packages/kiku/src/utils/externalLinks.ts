import type { ActionLinkContext } from '@akropolys/sdk';

export interface ExternalLink extends ActionLinkContext {
  label?: string;
  destination: string;
  service?: 'youtube' | 'gmail' | 'slack' | 'mpesa' | 'checkout' | 'email' | 'phone';
  favicon?: string;
}

export function externalLink(value: string, base: string): ExternalLink | undefined {
  if (/[\u0000-\u0020\\]/.test(value)) return;
  try {
    const url = new URL(value, base);
    if (!['https:', 'http:', 'mailto:', 'tel:', 'slack:'].includes(url.protocol) || url.username || url.password) return;
    const web = url.protocol === 'https:' || url.protocol === 'http:';
    if (web && url.origin === new URL(base).origin) return;
    const host = url.hostname.toLowerCase();
    const on = (domain: string) => host === domain || host.endsWith('.' + domain);
    const service = url.protocol === 'mailto:' ? 'email' : url.protocol === 'tel:' ? 'phone'
      : url.protocol === 'slack:' || on('slack.com') ? 'slack'
      : on('youtube.com') || on('youtu.be') ? 'youtube'
      : host === 'mail.google.com' || on('gmail.com') ? 'gmail'
      : on('mpesa.com') || on('m-pesa.com') || on('safaricom.co.ke') ? 'mpesa'
      : host === 'checkout.stripe.com' ? 'checkout' : undefined;
    const names = { youtube: 'YouTube', gmail: 'Gmail', slack: 'Slack', mpesa: 'M-Pesa', checkout: 'Stripe', email: 'Email', phone: 'Phone' };
    return {
      url: value,
      destination: service ? names[service] : host.replace(/^www\./, ''),
      service,
      favicon: web ? url.origin + '/favicon.ico' : undefined,
    };
  } catch { return; }
}

function bareUrl(value: string): string {
  let url = value.replace(/[.,;!?*_~]+$/, '');
  while (url.endsWith(')') && (url.match(/\)/g)?.length ?? 0) > (url.match(/\(/g)?.length ?? 0)) url = url.slice(0, -1);
  while (url.endsWith(']') && (url.match(/\]/g)?.length ?? 0) > (url.match(/\[/g)?.length ?? 0)) url = url.slice(0, -1);
  return url;
}

export function extractExternalLinks(content: string, base: string, contexts: ActionLinkContext[] = [], streaming = false): { content: string; links: ExternalLink[] } {
  const links = new Map<string, ExternalLink>();
  const contextByUrl = new Map(contexts.map(context => [context.url, context]));
  // Keep action-provided URLs exact. If the assistant repeats only the start of
  // one, use the action's complete URL rather than creating a second card.
  const verified = contexts.filter(context => externalLink(context.url, base));
  const matchingVerified = (candidate: string): ActionLinkContext[] => {
    try {
      const shown = new URL(candidate, base);
      return verified.filter(context => {
        const actual = new URL(context.url, base);
        return actual.protocol === shown.protocol && actual.host === shown.host &&
          actual.pathname === shown.pathname && actual.href.startsWith(shown.href);
      });
    } catch { return []; }
  };
  const tokens = /```[\s\S]*?(?:```|$)|`[^`\n]*(?:`|$)|!\[[^\]\n]*\]\([^\s]*?\)|\[([^\]\n]+)\]\(((?:[^()\s]|\([^()\s]*\))*)\)|(?:https?:\/\/|mailto:|tel:|slack:\/\/)[^\s<>`]+/gi;
  const source = streaming ? content.replace(/(?:\[[^\]\n]*\]\()?(?:https?:\/\/|mailto:|tel:|slack:\/\/)[^\s<>`]*$/i, '') : content;
  let cleaned = source.replace(tokens, (token, label: string | undefined, target: string | undefined, offset: number, whole: string) => {
    if (token.startsWith('`') || token.startsWith('![')) return token;
    const shown = target ?? bareUrl(token);
    if (!externalLink(shown, base)) return token;
    const matches = matchingVerified(shown);
    // Only links from the site's own actions (set up in Shell) become cards.
    // An address kiku writes on its own stays an ordinary link in the text.
    if (!contextByUrl.has(shown) && matches.length === 0) return token;
    if (matches.length > 1 && !contextByUrl.has(shown)) return '';
    const url = contextByUrl.has(shown) ? shown : matches[0]?.url ?? shown;
    const link = externalLink(url, base)!;
    const previous = links.get(url);
    const readableLabel = label?.replace(/[*_`]/g, '').trim();
    links.set(url, { ...link, ...contextByUrl.get(url), ...(previous ?? {}),
      ...(readableLabel && !/^(?:https?:\/\/|mailto:|tel:|slack:\/\/)/i.test(readableLabel) ? { label: readableLabel } : {}) });
    const lineStart = whole.lastIndexOf('\n', offset - 1) + 1;
    const nextBreak = whole.indexOf('\n', offset + token.length);
    const lineEnd = nextBreak < 0 ? whole.length : nextBreak;
    const alone = !whole.slice(lineStart, offset).replace(/[\s>*_\-+\d.)]/g, '') &&
      !whole.slice(offset + token.length, lineEnd).replace(/[\s*_.,;:!?]/g, '');
    const trailing = target === undefined && token.startsWith(shown) ? token.slice(shown.length) : '';
    return alone ? '' : (readableLabel || link.destination) + trailing;
  });
  if (streaming) cleaned = cleaned.replace(/\[[^\]\n]*\]\((?:https?|mailto|tel|slack)[^\n]*$/i, '');
  cleaned = cleaned.replace(/^\s*(?:[-*+]\s*|\d+[.)]\s*)?(?:\*\*|__)?\s*(?:\*\*|__)?\s*$/gm, '').replace(/\n{3,}/g, '\n\n').trim();
  if (!streaming) {
    for (const context of contexts) {
      if (links.has(context.url)) continue;
      const link = externalLink(context.url, base);
      if (link) links.set(context.url, { ...link, ...context });
    }
  }
  return { content: cleaned, links: streaming ? [] : [...links.values()] };
}
