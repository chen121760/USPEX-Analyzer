import { useTranslation } from 'react-i18next';
import { useUIStore } from '@/store/useUIStore';
import { useProjectStore } from '@/store/useProjectStore';
import { Moon, Sun, Globe, UploadCloud } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function Header() {
  const { t, i18n } = useTranslation();
  const theme = useUIStore((s) => s.theme);
  const toggleTheme = useUIStore((s) => s.toggleTheme);
  const systemInfo = useProjectStore((s) => s.systemInfo);
  const compareIds = useUIStore((s) => s.compareIds);
  const navigate = useNavigate();

  const toggleLang = () => {
    i18n.changeLanguage(i18n.language === 'zh' ? 'en' : 'zh');
  };

  return (
    <header className="header">
      {/* System summary */}
      {systemInfo && (
        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', display: 'flex', gap: 16 }}>
          <span>
            {t('system.totalStructures')}: <b>{systemInfo.totalStructures}</b>
          </span>
          <span>
            {t('system.stableStructures')}: <b>{systemInfo.stableCount}</b>
          </span>
          {systemInfo.totalGenerations > 0 && (
            <span>
              {t('system.generations')}: <b>{systemInfo.totalGenerations}</b>
            </span>
          )}
        </div>
      )}

      <div style={{ flex: 1 }} />

      {/* Compare badge */}
      {compareIds.length > 0 && (
        <button
          className="btn btn-outline btn-sm"
          onClick={() => navigate('/compare')}
          style={{ position: 'relative' }}
        >
          {t('btn.compare')}
          <span
            style={{
              background: 'var(--color-primary)',
              color: 'white',
              borderRadius: 9999,
              padding: '0 6px',
              fontSize: 11,
              minWidth: 18,
              textAlign: 'center',
            }}
          >
            {compareIds.length}
          </span>
        </button>
      )}

      {/* New upload */}
      <button className="btn btn-ghost btn-sm" onClick={() => navigate('/')}>
        <UploadCloud size={16} />
      </button>

      {/* Language toggle */}
      <button className="btn btn-ghost btn-sm" onClick={toggleLang} title="Switch language">
        <Globe size={16} />
        <span style={{ fontSize: 12 }}>{i18n.language === 'zh' ? 'EN' : '中'}</span>
      </button>

      {/* Theme toggle */}
      <button className="btn btn-ghost btn-sm" onClick={toggleTheme} title="Toggle theme">
        {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
      </button>
    </header>
  );
}
