import React, { useState } from 'react';
import { useScouts } from '@akropolys/sdk';
import { cn } from '../../utils/cn';

export interface ScoutControlBarProps {
  className?: string;
  style?: React.CSSProperties;
  initialSliderOpen?: boolean;
  onProvisionMinutes?: (minutes: number) => void;
}

const PlusIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19"/>
    <line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
);

const MinusIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
);

const RadarIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Z"/>
    <path d="M12 6a6 6 0 1 0 6 6 6 6 0 0 0-6-6Z"/>
    <circle cx="12" cy="12" r="2"/>
  </svg>
);

const ZapIcon = ({ size = 13 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
  </svg>
);

export function ScoutControlBar({
  className,
  style,
  initialSliderOpen = false,
  onProvisionMinutes,
}: ScoutControlBarProps) {
  const { scouts } = useScouts();
  const [sliderOpen, setSliderOpen] = useState(initialSliderOpen);

  React.useEffect(() => {
    if (initialSliderOpen) {
      setSliderOpen(true);
    }
  }, [initialSliderOpen]);

  const [addMinutes, setAddMinutes] = useState(60);
  const [showPolarModal, setShowPolarModal] = useState(false);
  const [provisionedBonus, setProvisionedBonus] = useState(0);
  const [provisionSuccess, setProvisionSuccess] = useState(false);

  const activeScouts = scouts.filter(s => s.status === 'active');
  const activeCount = activeScouts.length;

  // Calculate elapsed vs available minutes
  let elapsedMinutes = 0;
  let totalMinutesAssigned = 0;
  activeScouts.forEach(s => {
    const elapsed = Math.max(0, (s.durationMinutes || 30) - (s.minutesRemaining || 0));
    elapsedMinutes += elapsed;
    totalMinutesAssigned += (s.durationMinutes || 30);
  });

  const baseAllowance = 60 + provisionedBonus;
  const totalAvailable = Math.max(baseAllowance, totalMinutesAssigned + 30);
  const progressPct = Math.min(100, Math.round((elapsedMinutes / Math.max(1, totalAvailable)) * 100));

  const MINUTE_STEPS = [15, 30, 45, 60, 90, 120, 180, 240, 360];

  const stepDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    const idx = MINUTE_STEPS.findIndex(s => s >= addMinutes);
    if (idx > 0) setAddMinutes(MINUTE_STEPS[idx - 1]);
    else if (idx === -1) setAddMinutes(MINUTE_STEPS[MINUTE_STEPS.length - 1]);
    else setAddMinutes(MINUTE_STEPS[0]);
  };

  const stepUp = (e: React.MouseEvent) => {
    e.stopPropagation();
    const idx = MINUTE_STEPS.findIndex(s => s > addMinutes);
    if (idx !== -1) setAddMinutes(MINUTE_STEPS[idx]);
    else setAddMinutes(MINUTE_STEPS[MINUTE_STEPS.length - 1]);
  };

  const handleConfirmProvision = () => {
    setProvisionedBonus(prev => prev + addMinutes);
    onProvisionMinutes?.(addMinutes);
    setShowPolarModal(false);
    setSliderOpen(false);
    setProvisionSuccess(true);
    setTimeout(() => setProvisionSuccess(false), 4000);
  };

  return (
    <div
      className={cn('hsk-scout-control-bar', className)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        width: '100%',
        boxSizing: 'border-box',
        ...style,
      }}
    >
      {/* Top Row: Dotted Squircle (+) and Scouts in Motion Rectangle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', width: '100%' }}>
        {/* Dotted Squircle with Plus Sign */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setSliderOpen(!sliderOpen);
          }}
          title={sliderOpen ? "Close add minutes" : "Add minutes & provision"}
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '11px',
            border: sliderOpen
              ? '1.5px solid var(--hsk-primary, #ff6a33)'
              : '1.5px dashed color-mix(in srgb, var(--hsk-chat-text, currentColor) 28%, transparent)',
            background: sliderOpen
              ? 'color-mix(in srgb, var(--hsk-primary, #ff6a33) 16%, transparent)'
              : 'color-mix(in srgb, var(--hsk-chat-bg, #ffffff) 60%, transparent)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            color: sliderOpen
              ? 'var(--hsk-primary, #ff6a33)'
              : 'var(--hsk-chat-text, currentColor)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            flexShrink: 0,
            transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
            boxShadow: sliderOpen
              ? '0 0 12px color-mix(in srgb, var(--hsk-primary, #ff6a33) 28%, transparent), 0 1px 0 0 rgba(255, 255, 255, 0.4) inset'
              : '0 1px 0 0 rgba(255, 255, 255, 0.35) inset',
          }}
        >
          {sliderOpen ? <MinusIcon size={14} /> : <PlusIcon size={14} />}
        </button>

        {/* Rectangle with Scouts in Motion */}
        <div
          style={{
            flex: 1,
            height: '32px',
            borderRadius: '11px',
            background: 'color-mix(in srgb, var(--hsk-chat-bg, #ffffff) 60%, transparent)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: activeCount > 0
              ? '1px solid rgba(16, 185, 129, 0.45)'
              : '1px solid color-mix(in srgb, var(--hsk-chat-border, currentColor) 14%, transparent)',
            borderTop: activeCount > 0
              ? '1px solid rgba(16, 185, 129, 0.7)'
              : '1px solid rgba(255, 255, 255, 0.55)',
            padding: '0 8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxSizing: 'border-box',
            overflow: 'hidden',
            boxShadow: '0 1px 0 0 rgba(255, 255, 255, 0.3) inset',
          }}
        >
          {activeCount > 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', width: '100%', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', overflow: 'hidden' }}>
                <span style={{ color: '#10b981', display: 'inline-flex', flexShrink: 0 }}>
                  <RadarIcon size={13} />
                </span>
                <span
                  style={{
                    fontSize: '10.5px',
                    fontWeight: 650,
                    color: 'var(--hsk-chat-text, currentColor)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    maxWidth: '85px',
                  }}
                >
                  {activeScouts[0].instrument || 'Active'}
                </span>
              </div>

              <span
                style={{
                  fontSize: '9px',
                  fontWeight: 700,
                  padding: '1px 5px',
                  borderRadius: '8px',
                  background: 'rgba(16, 185, 129, 0.15)',
                  color: '#10b981',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                {activeCount} in motion
              </span>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', width: '100%', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ color: 'var(--hsk-chat-muted, #71717a)', display: 'inline-flex' }}>
                  <RadarIcon size={13} />
                </span>
                <span style={{ fontSize: '10.5px', color: 'var(--hsk-chat-muted, #71717a)', fontWeight: 550 }}>
                  No scouts
                </span>
              </div>
              <span
                style={{
                  fontSize: '9px',
                  color: 'var(--hsk-primary, #ff6a33)',
                  fontWeight: 650,
                  opacity: 0.9,
                }}
              >
                Tap +
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Minutes Elapsed / Total Available Progress Bar */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', padding: '0 2px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '9.5px', color: 'var(--hsk-chat-muted, #a1a1aa)' }}>
          <span>{elapsedMinutes}m elapsed</span>
          <span style={{ fontWeight: 600, color: 'var(--hsk-chat-text, currentColor)' }}>
            {totalAvailable}m total
          </span>
        </div>

        {/* Bar */}
        <div
          style={{
            width: '100%',
            height: '3px',
            borderRadius: '999px',
            background: 'color-mix(in srgb, var(--hsk-chat-text, currentColor) 10%, transparent)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${progressPct}%`,
              background: progressPct > 80 ? 'linear-gradient(90deg, #f59e0b, #fbbf24)' : 'linear-gradient(90deg, #10b981, #34d399)',
              borderRadius: '999px',
              transition: 'width 0.3s ease',
            }}
          />
        </div>
      </div>

      {/* Success Notification */}
      {provisionSuccess && (
        <div
          style={{
            padding: '6px 10px',
            borderRadius: '10px',
            background: 'rgba(16, 185, 129, 0.15)',
            border: '1px solid rgba(16, 185, 129, 0.35)',
            borderTop: '1px solid rgba(16, 185, 129, 0.55)',
            color: '#10b981',
            fontSize: '11px',
            fontWeight: 650,
            textAlign: 'center',
            backdropFilter: 'blur(8px)',
            boxShadow: '0 1px 0 0 rgba(255, 255, 255, 0.2) inset',
          }}
        >
          ✓ Successfully provisioned +{addMinutes} scout minutes!
        </div>
      )}

      {/* Expandable Add Minutes & Provision Section (toggled by + squircle) */}
      {sliderOpen && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            padding: '8px',
            borderRadius: '14px',
            background: 'color-mix(in srgb, var(--hsk-chat-bg, #ffffff) 60%, transparent)',
            backdropFilter: 'blur(20px) saturate(180%)',
            WebkitBackdropFilter: 'blur(20px) saturate(180%)',
            border: '1px solid color-mix(in srgb, var(--hsk-chat-border, rgba(255, 255, 255, 0.4)) 25%, transparent)',
            borderTop: '1px solid rgba(255, 255, 255, 0.65)',
            borderBottom: '1px solid color-mix(in srgb, #000 6%, transparent)',
            boxShadow: '0 4px 16px -2px color-mix(in srgb, var(--hsk-chat-text, #000) 6%, transparent), 0 1px 0 0 rgba(255, 255, 255, 0.45) inset',
            marginTop: '2px',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Custom Frosted Glass Stepper Dial (Ditching squeezed buttons!) */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 2px' }}>
            {/* Decrement Glass Node */}
            <button
              type="button"
              onClick={stepDown}
              title="Decrease minutes"
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '9px',
                border: '1px solid color-mix(in srgb, var(--hsk-chat-border, rgba(255, 255, 255, 0.5)) 40%, transparent)',
                borderTop: '1px solid rgba(255, 255, 255, 0.8)',
                background: 'color-mix(in srgb, var(--hsk-chat-bg, #ffffff) 75%, transparent)',
                color: 'var(--hsk-chat-text, currentColor)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04), 0 1px 0 0 rgba(255, 255, 255, 0.5) inset',
                transition: 'all 0.15s ease',
              }}
            >
              <MinusIcon size={13} />
            </button>

            {/* Center Dynamic Numeric Readout */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '2px' }}>
                <span style={{ fontSize: '18px', fontWeight: 800, color: 'var(--hsk-primary, #ff6a33)', letterSpacing: '-0.02em', lineHeight: 1 }}>
                  +{addMinutes}
                </span>
                <span style={{ fontSize: '9.5px', fontWeight: 700, color: 'var(--hsk-chat-muted, #71717a)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  min
                </span>
              </div>
              <span style={{ fontSize: '8px', color: 'var(--hsk-chat-muted, #a1a1aa)', fontWeight: 500, opacity: 0.85, marginTop: '1px' }}>
                Runtime Allowance
              </span>
            </div>

            {/* Increment Glass Node */}
            <button
              type="button"
              onClick={stepUp}
              title="Increase minutes"
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '9px',
                border: '1px solid color-mix(in srgb, var(--hsk-chat-border, rgba(255, 255, 255, 0.5)) 40%, transparent)',
                borderTop: '1px solid rgba(255, 255, 255, 0.8)',
                background: 'color-mix(in srgb, var(--hsk-chat-bg, #ffffff) 75%, transparent)',
                color: 'var(--hsk-chat-text, currentColor)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04), 0 1px 0 0 rgba(255, 255, 255, 0.5) inset',
                transition: 'all 0.15s ease',
              }}
            >
              <PlusIcon size={13} />
            </button>
          </div>

          {/* Fluid Interactive Scrubber Bar */}
          <div style={{ width: '100%', padding: '0 2px', boxSizing: 'border-box' }}>
            <input
              type="range"
              min={15}
              max={360}
              step={15}
              value={addMinutes}
              onChange={(e) => setAddMinutes(Number(e.target.value))}
              style={{
                width: '100%',
                accentColor: 'var(--hsk-primary, #ff6a33)',
                cursor: 'pointer',
                height: '3px',
                display: 'block',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8px', color: 'var(--hsk-chat-muted, #a1a1aa)', marginTop: '2px', padding: '0 1px' }}>
              <span>15m</span>
              <span>60m</span>
              <span>180m</span>
              <span>360m</span>
            </div>
          </div>

          {/* Provision Action Button */}
          <button
            type="button"
            onClick={() => setShowPolarModal(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '5px',
              width: '100%',
              height: '32px',
              borderRadius: '11px',
              border: '1px solid rgba(255, 255, 255, 0.35)',
              borderTop: '1px solid rgba(255, 255, 255, 0.65)',
              background: 'linear-gradient(135deg, var(--hsk-primary, #ff6a33) 0%, color-mix(in srgb, var(--hsk-primary, #ff6a33) 85%, #ff8555) 100%)',
              color: '#ffffff',
              fontWeight: 700,
              fontSize: '11px',
              cursor: 'pointer',
              boxShadow: '0 3px 12px color-mix(in srgb, var(--hsk-primary, #ff6a33) 32%, transparent), 0 1px 0 0 rgba(255, 255, 255, 0.4) inset',
              textShadow: '0 1px 1px rgba(0, 0, 0, 0.2)',
              transition: 'transform 0.12s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.15s ease',
            }}
          >
            <ZapIcon size={12} />
            <span>Provision +{addMinutes}m</span>
          </button>
        </div>
      )}

      {/* Polar Checkout Checkpoint Modal */}
      {showPolarModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(6px)',
            padding: '16px',
          }}
          onClick={(e) => {
            e.stopPropagation();
            setShowPolarModal(false);
          }}
        >
          <div
            style={{
              maxWidth: '340px',
              width: '100%',
              borderRadius: '18px',
              background: 'var(--hsk-surface-2, var(--hsk-chat-bg, #18181b))',
              border: '1px solid var(--hsk-chat-border, rgba(255, 255, 255, 0.15))',
              padding: '18px',
              color: 'var(--hsk-chat-text, currentColor)',
              boxShadow: '0 20px 48px rgba(0,0,0,0.5)',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              textAlign: 'center',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(var(--hsk-primary-rgb, 255,106,51), 0.15)', color: 'var(--hsk-primary, #ff6a33)', margin: '0 auto' }}>
              <ZapIcon size={20} />
            </div>

            <div>
              <div style={{ fontWeight: 700, fontSize: '15px' }}>
                Polar Checkout Checkpoint
              </div>
              <div style={{ fontSize: '12px', color: 'var(--hsk-chat-muted, #a1a1aa)', marginTop: '4px', lineHeight: 1.4 }}>
                Provisioning <strong style={{ color: 'var(--hsk-primary, #ff6a33)' }}>+{addMinutes} minutes</strong> of autonomous background telemetry monitoring.
              </div>
            </div>

            <div
              style={{
                padding: '10px 12px',
                borderRadius: '10px',
                background: 'var(--hsk-surface-1, rgba(255, 255, 255, 0.05))',
                fontSize: '11.5px',
                lineHeight: 1.5,
                color: 'var(--hsk-chat-muted, #d4d4d8)',
                textAlign: 'left',
              }}
            >
              <div>• Zero token consumption during active watch</div>
              <div>• Real-time match odds & price tick triggers</div>
              <div>• Polar checkout gateway checkpoint</div>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
              <button
                type="button"
                onClick={() => setShowPolarModal(false)}
                style={{
                  flex: 1,
                  padding: '9px 0',
                  borderRadius: '10px',
                  border: '1px solid var(--hsk-chat-border, rgba(255, 255, 255, 0.15))',
                  background: 'transparent',
                  color: 'var(--hsk-chat-muted, #a1a1aa)',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleConfirmProvision}
                style={{
                  flex: 1.4,
                  padding: '9px 0',
                  borderRadius: '10px',
                  border: 'none',
                  background: 'var(--hsk-primary, #ff6a33)',
                  color: '#ffffff',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: '0 2px 10px rgba(var(--hsk-primary-rgb, 255,106,51), 0.35)',
                }}
              >
                Confirm Provision
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
