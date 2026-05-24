import React from 'react';
import { useCart } from '../hooks/useCart';
import { cn } from '../utils/cn';

export function CartBadge({ className }: { className?: string }) {
  const { cart } = useCart();
  
  if (!cart || cart.item_count === 0) return null;
  
  return (
    <span className={cn("hsk-cart-badge", className)}>
      {cart.item_count}
    </span>
  );
}
