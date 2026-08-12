import { clsx, type ClassValue } from "clsx";

/**
 * Joins class values. Deliberately not twMerge: every class this library emits
 * is an `hsk-` name, which no Tailwind conflict rule can match, so the merge
 * pass was 8KB gzipped of no-op.
 */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}
