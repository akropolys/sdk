import { useCallback } from 'react';
import type { ChatSource, ChatAttachment, CaptureTarget } from '@akropolys/sdk';
import type { UIStringKey, ComposerAttachment } from '../types';

export interface UseChatCommandsOptions {
  attachments: ComposerAttachment[];
  setAttachments: React.Dispatch<React.SetStateAction<ComposerAttachment[]>>;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  send: (
    prompt: string,
    displayContent?: string,
    attachments?: ChatAttachment[],
    forcedIntent?: string,
    captureTargets?: CaptureTarget[]
  ) => Promise<any>;
  t: (key: UIStringKey, vars?: Record<string, string>) => string;
}

export function useChatCommands({
  attachments,
  setAttachments,
  setInput,
  send,
  t,
}: UseChatCommandsOptions) {
  const handleKikuCapture = useCallback((product: ChatSource) => {
    if (typeof product.id !== 'string' || !product.id.trim()) return;
    const name = product.name || '';
    const display = `@kiku ${t('displayCapture', { name }).trim()}`;
    const q = name || 'capture current page';
    setInput('');
    const toSend = attachments;
    setAttachments([]);
    const target: CaptureTarget = { id: product.id, name, url: product.url || product.fields?.url, image: product.image, fields: product.fields };
    send(q, display, toSend.length > 0 ? toSend : undefined, 'capture', [target]);
  }, [attachments, send, setAttachments, setInput, t]);

  const handleKikuCaptureAll = useCallback((products: ChatSource[]) => {
    const targets: CaptureTarget[] = products
      .filter((p): p is ChatSource & { id: string } => typeof p.id === 'string' && p.id.trim().length > 0)
      .map(p => ({
        id: p.id,
        name: p.name || '',
        url: p.url || p.fields?.url,
        fields: p.fields,
        image: p.image || '',
      }));
    if (targets.length === 0) return;
    const names = targets.map(p => p.name).filter(Boolean).join(', ');
    const display = `@kiku ${t('displayCaptureAll', { count: String(targets.length) })}`;
    setInput('');
    setAttachments([]);
    send(names || 'capture all', display, undefined, 'capture_all', targets);
  }, [send, setAttachments, setInput, t]);

  const handleKikuViewHistory = useCallback(() => {
    const display = `@kiku ${t('displayViewHistory')}`;
    setInput('');
    setAttachments([]);
    send('show my saved items', display, undefined, 'view_history');
  }, [send, setAttachments, setInput, t]);

  const handleKikuDelete = useCallback(() => {
    const display = `@kiku ${t('displayDelete')}`;
    setInput('');
    setAttachments([]);
    send('delete this', display, undefined, 'delete');
  }, [send, setAttachments, setInput, t]);

  return {
    handleKikuCapture,
    handleKikuCaptureAll,
    handleKikuViewHistory,
    handleKikuDelete,
  };
}
