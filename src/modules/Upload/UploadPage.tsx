import { useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '@/store/useProjectStore';
import { detectFileType, getFileTypeInfo } from '@/lib/fileDetection';
import {
  UploadCloud,
  FileText,
  CheckCircle2,
  AlertCircle,
  Globe,
  Monitor,
  Moon,
  Sun,
  Contact,
  ArrowRight,
  Play,
} from 'lucide-react';
import type { DetectedFile, USPEXFileType, ProjectFile } from '@/types/structure';
import { useEffect } from 'react';
import { loadRecentProjects, deleteProject, type StoredProject } from '@/lib/projectStorage';
import { Clock, Trash2 } from 'lucide-react';
import { UspexLogo } from '@/components/Logo/UspexLogo';
import { QuickPackCommand } from '@/components/QuickPackCommand';
import { extractArchive, entriesToFiles, isArchive } from '@/utils/extractArchive';
import { CitePopover } from '@/components/CitePopover';
import { useThemeStore } from '@/theme/themeStore';
import { Spinner, progressPercent } from '@/components/ui/Spinner';
import { SkeletonRows } from '@/components/ui/Skeleton';

/**
 * Build auto project name.
 * Format: Elements-calcType-PressureGPa[-suffix]
 * For fixed composition (calculationType % 10 === 0), the formula
 * (e.g. Ti2H11) is used in place of element symbols (e.g. Ti-H).
 */
function buildAutoName(
  elements: string[],
  calculationType: number,
  externalPressure: number | null,
  suffix: string,
  fixedFormula?: string,
): string {
  const parts: string[] = [];
  const isFixed = calculationType > 0 && calculationType % 10 === 0;
  if (isFixed && fixedFormula) {
    parts.push(fixedFormula);
  } else if (elements.length > 0) {
    parts.push(elements.join('-'));
  }
  if (calculationType > 0) parts.push(String(calculationType));
  if (externalPressure !== null) parts.push(`${externalPressure}GPa`);
  if (suffix.trim()) parts.push(suffix.trim());
  return parts.join('-');
}

function hasUspex25Schema(fileContents: Map<USPEXFileType, string>): boolean {
  const individuals = fileContents.get('individuals') ?? '';
  const poscars = fileContents.get('gathered_poscars') ?? '';
  const hull = fileContents.get('extended_convex_hull') ?? '';

  return /^\s*generation\s+number\s+num_atoms_all\s+energy/m.test(individuals) ||
    /^number=\d+\b/m.test(poscars) ||
    /^\s*generation\s+number\s+num_atoms_all\s+energy.*\be_above_hull\b/m.test(hull);
}

export function UploadPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const processFiles = useProjectStore((s) => s.processFiles);
  const isParsing = useProjectStore((s) => s.isLoading);
  const loadingProgress = useProjectStore((s) => s.loadingProgress);
  const parsingPercent = progressPercent(loadingProgress);
  const setProjectName = useProjectStore((s) => s.setProjectName);
  const loadProjectFile = useProjectStore((s) => s.loadProjectFile);
  const theme = useThemeStore((s) => s.theme);
  const themePreference = useThemeStore((s) => s.themePreference);
  const cycleThemePreference = useThemeStore((s) => s.cycleThemePreference);

  const [detectedFiles, setDetectedFiles] = useState<DetectedFile[]>([]);
  const [fileContents, setFileContents] = useState<Map<USPEXFileType, string>>(new Map());
  const [isDragging, setIsDragging] = useState(false);
  const [suffix, setSuffix] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [loadingSample, setLoadingSample] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  // 存储历史项目列表
  const [recentProjects, setRecentProjects] = useState<StoredProject[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  // The panel is reserved while the list is being read, so finishing the read
  // does not re-flow the whole page (the container switches to a row layout).
  const showProjectsPanel = projectsLoading || recentProjects.length > 0;

  // 页面挂载时读取一次 IndexedDB
  useEffect(() => {
    loadRecentProjects()
      .then(setRecentProjects)
      .finally(() => setProjectsLoading(false));
  }, []); // [] 表示只在组件第一次渲染时执行

  // 点击历史项目 → 恢复数据 → 跳转到 Dashboard
  const handleRestoreProject = async (stored: StoredProject) => {
    await loadProjectFile(stored.project);
    setProjectName(stored.name);
    navigate('/dashboard');
  };

  // 点击删除按钮 → 从 IndexedDB 删除 → 从页面列表移除
  const handleDeleteProject = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(t('upload.confirmDelete'))) return;
    await deleteProject(id);
    setRecentProjects((prev) => prev.filter((p) => p.id !== id));
  };


  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const fileArr = Array.from(files);
    const newDetected: DetectedFile[] = [...detectedFiles];
    const newContents = new Map(fileContents);
    const newErrors: string[] = [];

    // Archive pre-processing: if a single archive file is dropped, extract it first
    let resolvedFiles: File[];
    if (fileArr.length === 1 && isArchive(fileArr[0])) {
      try {
        const entries = await extractArchive(fileArr[0]);
        resolvedFiles = entriesToFiles(entries);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const friendlyMsg = i18n.language === 'zh'
          ? `解压失败: ${fileArr[0].name} — ${msg}`
          : `Extraction failed: ${fileArr[0].name} — ${msg}`;
        setErrors([friendlyMsg]);
        return;
      }
    } else {
      resolvedFiles = fileArr;
    }

    for (const file of resolvedFiles) {
      try {
        const content = await file.text();
        const detected = detectFileType(file, content);

        // Check for project file
        if (detected.type === 'project_json') {
          try {
            const project: ProjectFile = JSON.parse(content.replace(/^\uFEFF/, ''));
            await loadProjectFile(project);
            const name = project.projectName || file.name.replace(/\.json$/i, '') || 'Imported Project';
            setProjectName(name);
            navigate('/dashboard');
            return;
          } catch {
            newErrors.push(`Failed to parse project file: ${file.name}`);
            continue;
          }
        }

        if (detected.type === 'unknown') {
          newErrors.push(`Unrecognized file: ${file.name}`);
          continue;
        }

        // Replace if same type already exists
        const existingIdx = newDetected.findIndex((d) => d.type === detected.type);
        if (existingIdx >= 0) {
          const existing = newDetected[existingIdx];
          if (detected.confidence >= existing.confidence) {
            newDetected[existingIdx] = detected;
            newContents.set(detected.type, content);
          }
        } else {
          newDetected.push(detected);
          newContents.set(detected.type, content);
        }
      } catch (e) {
        newErrors.push(`Error reading ${file.name}: ${e}`);
      }
    }

    setDetectedFiles(newDetected);
    setFileContents(newContents);
    setErrors(newErrors);
  }, [detectedFiles, fileContents, loadProjectFile, navigate, i18n.language]);


  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleClick = () => inputRef.current?.click();

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) void handleFiles(e.target.files);
    e.currentTarget.value = '';
  };

  const isUspex25Schema = hasUspex25Schema(fileContents);
  const canStartLegacy =
    fileContents.has('individuals') &&
    fileContents.has('origin') &&
    fileContents.has('parameters') &&
    fileContents.has('gathered_poscars');
  const canStartUspex25 =
    isUspex25Schema &&
    fileContents.has('individuals') &&
    fileContents.has('gathered_poscars');
  const canStart = canStartLegacy || canStartUspex25;
  const startAnalysis = async () => {
    // Parsing a large run takes seconds and blocks the main thread, so the store
    // paints its loading overlay first (see `nextPaint`) and the button below
    // stays disabled with a spinner until the data is in.
    const previousProjectId = useProjectStore.getState().projectId;
    await processFiles(detectedFiles, fileContents);
    const state = useProjectStore.getState();
    if (state.projectId === previousProjectId) {
      setErrors(state.parseWarnings);
      return;
    }
    const si = state.systemInfo;
    const fixedFormula = state.structures?.[0]?.formula;
    const autoName = si
      ? buildAutoName(si.elements, si.calculationType, si.externalPressure, suffix, fixedFormula)
      : suffix.trim() || 'project';
    setProjectName(autoName);
    navigate('/dashboard');
  };

  const handleLoadSample = async () => {
    setLoadingSample(true);
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}examples/example.json`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const project: ProjectFile = await res.json();
      await loadProjectFile(project);
      const name = project.projectName || 'Sample';
      setProjectName(name);
      navigate('/dashboard');
    } catch (e) {
      setErrors([`Failed to load sample: ${e}`]);
    } finally {
      setLoadingSample(false);
    }
  };

  const toggleLang = () => {
    i18n.changeLanguage(i18n.language === 'zh' ? 'en' : 'zh');
  };

  const requiredFiles: USPEXFileType[] = isUspex25Schema
    ? ['individuals', 'gathered_poscars']
    : ['individuals', 'gathered_poscars', 'origin', 'parameters'];
  const filesByType = new Map(detectedFiles.map(file => [file.type, file]));
  const missingFiles = requiredFiles.filter(type => !filesByType.has(type));
  const hasFormatSource = filesByType.has('individuals') || filesByType.has('gathered_poscars');
  const detectedVersion = isUspex25Schema ? 'USPEX 25' : hasFormatSource ? 'USPEX 10.5 / 10.6' : t('upload.detected');

  return (
    <main className="upload-home">
      <header className="upload-topbar">
        <span className="upload-wordmark">USPEX Analyzer</span>
        <div className="upload-tools">
          <button type="button" className="btn btn-ghost btn-sm" onClick={toggleLang} aria-label={i18n.language === 'zh' ? 'Switch to English' : '切换为中文'}>
            <Globe size={16} />
            {i18n.language === 'zh' ? 'EN' : '中'}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={cycleThemePreference} aria-label={getThemeTitle(i18n.language, themePreference, theme)}>
            {themePreference === 'system' ? <Monitor size={16} /> : theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <CitePopover />
          <a className="btn btn-ghost btn-sm" href="https://chen121760.github.io/" target="_blank" rel="noopener noreferrer" aria-label={t('app.contact')}>
            <Contact size={16} />
          </a>
        </div>
      </header>

      <div className="upload-workspace">
        <section className="upload-intro" aria-labelledby="upload-title">
          <UspexLogo className="upload-logo" />
          <h1 id="upload-title">{t('upload.title')}</h1>
          <p>{t('upload.orLoadProject')}</p>
          <QuickPackCommand />
          <button className="btn btn-outline" type="button" onClick={handleLoadSample} disabled={loadingSample} aria-busy={loadingSample}>
            {loadingSample ? <Spinner size={15} /> : <Play size={15} />}
            {t('btn.loadSample')}
          </button>
          <p className="upload-sample-note">{t('upload.sampleHint')}</p>
        </section>

        <div className="upload-main">
          <section className="card upload-card" aria-label={t('upload.title')}>
            <div
              className={`dropzone ${isDragging ? 'active' : ''}`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
            >
              <input ref={inputRef} type="file" multiple hidden onChange={handleInputChange} />
              <span className="upload-drop-icon"><UploadCloud size={24} /></span>
              <button className="btn btn-primary" type="button" onClick={handleClick}>{t('upload.chooseFiles')}</button>
              <p>{t('upload.dropHint')}</p>
              <span>ZIP · TAR.GZ · TGZ · JSON</span>
            </div>

            {detectedFiles.length > 0 && (
              <div className="upload-file-status" role="status">
                <div className="upload-file-heading">
                  <strong>{detectedVersion}</strong>
                  <span>{t('upload.requiredCount', { count: requiredFiles.length - missingFiles.length, total: requiredFiles.length })}</span>
                </div>
                <ul className="upload-files">
                  {requiredFiles.map(type => {
                    const file = filesByType.get(type);
                    return (
                      <li key={type} className={file ? 'ready' : ''}>
                        {file ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                        <span>{t(getFileTypeInfo(type).displayKey)}</span>
                        <span>{t(file ? 'upload.recognized' : 'upload.missing')}</span>
                      </li>
                    );
                  })}
                  {detectedFiles.filter(file => !requiredFiles.includes(file.type)).map(file => (
                    <li key={file.type} className="ready">
                      <CheckCircle2 size={14} />
                      <span>{t(file.displayName)}</span>
                      <span>{t('upload.recognized')}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {errors.length > 0 && (
              <ul className="upload-errors" role="alert">
                {errors.map((error, index) => <li key={index}><AlertCircle size={14} />{error}</li>)}
              </ul>
            )}

            <div className="upload-name">
              <label htmlFor="project-suffix">{t('upload.suffixLabel')}</label>
              <input id="project-suffix" type="text" value={suffix} onChange={event => setSuffix(event.target.value)}
                placeholder={t('upload.suffixPlaceholder')} title={t('upload.suffixHint')} />
            </div>
            <div className="upload-card-footer">
              <button className="btn btn-primary" type="button" onClick={startAnalysis} disabled={!canStart || isParsing} aria-busy={isParsing}>
                {isParsing ? <><Spinner size={16} />{t('upload.parsing')}{parsingPercent != null && <span className="loading-percent">{parsingPercent}%</span>}</>
                  : <>{t('btn.startAnalysis')}<ArrowRight size={16} /></>}
              </button>
            </div>
          </section>

          {showProjectsPanel && (
            <section className="upload-recent" aria-labelledby="recent-projects-title">
              <h2 id="recent-projects-title"><Clock size={16} />{t('upload.recentProjects')}</h2>
              {projectsLoading ? <div aria-busy="true" aria-label={t('upload.projectsLoading')}><SkeletonRows rows={3} height={38} /></div> : (
                <div className="upload-projects">
                  {recentProjects.map(stored => {
                    const info = stored.project.systemInfo;
                    const mode = info.compositionMode === 'varcomp' ? t('system.varcomp') : t('system.fixedComp');
                    return (
                      <div className="upload-project" key={stored.id}>
                        <button type="button" className="upload-project-open" onClick={() => handleRestoreProject(stored)}>
                          <FileText size={17} />
                          <span><strong>{stored.name}</strong><small>{info.elements.join('-')} · {mode} · {t('upload.structureCount', { count: stored.project.structures.length })}</small></span>
                        </button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={event => handleDeleteProject(stored.id, event)}
                          aria-label={t('upload.deleteProject', { name: stored.name })}><Trash2 size={15} /></button>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </main>
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
