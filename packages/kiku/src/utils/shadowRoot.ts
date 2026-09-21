import { KIKU_CSS } from '../styles/cssText';

const CONTAINER_ID = 'akropolys-kiku-root';
let container: HTMLElement | null = null;
let shadow: ShadowRoot | null = null;
let styled = false;

export function kikuCss(): string {
  return KIKU_CSS;
}

function applyStyles(root: ShadowRoot): void {
  if (styled) return;
  styled = true;
  if (typeof CSSStyleSheet !== 'undefined' && 'replaceSync' in CSSStyleSheet.prototype) {
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(KIKU_CSS);
      root.adoptedStyleSheets = [sheet];
      return;
    } catch {
    }
  }
  const style = document.createElement('style');
  style.textContent = KIKU_CSS;
  root.appendChild(style);
}

export function getShadowContainer(): HTMLElement | null {
  if (typeof document === 'undefined') return null; // SSR
  if (shadow) {
    applyStyles(shadow);
    return shadow as unknown as HTMLElement;
  }

  container = document.getElementById(CONTAINER_ID);
  if (!container) {
    container = document.createElement('div');
    container.id = CONTAINER_ID;
    container.style.cssText = 'all: initial;';
    document.body.appendChild(container);
  }

  shadow = container.shadowRoot ?? container.attachShadow({ mode: 'open' });
  applyStyles(shadow);

  return shadow as unknown as HTMLElement;
}

export function destroyShadowContainer(): void {
  container?.remove();
  container = null;
  shadow = null;
  styled = false;
}
