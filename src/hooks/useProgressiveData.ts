import { startTransition, useDeferredValue, useEffect, useState } from 'react';

/** Stable empty array, so the first render does not allocate a new one. */
const EMPTY: never[] = [];

/**
 * Progressive data hand-off for the heavy analysis pages.
 *
 * Two separate problems, one hook:
 *
 * 1. **First paint.** Rendering a page with 7677 structures means building every
 *    chart trace, column definition and row model before anything is visible.
 *    Withholding the data for the first frame lets the page paint its shell and
 *    a reserved-space skeleton immediately, then the real pass runs inside a
 *    transition — interruptible, and after the skeleton is already on screen.
 * 2. **Data switches.** Once ready, a changed identity (new project, streamed
 *    symmetry results) is handed over through `useDeferredValue`, so the heavy
 *    re-render stays interruptible and the page shows the previous data instead
 *    of a blank frame. Deliberately *not* a skeleton: a filter pass over the
 *    full table measures ~3 ms, and flashing a skeleton for that would be worse
 *    than the work it hides.
 *
 * `ready` only ever goes from false to true, on the frame after mount.
 */
export function useProgressiveData<T extends readonly unknown[]>(
  data: T,
): { data: T; ready: boolean } {
  const [ready, setReady] = useState(false);
  const deferred = useDeferredValue(data);

  useEffect(() => {
    if (ready) return;
    const reveal = () => startTransition(() => setReady(true));
    // `requestAnimationFrame` is missing in the node checks; a 0 ms timer is
    // the equivalent "after the current paint" yield there.
    const frame = typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame(reveal)
      : (setTimeout(reveal, 0) as unknown as number);
    return () => {
      if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame);
      else clearTimeout(frame);
    };
  }, [ready]);

  return { data: ready ? deferred : (EMPTY as unknown as T), ready };
}
