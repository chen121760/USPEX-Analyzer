import { useTranslation } from 'react-i18next';
import { useCompareStore } from '@/store/useCompareStore';
import { useLayoutStore } from '@/store/useLayoutStore';
import { useProjectStore } from '@/store/useProjectStore';
import { Globe, UploadCloud, HelpCircle, Contact, Monitor, Moon, Sun } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { CitePopover } from '@/components/CitePopover';
import { useThemeStore } from '@/theme/themeStore';

export function Header() {
  const { t, i18n } = useTranslation();
  const systemInfo = useProjectStore((s) => s.systemInfo);
  const projectName = useProjectStore((s) => s.projectName);
  const compareIds = useCompareStore((s) => s.compareIds);
  const hintPanelOpen = useLayoutStore((s) => s.hintPanelOpen);
  const toggleHintPanel = useLayoutStore((s) => s.toggleHintPanel);
  const theme = useThemeStore((s) => s.theme);
  const themePreference = useThemeStore((s) => s.themePreference);
  const cycleThemePreference = useThemeStore((s) => s.cycleThemePreference);
  const navigate = useNavigate();

  const toggleLang = () => {
    i18n.changeLanguage(i18n.language === 'zh' ? 'en' : 'zh');
  };

  return (
    <header className="header">
      {/* System summary */}
      {systemInfo && (
        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', display: 'flex', gap: 16, alignItems: 'center' }}>
          {projectName && (
            <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
              {projectName}
            </span>
          )}
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
              color: 'var(--color-primary-contrast)',
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
      <button className="btn btn-ghost btn-sm" onClick={() => navigate('/')} title={t('btn.upload')}>
        <UploadCloud size={16} />
      </button>

      {/* Language toggle */}
      <button className="btn btn-ghost btn-sm" onClick={toggleLang} title="Switch language">
        <Globe size={16} />
        <span style={{ fontSize: 12 }}>{i18n.language === 'zh' ? 'EN' : '中'}</span>
      </button>

      {/* Theme toggle */}
      <button
        className="btn btn-ghost btn-sm"
        onClick={cycleThemePreference}
        title={getThemeTitle(i18n.language, themePreference, theme)}
      >
        {themePreference === 'system'
          ? <Monitor size={16} />
          : theme === 'dark'
            ? <Sun size={16} />
            : <Moon size={16} />}
      </button>

      {/* Cite USPEX */}
      <CitePopover />

      {/* Contact author */}
      <a
        className="btn btn-ghost btn-sm"
        href="https://chen121760.github.io/"
        target="_blank"
        rel="noopener noreferrer"
        title={i18n.language === 'zh' ? '联系作者' : 'Contact Author'}
      >
        <Contact size={16} />
      </a>

      {/* Help / hint panel toggle */}
      <button
        className="btn btn-ghost btn-sm"
        onClick={toggleHintPanel}
        title="Page guide"
        style={{
          color: hintPanelOpen ? '#68b88e' : undefined,
          background: hintPanelOpen ? 'rgba(104,184,142,0.12)' : undefined,
          borderRadius: 6,
        }}
      >
        <HelpCircle size={16} />
      </button>
    </header>
  );
}

function getThemeTitle(language: string, preference: 'system' | 'light' | 'dark', theme: 'light' | 'dark') {
  if (language === 'zh') {
    return preference === 'system'
      ? `跟随系统主题（当前${theme === 'dark' ? '深色' : '浅色'}）`
      : `${preference === 'dark' ? '深色' : '浅色'}主题`;
  }

  return preference === 'system'
    ? `Follow system theme (${theme})`
    : `${preference} theme`;
}
