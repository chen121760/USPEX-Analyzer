/**
 * Automatically keeps the moyo symmetry analysis in sync with the loaded data.
 *
 * Runs whenever the project data changes: new imports, restored projects,
 * workshop structures, or anything that adds structures without an analysis.
 * The bulk runner itself is idempotent, so calling it often is cheap.
 */

import { useEffect } from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import { startSymmetryAnalysis } from '@/domain/symmetry/runSymmetryAnalysis';

export function useSymmetryAutoAnalysis(): void {
  const isDataLoaded = useProjectStore((s) => s.isDataLoaded);
  const structures = useProjectStore((s) => s.structures);
  const userStructures = useProjectStore((s) => s.userStructures);
  const running = useProjectStore((s) => s.symmetryStatus.running);

  useEffect(() => {
    if (!isDataLoaded || running) return;
    startSymmetryAnalysis();
  }, [isDataLoaded, running, structures, userStructures]);
}
