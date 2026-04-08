import { useMemo, useState } from 'react';
import { X, ArrowUp, ArrowDown } from 'lucide-react';
import type { Structure } from '@/types/structure';
import { getAncestors, getDescendants, buildChildrenMap } from '@/lib/lineageUtils';

interface Props {
  structure: Structure;
  allStructures: Structure[];
  onClose: () => void;
  onSelect: (id: number) => void; // 点击某个节点时，可以切换查看对象
}

export function LineagePanel({ structure, allStructures, onClose, onSelect }: Props) {
  const [showAllDescendants, setShowAllDescendants] = useState(false);

  // 构建查找表
  const structureMap = useMemo(() => {
    const m = new Map<number, Structure>();
    for (const s of allStructures) m.set(s.id, s);
    return m;
  }, [allStructures]);

  const childrenMap = useMemo(() => buildChildrenMap(allStructures), [allStructures]);

  // 祖先链
  const ancestors = useMemo(
    () => getAncestors(structure.id, structureMap),
    [structure.id, structureMap],
  );

  // 后代
  const descendants = useMemo(
    () => getDescendants(structure.id, childrenMap, showAllDescendants ? 10 : 2),
    [structure.id, childrenMap, showAllDescendants],
  );

  // 直接父代
  const directParents = structure.parentIds.filter((pid) => pid > 0);

  // 直接子代数量
  const directChildCount = (childrenMap.get(structure.id) ?? []).length;

  const renderNode = (id: number, depth: number, prefix: string) => {
    const s = structureMap.get(id);
    if (!s) {
      return (
        <div
          key={`${prefix}-${id}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '4px 8px',
            paddingLeft: 8 + depth * 20,
            borderRadius: 4,
            fontSize: 12,
            color: 'var(--color-text)',
            opacity: 0.5,
          }}
        >
          <span style={{ fontWeight: 600, minWidth: 50 }}>EA{id}</span>
          <span style={{ color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
            Not in extended_convex_hull
          </span>
        </div>
      );
    }

    return (
      <div
        key={`${prefix}-${id}`}
        onClick={() => onSelect(id)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '4px 8px',
          paddingLeft: 8 + depth * 20,
          borderRadius: 4,
          cursor: 'pointer',
          fontSize: 12,
          color: 'var(--color-text)',
          transition: 'background 0.1s',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-bg)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        <span style={{ fontWeight: 600, minWidth: 50 }}>EA{s.id}</span>
        <span style={{ color: 'var(--color-text-muted)', minWidth: 80 }}>{s.origin}</span>
        <span style={{ color: 'var(--color-text-muted)', minWidth: 60 }}>SG{s.spaceGroup}</span>
        <span style={{ color: s.enthalpy < 900 ? 'var(--color-text)' : 'var(--color-danger)' }}>
          {s.enthalpy < 900 ? s.enthalpy.toFixed(4) : '—'}
        </span>
      </div>
    );
  };

  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0,
      width: 420, maxWidth: '90vw',
      background: 'var(--color-surface)',
      borderLeft: '1px solid var(--color-border)',
      boxShadow: '-4px 0 16px rgba(0,0,0,0.1)',
      zIndex: 100,
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* 头部 */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px',
        borderBottom: '1px solid var(--color-border)',
      }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>
            EA{structure.id} 谱系 / Lineage
          </h3>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--color-text-muted)' }}>
            {structure.formula} · {structure.origin} · SG{structure.spaceGroup}
          </p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={onClose} style={{ padding: 4 }}>
          <X size={18} />
        </button>
      </div>

      {/* 内容区 */}
      <div style={{ flex: 1, overflow: 'auto', padding: '12px 0' }}>
        {/* 祖先区 */}
        <div style={{ padding: '0 16px', marginBottom: 16 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            fontSize: 13, fontWeight: 600, marginBottom: 8,
            color: 'var(--color-text-secondary)',
          }}>
            <ArrowUp size={14} />
            祖先 / Ancestors ({ancestors.length})
          </div>

          {directParents.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', padding: '4px 8px' }}>
              无父代（{structure.origin}）
            </p>
          ) : (
            <>
              {/* 按深度排序，深度大的在上面（最远的祖先在最上面） */}
              {[...ancestors].reverse().map((a) => renderNode(a.id, 0, 'anc'))}
              {ancestors.length === 0 && directParents.map((pid) => renderNode(pid, 0, 'par'))}
            </>
          )}
        </div>

        {/* 当前结构（高亮） */}
        <div style={{
          margin: '0 16px 16px',
          padding: '8px 12px',
          borderRadius: 6,
          border: '2px solid var(--color-primary)',
          background: 'rgba(99, 102, 241, 0.08)',
          fontSize: 13,
          fontWeight: 600,
        }}>
          ★ EA{structure.id} — {structure.formula}
          <span style={{ fontWeight: 400, color: 'var(--color-text-secondary)', marginLeft: 8 }}>
            {structure.origin} · {structure.enthalpy < 900 ? `${structure.enthalpy.toFixed(4)} eV/atom` : '—'}
          </span>
        </div>

        {/* 后代区 */}
        <div style={{ padding: '0 16px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            fontSize: 13, fontWeight: 600, marginBottom: 8,
            color: 'var(--color-text-secondary)',
          }}>
            <ArrowDown size={14} />
            后代 / Descendants
            <span style={{ fontWeight: 400, fontSize: 12 }}>
              （直接子代 {directChildCount} 个，共 {descendants.length} 个）
            </span>
          </div>

          {descendants.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', padding: '4px 8px' }}>
              无后代
            </p>
          ) : (
            <>
              {descendants.map((d) => renderNode(d.id, d.depth - 1, 'desc'))}

              {!showAllDescendants && descendants.length > 0 && (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setShowAllDescendants(true)}
                  style={{ marginTop: 8, fontSize: 12 }}
                >
                  展开更多层级...
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
