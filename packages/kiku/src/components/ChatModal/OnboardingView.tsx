import React from 'react';
import { cn } from '../../utils/cn';
import type { KikuState } from '../KikuAvatar';
import { ChromeLoading } from './components/ListeningWave';
import { LANGUAGE_CHOICES, endonymFor, type UIStringKey } from './types';
import { CascadeText } from './components/CascadeText';
import { splitPlaceholder } from './components/AnimatedPlaceholder';
import { ShieldIcon, KeyOutlineIcon, VaultIcon, GlobeIcon } from './icons';

function countShimmerUnits(node: React.ReactNode): number {
  if (typeof node === 'string') return splitPlaceholder(node).length;
  if (Array.isArray(node)) return node.reduce<number>((n, c) => n + countShimmerUnits(c), 0);
  if (React.isValidElement(node)) return countShimmerUnits((node.props as any)?.children);
  return 0;
}

// walks the whole tree so interpolated nodes (tNode's <bdi>) shimmer like plain text
function shimmerTree(
  node: React.ReactNode,
  cursor: { i: number },
  last: number,
  baseIdx: number,
): React.ReactNode {
  if (typeof node === 'string') {
    return splitPlaceholder(node).map(unit => {
      const i = cursor.i++;
      return (
        <span
          key={i}
          className="hsk-cb-shimmer-char"
          style={{
            '--hsk-char-idx': baseIdx + i,
            '--hsk-ph-hue': `${Math.round((i / last) * 300)}`,
          } as React.CSSProperties}
        >
          {unit}
        </span>
      );
    });
  }
  if (Array.isArray(node)) {
    return node.map((child, k) => (
      <React.Fragment key={k}>{shimmerTree(child, cursor, last, baseIdx)}</React.Fragment>
    ));
  }
  if (React.isValidElement(node)) {
    return React.cloneElement(node as any, {
      children: shimmerTree((node.props as any)?.children, cursor, last, baseIdx),
    });
  }
  return node;
}

function ShimmerText({ text, baseIdx = 0 }: { text: React.ReactNode; baseIdx?: number }) {
  const last = Math.max(countShimmerUnits(text) - 1, 1);
  return <>{shimmerTree(text, { i: 0 }, last, baseIdx)}</>;
}

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
  shopperName: string;
  entityLangPref: string;
  chromeReady: boolean;
  activeChips: string[];
  t: (key: UIStringKey, vars?: Record<string, string>) => string;
  tNode: (key: UIStringKey, vars: Record<string, string>) => React.ReactNode;
  chooseLanguage: (lang: string) => void;
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
  shopperName,
  entityLangPref,
  chromeReady,
  activeChips,
  t,
  tNode,
  chooseLanguage,
  chooseEntityLang,
  agreeTerms,
  handleSend,
}: OnboardingViewProps) {
  const currentStep = awaitingLang ? '1' : awaitingName ? '2' : awaitingEntityLang ? '3' : awaitingConsent ? '4' : null;
  const [countdown, setCountdown] = React.useState(30);

  React.useEffect(() => {
    if (!awaitingConsent) {
      setCountdown(30);
      return;
    }
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
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
        {awaitingLang ? (
          <div className="hsk-cb-hello-wrap" key="step-lang">
            <h2 className="hsk-cb-hello hsk-cascade">
              <CascadeText baseMs={0}>What language should we chat in?</CascadeText>
            </h2>
            <div className="hsk-cb-lang-chips">
              {LANGUAGE_CHOICES.map((l, i) => (
                <button
                  key={l.value}
                  type="button"
                  className="hsk-cb-lang-chip"
                  style={{ '--hsk-pill-idx': i } as React.CSSProperties}
                  lang={l.tag}
                  dir={l.rtl ? 'rtl' : 'ltr'}
                  onClick={() => chooseLanguage(l.value)}
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
        ) : awaitingName ? (
          <div className="hsk-cb-hello-wrap" key="step-name">
            {chromeReady ? (
              <>
                <h2 className="hsk-cb-hello hsk-cascade">
                  <CascadeText baseMs={0}>{t('nameStepTitle')}</CascadeText>
                </h2>
                <p className="hsk-cb-hello-lead hsk-cascade">
                  <CascadeText baseMs={30}>{t('nameStepLead')}</CascadeText>
                </p>
                <p className="hsk-cb-hello-ask hsk-cascade">
                  <CascadeText baseMs={60}>{t('nameStepAsk')}</CascadeText>
                </p>
              </>
            ) : (
              <ChromeLoading
                language={shopperLanguage}
                onBack={() => chooseLanguage('')}
              />
            )}
          </div>
        ) : awaitingEntityLang ? (
          <div className="hsk-cb-hello-wrap" key="step-entity-lang">
            {chromeReady && (
              <>
                <h2 className="hsk-cb-hello hsk-cascade">
                  <CascadeText baseMs={0}>{t('howShouldResultsLook')}</CascadeText>
                </h2>
                <p className="hsk-cb-hello-lead hsk-cascade">
                  <CascadeText baseMs={30}>{tNode('entityLangIntro', { lang: shopperLanguage })}</CascadeText>
                </p>
              </>
            )}
            {chromeReady && (
              <div className="hsk-cb-entlang-opts" role="radiogroup" aria-label={t('howShouldResultsLook')}>
                {(['translated', 'original'] as const).map((mode, i) => (
                  <button
                    key={mode}
                    type="button"
                    role="radio"
                    aria-checked={entityLangPref === mode}
                    className={cn("hsk-cb-entlang-opt", entityLangPref === mode && "is-selected")}
                    style={{ '--hsk-opt-idx': i } as React.CSSProperties}
                    onClick={() => chooseEntityLang(mode)}
                  >
                    <span className="hsk-cb-entlang-radio" aria-hidden="true">
                      <span className="hsk-cb-entlang-radio-dot" />
                    </span>
                    <span className="hsk-cb-entlang-opt-text">
                      <span className="hsk-cb-entlang-opt-title">
                        <ShimmerText
                          text={
                            mode === 'translated'
                              ? tNode('inLanguage', { lang: shopperLanguage })
                              : t('asWritten')
                          }
                          baseIdx={0}
                        />
                      </span>
                      <span className="hsk-cb-entlang-opt-note">
                        <ShimmerText
                          text={
                            mode === 'translated'
                              ? t('detailsTranslated')
                              : t('namesAsWritten')
                          }
                          baseIdx={15}
                        />
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : awaitingConsent ? (
          <div className="hsk-cb-hello-wrap" key="step-terms">
            {chromeReady && (
              <>
                <h2 className="hsk-cb-hello hsk-cascade">
                  <CascadeText baseMs={0}>{t('termsStepTitle')}</CascadeText>
                </h2>
                <p className="hsk-cb-hello-lead hsk-cascade">
                  <CascadeText baseMs={30}>{t('termsStepSubtitle')}</CascadeText>
                </p>
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
                    className={cn(
                      "hsk-cb-terms-agree-btn",
                      countdown === 0 && "is-active"
                    )}
                    disabled={countdown > 0}
                    onClick={agreeTerms}
                  >
                    {countdown > 0
                      ? t('termsAgreeCounting', { seconds: String(countdown) })
                      : t('termsAgreeButton')}
                  </button>
                </div>
              </>
            )}
          </div>
        ) : justCompleted ? (
          <div className="hsk-cb-hello-wrap" key="step-completed">
            {chromeReady && (
              <>
                <h2 className="hsk-cb-hello hsk-cascade">
                  <CascadeText baseMs={0}>{tNode('allSet', { name: shopperName })}</CascadeText>
                </h2>
                <p className="hsk-cb-hello-lead hsk-cascade">
                  <CascadeText baseMs={30}>
                    {entityLangPref === 'translated'
                      ? tNode('replyingTranslated', { lang: shopperLanguage })
                      : tNode('replyingOriginal', { lang: shopperLanguage })}
                  </CascadeText>
                </p>
              </>
            )}
          </div>
        ) : shopperName ? (
          <div className="hsk-cb-hello-wrap" key="step-returning">
            <h2 className="hsk-cb-hello hsk-cascade">
              <CascadeText baseMs={0}>{tNode('greetReturning', { name: shopperName })}</CascadeText>
            </h2>
            <p className="hsk-cb-hello-lead hsk-cascade">
              <CascadeText baseMs={30}>{t('greetReturningLead')}</CascadeText>
            </p>
          </div>
        ) : (
          <div className="hsk-cb-hello-wrap" key="step-initial">
            <h2 className="hsk-cb-hello hsk-cascade">
              <CascadeText baseMs={0}>Hi, I'm <b>kiku</b>.</CascadeText>
            </h2>
            <p className="hsk-cb-hello-lead hsk-cascade">
              <CascadeText baseMs={30}>Ask me to search, visualize, or capture anything — I look across the whole site in real time.</CascadeText>
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
