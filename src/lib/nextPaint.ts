/**
 * Yield long enough for the browser to paint whatever state was just set.
 *
 * A synchronous parse blocks the main thread, so a loading overlay that is set
 * and then immediately overwritten never appears. Awaiting a paint before the
 * heavy work lets the overlay render first; the overlay's own indicator animates
 * on the compositor (transform/opacity only), so it keeps moving while the parse
 * holds the main thread.
 */
export function nextPaint(): Promise<void> {
  const raf = typeof globalThis.requestAnimationFrame === 'function'
    ? globalThis.requestAnimationFrame.bind(globalThis)
    : null;

  if (!raf) {
    // Non-DOM environments (the standalone node checks) only need the yield.
    return new Promise((resolve) => { setTimeout(resolve, 0); });
  }

  return new Promise((resolve) => {
    raf(() => raf(() => resolve()));
  });
}
