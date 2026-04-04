import { useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '@/store/useProjectStore';
import { detectFileType, ALL_USPEX_FILE_TYPES, getFileTypeInfo } from '@/lib/fileDetection';
import {
  UploadCloud, FileText, CheckCircle2, Circle, AlertCircle, Globe, Atom,
} from 'lucide-react';
import type { DetectedFile, USPEXFileType, ProjectFile } from '@/types/structure';

export function UploadPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const processFiles = useProjectStore((s) => s.processFiles);
  const loadProjectFile = useProjectStore((s) => s.loadProjectFile);

  const [detectedFiles, setDetectedFiles] = useState<DetectedFile[]>([]);
  const [fileContents, setFileContents] = useState<Map<USPEXFileType, string>>(new Map());
  const [isDragging, setIsDragging] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);

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
        justifyContent: 'center',
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

      {/* Title */}
      <div style={{ textAlign: 'center', marginBottom: 32 }} className="fade-in">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 8 }}>
          <Atom size={32} color="var(--color-primary)" />
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0, color: 'var(--color-text)' }}>
            {t('app.title')}
          </h1>
        </div>
        <p style={{ color: 'var(--color-text-secondary)', margin: 0, fontSize: 14 }}>
          {t('app.subtitle')}
        </p>
      </div>

      {/* Drop zone */}
      <div
        className={`dropzone ${isDragging ? 'active' : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={handleClick}
        style={{ maxWidth: 560, width: '100%', marginBottom: 24 }}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          style={{ display: 'none' }}
          onChange={handleInputChange}
        />
        <UploadCloud size={40} color="var(--color-primary)" style={{ marginBottom: 12 }} />
        <p style={{ fontSize: 15, fontWeight: 500, margin: '0 0 6px', color: 'var(--color-text)' }}>
          {t('upload.dragHint')}
        </p>
        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: 0 }}>
          {t('upload.supportedFiles')}
        </p>
        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '8px 0 0' }}>
          {t('upload.orLoadProject')}
        </p>
      </div>

      {/* Detected files list */}
      {(detectedFiles.length > 0 || errors.length > 0) && (
        <div style={{ maxWidth: 560, width: '100%' }} className="fade-in">
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
            {t('upload.detected')}
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {ALL_USPEX_FILE_TYPES.map((ftype) => {
              const isDetected = detectedTypes.has(ftype);
              const info = getFileTypeInfo(ftype);

              return (
                <div
                  key={ftype}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: `1px solid ${isDetected ? 'var(--color-success)' : 'var(--color-border)'}`,
                    background: isDetected ? 'rgba(22, 163, 74, 0.05)' : 'transparent',
                    opacity: isDetected ? 1 : 0.5,
                  }}
                >
                  {isDetected ? (
                    <CheckCircle2 size={16} color="var(--color-success)" />
                  ) : (
                    <Circle size={16} color="var(--color-text-muted)" />
                  )}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{t(info.displayKey)}</div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                      {t(info.descKey)}
                    </div>
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                    {info.required ? t('upload.required') : t('upload.optional')}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Errors */}
          {errors.map((err, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, color: 'var(--color-danger)', fontSize: 12 }}>
              <AlertCircle size={14} />
              {err}
            </div>
          ))}

          {/* Start button */}
          <div style={{ marginTop: 24, textAlign: 'center' }}>
            <button
              className="btn btn-primary"
              onClick={startAnalysis}
              disabled={!canStart}
              style={{
                padding: '10px 32px',
                fontSize: 15,
                opacity: canStart ? 1 : 0.4,
                cursor: canStart ? 'pointer' : 'not-allowed',
              }}
            >
              {t('btn.startAnalysis')} →
            </button>
            {!canStart && (
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 8 }}>
                需要上传 extended_convex_hull 或 Individuals 文件
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
