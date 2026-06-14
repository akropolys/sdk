import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useCart, useAkropolysContext, usePaymentPolling } from '@akropolys/sdk';

type Phase = 'idle' | 'awaiting' | 'done' | 'failed' | 'cancelled';

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
  const client = useAkropolysContext();
  const [config, setConfig] = useState<any>(null);
  const [loadingConfig, setLoadingConfig] = useState(true);

  // Form fields prefilled from localStorage
  const [phone, setPhone] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('akropolys_user_phone') || '';
    }
    return '';
  });
  const [email, setEmail] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('akropolys_user_email') || '';
    }
    return '';
  });
  const [firstName, setFirstName] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('akropolys_user_firstname') || '';
    }
    return '';
  });
  const [lastName, setLastName] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('akropolys_user_lastname') || '';
    }
    return '';
  });

  // Payment state
  const [phase, setPhase] = useState<Phase>('idle');
  const [merchantRef, setMerchantRef] = useState<string | null>(null);
  const [payError, setPayError] = useState<string | null>(null);

  // Poll for payment confirmation
  const { } = usePaymentPolling({
    client: client.api,
    merchantReference: merchantRef,
    onSuccess: () => { setPhase('done'); setMerchantRef(null); },
    onFailure: () => {
      setPhase('failed');
      setPayError('Payment failed or timed out. Please try again.');
      setMerchantRef(null);
    },
  });

  useEffect(() => {
    client.api.getCheckoutConfig()
      .then(res => setConfig(res.payment_methods))
      .catch(() => {})
      .finally(() => setLoadingConfig(false));
  }, [client]);

  const hasPaymentMethods = config && Object.values(config).some((m: any) => m.enabled);

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) { setPayError('Phone number is required.'); return; }
    setPayError(null);
    setPhase('awaiting');
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem('akropolys_user_phone', phone.trim());
        localStorage.setItem('akropolys_user_email', email.trim());
        localStorage.setItem('akropolys_user_firstname', firstName.trim());
        localStorage.setItem('akropolys_user_lastname', lastName.trim());
      }
      const res = await client.api.initiatePayment(phone.trim(), email, firstName, lastName);
      if (res?.merchantReference) {
        setMerchantRef(res.merchantReference);
      } else {
        throw new Error('No merchant reference returned.');
      }
    } catch (err: any) {
      setPhase('failed');
      setPayError(err.message || 'Could not connect to payment processor.');
    }
  };

  const currency = cart?.currency || 'KES';
  const total = cart?.total || 0;

  const backdropStyle: React.CSSProperties = { ...customStyles, fontSize: '15px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif', zIndex: 999999 };

  return createPortal(
    <div
      className="hsk-checkout-backdrop-full"
      style={backdropStyle}
      data-hsk-theme={hskThemeAttr}
    >
      <div
        className="hsk-checkout-modal-full"
        style={customStyles}
        data-hsk-theme={hskThemeAttr}
      >
        <button 
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClose(); }} 
          className="hsk-checkout-close-x"
          aria-label="Close checkout"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>

        {/* Left Panel: Order Summary */}
        <div className="hsk-checkout-panel-left">
          <div className="hsk-checkout-left-content">
            <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClose(); }} className="hsk-checkout-back-btn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="19" y1="12" x2="5" y2="12"></line>
                <polyline points="12 19 5 12 12 5"></polyline>
              </svg>
              Back to store
            </button>
            
            <div className="hsk-checkout-store-info">
              <h2>Secure Checkout</h2>
            </div>
            
            <div className="hsk-checkout-amount-due">
              <span className="hsk-checkout-label-muted">Pay total</span>
              <div className="hsk-checkout-grand-total">
                {currency} {total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
            </div>
            
            {cartLoading || !cart ? (
              <p className="hsk-cart-loading">Loading order...</p>
            ) : (
              <div className="hsk-checkout-items-list-wrap">
                <ul className="hsk-checkout-items-list">
                  {cart.items.map(item => (
                    <li key={item.id} className="hsk-checkout-item-row">
                      <div className="hsk-checkout-item-img-container">
                        {item.image ? (
                          <img src={item.image} alt={item.name} className="hsk-checkout-item-img" />
                        ) : (
                          <div className="hsk-checkout-item-img-placeholder">🛒</div>
                        )}
                        <span className="hsk-checkout-item-qty-badge">{item.quantity}</span>
                      </div>
                      <div className="hsk-checkout-item-details">
                        <span className="hsk-checkout-item-name">{item.name}</span>
                      </div>
                      <span className="hsk-checkout-item-price">
                        {item.currency} {(item.price_numeric * item.quantity).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* Right Panel: Payment Forms & Status */}
        <div className="hsk-checkout-panel-right">
          <div className="hsk-checkout-right-content">
            {phase === 'done' ? (
              <div className="hsk-checkout-status-card success">
                <div className="hsk-status-icon-wrap success">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                    <polyline points="22 4 12 14.01 9 11.01"/>
                  </svg>
                </div>
                <h3>Payment Successful!</h3>
                <p>Your transaction has been confirmed. Thank you for your order!</p>
                <button onClick={onClose} className="hsk-pay-btn hsk-btn-primary" style={{ marginTop: '1.5rem' }}>
                  Continue Shopping
                </button>
              </div>
            ) : phase === 'awaiting' ? (
              <div className="hsk-checkout-status-card awaiting">
                <div className="hsk-status-spinner-wrap">
                  <div className="hsk-status-spinner"></div>
                </div>
                <h3>Confirm payment on your phone</h3>
                <p>We've sent an M-Pesa STK push prompt to <strong>254{phone}</strong>.</p>
                <div className="hsk-checkout-stk-instructions">
                  <p>1. Check your phone lockscreen for the M-Pesa prompt.</p>
                  <p>2. Enter your M-Pesa PIN and press OK.</p>
                  <p>3. Wait here — this page auto-updates once confirmed.</p>
                </div>
                <button
                  onClick={() => { setPhase('cancelled'); setMerchantRef(null); }}
                  className="hsk-checkout-cancel-btn"
                >
                  Cancel payment
                </button>
              </div>
            ) : phase === 'cancelled' ? (
              <div className="hsk-checkout-status-card cancelled">
                <div className="hsk-status-icon-wrap cancelled">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m15 9-6 6M9 9l6 6"/>
                    <circle cx="12" cy="12" r="10"/>
                  </svg>
                </div>
                <h3>Payment Cancelled</h3>
                <p>No charge was made. You can update your phone number and try again whenever you're ready.</p>
                <div className="hsk-checkout-status-actions">
                  <button onClick={() => { setPhase('idle'); setPayError(null); }} className="hsk-pay-btn hsk-btn-primary">
                    Try again
                  </button>
                  <button onClick={onClose} className="hsk-checkout-cancel-btn">
                    Back to cart
                  </button>
                </div>
              </div>
            ) : phase === 'failed' ? (
              <div className="hsk-checkout-status-card failed">
                <div className="hsk-status-icon-wrap failed">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="8" x2="12" y2="12"/>
                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                </div>
                <h3>Payment Failed</h3>
                <p className="hsk-checkout-error-text">{payError || 'Could not verify M-Pesa transaction. Please check your phone and try again.'}</p>
                <div className="hsk-checkout-status-actions">
                  <button onClick={() => { setPhase('idle'); setPayError(null); }} className="hsk-pay-btn hsk-btn-primary">
                    Try again
                  </button>
                  <button onClick={onClose} className="hsk-checkout-cancel-btn">
                    Back to cart
                  </button>
                </div>
              </div>
            ) : (
              <div className="hsk-checkout-payment-form-wrap">
                <h3 className="hsk-checkout-section-title">Payment details</h3>
                {loadingConfig ? (
                  <p className="hsk-cart-loading">Loading payment configuration...</p>
                ) : !hasPaymentMethods ? (
                  <p className="hsk-checkout-error">No payment methods configured for this store.</p>
                ) : (
                  <form onSubmit={handlePay} className="hsk-stripe-checkout-form">
                    
                    {/* Phone field */}
                    <div className="hsk-form-group">
                      <label className="hsk-form-label">M-Pesa Mobile Number</label>
                      <div className="hsk-phone-input-container">
                        <span className="hsk-phone-prefix">254</span>
                        <input
                          type="tel"
                          required
                          placeholder="712345678"
                          pattern="[0-9]{9}"
                          maxLength={9}
                          value={phone}
                          onChange={e => setPhone(e.target.value.replace(/\D/g, ''))}
                          className="hsk-phone-input-field"
                        />
                      </div>
                      <span className="hsk-form-hint">Enter your 9-digit number (e.g. 712345678)</span>
                    </div>

                    {/* Email field */}
                    <div className="hsk-form-group">
                      <label className="hsk-form-label">Email address</label>
                      <input
                        type="email"
                        placeholder="john.doe@example.com"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        className="hsk-form-input"
                      />
                    </div>

                    {/* Name row */}
                    <div className="hsk-form-row">
                      <div className="hsk-form-group">
                        <label className="hsk-form-label">First Name</label>
                        <input
                          type="text"
                          placeholder="John"
                          value={firstName}
                          onChange={e => setFirstName(e.target.value)}
                          className="hsk-form-input"
                        />
                      </div>
                      <div className="hsk-form-group">
                        <label className="hsk-form-label">Last Name</label>
                        <input
                          type="text"
                          placeholder="Doe"
                          value={lastName}
                          onChange={e => setLastName(e.target.value)}
                          className="hsk-form-input"
                        />
                      </div>
                    </div>

                    {payError && (
                      <div className="hsk-form-error-banner">
                        {payError}
                      </div>
                    )}

                    <button type="submit" className="hsk-checkout-submit-btn">
                      Pay {currency} {total.toLocaleString()}
                    </button>
                    
                    <div className="hsk-checkout-footer-brand">
                      <span>Powered by Akropolys</span>
                    </div>
                  </form>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
