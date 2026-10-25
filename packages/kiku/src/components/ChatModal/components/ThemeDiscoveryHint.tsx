import React from 'react';
import { useT } from '../types';
import { cn } from '../../../utils/cn';

export function ThemeDiscoveryHint({ mobile = false, closing = false }: { mobile?: boolean; closing?: boolean }) {
  const t = useT();
  return (
    <div className={cn('hsk-cb-theme-discovery', mobile && 'is-mobile', closing && 'is-closing')} role="note">
      <svg viewBox={mobile ? '0 0 360 260' : '0 0 120 80'} preserveAspectRatio="none" fill="none" aria-hidden="true">
        <path pathLength="1" vectorEffect="non-scaling-stroke" d={mobile
          ? 'M174 250C213 263 247 245 239 225C230 205 205 222 220 239C244 269 294 251 326 220C354 194 343 158 351 132C363 90 349 66 352 43C356 20 311 16 215 14M225 5L213 14L224 24'
          : 'M26 67C48 78 63 61 54 52C43 43 37 58 50 62C81 73 106 44 84 22C79 16 73 13 66 12M72 27L65 12L83 10'} />
      </svg>
      <span>{t(mobile ? 'themeHoldHint' : 'themeClickHint')}</span>
    </div>
  );
}
