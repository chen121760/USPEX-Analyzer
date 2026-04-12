import { useMemo, useState, useCallback } from 'react';
import { X, Eye } from 'lucide-react';
import { FormulaDisplay } from '@/components/FormulaDisplay';
import type { Structure, SystemInfo } from '@/types/structure';

interface Props {
  structure: Structure;
  allStructures: Structure[];
  systemInfo: SystemInfo;
  onClose: () => void;
  onSelect: (id: number) => void;
  onViewStructure: (id: number) => void;
}

interface TooltipState {
  s: Structure;
  x: number;
  y: number;
}

interface ChildBranch {
  partnerId: number | null;
  childIds: number[];
}

const NODE_WIDTH = 120;
const NODE_GAP = 12;

function getValidParentIds(s: Structure): number[] {
  if (!Array.isArray(s.parentIds)) return [];
  return s.parentIds.filter((pid) => Number.isFinite(pid) && pid > 0);
}

function buildChildrenMap(structures: Structure[]): Map<number, number[]> {
  const map = new Map<number, number[]>();

  for (const s of structures) {
    const parents = getValidParentIds(s);
    for (const pid of parents) {
      if (!map.has(pid)) map.set(pid, []);
      map.get(pid)!.push(s.id);
    }
  }

  for (const [pid, childIds] of map.entries()) {
    const deduped = Array.from(new Set(childIds)).sort((a, b) => a - b);
    map.set(pid, deduped);
  }

  return map;
}

function NodeCard({
  s,
  isCurrent,
  onSelect,
  onView,
  onHover,
  onLeave,
}: {
  s: Structure;
  isCurrent: boolean;
  onSelect: (id: number) => void;
  onView: (id: number) => void;
  onHover: (s: Structure, e: React.MouseEvent) => void;
  onLeave: () => void;
}) {
  return (
    <div
      onClick={() => onSelect(s.id)}
      onMouseEnter={(e) => onHover(s, e)}
      onMouseMove={(e) => onHover(s, e)}
      onMouseLeave={onLeave}
      style={{
        width: NODE_WIDTH,
        padding: '6px 8px',
        borderRadius: 6,
        cursor: 'pointer',
        userSelect: 'none',
        border: isCurrent
          ? '2px solid var(--color-primary)'
          : '1px solid var(--color-border)',
        background: isCurrent
          ? 'rgba(99,102,241,0.08)'
          : 'var(--color-surface)',
        flexShrink: 0,
      }}
    >
      <div style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>
        Gen{s.generation}
      </div>

      <div style={{ fontSize: 13, fontWeight: 700 }}>EA{s.id}</div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 6,
        }}
      >
        <span
          style={{
            fontSize: 10,
            color: 'var(--color-text-secondary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: 80,
          }}
          title={s.origin}
        >
          {s.origin}
        </span>

        {s.poscarData && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onView(s.id);
            }}
            title="View structure"
            style={{
              padding: 2,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--color-text-muted)',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <Eye size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

function GhostCard({ id }: { id: number }) {
  return (
    <div
      style={{
        width: NODE_WIDTH,
        padding: '6px 8px',
        borderRadius: 6,
        border: '1px dashed var(--color-border)',
        background: 'transparent',
        flexShrink: 0,
        opacity: 0.55,
      }}
    >
      <div
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: 'var(--color-text-muted)',
        }}
      >
        EA{id}
      </div>
      <div
        style={{
          fontSize: 10,
          color: 'var(--color-text-muted)',
          fontStyle: 'italic',
        }}
      >
        missing
      </div>
    </div>
  );
}

function NodeRow({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        gap: NODE_GAP,
        flexWrap: 'wrap',
        position: 'relative',
      }}
    >
      {children}
    </div>
  );
}

function Connector({ height = 24 }: { height?: number }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        height,
        position: 'relative',
      }}
    >
      <div
        style={{
          width: 2,
          height: '100%',
          background: 'var(--color-border)',
          borderRadius: 1,
        }}
      />
    </div>
  );
}

function YConnector({ parentCount }: { parentCount: number }) {
  const totalW = parentCount * NODE_WIDTH + (parentCount - 1) * NODE_GAP;
  const h = 32;
  const midX = totalW / 2;

  const paths: string[] = [];
  for (let i = 0; i < parentCount; i++) {
    const cx = NODE_WIDTH / 2 + i * (NODE_WIDTH + NODE_GAP);
    paths.push(`M ${cx} 0 C ${cx} ${h / 2} ${midX} ${h / 2} ${midX} ${h}`);
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center' }}>
      <svg width={totalW} height={h} style={{ overflow: 'visible' }}>
        {paths.map((d, i) => (
          <path
            key={i}
            d={d}
            fill="none"
            stroke="var(--color-border)"
            strokeWidth={2}
          />
        ))}
      </svg>
    </div>
  );
}

function FanConnector({ childCount }: { childCount: number }) {
  const totalW = childCount * NODE_WIDTH + (childCount - 1) * NODE_GAP;
  const h = 32;
  const rootX = totalW / 2;

  const paths: string[] = [];
  for (let i = 0; i < childCount; i++) {
    const cx = NODE_WIDTH / 2 + i * (NODE_WIDTH + NODE_GAP);
    paths.push(`M ${rootX} 0 C ${rootX} ${h / 2} ${cx} ${h / 2} ${cx} ${h}`);
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center' }}>
      <svg width={totalW} height={h} style={{ overflow: 'visible' }}>
        {paths.map((d, i) => (
          <path
            key={i}
            d={d}
            fill="none"
            stroke="var(--color-border)"
            strokeWidth={2}
          />
        ))}
      </svg>
    </div>
  );
}

// ── Recursive ancestor subtree component ──
// Renders a node and recursively renders its parents above it,
// using YConnector when a node has multiple parents (heredity).
function AncestorSubtree({
  id,
  visited,
  depth,
  maxDepth,
  renderNode,
  structureMap,
}: {
  id: number;
  visited: Set<number>;
  depth: number;
  maxDepth: number;
  renderNode: (id: number, isCurrent?: boolean) => React.ReactNode;
  structureMap: Map<number, Structure>;
}) {
  const node = structureMap.get(id);
  const parents = node
    ? getValidParentIds(node)
        .filter((pid) => !visited.has(pid))
        .sort((a, b) => a - b)
    : [];

  const showParents = depth < maxDepth && parents.length > 0;

  const nextVisited = new Set(visited);
  parents.forEach((pid) => nextVisited.add(pid));

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}
    >
      {showParents && (
        <>
          <div
            style={{
              display: 'flex',
              gap: NODE_GAP,
              alignItems: 'flex-end',
            }}
          >
            {parents.map((pid) => (
              <AncestorSubtree
                key={pid}
                id={pid}
                visited={nextVisited}
                depth={depth + 1}
                maxDepth={maxDepth}
                renderNode={renderNode}
                structureMap={structureMap}
              />
            ))}
          </div>
          {parents.length >= 2 ? (
            <YConnector parentCount={parents.length} />
          ) : (
            <Connector />
          )}
        </>
      )}
      {renderNode(id)}
    </div>
  );
}

export function LineagePanel({
  structure,
  allStructures,
  systemInfo,
  onClose,
  onSelect,
  onViewStructure,
}: Props) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const hasSecondObj = systemInfo.optimizationType === 'multi';
  const secondObjName = systemInfo.secondObjectiveName || '2nd';

  const structureMap = useMemo(() => {
    const map = new Map<number, Structure>();
    for (const s of allStructures) map.set(s.id, s);
    return map;
  }, [allStructures]);

  const childrenMap = useMemo(
    () => buildChildrenMap(allStructures),
    [allStructures],
  );

  const renderNode = useCallback(
    (id: number, isCurrent = false) => {
      const s = structureMap.get(id);
      if (!s) return <GhostCard key={id} id={id} />;
      return (
        <NodeCard
          key={id}
          s={s}
          isCurrent={isCurrent}
          onSelect={onSelect}
          onView={onViewStructure}
          onHover={(ss, e) => {
            const pad = 16;
            const width = 220;
            const height = 150;
            let x = e.clientX + 14;
            let y = e.clientY - 10;
            if (x + width > window.innerWidth - pad)
              x = window.innerWidth - width - pad;
            if (y + height > window.innerHeight - pad)
              y = window.innerHeight - height - pad;
            if (y < pad) y = pad;
            if (x < pad) x = pad;
            setTooltip({ s: ss, x, y });
          }}
          onLeave={() => setTooltip(null)}
        />
      );
    },
    [onSelect, onViewStructure, structureMap],
  );

  // Group direct children by partner (one layer only)
  const childBranches = useMemo((): ChildBranch[] => {
    const directChildren = (childrenMap.get(structure.id) ?? [])
      .slice()
      .sort((a, b) => a - b);
    const branchMap = new Map<number | null, number[]>();

    for (const childId of directChildren) {
      const child = structureMap.get(childId);
      if (!child) continue;
      const validParents = getValidParentIds(child);
      if (validParents.length >= 2) {
        const partnerId =
          validParents.find((pid) => pid !== structure.id) ?? null;
        if (!branchMap.has(partnerId)) branchMap.set(partnerId, []);
        branchMap.get(partnerId)!.push(childId);
      } else {
        if (!branchMap.has(null)) branchMap.set(null, []);
        branchMap.get(null)!.push(childId);
      }
    }

    const branches = Array.from(branchMap.entries()).map(
      ([partnerId, childIds]) => ({
        partnerId,
        childIds: childIds.slice().sort((a, b) => a - b),
      }),
    );

    branches.sort((a, b) => {
      if (a.partnerId == null && b.partnerId != null) return -1;
      if (a.partnerId != null && b.partnerId == null) return 1;
      if (a.partnerId == null && b.partnerId == null)
        return a.childIds[0] - b.childIds[0];
      return (a.partnerId as number) - (b.partnerId as number);
    });

    return branches;
  }, [childrenMap, structure.id, structureMap]);

  // Build ancestor info for the current node
  const directParents = useMemo(
    () => getValidParentIds(structure).sort((a, b) => a - b),
    [structure],
  );

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: 500,
        maxWidth: '96vw',
        background: 'var(--color-surface)',
        borderLeft: '1px solid var(--color-border)',
        boxShadow: '-4px 0 16px rgba(0,0,0,0.1)',
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: '1px solid var(--color-border)',
          flexShrink: 0,
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>
            EA{structure.id} Lineage
          </h3>
          <p
            style={{
              margin: '4px 0 0',
              fontSize: 12,
              color: 'var(--color-text-muted)',
            }}
          >
            <FormulaDisplay formula={structure.formula} /> · {structure.origin} · SG{structure.spaceGroup}
          </p>
        </div>

        <button
          className="btn btn-ghost btn-sm"
          onClick={onClose}
          style={{ padding: 4 }}
        >
          <X size={18} />
        </button>
      </div>

      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '20px 16px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        {/* ── Ancestors: recursive subtree ── */}
        {directParents.length > 0 && (
          <div
            style={{
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              marginBottom: 4,
            }}
          >
            <div
              style={{
                alignSelf: 'flex-start',
                marginBottom: 8,
                fontSize: 11,
                color: 'var(--color-text-muted)',
              }}
            >
              Ancestors
            </div>

            <div
              style={{
                display: 'flex',
                gap: NODE_GAP,
                alignItems: 'flex-end',
              }}
            >
              {directParents.map((pid) => {
                const visited = new Set<number>([structure.id, ...directParents]);
                return (
                  <AncestorSubtree
                    key={pid}
                    id={pid}
                    visited={visited}
                    depth={1}
                    maxDepth={8}
                    renderNode={renderNode}
                    structureMap={structureMap}
                  />
                );
              })}
            </div>

            {directParents.length >= 2 ? (
              <YConnector parentCount={directParents.length} />
            ) : (
              <Connector />
            )}
          </div>
        )}

        {/* ── Current node ── */}
        <NodeRow>{renderNode(structure.id, true)}</NodeRow>

        {/* ── Descendants (one layer, grouped by branch) ── */}
        <div
          style={{
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            marginTop: 8,
          }}
        >
          {childBranches.length === 0 ? (
            <>
              <Connector />
              <div
                style={{
                  marginTop: 4,
                  fontSize: 12,
                  color: 'var(--color-text-muted)',
                }}
              >
                No descendants
              </div>
            </>
          ) : (
            <>
              <Connector />
              <div
                style={{
                  border: '1.5px dashed var(--color-border)',
                  borderRadius: 8,
                  padding: '12px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 16,
                  width: '100%',
                }}
              >
                {childBranches.map((branch, bi) => (
                  <div
                    key={`branch-${bi}-${branch.partnerId ?? 'single'}`}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      width: '100%',
                    }}
                  >
                    {/* Header row: show partner if heredity */}
                    {branch.partnerId != null ? (
                      <>
                        <div
                          style={{
                            fontSize: 11,
                            color: 'var(--color-text-muted)',
                            marginBottom: 4,
                          }}
                        >
                          Heredity with EA{branch.partnerId}
                        </div>
                        <NodeRow>
                          {renderNode(structure.id)}
                          {renderNode(branch.partnerId)}
                        </NodeRow>
                        <YConnector parentCount={2} />
                      </>
                    ) : (
                      childBranches.length > 1 && (
                        <div
                          style={{
                            fontSize: 11,
                            color: 'var(--color-text-muted)',
                            marginBottom: 4,
                          }}
                        >
                          Single-parent
                        </div>
                      )
                    )}

                    {/* Children row — use simple connector when too many children */}
                    {branch.childIds.length > 4 ? (
                      <Connector />
                    ) : branch.childIds.length > 1 ? (
                      <FanConnector childCount={branch.childIds.length} />
                    ) : (
                      <Connector />
                    )}
                    <NodeRow>
                      {branch.childIds.map((id) => renderNode(id))}
                    </NodeRow>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {tooltip && (
        <div
          style={{
            position: 'fixed',
            left: tooltip.x,
            top: tooltip.y,
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 8,
            padding: '8px 12px',
            fontSize: 12,
            zIndex: 300,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            pointerEvents: 'none',
            minWidth: 190,
            maxWidth: 240,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 4 }}>
            EA{tooltip.s.id} · <FormulaDisplay formula={tooltip.s.formula} />
          </div>
          <div>Origin: {tooltip.s.origin}</div>
          <div>Gen: {tooltip.s.generation}</div>

          {tooltip.s.enthalpy < 900 && (
            <div>Enthalpy: {tooltip.s.enthalpy.toFixed(4)} eV/atom</div>
          )}

          <div>SG: {tooltip.s.spaceGroup}</div>
          <div>
            Fitness:{' '}
            {tooltip.s.fitness >= 0 ? tooltip.s.fitness.toFixed(4) : 'N/A'}
          </div>

          {hasSecondObj && tooltip.s.extraProps && (() => {
            const entry = Object.entries(tooltip.s.extraProps).find(([k]) => k.endsWith('-Pareto_ranking'));
            return entry ? <div>{secondObjName}: {entry[1].toFixed(3)}</div> : null;
          })()}
        </div>
      )}
    </div>
  );
}

