import { useState, useCallback, useEffect } from 'react';
import { Scout, ScoutStatus, CreateScoutInput } from '../types';
import { useAkropolysContext } from '../Provider';

export interface UseScoutsOptions {
  status?: string;
  autoRefresh?: boolean;
  refreshIntervalMs?: number;
}

export interface UseScoutsReturn {
  scouts: Scout[];
  activeScouts: Scout[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  createScout: (input: CreateScoutInput) => Promise<Scout>;
  pauseScout: (id: string) => Promise<void>;
  resumeScout: (id: string) => Promise<void>;
  cancelScout: (id: string) => Promise<void>;
}

export function useScouts(options: UseScoutsOptions = {}): UseScoutsReturn {
  const client = useAkropolysContext();
  const [scouts, setScouts] = useState<Scout[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { status, autoRefresh = true, refreshIntervalMs = 15000 } = options;

  const fetchScouts = useCallback(async () => {
    if (!client) return;
    try {
      setLoading(true);
      setError(null);
      const res = await client.scouts.list({ status });
      setScouts(res.scouts || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch scouts');
    } finally {
      setLoading(false);
    }
  }, [client, status]);

  useEffect(() => {
    fetchScouts();
  }, [fetchScouts]);

  // Periodic refresh when active scouts exist
  useEffect(() => {
    if (!autoRefresh) return;
    const hasActive = scouts.some(s => s.status === 'active');
    if (!hasActive) return;

    const timer = setInterval(() => {
      fetchScouts().catch(() => {});
    }, refreshIntervalMs);

    return () => clearInterval(timer);
  }, [autoRefresh, scouts, refreshIntervalMs, fetchScouts]);

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

  const createScout = useCallback(
    async (input: CreateScoutInput): Promise<Scout> => {
      const created = await client.scouts.create(input);
      setScouts(prev => [created, ...prev.filter(s => s.id !== created.id)]);
      return created;
    },
    [client]
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
    scouts,
    activeScouts,
    loading,
    error,
    refetch: fetchScouts,
    createScout,
    pauseScout,
    resumeScout,
    cancelScout,
  };
}
