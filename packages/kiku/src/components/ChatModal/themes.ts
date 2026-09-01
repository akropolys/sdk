import type { ComponentType } from 'react';
import { SunIcon, MoonIcon, WoodIcon, HeartIcon, CoffeeIcon, StarIcon } from './icons';

export interface ThemeDef {
  id: string;
  label: string;
  Icon: ComponentType;
  dark: boolean;
}

// Single source of truth. Add a theme here plus a token block in styles.css.
export const THEMES: ThemeDef[] = [
  { id: 'light', label: 'Silver', Icon: SunIcon, dark: false },
  { id: 'dark', label: 'Onyx', Icon: MoonIcon, dark: true },
  { id: 'mahogany', label: 'Mahogany', Icon: WoodIcon, dark: true },
  { id: 'blush', label: 'Blush', Icon: HeartIcon, dark: false },
  { id: 'coffee', label: 'Coffee', Icon: CoffeeIcon, dark: false },
  { id: 'midnight', label: 'Midnight', Icon: StarIcon, dark: true },
];

export type ThemeId = string;

export const DEFAULT_DARK: ThemeId = 'dark';
export const DEFAULT_LIGHT: ThemeId = 'light';

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && THEMES.some(t => t.id === value);
}

export function themeDef(id: ThemeId): ThemeDef {
  return THEMES.find(t => t.id === id) ?? THEMES[0];
}
