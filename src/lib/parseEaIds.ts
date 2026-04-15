/**
 * Parse a user-typed string of EA IDs into a Set<number>.
 * Accepts: "EA1, EA5, EA10" | "1 5 10" | "EA1 EA5,EA10" | mixed
 */
export function parseEaIds(input: string): Set<number> {
  const result = new Set<number>();
  const tokens = input.split(/[\s,]+/).filter(Boolean);
  for (const token of tokens) {
    const cleaned = token.replace(/^ea/i, '');
    const n = parseInt(cleaned, 10);
    if (!isNaN(n) && n > 0) result.add(n);
  }
  return result;
}
