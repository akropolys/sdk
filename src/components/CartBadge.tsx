import React from 'react';
import { useCart } from '../hooks/useCart';

export function CartBadge({ className }: { className?: string }) {
  const { cart } = useCart();
  
  if (!cart || cart.item_count === 0) return null;
  
  return (
    <span className={`hsk-cart-badge ${className || ''}`}>
      {cart.item_count}
    </span>
  );
}
