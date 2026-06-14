import { useState, useEffect, useCallback } from 'react';
import { useAkropolysContext } from '../Provider';
import { CartPayload } from '../types';

export function useCart() {
  const client = useAkropolysContext();
  const [cart, setCart] = useState<CartPayload | null>(null);
  const [loading, setLoading] = useState(false);

  const shopperId = client.getShopperId();

  const fetchCart = useCallback(async () => {
    if (!shopperId) return;
    setLoading(true);
    try {
      const res = await client.api.getCart();
      setCart(res);
    } catch (e) {
      console.error('[Akropolys] Failed to fetch cart', e);
    } finally {
      setLoading(false);
    }
  }, [client, shopperId]);

  useEffect(() => {
    fetchCart();
    
    const handleCartUpdate = (e: any) => {
      if (e.detail) {
        setCart(e.detail);
      } else {
        fetchCart();
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('akropolys:cart_updated', handleCartUpdate as EventListener);
      return () => window.removeEventListener('akropolys:cart_updated', handleCartUpdate as EventListener);
    }
  }, [fetchCart, shopperId]);

  return { cart, loading, fetchCart };
}
