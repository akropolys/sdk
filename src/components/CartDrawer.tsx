import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useCart } from '../hooks/useCart';
import { useAkropolysContext } from './AkropolysProvider';
import { AkropolysTheme } from '../types';
import { CheckoutModal } from './CheckoutModal';
import { cn } from '../utils/cn';

export function CartDrawer({ 
  trigger, 
  className,
  theme 
}: { 
  trigger?: React.ReactNode, 
  className?: string,
  theme?: 'light' | 'dark' | AkropolysTheme 
}) {
  const { cart, loading } = useCart();
  const [open, setOpen] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [mounted, setMounted] = useState(false);
  const client = useAkropolysContext();

  useEffect(() => {
    setMounted(true);
    const handleTriggerCheckout = () => {
      setShowCheckout(true);
      setOpen(false);
    };
    window.addEventListener('akropolys:trigger_checkout', handleTriggerCheckout);
    return () => {
      window.removeEventListener('akropolys:trigger_checkout', handleTriggerCheckout);
    };
  }, []);

  // Block body scroll when drawer is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const handleCheckout = async () => {
    if (!cart || cart.items.length === 0) return;
    
    const event = new CustomEvent('akropolys:trigger_checkout', { cancelable: true });
    window.dispatchEvent(event);
    
    if (event.defaultPrevented) {
      setOpen(false);
      return;
    }
    
    setShowCheckout(true);
  };

  const isStringTheme = typeof theme === 'string';
  const hskThemeAttr = isStringTheme ? theme : undefined;
  
  const customStyles = (!isStringTheme && theme) ? {
    ...(theme?.primaryColor && { '--hsk-primary': theme.primaryColor, '--hsk-primary-color': theme.primaryColor }),
    ...(theme?.backgroundColor && { '--hsk-bg': theme.backgroundColor }),
    ...(theme?.textColor && { '--hsk-text': theme.textColor }),
    ...(theme?.fontFamily && { '--hsk-font': theme.fontFamily }),
    ...(theme?.borderRadius && { '--hsk-border-radius': theme.borderRadius }),
  } as React.CSSProperties : undefined;

  return (
    <>
      {trigger ? (
        <div onClick={() => setOpen(true)} style={{ display: 'inline-block' }}>
          {trigger}
        </div>
      ) : (
        <button 
          onClick={() => setOpen(true)}
          className={cn("hsk-cart-trigger", className)} 
          style={customStyles}
          data-hsk-theme={hskThemeAttr}
          aria-label="Open cart"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="9" cy="21" r="1"></circle>
            <circle cx="20" cy="21" r="1"></circle>
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
          </svg>
          {cart && cart.item_count > 0 ? (
            <span className="hsk-cart-trigger-badge">{cart.item_count}</span>
          ) : null}
        </button>
      )}
      
      {open && mounted && createPortal(
        <div 
          className="hsk-cart-backdrop" 
          style={customStyles}
          data-hsk-theme={hskThemeAttr}
          onClick={() => setOpen(false)}
        >
          <div 
            className="hsk-cart-bottom-sheet" 
            style={customStyles}
            data-hsk-theme={hskThemeAttr}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="hsk-cart-sheet-handle" />
            
            <div className="hsk-cart-sheet-header">
              <h2>Your Cart</h2>
              <button onClick={() => setOpen(false)} className="hsk-close-btn">&times;</button>
            </div>
            
            <div className="hsk-cart-sheet-content">
              {loading && !cart ? (
                <div className="hsk-cart-loading">Loading cart...</div>
              ) : !cart || cart.items.length === 0 ? (
                <div className="hsk-cart-empty">Your cart is empty.</div>
              ) : (
                <ul className="hsk-cart-items">
                  {cart.items.map(item => (
                    <li key={item.id} className="hsk-cart-item">
                      {item.image && <img src={item.image} alt={item.name} className="hsk-cart-item-img" />}
                      <div className="hsk-cart-item-info">
                        <span className="hsk-cart-item-name">{item.name}</span>
                        <span className="hsk-cart-item-price">{item.currency} {item.price_numeric.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="hsk-cart-item-qty">x{item.quantity}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            
            {cart && cart.items.length > 0 && (
              <div className="hsk-cart-sheet-footer">
                <div className="hsk-cart-total">
                  <span>Total</span>
                  <span>{cart.currency} {cart.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
                <button onClick={handleCheckout} className="hsk-checkout-btn">
                  Checkout securely
                </button>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

      {showCheckout && mounted && (
        <CheckoutModal 
          onClose={() => {
            setShowCheckout(false);
            setOpen(false);
          }}
          theme={isStringTheme ? (theme as string) : undefined}
          customStyles={customStyles}
          hskThemeAttr={hskThemeAttr}
        />
      )}
    </>
  );
}
