import { useState, useRef } from 'react';
import { useUIStore } from '@/store/useUIStore';
import { useProjectStore } from '@/store/useProjectStore';
import { JSmolViewer } from './JSmolViewer';
import type { JSmolViewerHandle } from './JSmolViewer';
import { X } from 'lucide-react';

/** Jmol script snippets for toolbar buttons */
const SCRIPTS = {
  ballAndStick: 'wireframe 0.15; spacefill 23%;',
  spacefill: 'wireframe off; spacefill on;',
  wireframe: 'wireframe 0.1; spacefill off;',
  sticks: 'wireframe 0.3; spacefill off;',
  unitCell: 'unitcell on;',
  unitCellOff: 'unitcell off;',
  polyhedraOn: 'polyhedra bonds 3.0; color polyhedra translucent 0.5;',
  polyhedraOff: 'polyhedra off;',
  axes: 'axes on; axes 0.5;',
  axesOff: 'axes off;',
  labels: 'label %e; font label 14; color label black;',
  labelsOff: 'label off;',
  spin: 'spin on;',
  spinOff: 'spin off;',
  measureDistOn: 'set picking measure distance;',
  measureAngOn: 'set picking measure angle;',
  measureOff: 'set picking identify; measures off;',
  bgWhite: 'background white;',
  bgBlack: 'background black;',
  symmetryOn: 'draw symop all;',
  symmetryOff: 'draw symop off;',
};

/** Build a supercell load command */
function supercellScript(poscar: string, nx: number, ny: number, nz: number): string {
  return (
    'load DATA "model"\n' +
    poscar +
    `\nend "model" {${nx} ${ny} ${nz}} packed;\n` +
    SCRIPTS.ballAndStick +
    ' unitcell on;'
  );
}

export function StructureViewerModal() {
  const viewerStructureId = useUIStore((s) => s.viewerStructureId);
  const closeViewer = useUIStore((s) => s.closeViewer);
  const structures = useProjectStore((s) => s.structures);

  // Toolbar state
  const [showUnitCell, setShowUnitCell] = useState(true);
  const [showPolyhedra, setShowPolyhedra] = useState(false);
  const [showAxes, setShowAxes] = useState(false);
  const [showLabels, setShowLabels] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [displayMode, setDisplayMode] = useState<'ballAndStick' | 'spacefill' | 'wireframe' | 'sticks'>('ballAndStick');
  const [supercell, setSupercell] = useState<[number, number, number]>([1, 1, 1]);
  const jsmolRef = useRef<JSmolViewerHandle>(null);
  const [scInput, setScInput] = useState('1 1 1');
  const [measureMode, setMeasureMode] = useState<'off' | 'distance' | 'angle'>('off');
  const [bgColor, setBgColor] = useState<'white' | 'black'>('white');


  // Don't render if no structure selected
  if (viewerStructureId === null) return null;

  const structure = structures.find((s) => s.id === viewerStructureId);
  console.log('VIEWER DEBUG:', viewerStructureId, structure?.formula, structure?.poscarData?.substring(0, 100));
  if (!structure || !structure.poscarData) {
    return (
      <ModalShell onClose={closeViewer} title={`EA${viewerStructureId}`}>
        <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>
          该结构没有 POSCAR 数据。
          <br />
          No POSCAR data available for this structure.
        </div>
      </ModalShell>
    );
  }

  // Build the initial script
  const initScript = [
    SCRIPTS[displayMode],
    showUnitCell ? SCRIPTS.unitCell : SCRIPTS.unitCellOff,
    showPolyhedra ? SCRIPTS.polyhedraOn : '',
    showAxes ? SCRIPTS.axes : '',
    showLabels ? SCRIPTS.labels : '',
    spinning ? SCRIPTS.spin : '',
  ].join(' ');

  // For supercells, we need to reload the model
  const isSupercell = supercell[0] > 1 || supercell[1] > 1 || supercell[2] > 1;

  // Build the full Jmol script that runs after load
  const fullScript = isSupercell ? '' : initScript;

  // If supercell, we pass the load command as the script itself
  const poscarForViewer = structure.poscarData;

  // Build a key that forces JSmolViewer to remount when supercell changes
  const viewerKey = `${viewerStructureId}-${supercell.join('-')}`;

  const handleApplySupercell = () => {
    const parts = scInput.trim().split(/\s+/).map(Number);
    if (parts.length === 3 && parts.every((n) => n >= 1 && n <= 5 && Number.isInteger(n))) {
      setSupercell([parts[0], parts[1], parts[2]]);
    }
  };

  // Info line
  const info = [
    structure.formula,
    `SG: ${structure.spaceGroup}`,
    structure.latticeParams
      ? `a=${structure.latticeParams.a.toFixed(2)} b=${structure.latticeParams.b.toFixed(2)} c=${structure.latticeParams.c.toFixed(2)}`
      : '',
  ].filter(Boolean).join('  |  ');

  return (
    <ModalShell onClose={closeViewer} title={`EA${structure.id} — ${structure.formula}`}>
      {/* Info bar */}
      <div style={{
        padding: '6px 16px',
        fontSize: 12,
        color: 'var(--color-text-muted, #666)',
        borderBottom: '1px solid var(--color-border, #e5e7eb)',
        background: 'var(--color-bg, #f9fafb)',
      }}>
        {info}
      </div>

      {/* Main content: viewer + toolbar */}
      <div style={{ display: 'flex', height: 'calc(100% - 80px)' }}>
        {/* Viewer */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {isSupercell ? (
            <JSmolViewer
              key={viewerKey}
              poscarText={poscarForViewer}
              script={
                `load DATA "model"\n${poscarForViewer}\nend "model" {${supercell[0]} ${supercell[1]} ${supercell[2]}} packed;\n` +
                initScript
              }
              height="100%"
            />
          ) : (
            <JSmolViewer
              ref={jsmolRef}
              key={viewerKey}
              poscarText={poscarForViewer}
              script={initScript}
              height="100%"
            />
          )}
        </div>

        {/* Toolbar sidebar */}
        <div style={{
          width: 200,
          borderLeft: '1px solid var(--color-border, #e5e7eb)',
          padding: 12,
          fontSize: 13,
          overflowY: 'auto',
          background: 'var(--color-bg, #f9fafb)',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}>
          {/* Display mode */}
          <Section title="显示模式 Display">
            {(['ballAndStick', 'spacefill', 'wireframe', 'sticks'] as const).map((mode) => (
              <label key={mode} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="displayMode"
                  checked={displayMode === mode}
                  onChange={() => setDisplayMode(mode)}
                />
                <span>{{
                  ballAndStick: '球棍 Ball & Stick',
                  spacefill: '空间填充 Spacefill',
                  wireframe: '线框 Wireframe',
                  sticks: '棍状 Sticks',
                }[mode]}</span>
              </label>
            ))}
          </Section>

          {/* Toggles */}
          <Section title="显示选项 Options">
            <Toggle label="晶胞 Unit Cell" checked={showUnitCell} onChange={setShowUnitCell} />
            <Toggle label="多面体 Polyhedra" checked={showPolyhedra} onChange={setShowPolyhedra} />
            <Toggle label="坐标轴 Axes" checked={showAxes} onChange={setShowAxes} />
            <Toggle label="原子标签 Labels" checked={showLabels} onChange={setShowLabels} />
            <Toggle label="旋转 Spin" checked={spinning} onChange={setSpinning} />
          </Section>

          {/* Supercell */}
          <Section title="扩胞 Supercell">
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type="text"
                value={scInput}
                onChange={(e) => setScInput(e.target.value)}
                placeholder="1 1 1"
                style={{
                  width: 80, padding: '3px 6px', fontSize: 12,
                  border: '1px solid var(--color-border, #d1d5db)',
                  borderRadius: 4, background: 'var(--color-surface, #fff)',
                  color: 'var(--color-text, #111)',
                }}
              />
              <button
                onClick={handleApplySupercell}
                style={{
                  padding: '3px 10px', fontSize: 12, borderRadius: 4,
                  border: '1px solid var(--color-primary, #3b82f6)',
                  background: 'var(--color-primary, #3b82f6)',
                  color: '#fff', cursor: 'pointer',
                }}
              >
                应用
              </button>
            </div>
            <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>
              输入 3 个数字，如 2 2 1，最大 5
            </div>
          </Section>

          {/* 测量工具 */}
          <Section title="测量工具 Measure">
            {(['off', 'distance', 'angle'] as const).map((mode) => (
              <label key={mode} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="measureMode"
                  checked={measureMode === mode}
                  onChange={() => {
                    setMeasureMode(mode);
                    
                    if (mode === 'distance') {
                    jsmolRef.current?.runScript(SCRIPTS.measureDistOn);
                    } else if (mode === 'angle') {
                    jsmolRef.current?.runScript(SCRIPTS.measureAngOn);
                    } else {
                    jsmolRef.current?.runScript(SCRIPTS.measureOff);
                    }
                    
                  }}
                />
                <span>{{
                  off: '关闭 Off',
                  distance: '键长 Distance',
                  angle: '键角 Angle',
                }[mode]}</span>
              </label>
            ))}
            <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
              选择后点击原子即可测量
            </div>
          </Section>

          {/* 背景色 */}
          <Section title="背景 Background">
            <div style={{ display: 'flex', gap: 4 }}>
              {(['white', 'black'] as const).map((c) => (
                <button
                  key={c}
                  onClick={() => {
                    setBgColor(c);
                    
                    jsmolRef.current?.runScript( c === 'white' ? SCRIPTS.bgWhite : SCRIPTS.bgBlack);
                    
                  }}
                  style={{
                    padding: '3px 12px', fontSize: 12, borderRadius: 4,
                    border: '1px solid var(--color-border, #d1d5db)',
                    background: bgColor === c ? 'var(--color-primary, #3b82f6)' : 'transparent',
                    color: bgColor === c ? '#fff' : 'var(--color-text, #333)',
                    cursor: 'pointer',
                  }}
                >
                  {c === 'white' ? '白 White' : '黑 Black'}
                </button>
              ))}
            </div>
          </Section>

          {/* 截图 */}
          <Section title="导出 Export">
            <button
              onClick={() => {
                const base64 = jsmolRef.current?.evalVar('write("PNG")');
                if (base64) {
                    const link = document.createElement('a');
                    link.href = 'data:image/png;base64,' + base64;
                    link.download = `EA${structure.id}_${structure.formula}.png`;
                    link.click();
                }
                }}

              style={{
                padding: '4px 12px', fontSize: 12, borderRadius: 4,
                border: '1px solid var(--color-primary, #3b82f6)',
                background: 'var(--color-primary, #3b82f6)',
                color: '#fff', cursor: 'pointer', width: '100%',
              }}
            >
              保存截图 PNG
            </button>
            <button
              onClick={() => {
                const blob = new Blob([structure.poscarData!], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `EA${structure.id}-SG${structure.spaceGroup}.vasp`;
                link.click();
                URL.revokeObjectURL(url);
              }}
              style={{
                padding: '4px 12px', fontSize: 12, borderRadius: 4,
                border: '1px solid #16a34a',
                background: '#16a34a',
                color: '#fff', cursor: 'pointer', width: '100%',
                marginTop: 4,
              }}
            >
              导出 POSCAR (.vasp)
            </button>
          </Section>

          {/* Quick supercell buttons */}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {['1 1 1', '2 2 2', '2 2 1', '3 3 3'].map((sc) => (
              <button
                key={sc}
                onClick={() => {
                  setScInput(sc);
                  const p = sc.split(' ').map(Number) as [number, number, number];
                  setSupercell(p);
                }}
                style={{
                  padding: '2px 8px', fontSize: 11, borderRadius: 4,
                  border: '1px solid var(--color-border, #d1d5db)',
                  background: scInput === sc ? 'var(--color-primary, #3b82f6)' : 'transparent',
                  color: scInput === sc ? '#fff' : 'var(--color-text, #333)',
                  cursor: 'pointer',
                }}
              >
                {sc}
              </button>
            ))}
          </div>
        </div>
      </div>
    </ModalShell>
  );
}

/* ---- Helper components ---- */

function ModalShell({ children, onClose, title }: {
  children: React.ReactNode;
  onClose: () => void;
  title: string;
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '90vw', maxWidth: 1100,
          height: '80vh',
          background: 'var(--color-surface, #fff)',
          borderRadius: 12,
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Title bar */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '10px 16px',
          borderBottom: '1px solid var(--color-border, #e5e7eb)',
          fontWeight: 600, fontSize: 15,
        }}>
          <span>{title}</span>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: 4, borderRadius: 4, display: 'flex',
              color: 'var(--color-text, #333)',
            }}
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 6, color: 'var(--color-text, #333)' }}>
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {children}
      </div>
    </div>
  );
}

function Toggle({ label, checked, onChange }: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12 }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}
