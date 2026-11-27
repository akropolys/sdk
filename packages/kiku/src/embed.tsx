import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { AkropolysClient, siteFromKey } from '@akropolys/sdk';
import { AkropolysContext } from '@akropolys/sdk';
import type { AkropolysConfig, Entity } from '@akropolys/sdk';
import { KikuButton, type KikuButtonProps } from './components/KikuButton';
import { cachedBaseFont, baseFontSettled } from './utils/chromeWarm';

export type EmbedOptions = AkropolysConfig & {
  siteId?: string;
  button?: Omit<KikuButtonProps, 'children' | 'icon' | 'label'> & { label?: string };
  /** Element or selector to place the button in; floats in the corner otherwise. */
  container?: string | HTMLElement;
};

export function resolveContainer(container: EmbedOptions['container']): HTMLElement | null {
  if (!container) return null;
  if (typeof container !== 'string') return container;
  try { return document.querySelector<HTMLElement>(container); } catch { return null; }
}

export const FLOATING_HOST = 'all:initial;position:fixed;right:20px;bottom:20px;z-index:2147483000';
export const INLINE_HOST = 'all:initial;display:inline-block;vertical-align:middle';

export function mount(options: EmbedOptions) {
  options = { ...options, siteId: options?.siteId?.trim() || siteFromKey(options?.apiToken) };
  if (!options.siteId) throw new Error('kiku needs your public key from Shell.');
  const host = document.createElement('div');
  host.id = 'kiku-embed';
  const place = resolveContainer(options.container);
  host.style.cssText = place ? INLINE_HOST : FLOATING_HOST;
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = ':host{color-scheme:light}button{font:500 14px system-ui;cursor:pointer;border:1px solid #d9c6b0;border-radius:999px;padding:14px 20px;background:#f7f1e8;color:#3b2a1d;box-shadow:0 3px 16px #0002}button:focus-visible{outline:2px solid #a9714b;outline-offset:3px}';
  shadow.append(style);
  const container = document.createElement('div');
  shadow.append(container);
  (place || document.body).append(host);
  const client = new AkropolysClient(options);
  const root = createRoot(container);
  let destroyed = false;
  const active = () => { if (destroyed) throw new Error('Kiku has been destroyed.'); };
  flushSync(() => root.render(
    <AkropolysContext.Provider value={client}>
      <KikuButton label="Ask Kiku" {...options.button} />
    </AkropolysContext.Provider>
  ));
  return {
    open() {
      active();
      // The first open waits briefly for kiku's font, so text never swaps face on screen.
      void baseFontSettled(client, 800).then(() => { if (!destroyed) container.querySelector<HTMLButtonElement>('button')?.click(); });
    },
    ingest(entities: Entity | Entity[]) {
      active();
      return Array.isArray(entities) ? client.api.ingestBatch(entities) : client.api.ingest(entities);
    },
    updateIdentity(identity: Pick<AkropolysConfig, 'shopperId' | 'userProof' | 'authLoading'>) {
      active();
      client.setShopperId(identity.shopperId);
      client.setUserProof(identity.userProof);
      client.setAuthLoading(!!identity.authLoading);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      root.unmount();
      client.destroy();
      host.remove();
    },
  };
}
