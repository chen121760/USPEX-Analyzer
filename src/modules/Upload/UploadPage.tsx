import { useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '@/store/useProjectStore';
import { detectFileType } from '@/lib/fileDetection';
import { UploadCloud, FileText, CheckCircle2, AlertCircle, Globe } from 'lucide-react';
import type { DetectedFile, USPEXFileType, ProjectFile } from '@/types/structure';
import { useEffect } from 'react';
import { loadRecentProjects, deleteProject, saveProject, type StoredProject } from '@/lib/projectStorage';
import { Clock, Trash2 } from 'lucide-react';
import logoImg from '@/assets/logo.jpg';
import { QuickPackCommand } from '@/components/QuickPackCommand';
import { extractArchive, entriesToFiles, isArchive } from '@/utils/extractArchive';

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

export function UploadPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const processFiles = useProjectStore((s) => s.processFiles);
  const setProjectName = useProjectStore((s) => s.setProjectName);
  const loadProjectFile = useProjectStore((s) => s.loadProjectFile);

  const [detectedFiles, setDetectedFiles] = useState<DetectedFile[]>([]);
  const [fileContents, setFileContents] = useState<Map<USPEXFileType, string>>(new Map());
  const [isDragging, setIsDragging] = useState(false);
  const [suffix, setSuffix] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [hoveredProjectId, setHoveredProjectId] = useState<string | null>(null);
  const [loadingSample, setLoadingSample] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  // 存储历史项目列表
  const [recentProjects, setRecentProjects] = useState<StoredProject[]>([]);

  // 页面挂载时读取一次 IndexedDB
  useEffect(() => {
    loadRecentProjects().then(setRecentProjects);
  }, []); // [] 表示只在组件第一次渲染时执行

  // 点击历史项目 → 恢复数据 → 跳转到 Dashboard
  const handleRestoreProject = (stored: StoredProject) => {
    loadProjectFile(stored.project); // 这个函数 store 里已有
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
            const project: ProjectFile = JSON.parse(content);
            loadProjectFile(project);
            const name = project.projectName || file.name.replace(/\.json$/i, '') || 'Imported Project';
            setProjectName(name);
            saveProject(project, name);
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
          newDetected[existingIdx] = detected;
        } else {
          newDetected.push(detected);
        }

        newContents.set(detected.type, content);
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
    if (e.target.files) handleFiles(e.target.files);
  };

  const canStart =
    fileContents.has('individuals') &&
    fileContents.has('origin') &&
    fileContents.has('parameters') &&
    fileContents.has('gathered_poscars');

  const startAnalysis = () => {
    processFiles(detectedFiles, fileContents);
    // Build auto name from parsed systemInfo (processFiles is synchronous)
    const state = useProjectStore.getState();
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
      loadProjectFile(project);
      const name = project.projectName || 'Sample';
      setProjectName(name);
      saveProject(project, name);
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

  // Which file types have been detected?
  const detectedTypes = new Set(detectedFiles.map((d) => d.type));

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        paddingTop: 32,
        padding: 24,
        background: 'var(--color-bg)',
      }}
    >
      {/* Language button top-right */}
      <button
        className="btn btn-ghost btn-sm"
        onClick={toggleLang}
        style={{ position: 'fixed', top: 12, right: 16 }}
      >
        <Globe size={16} />
        <span>{i18n.language === 'zh' ? 'EN' : '中'}</span>
      </button>

      {/* Logo only */}
      <div style={{ textAlign: 'center', marginBottom: 4 }} className="fade-in">
        <img
          src={logoImg}
          alt="USPEX Analyzer"
          style={{ width: 250, height: 250, borderRadius: 6, margin: '0 auto' }}
        />
      </div>

      {/* Sample data banner */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '7px 16px', borderRadius: 10, marginBottom: 10,
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        fontSize: 13,
      }}>
        <span style={{ color: 'var(--color-text-muted)' }}>
          {i18n.language === 'zh' ? '没有数据？' : 'No data yet?'}
        </span>
        <button
          className="btn btn-ghost btn-sm"
          onClick={handleLoadSample}
          disabled={loadingSample}
          style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-primary)', padding: '2px 8px' }}
        >
          {loadingSample ? '...' : t('btn.loadSample')} →
        </button>
        <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
          {t('upload.sampleHint')}
        </span>
      </div>

      {/* Quick-pack command card — visible before user uploads anything */}
      <QuickPackCommand />

      {/* Main content: upload + recent side by side when history exists */}
      <div style={{
        display: 'flex',
        flexDirection: recentProjects.length > 0 ? 'row' : 'column',
        alignItems: recentProjects.length > 0 ? 'flex-start' : 'center',
        gap: 24,
        width: '100%',
        maxWidth: recentProjects.length > 0 ? 1100 : 560,
        justifyContent: 'center',
      }}>
        {/* Left: naming + drop zone + start button */}
        <div style={{ flex: recentProjects.length > 0 ? '0 0 560px' : undefined, width: recentProjects.length > 0 ? undefined : '100%' }}>

          {/* Suffix input — optional, above dropzone */}
          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 4 }}>
              {t('upload.suffixLabel')}
            </label>
            <input
              type="text"
              value={suffix}
              onChange={(e) => setSuffix(e.target.value)}
              placeholder={t('upload.suffixPlaceholder')}
              onClick={(e) => e.stopPropagation()}
              style={{
                width: '100%', padding: '7px 12px', borderRadius: 6,
                border: '1px solid var(--color-border)', fontSize: 13,
                background: 'var(--color-surface)', color: 'var(--color-text)',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Drop zone */}
          <div
            className={`dropzone ${isDragging ? 'active' : ''}`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={handleClick}
            style={{ width: '100%', marginBottom: 12, padding: '14px 20px' }}
          >
            <input ref={inputRef} type="file" multiple style={{ display: 'none' }} onChange={handleInputChange} />
            <UploadCloud size={24} color="var(--color-primary)" style={{ display: 'block', margin: '0 auto 6px' }} />
            <p style={{ fontSize: 14, fontWeight: 600, margin: '0 0 2px', color: 'var(--color-text)' }}>
              {t('upload.dragHint')}
            </p>
            <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: '0 0 10px' }}>
              {t('upload.orLoadProject')}
            </p>

            {/* File groups with live status */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, width: '100%' }}>
              {([
                { labelKey: 'upload.groupCore', color: '#16a34a', bg: 'rgba(22,163,74,0.12)', files: [
                  { name: 'Individuals', type: 'individuals' },
                  { name: 'origin', type: 'origin' },
                  { name: 'Parameters.txt', type: 'parameters' },
                  { name: 'gatheredPOSCARS', type: 'gathered_poscars' },
                ] },
                { labelKey: 'upload.groupVarcomp', color: '#3b82f6', bg: 'rgba(59,130,246,0.12)', files: [
                  { name: 'extended_convex_hull', type: 'extended_convex_hull' },
                ] },
                { labelKey: 'upload.groupMulti', color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)', files: [
                  { name: 'Pareto_ranking', type: 'pareto_ranking' },
                ] },
                { labelKey: 'upload.groupML', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', files: [
                  { name: 'MLProperties', type: 'ml_properties' },
                ] },
              ] as const).map((group) => (
                <div key={group.labelKey}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {t(group.labelKey)}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '4px 6px' }}>
                    {group.files.map(({ name, type }) => {
                      const uploaded = detectedTypes.has(type as USPEXFileType);
                      return (
                        <span
                          key={name}
                          style={{
                            fontSize: 11, padding: '2px 8px', borderRadius: 10,
                            background: group.bg,
                            color: group.color,
                            opacity: uploaded ? 1 : 0.5,
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            transition: 'opacity 0.2s, box-shadow 0.2s',
                            boxShadow: uploaded ? `0 0 0 1px ${group.color}60` : 'none',
                          }}
                        >
                          {uploaded && <CheckCircle2 size={10} />}
                          {name}
                        </span>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Errors inside dropzone */}
            {errors.length > 0 && (
              <div style={{ marginTop: 12 }}>
                {errors.map((err, i) => (
                  <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', color: 'var(--color-danger)', fontSize: 12 }}>
                    <AlertCircle size={13} />
                    {err}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Start button */}
          <div style={{ textAlign: 'center' }}>
            <button
              className="btn btn-primary"
              onClick={startAnalysis}
              disabled={!canStart}
              style={{
                padding: '10px 32px', fontSize: 15,
                opacity: canStart ? 1 : 0.4,
                cursor: canStart ? 'pointer' : 'not-allowed',
              }}
            >
              {t('btn.startAnalysis')} →
            </button>
            {!canStart && (
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 8 }}>
                {t('upload.requiredFilesHint')}
              </p>
            )}
          </div>
        </div>

        {/* Right: Recent projects */}
        {recentProjects.length > 0 && (
          <div style={{ flex: '1 1 300px', minWidth: 260, maxWidth: 400 }}>
            <h3 style={{
              fontSize: 13, fontWeight: 600, marginBottom: 10,
              color: 'var(--color-text-secondary)',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <Clock size={14} />
              {t('upload.recentProjects')}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {recentProjects.map((stored) => {
                const si = stored.project.systemInfo;
                const systemLabel = si ? si.elements.join('-') : '—';
                const compMode = si ? (si.compositionMode === 'varcomp' ? t('system.varcomp') : t('system.fixedComp')) : '';
                const gens = si ? `${si.totalGenerations} gen` : '';
                return (
                  <div
                    key={stored.id}
                    onClick={() => handleRestoreProject(stored)}
                    onMouseEnter={() => setHoveredProjectId(stored.id)}
                    onMouseLeave={() => setHoveredProjectId(null)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 14px', borderRadius: 8, cursor: 'pointer',
                      border: `1px solid ${hoveredProjectId === stored.id ? 'var(--color-primary)' : 'var(--color-border)'}`,
                      background: hoveredProjectId === stored.id ? 'var(--color-surface-hover, rgba(99,102,241,0.06))' : 'var(--color-surface)',
                      transition: 'border-color 0.15s, background 0.15s',
                    }}
                  >
                    <FileText size={16} color="var(--color-primary)" style={{ flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {stored.name}
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-primary)', marginTop: 1 }}>
                        {systemLabel}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <span>{compMode}</span>
                        {gens && <span>· {gens}</span>}
                        <span>· {stored.project.structures.length} {t('system.totalStructures').toLowerCase()}</span>
                      </div>
                    </div>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={(e) => handleDeleteProject(stored.id, e)}
                      style={{ padding: 4, flexShrink: 0 }}
                    >
                      <Trash2 size={14} color="var(--color-text-muted)" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
