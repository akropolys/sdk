import React from 'react';
import { cn } from '../../utils/cn';
import type { KikuState } from '../KikuAvatar';
import { LANGUAGE_CHOICES, endonymFor, getLoadingMeta, type UIStringKey } from './types';
import { ClayLoader } from './ClayLoader';

function CheckMark() {
  return (
    <span className="hsk-cb-check" aria-hidden="true">
      <svg viewBox="0 0 16 16">
        <path d="M3.5 8.4 6.6 11.4 12.6 4.8" />
      </svg>
    </span>
  );
}

type SpinnerPhase = 'idle' | 'step1-exit' | 'spinner-enter' | 'spinner-steady' | 'spinner-exit';

export interface OnboardingViewProps {
  theme?: string;
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
  tNode: (key: UIStringKey, vars?: Record<string, string>) => React.ReactNode;
  chooseLanguage: (lang: string) => void;
  langSwitching?: boolean;
  isLangPreparing?: boolean;
  chooseEntityLang: (mode: 'translated' | 'original') => void;
  agreeTerms: () => void;
  handleSend: (text: string) => void;
}

export function OnboardingView({
  theme,
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
      setSpinnerPhase('step1-exit');
      phaseTimers.current.push(setTimeout(() => setSpinnerPhase('spinner-enter'), 280));
      phaseTimers.current.push(setTimeout(() => setSpinnerPhase('spinner-steady'), 280 + 680));
    } else {
      setSpinnerPhase('spinner-exit');
      phaseTimers.current.push(setTimeout(() => setSpinnerPhase('idle'), 460));
    }
  }

  React.useEffect(() => () => clearPhaseTimers(), []);

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

  const [picked, setPicked] = React.useState<'translated' | 'original' | null>(null);
  const [countdown, setCountdown] = React.useState(3);

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
  const displayShopperLang = shopperLanguage
    ? (endonymFor(shopperLanguage, speechLang) ||
       (shopperLanguage.charAt(0).toUpperCase() + shopperLanguage.slice(1)))
    : '';


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
          <div
            className={cn(
              'hsk-lang-loader',
              spinnerPhase === 'spinner-enter' && 'hsk-lang-loader--enter',
              spinnerPhase === 'spinner-exit'  && 'hsk-lang-loader--exit',
            )}
            key="spinner-loading"
          >
            <ClayLoader
              theme={theme}
              phase={spinnerPhase === 'spinner-exit' ? 'exit' : spinnerPhase === 'spinner-enter' ? 'enter' : 'steady'}
              label={loadingMeta.preparing}
            />
          </div>

        ) : (showStep1Exiting || awaitingLang || !shopperLanguage) ? (
          <div
            className={cn('hsk-cb-hello-wrap', showStep1Exiting && 'hsk-step1-exit')}
            key="step-lang"
          >
            <h2 className="hsk-cb-hello">Which language do you want to use?</h2>
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
                  onClick={() => !langSwitching && chooseLanguage(l.value)}
                >
                  {l.native}
                </button>
              ))}
              <span
                className="hsk-cb-lang-chips-hint"
                style={{ '--hsk-pill-idx': LANGUAGE_CHOICES.length } as React.CSSProperties}
              >
                or type another one
              </span>
            </div>
          </div>

        ) : (awaitingName || !shopperName) ? (
          <div className="hsk-cb-hello-wrap hsk-cb-name-step hsk-step-enter" key="step-name">
            <h2 className="hsk-cb-hello">{t('nameStepTitle')}</h2>
            <p className="hsk-cb-hello-ask">{t('nameStepAsk')}</p>
            <p className="hsk-cb-hello-hint">{t('nameStepHint')}</p>
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
                  aria-checked={(picked ?? entityLangPref) === mode}
                  className={cn('hsk-cb-entlang-opt', (picked ?? entityLangPref) === mode && 'is-selected')}
                  style={{ '--hsk-opt-idx': i } as React.CSSProperties}
                  onClick={() => setPicked(mode)}
                >
                  <CheckMark />
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
            <div className="hsk-cb-terms-action-wrap">
              <button
                type="button"
                className={cn('hsk-cb-terms-agree-btn', picked && 'is-active')}
                disabled={!picked}
                onClick={() => picked && chooseEntityLang(picked)}
              >
                {t('continueButton')}
              </button>
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
              <div className="hsk-cb-terms-divider" />
              <div className="hsk-cb-terms-item" style={{ '--hsk-row-idx': 4 } as React.CSSProperties}>
                <div className="hsk-cb-terms-head">
                  <span className="hsk-cb-terms-numeral">V</span>
                  <h3 className="hsk-cb-terms-title">{t('termsAiTitle')}</h3>
                </div>
                <p className="hsk-cb-terms-desc">{t('termsAiDesc')}</p>
              </div>
            </div>
            <p className="hsk-cb-terms-more">
              {t('privacyMore')}{' '}
              <a href="https://akropolys.cloud/privacy" target="_blank" rel="noopener noreferrer" dir="ltr">
                akropolys.cloud/privacy
              </a>
            </p>
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
            <h2 className="hsk-cb-hello">Hello, I am <b>kiku</b>.</h2>
            <p className="hsk-cb-hello-lead">
              Ask me to find, show or save anything. I look through this whole website for you.
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
