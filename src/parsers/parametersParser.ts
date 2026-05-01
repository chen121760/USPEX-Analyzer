/**
 * Parser for USPEX Parameters.txt
 *
 * Extracts:
 * - Element names from % atomType ... % EndAtomType
 * - calculationType: 3-digit code (hundreds=dimension, tens=molecule, ones=varcomp)
 * - optType: optimization targets (e.g., [1] for enthalpy-only, [1, 1201] for multi-obj)
 */

import type { ParsedParameters } from '@/types/structure';

/**
 * Parse the % optType ... % EndOptType block.
 * Returns an array of integer codes, e.g. [1] or [1, 1201].
 */
function parseOptType(content: string): number[] {
  const match = content.match(
    /%\s*optType\s*\n([\s\S]*?)\n\s*%\s*EndOptType/i
  );
  if (!match) return [1]; // default: single-objective enthalpy

  const nums = match[1].trim().split(/\s+/).map(Number).filter((n) => !isNaN(n));
  return nums.length > 0 ? nums : [1];
}

/**
 * Extract calculationType from a line like "301   : calculationType ..."
 */
function parseCalculationType(content: string): number {
  const match = content.match(/(\d{3})\s*:\s*calculationType\b/i);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * Extract ExternalPressure from a line like "100   : ExternalPressure"
 * Returns value in GPa, or null if not found.
 */
function parseExternalPressure(content: string): number | null {
  const match = content.match(/([\d.]+)\s*:\s*ExternalPressure\b/i);
  return match ? parseFloat(match[1]) : null;
}

/**
 * Extract pickUpGen and pickUpFolder from lines like:
 *   "5     : pickUpGen"
 *   "0     : pickUpFolder"
 * Returns { pickUpGen, pickUpFolder }; both default to 0 if not found.
 * isPickup is true when either value is non-zero.
 */
function parsePickup(content: string): { isPickup: boolean; pickUpGen: number; pickUpFolder: number } {
  const genMatch = content.match(/(\d+)\s*:\s*pickUpGen\b/i);
  const folderMatch = content.match(/(\d+)\s*:\s*pickUpFolder\b/i);
  const pickUpGen = genMatch ? parseInt(genMatch[1], 10) : 0;
  const pickUpFolder = folderMatch ? parseInt(folderMatch[1], 10) : 0;
  return { isPickup: pickUpGen !== 0 || pickUpFolder !== 0, pickUpGen, pickUpFolder };
}

export function parseParameters(content: string): ParsedParameters {
  // Extract element names
  const atomMatch = content.match(
    /%\s*atomType\s*\n([\s\S]*?)\n\s*%\s*EndAtomType/i
  );
  const elements = atomMatch
    ? atomMatch[1].trim().split(/\s+/).filter(Boolean)
    : [];

  const calculationType = parseCalculationType(content);
  const optType = parseOptType(content);
  const isVarcomp = calculationType > 0
    ? (calculationType % 10) === 1
    : false;
  const numComponents = elements.length;
  const externalPressure = parseExternalPressure(content);
  const { isPickup, pickUpGen, pickUpFolder } = parsePickup(content);

  return {
    elements,
    calculationType,
    optType,
    isVarcomp,
    numComponents,
    externalPressure,
    isPickup,
    pickUpGen,
    pickUpFolder,
  };
}
