import { resolveDisplayFields, type CardDetail } from '@akropolys/sdk';

// A card's details are the site's chosen cardFields; voice sources arrive with raw fields and are resolved here.
export function detailsOf(src: { details?: CardDetail[]; fields?: Record<string, any> }, cardFields: string[]): CardDetail[] {
  return src.details ?? (src.fields ? resolveDisplayFields(src.fields, cardFields).details : []);
}

export function detailsText(details: CardDetail[]): string {
  return details.length ? ` (${details.map(d => `${d.label}: ${d.value}`).join(', ')})` : '';
}
