import { createContext, useContext, useMemo } from 'react';

export const HullMetricContext = createContext({ name: 'Fitness', unit: 'eV/block' });

export function useHullMetric() {
  const { name, unit } = useContext(HullMetricContext);
  return useMemo(() => ({ name, unit, header: `${name}(${unit})`, limitLabel: `${name} (${unit}) ≤` }), [name, unit]);
}
