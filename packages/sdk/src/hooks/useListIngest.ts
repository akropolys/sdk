import { useEffect } from 'react';
import { useIngest } from './useIngest';
import { stableStringify } from '../utils/stableStringify';

export function useListIngest(items: Record<string, any>[] | null | undefined): void {
  const { ingestBatch } = useIngest();
  const listKey = items ? stableStringify(items) : '';
  useEffect(() => {
    // useIngest deduplicates accepted versions; failed submissions stay retryable.
    if (items?.length) void ingestBatch(items);
  }, [listKey, ingestBatch]);
}
