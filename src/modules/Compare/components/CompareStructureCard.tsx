import { Eye, X } from 'lucide-react';
import { FormulaDisplay } from '@/components/FormulaDisplay';
import { useUIStore } from '@/store/useUIStore';
import type { Structure } from '@/types/structure';

export function CompareStructureCard({
  structure,
  onRemove,
}: {
  structure: Structure;
  onRemove: () => void;
}) {
  const openViewer = useUIStore((s) => s.openViewer);

  return (
    <div className="card" style={{ position: 'relative', flex: 1, minWidth: 200 }}>
      <button
        onClick={onRemove}
        className="btn btn-ghost btn-sm"
        style={{ position: 'absolute', top: 6, right: 6, padding: 2 }}
        title="Remove"
      >
        <X size={14} />
      </button>

      <div style={{ textAlign: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>EA{structure.id}</div>
        <div style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>
          <FormulaDisplay formula={structure.formula} />
        </div>
        <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
          SG {structure.spaceGroup}
        </div>
      </div>

      {structure.poscarData && (
        <div style={{ textAlign: 'center', marginBottom: 12 }}>
          <button
            className="btn btn-outline btn-sm"
            onClick={() => openViewer(structure.id)}
          >
            <Eye size={14} />
            3D
          </button>
        </div>
      )}
    </div>
  );
}
