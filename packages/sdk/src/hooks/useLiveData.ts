import { useCallback, useEffect, useRef, useState } from 'react';
import { pipeLiveData, type LiveIngestResult, type LiveSkipped, type PipeOptions } from '../liveIngest';

export interface UseLiveDataReturn {
  status: 'idle' | 'pending' | LiveIngestResult['status'];
  error?: Error;
  skipped: LiveSkipped[];
  retrying: boolean;
  retry: () => void;
}

export function useLiveData(key: string, fields: Record<string, unknown>, options: PipeOptions = {}): UseLiveDataReturn {
  const [state, setState] = useState<Omit<UseLiveDataReturn, 'retry'>>({ status: 'idle', skipped: [], retrying: false });
  const current = useRef({ key, fields, options }); current.current = { key, fields, options };
  const last = useRef('');
  const mounted = useRef(false);
  const version = useRef(0);
  const submit = useCallback(() => {
    const { key, fields, options } = current.current;
    if (!key || !fields) return;
    const id = ++version.current;
    setState({ status: 'pending', skipped: [], retrying: false });
    pipeLiveData({ key, fields }, { ...options, onResult: result => {
      if (mounted.current && version.current === id) {
        setState({ ...result, skipped: result.skipped ?? [], retrying: result.retrying ?? false });
        current.current.options.onResult?.(result);
      }
    } });
  }, []);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; version.current++; last.current = ''; }; }, []);
  useEffect(() => {
    if (!key || !fields) { if (last.current) {last.current = ''; version.current++; setState({status:'idle',skipped:[],retrying:false});} return; }
    let fingerprint: string;
    try { fingerprint = key + '|' + JSON.stringify(fields); }
    catch (error) { if (last.current !== '!invalid') {last.current='!invalid'; version.current++; setState({ status: 'error', error: error as Error, skipped: [], retrying: false });} return; }
    if (last.current === fingerprint) return;
    last.current = fingerprint; submit();
  }, [key, fields, submit]);
  return { ...state, retry: submit };
}
