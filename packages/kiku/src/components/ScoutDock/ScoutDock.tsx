import React, { useState, useRef, useEffect } from 'react';
import { useScouts, Scout } from '@akropolys/sdk';
import { cn } from '../../utils/cn';

export interface ScoutDockProps {
  className?: string;
  style?: React.CSSProperties;
  compact?: boolean;
  defaultExpanded?: boolean;
  showTriggered?: boolean;
  onSelectScout?: (scout: Scout) => void;
  onClose?: () => void;
}

const RadarIcon = ({ size = 15 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Z"/>
    <path d="M12 6a6 6 0 1 0 6 6 6 6 0 0 0-6-6Z"/>
    <path d="M12 10a2 2 0 1 0 2 2 2 2 0 0 0-2-2Z"/>
    <line x1="12" y1="12" x2="19" y2="5"/>
  </svg>
);

const PauseIcon = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <rect x="6" y="4" width="4" height="16" rx="1"/>
    <rect x="14" y="4" width="4" height="16" rx="1"/>
  </svg>
);

const PlayIcon = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <polygon points="5 3 19 12 5 21 5 3"/>
  </svg>
);

const TrashIcon = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/>
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
  </svg>
);

const CloseIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/>
    <line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

export function ScoutDock({
  className,
  style,
  compact = false,
  defaultExpanded = true,
  showTriggered = true,
  onSelectScout,
  onClose,
}: ScoutDockProps) {
  const { scouts, pauseScout, resumeScout, cancelScout } = useScouts();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const containerRef = useRef<HTMLDivElement>(null);

  const activeCount = scouts.filter(s => s.status === 'active').length;
  const triggeredCount = scouts.filter(s => s.status === 'triggered').length;

  const visibleScouts = scouts.filter(s => {
    if (s.status === 'canceled' || s.status === 'expired') return false;
    if (s.status === 'triggered' && !showTriggered) return false;
    return true;
  });

  // Click outside to close when in compact popover mode
  useEffect(() => {
    if (!compact || !expanded) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setExpanded(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [compact, expanded]);

  const handleToggleStatus = async (scout: Scout, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      if (scout.status === 'active') {
        await pauseScout(scout.id);
      } else if (scout.status === 'paused') {
        await resumeScout(scout.id);
      }
    } catch (err) {
      console.error('[ScoutDock] Failed to toggle status:', err);
    }
  };

  const handleCancel = async (scout: Scout, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await cancelScout(scout.id);
    } catch (err) {
      console.error('[ScoutDock] Failed to cancel scout:', err);
    }
  };

  const renderContent = () => (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        maxHeight: '280px',
        overflowY: 'auto',
        padding: '2px',
      }}
    >
      {visibleScouts.length === 0 ? (
        <div
          style={{
            padding: '20px 14px',
            textAlign: 'center',
            color: 'var(--hsk-chat-muted, #71717a)',
            fontSize: '12px',
            lineHeight: 1.5,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: '4px', color: 'var(--hsk-chat-text, currentColor)' }}>
            No Active Scouts
          </div>
          <div style={{ fontSize: '11px', opacity: 0.85 }}>
            Type <code style={{ padding: '2px 5px', borderRadius: '4px', background: 'var(--hsk-surface-1, rgba(255,255,255,0.08))', fontFamily: 'monospace' }}>scout BTC &lt;= 84000</code> in chat to deploy an autonomous watcher.
          </div>
        </div>
      ) : (
        visibleScouts.map(scout => {
          const isTriggered = scout.status === 'triggered';
          const isPaused = scout.status === 'paused';
          const isActive = scout.status === 'active';

          return (
            <div
              key={scout.id}
              onClick={() => onSelectScout?.(scout)}
              style={{
                padding: '9px 12px',
                borderRadius: '10px',
                background: isTriggered
                  ? 'rgba(168, 85, 247, 0.12)'
                  : isPaused
                  ? 'rgba(234, 179, 8, 0.08)'
                  : 'var(--hsk-surface-1, rgba(255, 255, 255, 0.05))',
                border: isTriggered
                  ? '1px solid rgba(168, 85, 247, 0.35)'
                  : isPaused
                  ? '1px solid rgba(234, 179, 8, 0.25)'
                  : '1px solid var(--hsk-chat-border, rgba(255, 255, 255, 0.08))',
                display: 'flex',
                flexDirection: 'column',
                gap: '5px',
                cursor: onSelectScout ? 'pointer' : 'default',
                transition: 'all 0.15s ease',
              }}
            >
              {/* Top Row: Instrument, Condition, Status */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    style={{
                      fontWeight: 700,
                      fontSize: '12px',
                      letterSpacing: '0.01em',
                      color: 'var(--hsk-chat-text, currentColor)',
                    }}
                  >
                    {scout.instrument}
                  </span>
                  <span
                    style={{
                      fontSize: '11px',
                      fontFamily: 'monospace',
                      color: isTriggered ? '#c084fc' : 'var(--hsk-chat-muted, #a1a1aa)',
                    }}
                  >
                    {scout.conditionField} {scout.operator} {scout.targetValue}
                  </span>
                </div>

                {/* Status Pill */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  {isActive && (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '11px',
                        color: '#10b981',
                        fontWeight: 600,
                      }}
                    >
                      <span
                        style={{
                          width: '6px',
                          height: '6px',
                          borderRadius: '50%',
                          backgroundColor: '#10b981',
                          boxShadow: '0 0 6px #10b981',
                        }}
                      />
                      {scout.minutesRemaining}m
                    </span>
                  )}
                  {isPaused && (
                    <span
                      style={{
                        fontSize: '11px',
                        color: '#facc15',
                        fontWeight: 600,
                      }}
                    >
                      Paused
                    </span>
                  )}
                  {isTriggered && (
                    <span
                      style={{
                        fontSize: '11px',
                        color: '#c084fc',
                        fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '3px',
                      }}
                    >
                      🎯 Hit
                    </span>
                  )}
                </div>
              </div>

              {/* Trigger Info if triggered */}
              {isTriggered && scout.triggerValue && (
                <div
                  style={{
                    fontSize: '11px',
                    color: '#d8b4fe',
                    background: 'rgba(168, 85, 247, 0.18)',
                    padding: '2px 7px',
                    borderRadius: '5px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <span>Triggered at: {scout.triggerValue}</span>
                  {scout.actionType && (
                    <span style={{ textTransform: 'uppercase', fontSize: '10px', fontWeight: 600, opacity: 0.9 }}>
                      {scout.actionType}
                    </span>
                  )}
                </div>
              )}

              {/* Bottom Row: Name and Actions */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingTop: '2px',
                }}
              >
                <span
                  style={{
                    fontSize: '10px',
                    color: 'var(--hsk-chat-muted, #71717a)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.03em',
                  }}
                >
                  {scout.actionType} • #{scout.id.slice(0, 8)}
                </span>

                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {!isTriggered && (
                    <button
                      type="button"
                      onClick={(e) => handleToggleStatus(scout, e)}
                      title={isActive ? 'Pause scout' : 'Resume scout'}
                      style={{
                        border: 'none',
                        background: 'var(--hsk-surface-2, rgba(255, 255, 255, 0.08))',
                        color: 'var(--hsk-chat-text, currentColor)',
                        width: '22px',
                        height: '22px',
                        borderRadius: '5px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        transition: 'opacity 0.15s ease',
                      }}
                    >
                      {isActive ? <PauseIcon /> : <PlayIcon />}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={(e) => handleCancel(scout, e)}
                    title="Undock / Cancel scout"
                    style={{
                      border: 'none',
                      background: 'var(--hsk-surface-2, rgba(255, 255, 255, 0.08))',
                      color: 'var(--hsk-chat-muted, #71717a)',
                      width: '22px',
                      height: '22px',
                      borderRadius: '5px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      transition: 'color 0.15s ease',
                    }}
                  >
                    <TrashIcon />
                  </button>
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );

  // Compact popover trigger button
  if (compact) {
    return (
      <div ref={containerRef} style={{ position: 'relative', display: 'inline-block' }}>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className={cn('hsk-scout-dock-trigger', className)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '5px 11px',
            borderRadius: 'var(--hsk-control-radius, 9999px)',
            border: '1px solid var(--hsk-chat-border, rgba(255, 255, 255, 0.12))',
            background: 'var(--hsk-surface-1, rgba(24, 24, 27, 0.85))',
            color: 'var(--hsk-chat-text, currentColor)',
            fontSize: '12px',
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            ...style,
          }}
        >
          <span style={{ display: 'inline-flex', color: activeCount > 0 ? '#10b981' : 'inherit' }}>
            <RadarIcon size={14} />
          </span>
          <span>{activeCount > 0 ? `${activeCount} Scout${activeCount > 1 ? 's' : ''}` : 'Scouts'}</span>
          {activeCount > 0 && (
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: '#10b981',
                boxShadow: '0 0 6px #10b981',
              }}
            />
          )}
        </button>

        {expanded && (
          <div
            className="hsk-scout-popover"
            style={{
              position: 'absolute',
              top: 'calc(100% + 8px)',
              right: 0,
              zIndex: 1000,
              minWidth: '320px',
              maxWidth: '380px',
              width: 'max-content',
              borderRadius: '14px',
              border: '1px solid var(--hsk-chat-border, rgba(255, 255, 255, 0.12))',
              background: 'var(--hsk-surface-2, var(--hsk-chat-bg, #18181b))',
              color: 'var(--hsk-chat-text, currentColor)',
              boxShadow: '0 12px 36px -4px rgba(0, 0, 0, 0.35), 0 4px 12px rgba(0, 0, 0, 0.15)',
              backdropFilter: 'blur(16px)',
              padding: '12px',
            }}
          >
            {/* Popover Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingBottom: '8px',
                marginBottom: '8px',
                borderBottom: '1px solid var(--hsk-chat-border, rgba(255, 255, 255, 0.08))',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, fontSize: '13px' }}>
                <span style={{ color: activeCount > 0 ? '#10b981' : 'var(--hsk-primary, #ff6a33)' }}>
                  <RadarIcon size={14} />
                </span>
                <span>Scout Dock</span>
                {activeCount > 0 && (
                  <span
                    style={{
                      fontSize: '10px',
                      padding: '1px 6px',
                      borderRadius: '10px',
                      background: 'rgba(16, 185, 129, 0.15)',
                      color: '#10b981',
                      fontWeight: 700,
                    }}
                  >
                    {activeCount} active
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={() => setExpanded(false)}
                style={{
                  border: 'none',
                  background: 'none',
                  color: 'var(--hsk-chat-muted, #71717a)',
                  cursor: 'pointer',
                  padding: '3px',
                  display: 'inline-flex',
                }}
              >
                <CloseIcon size={14} />
              </button>
            </div>

            {renderContent()}
          </div>
        )}
      </div>
    );
  }

  // Embedded dock inside ChatModal
  return (
    <div
      className={cn('hsk-scout-dock-embedded', className)}
      style={{
        borderRadius: '12px',
        border: '1px solid var(--hsk-chat-border, rgba(255, 255, 255, 0.1))',
        background: 'var(--hsk-surface-2, var(--hsk-chat-bg, rgba(24, 24, 27, 0.95)))',
        color: 'var(--hsk-chat-text, currentColor)',
        padding: '10px 12px',
        width: '100%',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)',
        fontSize: '12px',
        ...style,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingBottom: '8px',
          marginBottom: '8px',
          borderBottom: '1px solid var(--hsk-chat-border, rgba(255, 255, 255, 0.08))',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ color: activeCount > 0 ? '#10b981' : 'var(--hsk-primary, #ff6a33)', display: 'inline-flex' }}>
            <RadarIcon size={15} />
          </span>
          <span style={{ fontWeight: 600, fontSize: '13px' }}>Scout Dock</span>
          {activeCount > 0 && (
            <span
              style={{
                fontSize: '10px',
                padding: '1px 6px',
                borderRadius: '10px',
                background: 'rgba(16, 185, 129, 0.15)',
                color: '#10b981',
                fontWeight: 700,
              }}
            >
              {activeCount} active
            </span>
          )}
          {triggeredCount > 0 && (
            <span
              style={{
                fontSize: '10px',
                padding: '1px 6px',
                borderRadius: '10px',
                background: 'rgba(168, 85, 247, 0.15)',
                color: '#c084fc',
                fontWeight: 700,
              }}
            >
              {triggeredCount} triggered
            </span>
          )}
        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            title="Close dock"
            style={{
              border: 'none',
              background: 'transparent',
              color: 'var(--hsk-chat-muted, #71717a)',
              cursor: 'pointer',
              padding: '3px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '4px',
              transition: 'color 0.15s ease',
            }}
          >
            <CloseIcon size={14} />
          </button>
        )}
      </div>

      {/* Scout Items List */}
      {renderContent()}
    </div>
  );
}
