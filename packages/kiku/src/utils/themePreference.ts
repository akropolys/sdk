export const DEFAULT_THEME = 'light';
const THEME_IDS = ['light', 'dark', 'mahogany', 'blush', 'coffee', 'midnight'];
let themesSeenThisVisit = false;

export function isThemeId(value: unknown): value is string {
  return typeof value === 'string' && THEME_IDS.includes(value);
}

export function initialTheme(theme: unknown): string {
  if (isThemeId(theme)) return theme;
  try {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('akropolys_theme') : null;
    if (isThemeId(saved)) return saved;
  } catch { /* Storage can be unavailable in embedded browsers. */ }
  return DEFAULT_THEME;
}

export function hasSeenThemes(): boolean {
  if (themesSeenThisVisit) return true;
  try {
    return localStorage.getItem('akropolys_themes_seen') === 'true'
      || isThemeId(localStorage.getItem('akropolys_theme'));
  } catch {
    return false;
  }
}

export function rememberThemesSeen(): void {
  themesSeenThisVisit = true;
  try { localStorage.setItem('akropolys_themes_seen', 'true'); } catch {}
}
