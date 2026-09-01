import cssText from '../generated/cssText';

const CONTAINER_ID = 'akropolys-kiku-root';
let container: HTMLElement | null = null;
let shadow: ShadowRoot | null = null;

function applyStyles(root: ShadowRoot): void {
  if (typeof CSSStyleSheet !== 'undefined' && 'replaceSync' in CSSStyleSheet.prototype) {
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(cssText);
      root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
      return;
    } catch {
    }
  }
  const style = document.createElement('style');
  style.textContent = cssText;
  root.appendChild(style);
}

export function getShadowContainer(): HTMLElement | null {
  if (typeof document === 'undefined') return null; // SSR
  if (shadow) return shadow as unknown as HTMLElement;

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
}
