import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { AkropolysClient } from '@akropolys/sdk';
import { AkropolysContext } from '@akropolys/sdk';
import type { AkropolysConfig, Entity } from '@akropolys/sdk';
import { KikuButton, type KikuButtonProps } from './components/KikuButton';

export type EmbedOptions = AkropolysConfig & {
  siteId: string;
  button?: Omit<KikuButtonProps, 'children' | 'icon' | 'label'> & { label?: string };
};

export function mount(options: EmbedOptions) {
  if (!options?.siteId?.trim()) throw new Error('Kiku requires a siteId.');
  const host = document.createElement('div');
  host.id = 'kiku-embed';
  host.style.cssText = 'all:initial;position:fixed;right:20px;bottom:20px;z-index:2147483000';
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = ':host{color-scheme:light}button{font:500 14px system-ui;cursor:pointer;border:1px solid #d9c6b0;border-radius:999px;padding:14px 20px;background:#f7f1e8;color:#3b2a1d;box-shadow:0 3px 16px #0002}button:focus-visible{outline:2px solid #a9714b;outline-offset:3px}';
  shadow.append(style);
  const container = document.createElement('div');
  shadow.append(container);
  document.body.append(host);
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
    open() { active(); container.querySelector<HTMLButtonElement>('button')?.click(); },
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
