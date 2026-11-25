import type { BrowserActionResult } from './browserActions';

export interface ActionLinkContext {
  url: string;
  returnToken?: string;
  title?: string;
  logo?: string;
  amount?: number;
  currency?: string;
}

const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

export function actionLinkContexts(result: BrowserActionResult): ActionLinkContext[] {
  if (result.status !== 'sent' || !result.httpStatus || result.httpStatus < 200 || result.httpStatus >= 300) return [];
  const links = new Map<string, ActionLinkContext>();
  const visit = (value: unknown, depth: number) => {
    if (depth > 6) return;
    if (Array.isArray(value)) { value.forEach(item => visit(item, depth + 1)); return; }
    if (!object(value)) return;
    const merchant = object(value.merchant) ? value.merchant : undefined;
    const currency = text(value.currency)?.toUpperCase();
    const amount = typeof value.total_cents === 'number' ? value.total_cents / 100
      : typeof value.amount === 'number' ? value.amount
      : typeof value.total === 'number' ? value.total : undefined;
    for (const [key, item] of Object.entries(value)) {
      if (typeof item === 'string' && /(?:url|uri|link)$/i.test(key) && !/(?:image|photo|logo|avatar|icon)/i.test(key)) {
        const url = item.trim();
        if (!/^(?:https?:\/\/|mailto:|tel:|slack:\/\/)/i.test(url)) continue;
        const context: ActionLinkContext = { url };
        const title = text(merchant?.name) ?? text(value.merchant_name) ?? text(value.title);
        const logo = text(merchant?.logo_url) ?? text(value.logo_url);
        if (title) context.title = title;
        if (logo) context.logo = logo;
        if (amount !== undefined && Number.isFinite(amount) && /^[A-Z]{3}$/.test(currency ?? '')) {
          context.amount = amount;
          context.currency = currency;
        }
        if (!links.has(url)) links.set(url, context);
      } else if (typeof item === 'object') visit(item, depth + 1);
    }
  };
  visit(result.response, 0);
  return [...links.values()];
}
