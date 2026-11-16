import { useTranslation } from 'react-i18next';
import { useCompareStore } from '@/store/useCompareStore';
import { useProjectStore } from '@/store/useProjectStore';
import { Globe, UploadCloud, HelpCircle, Contact, Github, Menu, Monitor, Moon, Sun, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { CitePopover } from '@/components/CitePopover';
import { useThemeStore } from '@/theme/themeStore';

export function Header({ onOpenMenu, menuOpen, guideOpen, onToggleGuide }: {
  onOpenMenu: () => void;
  menuOpen: boolean;
  guideOpen: boolean;
  onToggleGuide: () => void;
}) {
  const { t, i18n } = useTranslation();
  const systemInfo = useProjectStore((s) => s.systemInfo);
  const persistenceError = useProjectStore(s => s.persistenceError);
  const projectName = useProjectStore((s) => s.projectName);
  const symmetryStatus = useProjectStore((s) => s.symmetryStatus);
  const compareIds = useCompareStore((s) => s.compareIds);
  const theme = useThemeStore((s) => s.theme);
  const themePreference = useThemeStore((s) => s.themePreference);
  const cycleThemePreference = useThemeStore((s) => s.cycleThemePreference);
  const navigate = useNavigate();

  const toggleLang = () => {
    i18n.changeLanguage(i18n.language === 'zh' ? 'en' : 'zh');
  };

  return (
    <header className="header">
      <button type="button" className="btn btn-ghost mobile-menu-trigger" onClick={onOpenMenu}
        aria-controls="workspace-navigation" aria-expanded={menuOpen} aria-label={t('nav.menu')}>
        <Menu size={21} />
      </button>
      {/* System summary */}
      {systemInfo && (
        <div className="header-project">
          {projectName && (
            <span className="header-project-name">
              {projectName}
            </span>
          )}
          <span className="header-project-stat">
            {t('system.totalStructures')}: <b>{systemInfo.totalStructures}</b>
          </span>
          <span className="header-project-stat">
            {t('system.stableStructures')}: <b>{systemInfo.stableCount}</b>
          </span>
          {systemInfo.totalGenerations > 0 && (
            <span className="header-project-stat">
              {t('system.generations')}: <b>{systemInfo.totalGenerations}</b>
            </span>
          )}
        </div>
      )}

      <div style={{ flex: 1 }} />

      {persistenceError && <span role="alert" title={persistenceError} style={{ color: 'var(--color-danger)', fontSize: 12 }}>
        {i18n.language === 'zh' ? '自动保存失败，请导出项目备份' : 'Auto-save failed; export a project backup'}
      </span>}

      {/* Background moyo symmetry analysis progress */}
      {symmetryStatus.running && (
        <span
          className="symmetry-progress"
          title={t('symmetry.progressTitle')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            color: 'var(--color-text-secondary)',
            padding: '2px 8px',
            borderRadius: 9999,
            border: '1px solid var(--color-border)',
            background: 'var(--color-bg-secondary)',
            whiteSpace: 'nowrap',
          }}
        >
          <Loader2 size={13} className="animate-spin" />
          {t('symmetry.progress', {
            done: symmetryStatus.done,
            total: symmetryStatus.total,
          })}
        </span>
      )}

      <div className="header-actions">
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
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/')} aria-label={t('btn.upload')} title={t('btn.upload')}>
          <UploadCloud size={16} />
        </button>

        {/* Language toggle */}
        <button className="btn btn-ghost btn-sm" onClick={toggleLang} aria-label={i18n.language === 'zh' ? 'Switch to English' : '切换为中文'}>
          <Globe size={16} />
          <span style={{ fontSize: 12 }}>{i18n.language === 'zh' ? 'EN' : '中'}</span>
        </button>

        {/* Theme toggle */}
        <button
          className="btn btn-ghost btn-sm"
          onClick={cycleThemePreference}
          aria-label={getThemeTitle(i18n.language, themePreference, theme)}
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
          aria-label={t('app.contact')}
        >
          <Contact size={16} />
        </a>

        {/* Source repository */}
        <a
          className="btn btn-ghost btn-sm"
          href="https://github.com/chen121760/USPEX-Analyzer"
          target="_blank"
          rel="noopener noreferrer"
          title={i18n.language === 'zh' ? 'GitHub 仓库' : 'GitHub repository'}
        >
          <Github size={16} />
        </a>

        {/* Help / hint panel toggle */}
        <button
          className="btn btn-ghost btn-sm"
          onClick={onToggleGuide}
          aria-label={t('app.guide')}
          aria-pressed={guideOpen}
        >
          <HelpCircle size={16} />
        </button>
      </div>
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
