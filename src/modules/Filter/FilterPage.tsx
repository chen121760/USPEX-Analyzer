import { useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '@/store/useProjectStore';
import { useUIStore } from '@/store/useUIStore';
import { X, Plus, Download } from 'lucide-react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { buildSeedsFile } from '@/lib/poscarWriter';
import type { Structure, FilterCondition } from '@/types/structure';


const NUMERIC_FIELDS = [
  'fitness', 'enthalpy', 'volume', 'density', 'spaceGroup', 'generation',
  'youngModulus', 'bulkModulus', 'shearModulus', 'poissonRatio',
  'vickersHardness', 'fractureToughness', 'qEntropy', 'aOrder', 'sOrder',
  'paretoFront', 'secondObjective',
];

const OPERATORS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'] as const;

function toSortableNumber(value: unknown): number {
  if (value == null) return Number.POSITIVE_INFINITY;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

function applyCondition(s: Structure, cond: FilterCondition): boolean {
  const val = (s as unknown as Record<string, unknown>)[cond.field];
  if (val == null) return false;

  const num = Number(val);
  if (isNaN(num)) return false;
  const target = Number(cond.value);

  switch (cond.operator) {
    case 'eq': return num === target;
    case 'neq': return num !== target;
    case 'gt': return num > target;
    case 'gte': return num >= target;
    case 'lt': return num < target;
    case 'lte': return num <= target;
    case 'contains': return String(val).toLowerCase().includes(String(cond.value).toLowerCase());
    default: return true;
  }
}

function applyAllConditions(s: Structure, conditions: FilterCondition[]): boolean {
  return conditions.every((c) => applyCondition(s, c));
}

function buildFilename(
  index: number,
  s: Structure,
  nameParts: number[],
  padding: number,
  prefix: string,
): string {
  const segments: string[] = [];

  for (const part of nameParts) {
    switch (part) {
      case 1: segments.push(String(index + 1).padStart(padding, '0')); break;
      case 2: segments.push(`EA${s.id}`); break;
      case 3: segments.push(`SG${s.spaceGroup}`); break;
      case 4: segments.push(`Ed${s.fitness >= 0 ? s.fitness.toFixed(4) : 'NA'}`); break;
      case 5: {
        const paretoVal = s.extraProps
          ? Object.entries(s.extraProps).find(([k]) => k.endsWith('-Pareto_ranking'))?.[1]
          : undefined;
        segments.push(`${prefix}${paretoVal != null ? paretoVal.toFixed(1) : 'NA'}`);
        break;
      }
      case 6: segments.push(s.formula || 'Unknown'); break;
    }
  }

  return segments.join('-') + '.vasp';
}

export function FilterPage() {
  const { t } = useTranslation();
  const structures = useProjectStore((s) => s.structures);
  const systemInfo = useProjectStore((s) => s.systemInfo);
  const tags = useProjectStore((s) => s.tags);

  // 从 UIStore 读取所有筛选状态（这样切换页面再回来，状态还在）
  // 原来这里用的是 useState，每次离开页面状态就丢了
  // 现在改成从 UIStore 读，UIStore 会自动存到 localStorage
  const conditions      = useUIStore((s) => s.filterConditions);
  const setConditions   = useUIStore((s) => s.setFilterConditions);
  const tagStates       = useUIStore((s) => s.filterTagStates);
  const setTagStates    = useUIStore((s) => s.setFilterTagStates);
  const exportFormat    = useUIStore((s) => s.filterExportFormat);
  const setExportFormat = useUIStore((s) => s.setFilterExportFormat);
  const nameParts       = useUIStore((s) => s.filterNameParts);
  const setNameParts    = useUIStore((s) => s.setFilterNameParts);
  const sortKey         = useUIStore((s) => s.filterSortKey);
  const setSortKey      = useUIStore((s) => s.setFilterSortKey);
  const sortReverse     = useUIStore((s) => s.filterSortReverse);
  const setSortReverse  = useUIStore((s) => s.setFilterSortReverse);

  // secondObjPrefix 不需要持久化，保持简单
  const secondObjPrefix = 'Obj';

  // 点击标签时，循环切换三种状态：灰 → 绿（include）→ 红（exclude）→ 灰
  const handleTagClick = (tagId: string) => {
    // 读取当前状态（undefined = 灰色）
    const currentState = tagStates[tagId]

    if (currentState === undefined) {
      // 灰色 → 绿色
      setTagStates({ ...tagStates, [tagId]: 'include' })
    } else if (currentState === 'include') {
      // 绿色 → 红色
      setTagStates({ ...tagStates, [tagId]: 'exclude' })
    } else {
      // 红色 → 灰色：从字典里删掉这个 key
      const next = { ...tagStates }
      delete next[tagId]
      setTagStates(next)
    }
  }

  const addCondition = () => {
    setConditions([...conditions, { field: 'spaceGroup', operator: 'gte', value: 1 }]);
  };

  const removeCondition = (idx: number) => {
    setConditions(conditions.filter((_, i) => i !== idx));
  };

  const updateCondition = (idx: number, key: keyof FilterCondition, value: unknown) => {
    const updated = [...conditions];
    (updated[idx] as unknown as Record<string, unknown>)[key] = value;
    setConditions(updated);
  };

  const filteredStructures = useMemo(() => {
    let result = structures;

    // 从 tagStates 字典里分别提取"必须含有"和"必须排除"的标签 id 列表
    const includedTagIds = Object.entries(tagStates)
      .filter(([, state]) => state === 'include')
      .map(([id]) => id)

    const excludedTagIds = Object.entries(tagStates)
      .filter(([, state]) => state === 'exclude')
      .map(([id]) => id)

    // 包含过滤：结构必须同时拥有所有绿色标签
    if (includedTagIds.length > 0) {
      result = result.filter((s) =>
        includedTagIds.every((tagId) => s.tags.includes(tagId))
      );
    }

    // 排除过滤：结构不能含有任何红色标签
    if (excludedTagIds.length > 0) {
      result = result.filter((s) =>
        excludedTagIds.every((tagId) => !s.tags.includes(tagId))
      );
    }

    // 数值条件过滤
    if (conditions.length > 0) {
      result = result.filter((s) => applyAllConditions(s, conditions));
    }

    return result;
  // tagStates 包含了所有标签状态，conditions 是数值筛选条件，都要放进依赖数组
  }, [structures, conditions, tagStates]);


  // Sort
  const sortedStructures = useMemo(() => {
    const sorted = [...filteredStructures].sort((a, b) => {
      const av = (a as unknown as Record<string, unknown>)[sortKey];
      const bv = (b as unknown as Record<string, unknown>)[sortKey];
      const na = toSortableNumber(av);
      const nb = toSortableNumber(bv);
      return na - nb;
    });
    return sortReverse ? sorted.reverse() : sorted;
  }, [filteredStructures, sortKey, sortReverse]);

  // Export handler
  const handleExport = useCallback(async () => {
    if (sortedStructures.length === 0) return;

    const padding = String(sortedStructures.length).length;

    if (exportFormat === 'zip') {
      const zip = new JSZip();
      sortedStructures.forEach((s, i) => {
        if (!s.poscarData) return;
        const fname = buildFilename(i, s, nameParts, padding, secondObjPrefix);
        zip.file(fname, s.poscarData);
      });
      const blob = await zip.generateAsync({ type: 'blob' });
      saveAs(blob, `uspex-structures-${sortedStructures.length}.zip`);
    } else if (exportFormat === 'seeds') {
      const content = buildSeedsFile(sortedStructures);
      const blob = new Blob([content], { type: 'text/plain' });
      saveAs(blob, 'seeds.txt');
    } else if (exportFormat === 'csv') {
      const fmtVal = (v: number) => v < 900 ? v.toFixed(4) : '';
      const headers = ['ID', 'Formula', 'SpaceGroup', 'Generation', 'Enthalpy', 'Volume', 'Fitness', 'Density', 'Origin'];
      const rows = sortedStructures.map((s) =>
        [s.id, s.formula, s.spaceGroup, s.generation, fmtVal(s.enthalpy), fmtVal(s.volume), fmtVal(s.fitness), fmtVal(s.density), s.origin].join(','),
      );
      const csv = [headers.join(','), ...rows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      saveAs(blob, 'structures.csv');
    } else if (exportFormat === 'json') {
      const project = useProjectStore.getState().exportProjectFile();
      const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
      saveAs(blob, `uspex-project-${systemInfo?.elements.join('-') ?? 'data'}.json`);
    }
  }, [sortedStructures, exportFormat, nameParts, secondObjPrefix, systemInfo]);

  const toggleNamePart = (part: number) => {
    // UIStore 的 setter 只接受新值，不接受函数，所以先计算出新数组再传入
    const next = nameParts.includes(part)
      ? nameParts.filter((p) => p !== part)
      : [...nameParts, part].sort();
    setNameParts(next);
  };

  const selectStyle: React.CSSProperties = {
    padding: '5px 8px',
    border: '1px solid var(--color-border)',
    borderRadius: 6,
    fontSize: 12,
    background: 'var(--color-bg)',
    color: 'var(--color-text)',
  };

  const inputStyle: React.CSSProperties = {
    ...selectStyle,
    width: 100,
  };

  // Preview filename
  const previewName = sortedStructures.length > 0
    ? buildFilename(0, sortedStructures[0], nameParts, String(sortedStructures.length).length, secondObjPrefix)
    : '001-EA2-Ti10H28-SG82.vasp';

  return (
    <div className="fade-in">
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>{t('filter.title')}</h2>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Left: Filter conditions */}
        <div className="card">
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
            {t('filter.conditions')}
          </h3>

    {/* 标签筛选区域：三态切换（灰/绿/红） */}
    <div style={{ marginBottom: 12 }}>
      {/* 标题行：左边是标题，右边是"清除"按钮（只有选了标签才显示） */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
          {t('filter.tagFilter')}
        </div>
        {/* 只有当 tagStates 里有内容（即有标签被选中）时，才显示"清除"按钮 */}
        {Object.keys(tagStates).length > 0 && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setTagStates({})}
            style={{ fontSize: 11 }}
          >
            {t('filter.clearTags')}
          </button>
        )}
      </div>

      {/* 操作提示文字 */}
      <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 6 }}>
        {t('filter.tagFilterHint')}
      </div>

      {/* 标签按钮列表 */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {tags.map((tag) => {
          // 读取这个标签当前的状态（undefined = 灰色）
          const state = tagStates[tag.id]
          // 统计有这个标签的结构数量，显示在括号里
          const count = structures.filter((s) => s.tags.includes(tag.id)).length

          // 根据状态决定按钮的样式
          // 绿色（include）：用标签自己的颜色填充背景，白色文字
          // 红色（exclude）：红色背景，白色文字，加删除线
          // 灰色（未选）：透明背景，用标签颜色作为边框和文字颜色
          const buttonStyle: React.CSSProperties = {
            border: `1px solid ${state === 'exclude' ? '#ef4444' : tag.color}`,
            color: state ? '#fff' : tag.color,
            background: state === 'include'
              ? tag.color
              : state === 'exclude'
                ? '#ef4444'
                : 'transparent',
            textDecoration: state === 'exclude' ? 'line-through' : 'none',
            transition: 'all 0.15s',
          }

          return (
            <button
              key={tag.id}
              className="btn btn-sm"
              onClick={() => handleTagClick(tag.id)}
              style={buttonStyle}
            >
              {/* 绿色时显示 ✓，红色时显示 ✗，灰色时不显示符号 */}
              {state === 'include' ? '✓ ' : state === 'exclude' ? '✗ ' : ''}
              {t(tag.nameKey)} ({count})
            </button>
          )
        })}
      </div>
    </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {conditions.map((cond, idx) => (
              <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {idx > 0 && <span style={{ fontSize: 11, color: 'var(--color-text-muted)', minWidth: 28 }}>AND</span>}
                {idx === 0 && <span style={{ minWidth: 28 }} />}

                <select
                  value={cond.field}
                  onChange={(e) => updateCondition(idx, 'field', e.target.value)}
                  style={selectStyle}
                >
                  {NUMERIC_FIELDS.map((f) => (
                    <option key={f} value={f}>{t(`col.${f}`) || f}</option>
                  ))}
                </select>

                <select
                  value={cond.operator}
                  onChange={(e) => updateCondition(idx, 'operator', e.target.value)}
                  style={selectStyle}
                >
                  {OPERATORS.map((op) => (
                    <option key={op} value={op}>{t(`op.${op}`)}</option>
                  ))}
                </select>

                <input
                  type="number"
                  step="any"
                  value={String(cond.value)}
                  onChange={(e) => updateCondition(idx, 'value', Number(e.target.value))}
                  style={inputStyle}
                />

                <button className="btn btn-ghost btn-sm" onClick={() => removeCondition(idx)}>
                  <X size={14} />
                </button>
              </div>
            ))}

            <button className="btn btn-outline btn-sm" onClick={addCondition} style={{ alignSelf: 'flex-start' }}>
              <Plus size={14} />
              {t('btn.addCondition')}
            </button>
          </div>

          <div
            style={{
              marginTop: 16,
              padding: 10,
              borderRadius: 6,
              background: filteredStructures.length > 0 ? 'rgba(22,163,74,0.1)' : 'rgba(220,38,38,0.1)',
              fontSize: 13,
              fontWeight: 600,
              color: filteredStructures.length > 0 ? 'var(--color-success)' : 'var(--color-danger)',
            }}
          >
            {filteredStructures.length > 0
              ? t('filter.matchCount', { count: filteredStructures.length })
              : t('filter.noMatch')}
          </div>
        </div>

        {/* Right: Export options */}
        <div className="card">
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
            {t('export.title')}
          </h3>

          {/* Format */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
              {t('export.format')}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {(['zip', 'seeds', 'csv', 'json'] as const).map((fmt) => (
                <button
                  key={fmt}
                  className={`btn btn-sm ${exportFormat === fmt ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => setExportFormat(fmt)}
                >
                  {t(`export.format${fmt.charAt(0).toUpperCase() + fmt.slice(1)}`)}
                </button>
              ))}
            </div>
          </div>

          {/* Naming (only for zip) */}
          {exportFormat === 'zip' && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
                {t('export.naming')}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {([
                  [1, t('export.nameParts.index')],
                  [2, t('export.nameParts.id')],
                  [3, t('export.nameParts.sg')],
                  [4, t('export.nameParts.fitness')],
                  [5, t('export.nameParts.secondObj')],
                  [6, t('export.nameParts.formula')],
                ] as [number, string][]).map(([n, label]) => (
                  <button
                    key={n}
                    className={`btn btn-sm ${nameParts.includes(n) ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => toggleNamePart(n)}
                  >
                    [{n}] {label}
                  </button>
                ))}
              </div>

              <div style={{ fontSize: 12, marginTop: 8, color: 'var(--color-text-muted)' }}>
                {t('export.preview')}: <code style={{ background: 'var(--color-bg-tertiary)', padding: '2px 6px', borderRadius: 4 }}>{previewName}</code>
              </div>
            </div>
          )}

          {/* Sort */}
          <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{t('export.sortBy')}:</span>
            <select value={sortKey} onChange={(e) => setSortKey(e.target.value)} style={selectStyle}>
              {NUMERIC_FIELDS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
            <button
              className="btn btn-outline btn-sm"
              onClick={() => setSortReverse(!sortReverse)}
            >
              {sortReverse ? t('export.descending') : t('export.ascending')}
            </button>
          </div>

          {/* Export button */}
          <button
            className="btn btn-primary"
            onClick={handleExport}
            disabled={filteredStructures.length === 0}
            style={{
              width: '100%',
              padding: '10px 20px',
              fontSize: 14,
              opacity: filteredStructures.length > 0 ? 1 : 0.4,
            }}
          >
            <Download size={16} />
            {t('export.exportCount', { count: filteredStructures.length })}
          </button>
        </div>
      </div>

      {/* Preview table */}
      {sortedStructures.length > 0 && (
        <div className="card" style={{ marginTop: 16, maxHeight: 300, overflow: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                {/* 固定列：这几列永远显示 */}
                <th>#</th>
                <th>ID</th>
                <th>{t('col.formula')}</th>
                <th>SG</th>
                <th>{t('col.enthalpy')}</th>
                <th>{t('col.fitness')}</th>
                <th>{t('col.origin')}</th>

                {/* 动态列：从筛选条件里提取出"不在固定列里的字段"，额外显示 */}
                {/* 先收集所有筛选条件用到的字段名 */}
                {/* 再过滤掉已经在固定列里的字段，避免重复 */}
                {conditions
                  .map((cond) => cond.field)
                  // 去掉重复的字段名（同一个字段可能被用了多次）
                  .filter((field, index, self) => self.indexOf(field) === index)
                  // 去掉已经在固定列里的字段，不需要再显示一遍
                  .filter((field) => !['enthalpy', 'fitness', 'spaceGroup'].includes(field))
                  .map((field) => (
                    // 用字段名作为列标题，优先用翻译，没有翻译就直接显示字段名
                    <th key={field} style={{ color: 'var(--color-primary)', fontStyle: 'italic' }}>
                      {t(`col.${field}`) || field}
                    </th>
                  ))
                }
              </tr>
            </thead>
            <tbody>
              {sortedStructures.slice(0, 50).map((s, i) => {
                // 计算这一行需要额外显示哪些动态列（和表头保持一致）
                const extraFields = conditions
                  .map((cond) => cond.field)
                  .filter((field, index, self) => self.indexOf(field) === index)
                  .filter((field) => !['enthalpy', 'fitness', 'spaceGroup'].includes(field));

                return (
                  <tr key={s.id}>
                    {/* 固定列的数据 */}
                    <td>{i + 1}</td>
                    <td style={{ fontWeight: 600 }}>EA{s.id}</td>
                    <td>{s.formula}</td>
                    <td>{s.spaceGroup}</td>
                    <td>{s.enthalpy < 900 ? s.enthalpy.toFixed(4) : '—'}</td>
                    <td>{s.fitness >= 0 ? s.fitness.toFixed(4) : '—'}</td>
                    <td>{s.origin}</td>

                    {/* 动态列的数据：从结构对象里读取对应字段的值 */}
                    {extraFields.map((field) => {
                      // 把结构对象当作一个普通字典来读取任意字段的值
                      const rawValue = (s as unknown as Record<string, unknown>)[field];

                      // 把值转成数字，方便判断是否有效
                      const numValue = Number(rawValue);

                      // 如果值不存在，或者不是有效数字，就显示破折号
                      const displayValue = rawValue == null || isNaN(numValue)
                        ? '—'
                        : numValue < 900
                          ? numValue.toFixed(4)
                          : numValue.toFixed(1);

                      return (
                        <td key={field} style={{ color: 'var(--color-primary)' }}>
                          {displayValue}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {sortedStructures.length > 50 && (
            <div style={{ padding: 8, textAlign: 'center', fontSize: 12, color: 'var(--color-text-muted)' }}>
              ... and {sortedStructures.length - 50} more
            </div>
          )}
        </div>
      )}
    </div>
  );
}
