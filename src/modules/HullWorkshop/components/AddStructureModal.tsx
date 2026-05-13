/**
 * Modal for manually adding a structure to the Hull Workshop.
 *
 * Required: composition (via formula or per-element inputs) + enthalpy.
 * Optional: space group, notes.
 * User-added structures have isUserAdded=true, so they do not define
 * the convex hull but still get eForm and hull-distance computed.
 */

import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Plus } from 'lucide-react';
import { buildFormula, totalAtoms } from '@/parsers/compositionUtils';

interface Props {
  open: boolean;
  elements: string[];
  onClose: () => void;
  onAdd: (data: ManualStructureData) => void;
}

export interface ManualStructureData {
  composition: number[];
  enthalpy: number;
  spaceGroup: number;
  notes: string;
}

/** Parse a formula like "Ti3H8" into element counts for the given element list. */
function parseFormula(formula: string, elements: string[]): number[] {
  const counts = new Array(elements.length).fill(0);
  if (!formula.trim()) return counts;
  // Sort elements by descending length to match longest symbols first (e.g. "Ta" before "T")
  const sorted = [...elements]
    .map((el, i) => ({ el, i, len: el.length }))
    .sort((a, b) => b.len - a.len);
  // Build regex alternation: (Ta|H|...)
  const pattern = new RegExp(`(${sorted.map((s) => s.el).join('|')})(\\d*)`, 'g');
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(formula)) !== null) {
    const sym = m[1];
    const count = m[2] ? parseInt(m[2], 10) : 1;
    const entry = sorted.find((s) => s.el === sym);
    if (entry) counts[entry.i] += count;
  }
  return counts;
}

export function AddStructureModal({ open, elements, onClose, onAdd }: Props) {
  const { t } = useTranslation();

  const [formulaInput, setFormulaInput] = useState('');
  const [composition, setComposition] = useState<number[]>(() => new Array(elements.length).fill(0));
  const [enthalpy, setEnthalpy] = useState('');
  const [spaceGroup, setSpaceGroup] = useState('');
  const [notes, setNotes] = useState('');

  // Reset form when modal opens
  const handleClose = () => {
    setFormulaInput('');
    setComposition(new Array(elements.length).fill(0));
    setEnthalpy('');
    setSpaceGroup('');
    setNotes('');
    onClose();
  };

  // Parse formula → update per-element inputs
  const handleFormulaChange = (value: string) => {
    setFormulaInput(value);
    const parsed = parseFormula(value, elements);
    if (parsed.some((c) => c > 0)) {
      setComposition(parsed);
    }
  };

  // Per-element input change → update formula
  const handleElementChange = (index: number, value: string) => {
    const n = parseInt(value, 10);
    const next = [...composition];
    next[index] = isNaN(n) ? 0 : Math.max(0, n);
    setComposition(next);
    if (next.some((c) => c > 0)) {
      setFormulaInput(buildFormula(next, elements));
    }
  };

  const enthalpyNum = parseFloat(enthalpy);
  const hasComposition = totalAtoms(composition) > 0;
  const hasEnthalpy = !isNaN(enthalpyNum);
  const canSubmit = hasComposition && hasEnthalpy;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onAdd({
      composition: [...composition],
      enthalpy: enthalpyNum,
      spaceGroup: spaceGroup.trim() ? parseInt(spaceGroup, 10) : 0,
      notes: notes.trim(),
    });
    handleClose();
  };

  // Preview formula
  const previewFormula = useMemo(
    () => (hasComposition ? buildFormula(composition, elements) : ''),
    [composition, elements, hasComposition],
  );

  if (!open) return null;

  return (
    <div className="workshop-modal-overlay" onClick={handleClose}>
      <div className="workshop-modal" style={{ width: 400 }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="workshop-modal-header">
          <Plus size={18} />
          <span style={{ fontWeight: 600 }}>{t('workshop.addStructure', 'Add Structure')}</span>
          <button className="workshop-modal-close" onClick={handleClose}>
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="workshop-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Formula input */}
          <div>
            <label style={labelStyle}>{t('workshop.formula')}</label>
            <input
              className="workshop-input"
              value={formulaInput}
              onChange={(e) => handleFormulaChange(e.target.value)}
              placeholder={elements.length === 2 ? `${elements[0]}2${elements[1]}3` : `${elements[0]}1${elements[1]}2${elements[2] ?? ''}3`}
            />
          </div>

          {/* Per-element inputs */}
          <div style={{ display: 'flex', gap: 10 }}>
            {elements.map((el, i) => (
              <div key={el} style={{ flex: 1 }}>
                <label style={labelStyle}>{el}</label>
                <input
                  className="workshop-input"
                  type="number"
                  min={0}
                  value={composition[i] || ''}
                  onChange={(e) => handleElementChange(i, e.target.value)}
                />
              </div>
            ))}
          </div>

          {/* Formula preview */}
          {hasComposition && (
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
              {previewFormula}
            </div>
          )}

          {/* Enthalpy (required) */}
          <div>
            <label style={labelStyle}>
              {t('workshop.enthalpyRequired', 'Enthalpy (eV/atom)')}
              <span style={{ color: 'var(--color-danger)' }}> *</span>
            </label>
            <input
              className="workshop-input"
              type="number"
              step="any"
              value={enthalpy}
              onChange={(e) => setEnthalpy(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && canSubmit) handleSubmit(); }}
              placeholder="-1.234"
            />
          </div>

          {/* Space Group (optional) */}
          <div>
            <label style={labelStyle}>{t('workshop.spaceGroup', 'Space Group')}</label>
            <input
              className="workshop-input"
              type="number"
              min={1}
              max={230}
              value={spaceGroup}
              onChange={(e) => setSpaceGroup(e.target.value)}
              placeholder="1–230"
            />
          </div>

          {/* Notes (optional) */}
          <div>
            <label style={labelStyle}>{t('workshop.notes', 'Notes')}</label>
            <input
              className="workshop-input"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('workshop.notesPlaceholder', 'e.g. known phase from literature')}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="workshop-modal-footer">
          <button className="workshop-btn" onClick={handleClose}>{t('btn.cancel')}</button>
          <button
            className="workshop-btn workshop-btn-primary"
            disabled={!canSubmit}
            onClick={handleSubmit}
          >
            <Plus size={16} />
            <span>{t('workshop.add')}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 500,
  color: 'var(--color-text-secondary)',
  marginBottom: 4,
};
