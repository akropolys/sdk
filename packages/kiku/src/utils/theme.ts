import type { CSSProperties } from 'react';
import type { AkropolysTheme } from '@akropolys/sdk';

export type ThemeProp = string | AkropolysTheme | undefined;

export function resolveTheme(theme: ThemeProp): {
  themeAttr: string | undefined;
  vars: CSSProperties | undefined;
} {
  if (typeof theme === 'string') {
    return { themeAttr: theme as any, vars: undefined };
  }
  if (!theme) {
    return { themeAttr: undefined, vars: undefined };
  }
  const vars: Record<string, string> = {};
  if (theme.primaryColor) vars['--hsk-primary'] = theme.primaryColor;
  if (theme.backgroundColor) {
    vars['--hsk-bg'] = theme.backgroundColor;
    vars['--hsk-chat-bg'] = theme.backgroundColor;
  }
  if (theme.textColor) {
    vars['--hsk-text'] = theme.textColor;
    vars['--hsk-chat-text'] = theme.textColor;
  }
  if (theme.fontFamily) vars['--hsk-font'] = theme.fontFamily;
  if (theme.fontSize) vars['--hsk-font-size'] = theme.fontSize;
  if (theme.mobileFontSize) vars['--hsk-mobile-font-size'] = theme.mobileFontSize;
  if (theme.borderRadius) vars['--hsk-border-radius'] = theme.borderRadius;
  return { themeAttr: undefined, vars: vars as CSSProperties };
}
