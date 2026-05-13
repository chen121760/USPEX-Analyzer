/**
 * Workspace sidebar — left panel for the Hull Workshop.
 *
 * Manages data groups: import from project, upload CSV, rename, toggle
 * visibility, delete, and export merged result.
 */

import { useRef, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '@/store/useProjectStore';
import { Database, FlaskConical, Eye, EyeOff, Trash2, Download, Archive, FileJson, Plus } from 'lucide-react';
import type { WorkshopGroup } from './types';
import { ImportProjectModal } from './components/ImportProjectModal';
import { AddStructureModal, type ManualStructureData } from './components/AddStructureModal';

interface Props {
  groups: WorkshopGroup[];
  hasData: boolean;
  structuresCount: number;
  /** Workshop-scope elements (for matching saved projects) */
  elements: string[];
  /** Workshop-scope pressure (for matching saved projects) */
  pressure: number;
  /** Current project ID (excluded from saved-project list) */
  currentProjectId: string;
  onImportFromProject: () => void;
  onImportFromSaved: (groups: WorkshopGroup[]) => void;
  onUploadJson: (file: File) => void;
  onToggleVisibility: (groupId: string) => void;
  onRemoveGroup: (groupId: string) => void;
  onRenameGroup: (groupId: string, name: string) => void;
  onExportCsv: () => void;
  onExportJson: () => void;
  onAddManual: (data: ManualStructureData) => void;
}

export function WorkspaceSidebar({
  groups,
  hasData,
  structuresCount,
  elements,
  pressure,
  currentProjectId,
  onImportFromProject,
  onImportFromSaved,
  onUploadJson,
  onToggleVisibility,
  onRemoveGroup,
  onRenameGroup,
  onExportCsv,
  onExportJson,
  onAddManual,
}: Props) {
  const { t } = useTranslation();
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const projectStructures = useProjectStore((s) => s.structures);
  const projectSystemInfo = useProjectStore((s) => s.systemInfo);
  const hasProjectData = projectStructures.length > 0 && projectSystemInfo !== null;

  const [showImportModal, setShowImportModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [renameTarget, setRenameTarget] = useState<{ groupId: string; currentName: string } | null>(null);

  const handleUploadJsonClick = useCallback(() => {
    jsonInputRef.current?.click();
  }, []);

  return (
    <div className="workshop-sidebar">
      {/* Header */}
      <div className="workshop-sidebar-header">
        <FlaskConical size={18} />
        <span>{t('workshop.title', 'Hull Workshop')}</span>
      </div>

      {/* ── Data Source ── */}
      <div className="workshop-section">
        <div className="workshop-section-title">{t('workshop.dataSource', 'Data Source')}</div>

        {/* Import from current project */}
        <button
          className="workshop-btn workshop-btn-primary"
          disabled={!hasProjectData}
          onClick={onImportFromProject}
          style={{ marginBottom: 8 }}
        >
          <Database size={16} />
          <span>{t('workshop.importFromProject', 'Import from Current Project')}</span>
        </button>
        {!hasProjectData && (
          <div className="workshop-hint">
            {t('workshop.noProjectData', 'No project data loaded. Please upload USPEX files first.')}
          </div>
        )}
        {/* Import from saved projects */}
        <button
          className="workshop-btn"
          style={{ marginBottom: 8 }}
          onClick={() => setShowImportModal(true)}
        >
          <Archive size={16} />
          <span>{t('workshop.importFromSaved', 'Import from Saved Projects')}</span>
        </button>

        {/* Upload JSON */}
        <button
          className="workshop-btn"
          onClick={handleUploadJsonClick}
        >
          <FileJson size={16} />
          <span>{t('workshop.importJson', 'Upload JSON File')}</span>
        </button>

        {/* Manual add */}
        <button
          className="workshop-btn"
          onClick={() => setShowAddModal(true)}
          style={{ marginTop: 8 }}
        >
          <Plus size={16} />
          <span>{t('workshop.addStructure', 'Add Structure')}</span>
        </button>
      </div>

      {/* Hidden file input for JSON upload */}
      <input
        ref={jsonInputRef}
        type="file"
        accept=".json"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onUploadJson(f);
          e.target.value = '';
        }}
      />

      {/* ── Groups ── */}
      {groups.length > 0 && (
        <div className="workshop-section">
          <div className="workshop-section-title">
            {t('workshop.groups', 'Groups')} ({groups.length})
          </div>
          {groups.map((g) => (
            <div key={g.id} className="workshop-group-item">
              <span className="workshop-group-dot" style={{ background: g.color }} />
              <span
                className="workshop-group-name"
                title={g.name}
                onClick={() => setRenameTarget({ groupId: g.id, currentName: g.name })}
                style={{ cursor: 'pointer' }}
              >
                {g.name}
              </span>
              <span className="workshop-group-count">
                {t('workshop.structuresPerGroup', '{{count}} structures', { count: g.structures.length })}
              </span>
              <button
                className="workshop-group-btn"
                title={g.visible ? t('workshop.visible', 'Visible') : t('workshop.hidden', 'Hidden')}
                onClick={() => onToggleVisibility(g.id)}
              >
                {g.visible ? <Eye size={14} /> : <EyeOff size={14} />}
              </button>
              <button
                className="workshop-group-btn workshop-group-btn-danger"
                title={t('workshop.removeGroup', 'Remove Group')}
                onClick={() => onRemoveGroup(g.id)}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Export ── */}
      {hasData && (
        <div className="workshop-section">
          <div className="workshop-section-title">{t('workshop.exportWorkshop', 'Export Workshop Data')}</div>
          <div className="workshop-export-row">
            <button className="workshop-export-btn" onClick={onExportCsv}>
              <Download size={13} />
              <span>CSV</span>
            </button>
            <button className="workshop-export-btn" onClick={onExportJson}>
              <Download size={13} />
              <span>JSON</span>
            </button>
          </div>
          <div className="workshop-info" style={{ marginTop: 8 }}>
            {structuresCount} {t('system.totalStructures', 'Total Structures').toLowerCase()}
          </div>
        </div>
      )}

      {/* ── No groups hint ── */}
      {groups.length === 0 && (
        <div className="workshop-section">
          <div className="workshop-hint">
            {t('workshop.noGroups', 'No data groups yet. Import data to get started.')}
          </div>
        </div>
      )}

      {/* ── Import from saved projects modal ── */}
      <ImportProjectModal
        open={showImportModal}
        elements={elements}
        pressure={pressure}
        currentProjectId={currentProjectId}
        groupsCount={groups.length}
        onClose={() => setShowImportModal(false)}
        onImport={onImportFromSaved}
      />

      {/* ── Rename dialog ── */}
      {renameTarget && (
        <RenameDialog
          currentName={renameTarget.currentName}
          onConfirm={(name) => {
            onRenameGroup(renameTarget.groupId, name);
            setRenameTarget(null);
          }}
          onCancel={() => setRenameTarget(null)}
        />
      )}

      {/* ── Add Structure modal ── */}
      <AddStructureModal
        open={showAddModal}
        elements={elements}
        onClose={() => setShowAddModal(false)}
        onAdd={(data) => {
          onAddManual(data);
          setShowAddModal(false);
        }}
      />
    </div>
  );
}

/** Inline rename dialog (reuses workshop-modal styles) */
function RenameDialog({
  currentName,
  onConfirm,
  onCancel,
}: {
  currentName: string;
  onConfirm: (name: string) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState(currentName);
  return (
    <div className="workshop-modal-overlay" onClick={onCancel}>
      <div className="workshop-modal" style={{ width: 380 }} onClick={(e) => e.stopPropagation()}>
        <div className="workshop-modal-header">
          <span style={{ fontWeight: 600 }}>{t('workshop.renameGroup', 'Rename Group')}</span>
        </div>
        <div className="workshop-modal-body">
          <input
            className="workshop-input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && value.trim()) onConfirm(value.trim()); }}
            autoFocus
          />
        </div>
        <div className="workshop-modal-footer">
          <button className="workshop-btn" onClick={onCancel}>{t('btn.cancel')}</button>
          <button
            className="workshop-btn workshop-btn-primary"
            disabled={!value.trim()}
            onClick={() => onConfirm(value.trim())}
          >
            {t('btn.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
