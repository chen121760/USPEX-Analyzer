import type { CSSProperties } from 'react';
import logoUrl from '@/assets/uspex_analyzer_transparent.svg';
import { UI_FONT_FAMILY } from '@/lib/constants';

interface UspexLogoProps {
  className?: string;
  style?: CSSProperties;
}

export function UspexLogo({ className, style }: UspexLogoProps) {
  return (
    <svg
      className={className}
      style={style}
      viewBox="0 0 840 840"
      role="img"
      aria-label="USPEX Analyzer"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <clipPath id="uspex-logo-mark-clip">
          <rect x="0" y="0" width="840" height="670" />
        </clipPath>
      </defs>
      <image
        href={logoUrl}
        width="840"
        height="840"
        preserveAspectRatio="xMidYMid meet"
        clipPath="url(#uspex-logo-mark-clip)"
      />
      <text
        x="46"
        y="780"
        fill="#248b8d"
        fontFamily={UI_FONT_FAMILY}
        fontSize="96"
        fontWeight="700"
        letterSpacing="0"
      >
        USPEX
      </text>
      <text
        x="400"
        y="780"
        fill="var(--color-text-primary)"
        fontFamily={UI_FONT_FAMILY}
        fontSize="96"
        fontWeight="700"
        letterSpacing="0"
      >
        Analyzer
      </text>
    </svg>
  );
}
