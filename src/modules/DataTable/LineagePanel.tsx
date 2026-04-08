import { useMemo, useState, useRef } from 'react';
import { X, Eye } from 'lucide-react';
import type { Structure } from '@/types/structure';
import { getAncestors, getDescendants, buildChildrenMap } from '@/lib/lineageUtils';
import { useUIStore } from '@/store/useUIStore';

interface Props {
  structure: Structure;
  allStructures: Structure[];
  onClose: () => void;
  onSelect: (id: number) => void;
}

interface TooltipState {
  id: number;
  x: number;
  y: number;
}

function NodeTooltip({ id, structureMap }: { id: number; structureMap: Map<number, Structure> }) {
  const s = structureMap.get(id);
  if (!s) return <div style={{ padding: '6px 10px', fontSize: 12 }}>EA{id} — not in dataset</div>;
  return (
    <div style={{ padding: '8px 12px', fontSize: 12, lineHeight: 1.6 }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>EA{s.id} · {s.formula}</div>
      <div>Origin: <span style={{ color: 'var(--color-primary)' }}>{s.origin}</span></div>
      <div>Gen: {s.generation}</div>
      <div>SG: {s.spaceGroup}</div>
      <div>H: {s.enthalpy < 900 ? `${s.enthalpy.toFixed(4)} eV/atom` : '—'}</div>
      {s.fitness >= 0 && <div>Fitness: {s.fitness.toFixed(4)}</div>}
      {!s.poscarData && <div style={{ color: 'var(--color-text-muted)', fontStyle: 'italic', marginTop: 4 }}>No POSCAR data</div>}
    </div>
  );
}

function TreeNode({
  id,
  depth,
  isCurrent,
  structureMap,
  onSelect,
  onHover,
  onLeave,
}: {
  id: number;
  depth: number;
  isCurrent: boolean;
  structureMap: Map<number, Structure>;
  onSelect: (id: number) => void;
  onHover: (id: number, el: HTMLElement) => void;
  onLeave: () => void;
}) {
  const openViewer = useUIStore((s) => s.openViewer);
  const s = structureMap.get(id);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        paddingLeft: 8 + depth * 18,
        paddingTop: 3,
        paddingBottom: 3,
        paddingRight: 8,
        borderRadius: 4,
        border: isCurrent ? '2px solid var(--color-primary)' : '2px solid transparent',
        background: isCurrent ? 'rgba(99,102,241,0.08)' : 'transparent',
        cursor: 'pointer',
        transition: 'background 0.1s',
        position: 'relative',
      }}
      onClick={() => !isCurrent && onSelect(id)}
      onMouseEnter={(e) => onHover(id, e.currentTarget)}
      onMouseLeave={onLeave}
    >
      {/* connector line */}
      {depth > 0 && (
        <span style={{
          position: 'absolute',
          left: 8 + (depth - 1) * 18 + 7,
          top: 0,
          bottom: '50%',
          width: 1,
          background: 'var(--color-border)',
          pointerEvents: 'none',
        }} />
      )}
      {depth > 0 && (
        <span style={{
          position: 'absolute',
          left: 8 + (depth - 1) * 18 + 7,
          top: '50%',
          width: 11,
          height: 1,
          background: 'var(--color-border)',
          pointerEvents: 'none',
        }} />
      )}

      <span style={{
        fontWeight: isCurrent ? 700 : 500,
        fontSize: 12,
        color: s ? 'var(--color-text)' : 'var(--color-text-muted)',
        minWidth: 44,
      }}>
        {isCurrent ? '★ ' : ''}EA{id}
      </span>

      {s ? (
        <span style={{ fontSize: 11, color: 'var(--color-text-muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {s.origin} · SG{s.spaceGroup}
        </span>
      ) : (
        <span style={{ fontSize: 11, color: 'var(--color-text-muted)', fontStyle: 'italic' }}>not in dataset</span>
      )}

      {s?.poscarData && (
        <button
          className="btn btn-ghost btn-sm"
          style={{ padding: '1px 4px', flexShrink: 0 }}
          title="View structure"
          onClick={(e) => { e.stopPropagation(); openViewer(id); }}
        >
          <Eye size={12} />
        </button>
      )}
    </div>
  );
}

export function LineagePanel({ structure, allStructures, onClose, onSelect }: Props) {
  const [showAllDescendants, setShowAllDescendants] = useState(false);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const structureMap = useMemo(() => {
    const m = new Map<number, Structure>();
    for (const s of allStructures) m.set(s.id, s);
    return m;
  }, [allStructures]);

  const childrenMap = useMemo(() => buildChildrenMap(allStructures), [allStructures]);

  const ancestors = useMemo(
    () => getAncestors(structure.id, structureMap, 5),
    [structure.id, structureMap],
  );

  const descendants = useMemo(
    () => getDescendants(structure.id, childrenMap, showAllDescendants ? 10 : 3),
    [structure.id, childrenMap, showAllDescendants],
  );

  const directChildCount = (childrenMap.get(structure.id) ?? []).length;

  function handleHover(id: number, el: HTMLElement) {
    const panelRect = panelRef.current?.getBoundingClientRect();
    const nodeRect = el.getBoundingClientRect();
    if (!panelRect) return;
    setTooltip({
      id,
      x: 0,
      y: nodeRect.bottom - panelRect.top + 4,
    });
  }

  const nodeProps = {
    structureMap,
    onSelect,
    onHover: handleHover,
    onLeave: () => setTooltip(null),
  };

  // Build ancestor chain: deepest ancestor first (top of tree)
  const ancestorChain = [...ancestors].reverse();

  return (
    <div
      ref={panelRef}
      style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 380, maxWidth: '90vw',
        background: 'var(--color-surface)',
        borderLeft: '1px solid var(--color-border)',
        boxShadow: '-4px 0 16px rgba(0,0,0,0.12)',
        zIndex: 100,
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px',
        borderBottom: '1px solid var(--color-border)',
        flexShrink: 0,
      }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>EA{structure.id} Lineage</div>
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>
            {structure.formula} · {structure.origin} · SG{structure.spaceGroup}
          </div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={onClose} style={{ padding: 4 }}>
          <X size={16} />
        </button>
      </div>

      {/* Tree */}
      <div style={{ flex: 1, overflow: 'auto', padding: '10px 0', position: 'relative' }}>

        {/* Ancestors section */}
        {ancestorChain.length > 0 && (
          <div style={{ marginBottom: 4 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', padding: '0 14px 4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Ancestors ({ancestors.length})
            </div>
            {ancestorChain.map((a) => (
              <TreeNode key={`anc-${a.id}`} id={a.id} depth={0} isCurrent={false} {...nodeProps} />
            ))}
          </div>
        )}

        {/* Divider before current */}
        {ancestorChain.length > 0 && (
          <div style={{ height: 1, background: 'var(--color-border)', margin: '4px 14px' }} />
        )}

        {/* Current node */}
        <TreeNode key="current" id={structure.id} depth={0} isCurrent={true} {...nodeProps} />

        {/* Divider after current */}
        {descendants.length > 0 && (
          <div style={{ height: 1, background: 'var(--color-border)', margin: '4px 14px' }} />
        )}

        {/* Descendants section */}
        {descendants.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', padding: '4px 14px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Descendants (direct: {directChildCount}, shown: {descendants.length})
            </div>
            {descendants.map((d) => (
              <TreeNode key={`desc-${d.id}`} id={d.id} depth={d.depth} isCurrent={false} {...nodeProps} />
            ))}
            {!showAllDescendants && directChildCount > 0 && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setShowAllDescendants(true)}
                style={{ margin: '6px 14px', fontSize: 11 }}
              >
                Show more levels…
              </button>
            )}
          </div>
        )}

        {descendants.length === 0 && ancestors.length === 0 && (
          <div style={{ padding: '8px 14px', fontSize: 12, color: 'var(--color-text-muted)' }}>
            No lineage data available (origin: {structure.origin})
          </div>
        )}

        {/* Tooltip */}
        {tooltip !== null && (
          <div style={{
            position: 'absolute',
            left: 14,
            top: tooltip.y,
            zIndex: 200,
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 6,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            minWidth: 180,
            maxWidth: 280,
            pointerEvents: 'none',
          }}>
            <NodeTooltip id={tooltip.id} structureMap={structureMap} />
          </div>
        )}
      </div>
    </div>
  );
}
