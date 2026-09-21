import React from 'react';
import { cn } from '../../utils/cn';
import type { KikuState } from '../KikuAvatar';
import { LANGUAGE_CHOICES, endonymFor, getLoadingMeta, type UIStringKey } from './types';

type SpinnerPhase = 'idle' | 'step1-exit' | 'spinner-enter' | 'spinner-steady' | 'spinner-exit';

export interface OnboardingViewProps {
  inOnboarding: boolean;
  justCompleted: boolean;
  onboardingMood?: KikuState;
  awaitingLang: boolean;
  awaitingName: boolean;
  awaitingEntityLang: boolean;
  awaitingConsent: boolean;
  termsAgreed: boolean;
  shopperLanguage: string;
  pendingLanguage?: string;
  shopperName: string;
  entityLangPref: string;
  chromeReady: boolean;
  activeChips: string[];
  speechLang?: string;
  t: (key: UIStringKey, vars?: Record<string, string>) => string;
  tNode: (key: UIStringKey, vars?: Record<string, React.ReactNode>) => React.ReactNode;
  chooseLanguage: (lang: string) => void;
  langSwitching?: boolean;
  /** Passed directly from ChatModal so phase machine sees the same value */
  isLangPreparing?: boolean;
  onPrewarmLanguage?: (lang: string) => void;
  chooseEntityLang: (mode: 'translated' | 'original') => void;
  agreeTerms: () => void;
  handleSend: (text: string) => void;
}

export function OnboardingView({
  inOnboarding,
  justCompleted,
  onboardingMood,
  awaitingLang,
  awaitingName,
  awaitingEntityLang,
  awaitingConsent,
  termsAgreed,
  shopperLanguage,
  pendingLanguage,
  shopperName,
  entityLangPref,
  chromeReady,
  activeChips,
  speechLang,
  t,
  tNode,
  chooseLanguage,
  langSwitching = false,
  isLangPreparing: isLangPreparingProp,
  onPrewarmLanguage,
  chooseEntityLang,
  agreeTerms,
  handleSend,
}: OnboardingViewProps) {
  const targetLang = pendingLanguage || shopperLanguage;
  const isEn = !targetLang || targetLang.toLowerCase() === 'english' || targetLang.toLowerCase() === 'en';
  // Use prop from ChatModal if provided, otherwise compute locally (backward-compat)
  const isLangPreparing = isLangPreparingProp ??
    (langSwitching || !!pendingLanguage || (!!shopperLanguage && !chromeReady && !isEn));
  const loadingMeta = getLoadingMeta(targetLang);

  const rawGooId = React.useId();
  const gooFilterId = React.useMemo(() => 'hsk_goo_' + rawGooId.replace(/[^a-zA-Z0-9_-]/g, '_'), [rawGooId]);

  // ── Phase state machine (Synchronous for Zero-Flash Apple Fluid Transitions) ─
  const [prevPreparing, setPrevPreparing] = React.useState(isLangPreparing);
  const [spinnerPhase, setSpinnerPhase] = React.useState<SpinnerPhase>(() =>
    isLangPreparing ? 'spinner-steady' : 'idle',
  );
  const phaseTimers = React.useRef<ReturnType<typeof setTimeout>[]>([]);
  const clearPhaseTimers = () => {
    phaseTimers.current.forEach(clearTimeout);
    phaseTimers.current = [];
  };

  // Adjust state synchronously during render so there is NEVER a 1-frame flash
  if (isLangPreparing !== prevPreparing) {
    setPrevPreparing(isLangPreparing);
    clearPhaseTimers();
    if (isLangPreparing) {
      // Step 1 content glides UP out of frame with Apple duo blur (280ms)
      setSpinnerPhase('step1-exit');
      phaseTimers.current.push(setTimeout(() => setSpinnerPhase('spinner-enter'), 280));
      phaseTimers.current.push(setTimeout(() => setSpinnerPhase('spinner-steady'), 280 + 680));
    } else {
      // Strings ready: Spinner drops back DOWN toward send button (460ms)
      setSpinnerPhase('spinner-exit');
      phaseTimers.current.push(setTimeout(() => setSpinnerPhase('idle'), 460));
    }
  }

  React.useEffect(() => () => clearPhaseTimers(), []);
  // ─────────────────────────────────────────────────────────────────────────

  const showSpinner = (
    spinnerPhase === 'spinner-enter' ||
    spinnerPhase === 'spinner-steady' ||
    spinnerPhase === 'spinner-exit'
  );
  const showStep1Exiting = spinnerPhase === 'step1-exit';

  const currentStep =
    showSpinner || showStep1Exiting ? '1'
    : (!shopperLanguage || awaitingLang) ? '1'
    : (!shopperName || awaitingName) ? '2'
    : (!entityLangPref || awaitingEntityLang) ? '3'
    : (!termsAgreed || awaitingConsent) ? '4'
    : null;

  const [consentExpanded, setConsentExpanded] = React.useState(false);
  const [countdown, setCountdown] = React.useState(3);
  const displayShopperLang = shopperLanguage
    ? (endonymFor(shopperLanguage, speechLang) ||
       (shopperLanguage.charAt(0).toUpperCase() + shopperLanguage.slice(1)))
    : '';

  React.useEffect(() => {
    if (awaitingLang && onPrewarmLanguage) {
      const ric = typeof window !== 'undefined' ? (window as any).requestIdleCallback : undefined;
      const id = ric
        ? ric(() => onPrewarmLanguage('Urdu'), { timeout: 2000 })
        : setTimeout(() => onPrewarmLanguage('Urdu'), 500);
      return () => {
        if (ric && typeof window !== 'undefined') (window as any).cancelIdleCallback?.(id);
        else clearTimeout(id);
      };
    }
  }, [awaitingLang, onPrewarmLanguage]);

  React.useEffect(() => {
    if (!awaitingConsent) return;
    setCountdown(3);
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { clearInterval(timer); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [awaitingConsent]);

  return (
    <div className="hsk-cb-empty">
      <div className="hsk-cb-onboarding-card">
        {currentStep && (
          <div className="hsk-cb-onboarding-head">
            <span className="hsk-cb-step-badge" dir="ltr">
              {currentStep} / 4
            </span>
          </div>
        )}

        {showSpinner ? (
          /* ── Large organic goo loader ─────────────────────────────────── */
          <div
            className={cn(
              'hsk-lang-loader',
              spinnerPhase === 'spinner-enter' && 'hsk-lang-loader--enter',
              spinnerPhase === 'spinner-exit'  && 'hsk-lang-loader--exit',
            )}
            key="spinner-loading"
          >
            {/* Direct SVG goo filter: Gaussian blur + alpha threshold for organic liquid merge */}
            <svg
              width="0" height="0"
              aria-hidden="true"
              style={{ position: 'absolute', pointerEvents: 'none' }}
            >
              <defs>
                <filter
                  id={gooFilterId}
                  x="-60%" y="-60%"
                  width="220%" height="220%"
                  colorInterpolationFilters="sRGB"
                >
                  <feGaussianBlur in="SourceGraphic" stdDeviation="6.5" result="blur" />
                  <feColorMatrix
                    in="blur" type="matrix"
                    values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -8"
                  />
                </filter>
              </defs>
            </svg>
            <div
              className="hsk-lang-goo-stage"
              style={{ filter: `url(#${gooFilterId})` }}
            >
              <div className="hsk-lang-core-blob" />
              <div className="hsk-lang-orbit-arm hsk-lang-orbit-arm--1">
                <div className="hsk-lang-satellite hsk-lang-satellite--1" />
              </div>
              <div className="hsk-lang-orbit-arm hsk-lang-orbit-arm--2">
                <div className="hsk-lang-satellite hsk-lang-satellite--2" />
              </div>
              <div className="hsk-lang-orbit-arm hsk-lang-orbit-arm--3">
                <div className="hsk-lang-satellite hsk-lang-satellite--3" />
              </div>
            </div>
            <p className="hsk-lang-preparing">{loadingMeta.preparing}</p>
          </div>

        ) : (showStep1Exiting || awaitingLang || !shopperLanguage) ? (
          /* ── Step 1: Language selection (+ exit-up animation on dismiss) ── */
          <div
            className={cn('hsk-cb-hello-wrap', showStep1Exiting && 'hsk-step1-exit')}
            key="step-lang"
          >
            <h2 className="hsk-cb-hello">What language should we chat in?</h2>
            <div className="hsk-cb-lang-chips">
              {LANGUAGE_CHOICES.map((l, i) => (
                <button
                  key={l.value}
                  type="button"
                  className="hsk-cb-lang-chip"
                  style={{ '--hsk-pill-idx': i } as React.CSSProperties}
                  lang={l.tag}
                  dir={l.rtl ? 'rtl' : 'ltr'}
                  disabled={langSwitching}
                  onPointerEnter={() => !langSwitching && onPrewarmLanguage?.(l.value)}
                  onPointerDown={() => !langSwitching && onPrewarmLanguage?.(l.value)}
                  onClick={() => !langSwitching && chooseLanguage(l.value)}
                >
                  {l.native}
                </button>
              ))}
              <span
                className="hsk-cb-lang-chips-hint"
                style={{ '--hsk-pill-idx': LANGUAGE_CHOICES.length } as React.CSSProperties}
              >
                or type any other
              </span>
            </div>
          </div>

        ) : (awaitingName || !shopperName) ? (
          <div className="hsk-cb-hello-wrap hsk-step-enter" key="step-name">
            <h2 className="hsk-cb-hello">{t('nameStepTitle')}</h2>
            <p className="hsk-cb-hello-lead">{t('nameStepLead')}</p>
            <p className="hsk-cb-hello-ask">{t('nameStepAsk')}</p>
          </div>

        ) : awaitingEntityLang ? (
          <div className="hsk-cb-hello-wrap" key="step-entity-lang">
            <h2 className="hsk-cb-hello">{t('howShouldResultsLook')}</h2>
            <p className="hsk-cb-hello-lead">{tNode('entityLangIntro', { lang: displayShopperLang })}</p>
            <div className="hsk-cb-entlang-opts" role="radiogroup" aria-label={t('howShouldResultsLook')}>
              {(['translated', 'original'] as const).map((mode, i) => (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  aria-checked={entityLangPref === mode}
                  className={cn('hsk-cb-entlang-opt', entityLangPref === mode && 'is-selected')}
                  style={{ '--hsk-opt-idx': i } as React.CSSProperties}
                  onClick={() => chooseEntityLang(mode)}
                >
                  <span className="hsk-cb-entlang-radio" aria-hidden="true">
                    <span className="hsk-cb-entlang-radio-dot" />
                  </span>
                  <span className="hsk-cb-entlang-opt-text">
                    <span className="hsk-cb-entlang-opt-title">
                      {mode === 'translated' ? tNode('inLanguage', { lang: displayShopperLang }) : t('asWritten')}
                    </span>
                    <span className="hsk-cb-entlang-opt-note">
                      {mode === 'translated' ? t('detailsTranslated') : t('namesAsWritten')}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>

        ) : awaitingConsent ? (
          <div className="hsk-cb-hello-wrap" key="step-terms">
            <h2 className="hsk-cb-hello">{t('termsStepTitle')}</h2>
            <p className="hsk-cb-hello-lead">{t('termsStepSubtitle')}</p>
            <div className="hsk-cb-terms-sanctuary">
              <div className="hsk-cb-terms-item" style={{ '--hsk-row-idx': 0 } as React.CSSProperties}>
                <div className="hsk-cb-terms-head">
                  <span className="hsk-cb-terms-numeral">I</span>
                  <h3 className="hsk-cb-terms-title">{t('termsPiiTitle')}</h3>
                </div>
                <p className="hsk-cb-terms-desc">{t('termsPiiDesc')}</p>
              </div>
              <div className="hsk-cb-terms-divider" />
              <div className="hsk-cb-terms-item" style={{ '--hsk-row-idx': 1 } as React.CSSProperties}>
                <div className="hsk-cb-terms-head">
                  <span className="hsk-cb-terms-numeral">II</span>
                  <h3 className="hsk-cb-terms-title">{t('termsSessionTitle')}</h3>
                </div>
                <p className="hsk-cb-terms-desc">{t('termsSessionDesc')}</p>
              </div>
              <div className="hsk-cb-terms-divider" />
              <div className="hsk-cb-terms-item" style={{ '--hsk-row-idx': 2 } as React.CSSProperties}>
                <div className="hsk-cb-terms-head">
                  <span className="hsk-cb-terms-numeral">III</span>
                  <h3 className="hsk-cb-terms-title">{t('termsMemoryTitle')}</h3>
                </div>
                <p className="hsk-cb-terms-desc">{t('termsMemoryDesc')}</p>
              </div>
              <div className="hsk-cb-terms-divider" />
              <div className="hsk-cb-terms-item" style={{ '--hsk-row-idx': 3 } as React.CSSProperties}>
                <div className="hsk-cb-terms-head">
                  <span className="hsk-cb-terms-numeral">IV</span>
                  <h3 className="hsk-cb-terms-title">{t('termsCookieTitle')}</h3>
                </div>
                <p className="hsk-cb-terms-desc">{t('termsCookieDesc')}</p>
              </div>
            </div>
            <div className="hsk-cb-terms-action-wrap">
              <button
                type="button"
                className={cn('hsk-cb-terms-agree-btn', countdown === 0 && 'is-active')}
                disabled={countdown > 0}
                onClick={agreeTerms}
              >
                {countdown > 0
                  ? t('termsAgreeCounting', { seconds: String(countdown) })
                  : t('termsAgreeButton')}
              </button>
            </div>
          </div>

        ) : justCompleted ? (
          <div className="hsk-cb-hello-wrap" key="step-completed">
            <h2 className="hsk-cb-hello">{tNode('allSet', { name: shopperName })}</h2>
            <p className="hsk-cb-hello-lead">
              {entityLangPref === 'translated'
                ? tNode('replyingTranslated', { lang: displayShopperLang })
                : tNode('replyingOriginal', { lang: displayShopperLang })}
            </p>
          </div>

        ) : shopperName ? (
          <div className="hsk-cb-hello-wrap" key="step-returning">
            <h2 className="hsk-cb-hello">{tNode('greetReturning', { name: shopperName })}</h2>
            <p className="hsk-cb-hello-lead">{t('greetReturningLead')}</p>
          </div>

        ) : (
          <div className="hsk-cb-hello-wrap" key="step-initial">
            <h2 className="hsk-cb-hello">Hi, I'm <b>kiku</b>.</h2>
            <p className="hsk-cb-hello-lead">
              Ask me to search, visualize, or capture anything — I look across the whole site in real time.
            </p>
          </div>
        )}

        {!inOnboarding && (activeChips?.length ?? 0) > 0 && (
          <div className="hsk-cb-chips">
            {activeChips.map((chip, i) => (
              <button
                key={chip}
                className="hsk-cb-chip"
                style={{ '--hsk-pill-idx': i } as React.CSSProperties}
                onClick={() => handleSend(chip)}
              >
                {chip}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
