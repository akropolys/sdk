import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useCart } from '../hooks/useCart';
import { useHuskelContext } from './HuskelProvider';

export function CheckoutModal({
  onClose,
  theme,
  customStyles,
  hskThemeAttr
}: {
  onClose: () => void;
  theme?: string;
  customStyles?: React.CSSProperties;
  hskThemeAttr?: string;
}) {
  const { cart, loading: cartLoading } = useCart();
  const client = useHuskelContext();
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [checkingOut, setCheckingOut] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);

  useEffect(() => {
    client.api.getCheckoutConfig()
      .then(res => setConfig(res.payment_methods))
      .catch(e => console.error('[Huskel] Failed to fetch checkout config', e))
      .finally(() => setLoading(false));
  }, [client]);

  const handlePay = async (method: string) => {
    setCheckingOut(true);
    // Simulate processing payment
    setTimeout(async () => {
      try {
        const payload = await client.api.checkoutCart();
        if (client.onCheckout) {
          client.onCheckout(payload);
        }
        setPaymentSuccess(true);
        setTimeout(() => {
          onClose();
        }, 3000);
      } catch (e) {
        console.error('[Huskel] Checkout failed', e);
        setCheckingOut(false);
      }
    }, 1500);
  };

  const hasPaymentMethods = config && Object.values(config).some((m: any) => m.enabled);

  return createPortal(
    <div 
      className="hsk-cart-backdrop" 
      style={{...customStyles, zIndex: 999999}}
      data-hsk-theme={hskThemeAttr}
      onClick={onClose}
    >
      <div 
        className="hsk-checkout-modal" 
        style={customStyles}
        data-hsk-theme={hskThemeAttr}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="hsk-checkout-header">
          <h2>Secure Checkout</h2>
          <button onClick={onClose} className="hsk-close-btn">&times;</button>
        </div>
        
        <div className="hsk-checkout-content">
          {paymentSuccess ? (
            <div className="hsk-checkout-success">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="hsk-success-icon">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
              </svg>
              <h3>Payment Successful!</h3>
              <p>Thank you for your order.</p>
            </div>
          ) : (
            <div className="hsk-checkout-split">
              <div className="hsk-checkout-summary">
                <h3>Order Summary</h3>
                {cartLoading || !cart ? (
                  <p className="hsk-cart-loading">Loading order...</p>
                ) : (
                  <>
                    <ul className="hsk-checkout-items">
                      {cart.items.map(item => (
                        <li key={item.id}>
                          <span>{item.quantity}x {item.name}</span>
                          <span>{item.currency} {(item.price_numeric * item.quantity).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="hsk-checkout-total">
                      <span>Total</span>
                      <span>{cart.currency} {cart.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                  </>
                )}
              </div>
              <div className="hsk-checkout-payment">
                <h3>Payment Method</h3>
                {loading ? (
                  <p className="hsk-cart-loading">Loading secure payment methods...</p>
                ) : !hasPaymentMethods ? (
                  <p className="hsk-checkout-error">No payment methods are currently available for this store.</p>
                ) : (
                  <div className="hsk-payment-options">
                    {config?.mpesa?.enabled && (
                      <button onClick={() => handlePay('mpesa')} disabled={checkingOut} className="hsk-pay-btn hsk-pay-mpesa">
                        {checkingOut ? 'Processing...' : 'Pay with M-Pesa'}
                      </button>
                    )}
                    {config?.equity?.enabled && (
                      <button onClick={() => handlePay('equity')} disabled={checkingOut} className="hsk-pay-btn hsk-pay-equity">
                        {checkingOut ? 'Processing...' : 'Pay with Equity Bank'}
                      </button>
                    )}
                    {config?.stripe?.enabled && (
                      <button onClick={() => handlePay('stripe')} disabled={checkingOut} className="hsk-pay-btn hsk-pay-stripe">
                        {checkingOut ? 'Processing...' : 'Pay with Card (Stripe)'}
                      </button>
                    )}
                    {config?.paypal?.enabled && (
                      <button onClick={() => handlePay('paypal')} disabled={checkingOut} className="hsk-pay-btn hsk-pay-paypal">
                        {checkingOut ? 'Processing...' : 'Pay with PayPal'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
