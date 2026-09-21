import { useState, useCallback, useEffect, useRef } from 'react';
import { Scout, ScoutStatus, CreateScoutInput } from '../types';
import { useAkropolysContext } from '../Provider';

export interface UseScoutsOptions {
  status?: string;
  autoRefresh?: boolean;
  refreshIntervalMs?: number;
}

export interface UseScoutsReturn {
  // False on a site that has not turned scouts on: no dock, no rail, nothing.
  enabled: boolean;
  justTriggered: Scout[];
  scouts: Scout[];
  activeScouts: Scout[];
  // Minutes shared by every active scout. Two scouts burn it twice as fast.
  balance: number;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  dispatchScout: (id: string) => Promise<any>;
  createScout: (input: CreateScoutInput) => Promise<Scout>;
  pauseScout: (id: string) => Promise<void>;
  resumeScout: (id: string) => Promise<void>;
  cancelScout: (id: string) => Promise<void>;
  addScoutMinutes: (id: string, minutes: number) => Promise<void>;
  setAvatar: (id: string, avatar: string) => Promise<void>;
}

export function useScouts(options: UseScoutsOptions = {}): UseScoutsReturn {
  const client = useAkropolysContext();
  const [scouts, setScouts] = useState<Scout[]>([]);
  const [balance, setBalance] = useState(0);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justTriggered, setJustTriggered] = useState<Scout[]>([]);
  const seenTriggered = useRef<Set<string> | null>(null);

  const { status, autoRefresh = true, refreshIntervalMs = 15000 } = options;

  const fetchScouts = useCallback(async () => {
    if (!client) return;
    try {
      setLoading(true);
      setError(null);
      const res = await client.scouts.list({ status });
      const fresh = res.scouts || [];
      // The first look only learns what already happened; anything after it is
      // news, and news is what the shopper is waiting to hear.
      const triggered = fresh.filter(s => s.status === 'triggered');
      if (seenTriggered.current === null) {
        seenTriggered.current = new Set(triggered.map(s => s.id));
      } else {
        const news = triggered.filter(s => !seenTriggered.current!.has(s.id));
        news.forEach(s => seenTriggered.current!.add(s.id));
        if (news.length > 0) setJustTriggered(news);
      }
      setScouts(fresh);
      setBalance(res.balance ?? 0);
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch scouts');
    } finally {
      setLoading(false);
    }
  }, [client, status]);

  useEffect(() => {
    if (!client) return;
    let live = true;
    client.api.widgetSettings().then((w) => { if (live) setEnabled(w.scouts.enabled); });
    return () => { live = false; };
  }, [client]);

  useEffect(() => {
    if (enabled) fetchScouts();
  }, [enabled, fetchScouts]);

  // Refresh for as long as the hook is mounted. Polling only while a scout was
  // active meant that the moment the last one fired, nothing looked again — so
  // the trigger that had just happened was never seen.
  useEffect(() => {
    if (!autoRefresh || !enabled) return;
    const timer = setInterval(() => {
      fetchScouts().catch(() => {});
    }, refreshIntervalMs);
    return () => clearInterval(timer);
  }, [autoRefresh, enabled, refreshIntervalMs, fetchScouts]);

  // Window events listener for real-time synchronization
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleAction = (e: Event) => {
      const customEvent = e as CustomEvent;
      const detail = customEvent.detail;
      if (!detail || typeof detail !== 'object') return;

      if (detail.type === 'scout_created' && detail.scout) {
        const created: Scout = detail.scout;
        setScouts(prev => {
          const filtered = prev.filter(s => s.id !== created.id);
          return [created, ...filtered];
        });
      } else if (detail.type === 'scout_dock_sync' && Array.isArray(detail.scouts)) {
        setScouts(detail.scouts);
      } else if (detail.type === 'scout_updated' && detail.scoutId) {
        const targetId = detail.scoutId;
        const nextStatus: ScoutStatus =
          detail.action === 'pause' ? 'paused'
          : detail.action === 'resume' ? 'active'
          : detail.action === 'cancel' ? 'canceled'
          : detail.status || 'active';

        setScouts(prev =>
          prev.map(s => (s.id === targetId ? { ...s, status: nextStatus } : s))
        );
      }
    };

    const handleScoutEvent = (e: Event) => {
      const customEvent = e as CustomEvent;
      const detail = customEvent.detail;
      if (!detail) return;

      if (detail.scout) {
        setScouts(prev => {
          const filtered = prev.filter(s => s.id !== detail.scout.id);
          return [detail.scout, ...filtered];
        });
      } else if (Array.isArray(detail.scouts)) {
        setScouts(detail.scouts);
      } else if (detail.scoutId && detail.status) {
        setScouts(prev =>
          prev.map(s => (s.id === detail.scoutId ? { ...s, status: detail.status } : s))
        );
      }
    };

    window.addEventListener('akropolys:action', handleAction);
    window.addEventListener('akropolys:scout', handleScoutEvent);

    return () => {
      window.removeEventListener('akropolys:action', handleAction);
      window.removeEventListener('akropolys:scout', handleScoutEvent);
    };
  }, []);

  const dispatchScout = useCallback(
    async (id: string) => {
      const event = await client.scouts.dispatch(id);
      fetchScouts().catch(() => {});
      return event;
    },
    [client, fetchScouts]
  );

  const createScout = useCallback(
    async (input: CreateScoutInput): Promise<Scout> => {
      const created = await client.scouts.create(input);
      setScouts(prev => [created, ...prev.filter(s => s.id !== created.id)]);
      return created;
    },
    [client]
  );

  const addScoutMinutes = useCallback(
    async (id: string, minutes: number): Promise<void> => {
      const total = await client.scouts.addMinutes(id, minutes);
      setScouts(prev => prev.map(s => (s.id === id ? { ...s, dedicatedMinutes: total } : s)));
    },
    [client]
  );

  const setAvatar = useCallback(
    async (id: string, avatar: string): Promise<void> => {
      setScouts(prev => prev.map(s => (s.id === id ? { ...s, avatar } : s)));
      try {
        await client.scouts.setAvatar(id, avatar);
      } catch (err) {
        fetchScouts().catch(() => {});
        throw err;
      }
    },
    [client, fetchScouts]
  );

  const pauseScout = useCallback(
    async (id: string): Promise<void> => {
      setScouts(prev => prev.map(s => (s.id === id ? { ...s, status: 'paused' } : s)));
      try {
        await client.scouts.pause(id);
      } catch (err) {
        fetchScouts().catch(() => {});
        throw err;
      }
    },
    [client, fetchScouts]
  );

  const resumeScout = useCallback(
    async (id: string): Promise<void> => {
      setScouts(prev => prev.map(s => (s.id === id ? { ...s, status: 'active' } : s)));
      try {
        await client.scouts.resume(id);
      } catch (err) {
        fetchScouts().catch(() => {});
        throw err;
      }
    },
    [client, fetchScouts]
  );

  const cancelScout = useCallback(
    async (id: string): Promise<void> => {
      setScouts(prev => prev.map(s => (s.id === id ? { ...s, status: 'canceled' } : s)));
      try {
        await client.scouts.cancel(id);
      } catch (err) {
        fetchScouts().catch(() => {});
        throw err;
      }
    },
    [client, fetchScouts]
  );

  const activeScouts = scouts.filter(s => s.status === 'active' || s.status === 'paused');

  return {
    enabled,
    justTriggered,
    dispatchScout,
    scouts,
    activeScouts,
    balance,
    loading,
    error,
    refetch: fetchScouts,
    createScout,
    pauseScout,
    resumeScout,
    cancelScout,
    addScoutMinutes,
    setAvatar,
  };
}
