import { useEffect, useState } from 'react';

/**
 * Follow a boolean, but only after it has stayed true for `delayMs`.
 *
 * Near-instant work (a 200 ms parse of a small run) would otherwise flash a
 * full-screen overlay; the UX guidance is to keep feedback proportional to the
 * wait instead of flickering. The value turns false immediately.
 */
export function useDelayedFlag(active: boolean, delayMs = 150): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!active) {
      setVisible(false);
      return;
    }
    const timer = window.setTimeout(() => setVisible(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [active, delayMs]);

  return visible;
}
