import React, { lazy, useEffect } from 'react';
import type { MarkupEditor as Editor } from './MarkupEditor';

type Props = React.ComponentProps<typeof Editor>;

let loaded: typeof Editor | undefined;
let pending: Promise<typeof Editor> | undefined;

function preload() {
  pending ??= import('./MarkupEditor').then(m => (loaded = m.MarkupEditor), e => { pending = undefined; throw e; });
  return pending;
}

export const warmMarkupEditor = () => { preload().catch(() => {}); };

function Failed({ onCancel }: Props): React.ReactElement | null {
  useEffect(() => { Lazy = load(); onCancel(); }, []);
  return null;
}

const load = () => lazy(() => preload().then(C => ({ default: C }), () => ({ default: Failed })));
let Lazy = load();

export function MarkupEditor(props: Props) {
  const C = loaded ?? Lazy;
  return <C {...props} />;
}
