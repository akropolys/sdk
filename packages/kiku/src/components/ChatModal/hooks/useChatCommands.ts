import { useCallback } from 'react';
import type { ChatSource, ChatAttachment, CaptureTarget } from '@akropolys/sdk';
import type { UIStringKey } from '../types';

export interface UseChatCommandsOptions {
  attachments: ChatAttachment[];
  setAttachments: React.Dispatch<React.SetStateAction<ChatAttachment[]>>;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  send: (
    prompt: string,
    displayContent?: string,
    attachments?: ChatAttachment[],
    forcedIntent?: string,
    captureTargets?: CaptureTarget[]
  ) => Promise<any>;
  defaultCurrency: string;
  t: (key: UIStringKey, vars?: Record<string, string>) => string;
}

export function useChatCommands({
  attachments,
  setAttachments,
  setInput,
  send,
  defaultCurrency,
  t,
}: UseChatCommandsOptions) {
  const handleKikuCapture = useCallback((product: ChatSource) => {
    const name = product.name || '';
    const display = `@kiku ${t('displayCapture', { name }).trim()}`;
    const q = name || 'capture current page';
    setInput('');
    const toSend = attachments;
    setAttachments([]);
    send(q, display, toSend.length > 0 ? toSend : undefined, 'capture');
  }, [attachments, send, setAttachments, setInput, t]);

  const handleKikuCaptureAll = useCallback((products: ChatSource[]) => {
    const targets: CaptureTarget[] = products
      .filter(p => p.id)
      .map(p => ({
        name: p.name || '',
        url: (p as any).url || '',
        image: p.image || '',
        price: p.price ? String(p.price) : '',
        currency: p.currency || defaultCurrency,
      }));
    const names = products.map(p => p.name).filter(Boolean).join(', ');
    const display = `@kiku ${t('displayCaptureAll', { count: String(products.length) })}`;
    setInput('');
    setAttachments([]);
    send(names || 'capture all', display, undefined, 'capture_all', targets);
  }, [defaultCurrency, send, setAttachments, setInput, t]);

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
