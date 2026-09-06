import { useCallback, useEffect, useRef, useState } from 'react';

export function useDelayedClose(ms: number, onClosed: () => void) {
  const [closing, setClosing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closedRef = useRef(onClosed);
  closedRef.current = onClosed;

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const requestClose = useCallback(() => {
    if (timer.current) return;
    setClosing(true);
    timer.current = setTimeout(() => {
      timer.current = null;
      setClosing(false);
      closedRef.current();
    }, ms);
  }, [ms]);

  /** Skips the exit entirely - for a handover, where the delay is the bug. */
  const closeNow = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    setClosing(false);
    closedRef.current();
  }, []);

  return { closing, requestClose, closeNow };
}
