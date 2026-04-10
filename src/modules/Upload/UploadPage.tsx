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

export function UploadPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const processFiles = useProjectStore((s) => s.processFiles);
  const setProjectName = useProjectStore((s) => s.setProjectName);
  const loadProjectFile = useProjectStore((s) => s.loadProjectFile);

  const [detectedFiles, setDetectedFiles] = useState<DetectedFile[]>([]);
  const [fileContents, setFileContents] = useState<Map<USPEXFileType, string>>(new Map());
  const [isDragging, setIsDragging] = useState(false);
  const [projectName, setProjectNameLocal] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [hoveredProjectId, setHoveredProjectId] = useState<string | null>(null);

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
    const newDetected: DetectedFile[] = [...detectedFiles];
    const newContents = new Map(fileContents);
    const newErrors: string[] = [];

    for (const file of Array.from(files)) {
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
  }, [detectedFiles, fileContents, loadProjectFile, navigate]);


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
    fileContents.has('extended_convex_hull') || fileContents.has('individuals');

  const startAnalysis = () => {
    if (!canStart) return;
    if (!projectName.trim()) return;  // 没起名字不让开始
    setProjectName(projectName.trim()); // ← 加这一行，存入 store
    processFiles(detectedFiles, fileContents);
    navigate('/dashboard');
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
      <div style={{ textAlign: 'center', marginBottom: 1 }} className="fade-in">
        <img
          src={logoImg}
          alt="USPEX Analyzer"
          style={{ width: 250, height: 250, borderRadius: 6, margin: '0 auto' }}
        />
      </div>

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

          {/* Project name — above dropzone */}
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 6 }}>
              {t('upload.nameProject')}
            </label>
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectNameLocal(e.target.value)}
              placeholder={t('upload.namePlaceholder')}
              onClick={(e) => e.stopPropagation()}
              style={{
                width: '100%', padding: '8px 12px', borderRadius: 6,
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
            style={{ width: '100%', marginBottom: 16, padding: '28px 24px' }}
          >
            <input ref={inputRef} type="file" multiple style={{ display: 'none' }} onChange={handleInputChange} />
            <UploadCloud size={36} color="var(--color-primary)" style={{ display: 'block', margin: '0 auto 8px' }} />
            <p style={{ fontSize: 15, fontWeight: 600, margin: '0 0 4px', color: 'var(--color-text)' }}>
              {t('upload.dragHint')}
            </p>
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '0 0 16px' }}>
              {t('upload.orLoadProject')}
            </p>

            {/* File groups with live status */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
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
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
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
              disabled={!canStart || !projectName.trim()}
              style={{
                padding: '10px 32px', fontSize: 15,
                opacity: canStart && projectName.trim() ? 1 : 0.4,
                cursor: canStart && projectName.trim() ? 'pointer' : 'not-allowed',
              }}
            >
              {t('btn.startAnalysis')} →
            </button>
            {!canStart && (
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 8 }}>
                {t('upload.requiredFilesHint')}
              </p>
            )}
            {canStart && !projectName.trim() && (
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 8 }}>
                {t('upload.nameFirst')}
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
