import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  getLegacyUIValue,
  isBoolean,
  isNullableNumber,
  isNumber,
  isNumberArray,
  isString,
} from '@/store/uiPersistence';

interface ChartSettingsState {
  explorerXKey: string;
  setExplorerXKey: (key: string) => void;
  explorerYKey: string;
  setExplorerYKey: (key: string) => void;
  explorerColorKey: string;
  setExplorerColorKey: (key: string) => void;
  explorerShowXMarginal: boolean;
  setExplorerShowXMarginal: (value: boolean) => void;
  explorerShowYMarginal: boolean;
  setExplorerShowYMarginal: (value: boolean) => void;
  explorerMarginalBins: number;
  setExplorerMarginalBins: (value: number) => void;
  explorerXMarginalExcludeZero: boolean;
  setExplorerXMarginalExcludeZero: (value: boolean) => void;
  explorerYMarginalExcludeZero: boolean;
  setExplorerYMarginalExcludeZero: (value: boolean) => void;

  betaXKey: string;
  setBetaXKey: (key: string) => void;
  betaYKey: string;
  setBetaYKey: (key: string) => void;
  betaColorKey: string;
  setBetaColorKey: (key: string) => void;
  betaXMinimize: boolean;
  setBetaXMinimize: (value: boolean) => void;
  betaYMinimize: boolean;
  setBetaYMinimize: (value: boolean) => void;
  betaColorByFront: boolean;
  setBetaColorByFront: (value: boolean) => void;
  betaNumFronts: number;
  setBetaNumFronts: (value: number) => void;
  betaRefMode: 'auto' | 'manual';
  setBetaRefMode: (value: 'auto' | 'manual') => void;
  betaRefX: number | null;
  setBetaRefX: (value: number | null) => void;
  betaRefY: number | null;
  setBetaRefY: (value: number | null) => void;
  betaShowXMarginal: boolean;
  setBetaShowXMarginal: (value: boolean) => void;
  betaShowYMarginal: boolean;
  setBetaShowYMarginal: (value: boolean) => void;
  betaMarginalBins: number;
  setBetaMarginalBins: (value: number) => void;
  betaXMarginalExcludeZero: boolean;
  setBetaXMarginalExcludeZero: (value: boolean) => void;
  betaYMarginalExcludeZero: boolean;
  setBetaYMarginalExcludeZero: (value: boolean) => void;

  paretoSelectedFronts: number[];
  setParetoSelectedFronts: (fronts: number[]) => void;
  paretoShowLines: boolean;
  setParetoShowLines: (show: boolean) => void;
}

function isBetaRefMode(value: unknown): value is ChartSettingsState['betaRefMode'] {
  return value === 'auto' || value === 'manual';
}

export const useChartSettingsStore = create<ChartSettingsState>()(
  persist(
    (set) => ({
      explorerXKey: getLegacyUIValue('explorerXKey', 'fitness', isString),
      setExplorerXKey: (key) => set({ explorerXKey: key }),
      explorerYKey: getLegacyUIValue('explorerYKey', 'enthalpy', isString),
      setExplorerYKey: (key) => set({ explorerYKey: key }),
      explorerColorKey: getLegacyUIValue('explorerColorKey', 'origin', isString),
      setExplorerColorKey: (key) => set({ explorerColorKey: key }),
      explorerShowXMarginal: getLegacyUIValue('explorerShowXMarginal', false, isBoolean),
      setExplorerShowXMarginal: (value) => set({ explorerShowXMarginal: value }),
      explorerShowYMarginal: getLegacyUIValue('explorerShowYMarginal', false, isBoolean),
      setExplorerShowYMarginal: (value) => set({ explorerShowYMarginal: value }),
      explorerMarginalBins: getLegacyUIValue('explorerMarginalBins', 30, isNumber),
      setExplorerMarginalBins: (value) => set({ explorerMarginalBins: value }),
      explorerXMarginalExcludeZero: getLegacyUIValue('explorerXMarginalExcludeZero', false, isBoolean),
      setExplorerXMarginalExcludeZero: (value) => set({ explorerXMarginalExcludeZero: value }),
      explorerYMarginalExcludeZero: getLegacyUIValue('explorerYMarginalExcludeZero', false, isBoolean),
      setExplorerYMarginalExcludeZero: (value) => set({ explorerYMarginalExcludeZero: value }),

      betaXKey: getLegacyUIValue('betaXKey', 'fitness', isString),
      setBetaXKey: (key) => set({ betaXKey: key }),
      betaYKey: getLegacyUIValue('betaYKey', 'enthalpy', isString),
      setBetaYKey: (key) => set({ betaYKey: key }),
      betaColorKey: getLegacyUIValue('betaColorKey', '', isString),
      setBetaColorKey: (key) => set({ betaColorKey: key }),
      betaXMinimize: getLegacyUIValue('betaXMinimize', true, isBoolean),
      setBetaXMinimize: (value) => set({ betaXMinimize: value }),
      betaYMinimize: getLegacyUIValue('betaYMinimize', true, isBoolean),
      setBetaYMinimize: (value) => set({ betaYMinimize: value }),
      betaColorByFront: getLegacyUIValue('betaColorByFront', true, isBoolean),
      setBetaColorByFront: (value) => set({ betaColorByFront: value }),
      betaNumFronts: getLegacyUIValue('betaNumFronts', 1, isNumber),
      setBetaNumFronts: (value) => set({ betaNumFronts: value }),
      betaRefMode: getLegacyUIValue('betaRefMode', 'auto', isBetaRefMode),
      setBetaRefMode: (value) => set({ betaRefMode: value }),
      betaRefX: getLegacyUIValue('betaRefX', null, isNullableNumber),
      setBetaRefX: (value) => set({ betaRefX: value }),
      betaRefY: getLegacyUIValue('betaRefY', null, isNullableNumber),
      setBetaRefY: (value) => set({ betaRefY: value }),
      betaShowXMarginal: getLegacyUIValue('betaShowXMarginal', false, isBoolean),
      setBetaShowXMarginal: (value) => set({ betaShowXMarginal: value }),
      betaShowYMarginal: getLegacyUIValue('betaShowYMarginal', false, isBoolean),
      setBetaShowYMarginal: (value) => set({ betaShowYMarginal: value }),
      betaMarginalBins: getLegacyUIValue('betaMarginalBins', 30, isNumber),
      setBetaMarginalBins: (value) => set({ betaMarginalBins: value }),
      betaXMarginalExcludeZero: getLegacyUIValue('betaXMarginalExcludeZero', false, isBoolean),
      setBetaXMarginalExcludeZero: (value) => set({ betaXMarginalExcludeZero: value }),
      betaYMarginalExcludeZero: getLegacyUIValue('betaYMarginalExcludeZero', false, isBoolean),
      setBetaYMarginalExcludeZero: (value) => set({ betaYMarginalExcludeZero: value }),

      paretoSelectedFronts: getLegacyUIValue('paretoSelectedFronts', [], isNumberArray),
      setParetoSelectedFronts: (fronts) => set({ paretoSelectedFronts: fronts }),
      paretoShowLines: getLegacyUIValue('paretoShowLines', true, isBoolean),
      setParetoShowLines: (show) => set({ paretoShowLines: show }),
    }),
    {
      name: 'uspex-chart-settings-state',
      version: 1,
      partialize: (state) => ({
        explorerXKey: state.explorerXKey,
        explorerYKey: state.explorerYKey,
        explorerColorKey: state.explorerColorKey,
        explorerShowXMarginal: state.explorerShowXMarginal,
        explorerShowYMarginal: state.explorerShowYMarginal,
        explorerMarginalBins: state.explorerMarginalBins,
        explorerXMarginalExcludeZero: state.explorerXMarginalExcludeZero,
        explorerYMarginalExcludeZero: state.explorerYMarginalExcludeZero,
        betaXKey: state.betaXKey,
        betaYKey: state.betaYKey,
        betaColorKey: state.betaColorKey,
        betaXMinimize: state.betaXMinimize,
        betaYMinimize: state.betaYMinimize,
        betaColorByFront: state.betaColorByFront,
        betaNumFronts: state.betaNumFronts,
        betaRefMode: state.betaRefMode,
        betaRefX: state.betaRefX,
        betaRefY: state.betaRefY,
        betaShowXMarginal: state.betaShowXMarginal,
        betaShowYMarginal: state.betaShowYMarginal,
        betaMarginalBins: state.betaMarginalBins,
        betaXMarginalExcludeZero: state.betaXMarginalExcludeZero,
        betaYMarginalExcludeZero: state.betaYMarginalExcludeZero,
        paretoSelectedFronts: state.paretoSelectedFronts,
        paretoShowLines: state.paretoShowLines,
      }),
    },
  ),
);
