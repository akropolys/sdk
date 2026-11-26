import { armActionReturn, markReturn, memoryChoice } from '@akropolys/sdk';

// A link opened from the chat: watch for the return in this tab, and in a
// remembered chat let whichever tab loads next pick it up.
export function noteLeaving(client: any, token?: string): void {
  const site = client?.api?.siteId;
  if (!site) return;
  armActionReturn(site, token);
  if (client.getKikuKey?.() && memoryChoice(site) === 'on') markReturn(site, token);
}
