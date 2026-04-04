/**
 * Parser for USPEX Parameters.txt
 * Extracts element names from the atomType block.
 */

export function parseParameters(content: string): string[] {
  // Match: % atomType ... % EndAtomType
  const match = content.match(
    /%\s*atomType\s*\n([\s\S]*?)\n\s*%\s*EndAtomType/i
  );

  if (!match) {
    console.warn('[parseParameters] atomType block not found');
    return [];
  }

  const atoms = match[1].trim().split(/\s+/).filter(Boolean);
  return atoms;
}
