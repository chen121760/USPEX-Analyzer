import type { CSSProperties } from 'react';

/**
 * Indeterminate loading indicator.
 *
 * Only `transform`/`opacity` are animated so the browser can run the animation on
 * the compositor: it keeps turning while a synchronous parse holds the main
 * thread. Easing is linear, which is the correct choice for constant-rate
 * rotation.
 */
export function Spinner({ size = 18, label }: { size?: number; label?: string }) {
  return (
    <span
      className="spinner"
      style={{ width: size, height: size }}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <svg viewBox="0 0 24 24" width="100%" height="100%" focusable="false">
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
        <path
          d="M21 12a9 9 0 0 0-9-9"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

/** Clamp a progress fraction to a whole percentage, or `null` if unknown. */
export function progressPercent(value?: number | null): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.round(Math.min(1, Math.max(0, value)) * 100);
}

/**
 * Progress bar for long operations.
 *
 * With a `value` in [0, 1] it is determinate: the fill is scaled with
 * `transform: scaleX()` (a compositor-friendly property, not `width`) and the
 * element exposes `role="progressbar"` + `aria-valuenow` so assistive tech
 * reports the same information the bar shows. Without a value it is the
 * indeterminate sliding bar, which is decorative and hidden from assistive tech.
 */
export function ProgressBar({ value }: { value?: number | null }) {
  const determinate = typeof value === 'number' && Number.isFinite(value);
  const fraction = determinate ? Math.min(1, Math.max(0, value)) : 0;
  const percent = progressPercent(value);

  return (
    <span
      className={determinate ? 'loading-bar is-determinate' : 'loading-bar'}
      role={determinate ? 'progressbar' : undefined}
      aria-valuemin={determinate ? 0 : undefined}
      aria-valuemax={determinate ? 100 : undefined}
      aria-valuenow={percent ?? undefined}
      aria-label={determinate ? `${percent}%` : undefined}
      aria-hidden={determinate ? undefined : true}
    >
      <span
        className="loading-bar-fill"
        style={determinate ? ({ '--progress': fraction } as CSSProperties) : undefined}
      />
    </span>
  );
}
