import { useState } from 'react';
import { clampFitnessLimit } from './ternaryPlotModel';

export interface FitnessLimitProps {
  fitnessLimit?: number | null;
  onFitnessLimitChange?: (value: number) => void;
}

/** null means show the full dataset; a chosen limit follows updates without exceeding the available range. */
export function useFitnessLimit(maxFitness: number, { fitnessLimit, onFitnessLimitChange }: FitnessLimitProps) {
  const [localLimit, setLocalLimit] = useState<number | null>(null);
  const requested = onFitnessLimitChange ? fitnessLimit : localLimit;
  const value = clampFitnessLimit(requested ?? maxFitness, maxFitness);
  const change = (next: number) => {
    if (!Number.isFinite(next)) return;
    const clamped = clampFitnessLimit(next, maxFitness);
    if (onFitnessLimitChange) onFitnessLimitChange(clamped);
    else setLocalLimit(clamped);
  };
  return { fitnessMax: value, handleFitnessChange: change };
}
