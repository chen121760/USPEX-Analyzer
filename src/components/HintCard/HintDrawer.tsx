import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useUIStore } from '@/store/useUIStore';
import { useProjectStore } from '@/store/useProjectStore';
import { X } from 'lucide-react';

const ACCENT      = '#68b88e';
const ACCENT_DARK = '#4a9a72';
const TEXT        = '#0f2d1e';
const TEXT_MUTED  = '#2d5c3f';
const CARD_BG     = 'rgba(255,255,255,0.30)';
const CARD_BORDER = 'rgba(255,255,255,0.55)';
const SECTION_BG  = 'rgba(0,0,0,0.08)';

// ── Data types ──────────────────────────────────────────────
interface FullHint {
  kind: 'full';
  title: string;
  summary: string;
  features: string[];
  concepts: { term: string; desc: string }[];
}
interface SimpleHint {
  kind: 'simple';
  title: string;
  lines: string[];
}
type PageHint = FullHint | SimpleHint;

// ── Build hint from i18n keys ────────────────────────────────
function usePageHint(): PageHint | null {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const systemInfo = useProjectStore((state) => state.systemInfo);

  const routeKey: Record<string, string> = {
    '/dashboard':    'dashboard',
    '/table':        'table',
    '/convex-hull':  systemInfo?.compositionMode === 'fixed' ? 'energyRanking' : 'hull',
    '/pareto':       'pareto',
    '/explorer':     'explorer',
    '/beta-explorer':'hv',
    '/filter':       'filter',
    '/compare':      'compare',
    '/hull-workshop': 'hullWorkshop',
  };

  const navKey: Record<string, string> = {
    'dashboard':    'nav.dashboard',
    'table':        'nav.table',
    'hull':         'nav.hull',
    'energyRanking':'nav.energyRanking',
    'pareto':       'nav.pareto',
    'explorer':     'nav.explorer',
    'hv':           'nav.betaExplorer',
    'filter':       'nav.filter',
    'compare':      'nav.compare',
    'hullWorkshop': 'nav.hullWorkshop',
  };

  const key = routeKey[pathname];
  if (!key) return null;

  const title = t(navKey[key]);

  // Check if this page has full structured content
  const summaryKey = `hint.${key}.summary`;
  const summary = t(summaryKey);
  if (summary !== summaryKey) {
    // Has full content — collect features and concepts
    const features: string[] = [];
    for (let i = 0; ; i++) {
      const fKey = `hint.${key}.feature.${i}`;
      const val = t(fKey);
      if (val === fKey) break;
      features.push(val);
    }
    const concepts: { term: string; desc: string }[] = [];
    for (let i = 0; ; i++) {
      const tKey = `hint.${key}.concept.term.${i}`;
      const dKey = `hint.${key}.concept.desc.${i}`;
      const term = t(tKey);
      const desc = t(dKey);
      if (term === tKey) break;
      concepts.push({ term, desc });
    }
    return { kind: 'full', title, summary, features, concepts };
  }

  // Fallback to simple line1/line2
  const line1 = t(`hint.${key}.line1`);
  const line2 = t(`hint.${key}.line2`);
  return { kind: 'simple', title, lines: [line1, line2] };
}

// ── Sub-components ───────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      color: TEXT_MUTED,
      background: SECTION_BG,
      borderRadius: 6,
      padding: '3px 8px',
      marginBottom: 8,
      display: 'inline-block',
    }}>
      {children}
    </div>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: CARD_BG,
      border: `1px solid ${CARD_BORDER}`,
      borderRadius: 10,
      padding: '9px 12px',
      fontSize: 12.5,
      lineHeight: 1.65,
      color: TEXT,
      backdropFilter: 'blur(4px)',
      ...style,
    }}>
      {children}
    </div>
  );
}

// ── Main drawer ──────────────────────────────────────────────
export function HintDrawer() {
  const hintPanelOpen  = useUIStore((s) => s.hintPanelOpen);
  const setHintPanelOpen = useUIStore((s) => s.setHintPanelOpen);
  const { t } = useTranslation();
  const hint = usePageHint();

  if (!hintPanelOpen || !hint) return null;

  return (
    <>
      <div style={{ position: 'fixed', top: 'var(--header-height)', right: 0, bottom: 0, width: 300, zIndex: 50,
        background: ACCENT, boxShadow: '-4px 0 24px rgba(0,0,0,0.13)',
        display: 'flex', flexDirection: 'column',
        animation: 'slideInRight 0.22s cubic-bezier(0.16,1,0.3,1)',
      }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '13px 16px 11px', borderBottom: `1px solid ${ACCENT_DARK}`, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ fontSize: 16 }}>💡</span>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: TEXT }}>{hint.title}</span>
          </div>
          <button onClick={() => setHintPanelOpen(false)}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer',
              color: TEXT_MUTED, padding: 4, borderRadius: 6, display: 'flex', alignItems: 'center' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = TEXT)}
            onMouseLeave={(e) => (e.currentTarget.style.color = TEXT_MUTED)}
          >
            <X size={15} />
          </button>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 14px 20px' }}>

          {hint.kind === 'simple' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {hint.lines.map((line, i) => <Card key={i}>{line}</Card>)}
            </div>
          )}

          {hint.kind === 'full' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Summary */}
              <Card style={{ fontWeight: 700, fontSize: 12.5 }}>{hint.summary}</Card>

              {/* Features */}
              {hint.features.length > 0 && (
                <div>
                  <SectionLabel>{t('hint.label.features', 'Features')}</SectionLabel>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {hint.features.map((f, i) => <Card key={i}>{f}</Card>)}
                  </div>
                </div>
              )}

              {/* Divider */}
              {hint.concepts.length > 0 && (
                <div style={{ borderTop: `1px solid ${ACCENT_DARK}`, margin: '0 -2px' }} />
              )}

              {/* Concepts */}
              {hint.concepts.length > 0 && (
                <div>
                  <SectionLabel>{t('hint.label.concepts', 'Background')}</SectionLabel>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                    {hint.concepts.map((c, i) => (
                      <Card key={i}>
                        <div style={{ fontWeight: 700, marginBottom: 4, fontSize: 12 }}>{c.term}</div>
                        <div style={{ fontSize: 12, color: TEXT_MUTED }}>{c.desc}</div>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '8px 16px', borderTop: `1px solid ${ACCENT_DARK}`,
          fontSize: 10.5, color: TEXT_MUTED, textAlign: 'center', flexShrink: 0 }}>
          {t('hint.footer', 'Click ? in the toolbar to reopen')}
        </div>
      </div>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
    </>
  );
}
