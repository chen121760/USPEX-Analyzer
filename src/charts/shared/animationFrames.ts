export function animationFrames(range: { min: number; max: number }, low: number | null, high: number | null, step: number): number[] {
  if (!Number.isFinite(step) || step <= 0 || !Number.isFinite(range.min) || !Number.isFinite(range.max) || range.max < range.min) return [];
  const floor = Math.max(range.min, Math.min(range.max, low ?? range.min));
  const start = high == null || high >= range.max ? floor : Math.max(floor, Math.min(range.max, high));
  const count = Math.ceil((range.max - start) / step);
  // Guard accidental runaway exports while keeping the first and last frame.
  const stride = Math.max(step, (range.max - start) / 2000);
  const frames = Array.from({ length: Math.min(count, 2000) }, (_, i) => Math.min(range.max, start + i * stride));
  frames.push(range.max);
  return frames;
}
