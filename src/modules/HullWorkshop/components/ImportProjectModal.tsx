/**
 * Modal for importing structures from saved projects into the Hull Workshop.
 *
 * Lists all saved projects that match the current workshop's element set and
 * external pressure, letting the user pick one or more to import.  Each
 * selected project becomes its own group, using the project name directly.
 * Renaming can be done later by clicking the group name in the sidebar.
 */

import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Database, Check, Archive } from 'lucide-react';
import { listAllProjects, loadProjectById, type StoredProject } from '@/lib/projectStorage';
import type { Structure } from '@/types/structure';
import type { WorkshopGroup } from '../types';
import { GROUP_COLORS, defaultGroupName } from '../types';

/* ------------------------------------------------------------------ */
/*  Props                                                               */
/* ------------------------------------------------------------------ */

interface Props {
  open: boolean;
  /** Elements of the current workshop context (for matching) */
  elements: string[];
  /** External pressure of the current workshop context (for matching) */
  pressure: number;
  /** Current project id (excluded from the list) */
  currentProjectId: string;
  /** Number of existing groups (for color rotation) */
  groupsCount: number;
  onClose: () => void;
  onImport: (groups: WorkshopGroup[]) => void;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                              */
/* ------------------------------------------------------------------ */

/** Two element sets match if they contain the same symbols (order-insensitive). */
function sameElements(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((el, i) => el === sb[i]);
}

/** Filter structures suitable for geometric hull (same as current-project import). */
function filterWorkshopStructures(structures: Structure[]): Structure[] {
  return structures.filter(
    (s) => s.enthalpyTotal <= 900 && !isNaN(s.fitness) && s.fitness >= 0,
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                            */
/* ------------------------------------------------------------------ */

export function ImportProjectModal({
  open,
  elements,
  pressure,
  currentProjectId,
  groupsCount,
  onClose,
  onImport,
}: Props) {
  const { t } = useTranslation();

  const [loading, setLoading] = useState(false);
  const [allProjects, setAllProjects] = useState<StoredProject[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);

  // Load all projects when modal opens
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setAllProjects([]);
    setSelectedIds(new Set());
    listAllProjects()
      .then((projects) => {
        if (!cancelled) {
          setAllProjects(projects);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [open]);

  // Filter compatible projects (same elements, same pressure, not current)
  const compatibleProjects = useMemo(() => {
    return allProjects.filter((p) => {
      const sysInfo = p.project.systemInfo;
      if (!sysInfo) return false;
      if (!sameElements(elements, sysInfo.elements ?? [])) return false;
      const p1 = pressure ?? 0;
      const p2 = sysInfo.externalPressure ?? 0;
      if (Math.abs(p1 - p2) > 0.001) return false;
      if (currentProjectId && p.id === currentProjectId) return false;
      return true;
    });
  }, [allProjects, elements, pressure, currentProjectId]);

  // Toggle a project in the selection set
  const toggleProject = (projectId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  };

  // Import all selected projects
  const handleImport = async () => {
    if (selectedIds.size === 0) return;
    setImporting(true);
    try {
      const newGroups: WorkshopGroup[] = [];

      for (const projectId of selectedIds) {
        const stored = await loadProjectById(projectId);
        if (!stored) continue;

        const rawStructures = stored.project.structures ?? [];
        const chartStructures = filterWorkshopStructures(rawStructures);
        if (chartStructures.length === 0) continue;

        const systemInfo = stored.project.systemInfo;
        const name = defaultGroupName(stored.name, elements);

        newGroups.push({
          id: crypto.randomUUID(),
          name,
          structures: chartStructures.map((s) => ({ ...s })),
          systemInfo: { ...systemInfo },
          visible: true,
          color: GROUP_COLORS[(groupsCount + newGroups.length) % GROUP_COLORS.length],
          importSource: 'project',
        });
      }

      if (newGroups.length === 0) {
        alert(t('workshop.noProjectData'));
      } else {
        onImport(newGroups);
        onClose();
      }
    } catch (err: unknown) {
      alert(t('workshop.importCsvInvalidFormat', {
        detail: err instanceof Error ? err.message : 'Unknown error',
      }));
    } finally {
      setImporting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="workshop-modal-overlay" onClick={onClose}>
      <div className="workshop-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="workshop-modal-header">
          <Archive size={18} />
          <span style={{ fontWeight: 600 }}>{t('workshop.importFromSaved')}</span>
          <button className="workshop-modal-close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="workshop-modal-body">
          {loading ? (
            <div className="workshop-modal-loading">
              {t('workshop.loadingProjects')}
            </div>
          ) : compatibleProjects.length === 0 ? (
            <div className="workshop-modal-empty">
              {t('workshop.noCompatibleProjects')}
            </div>
          ) : (
            <>
              <div className="workshop-info" style={{ marginBottom: 8 }}>
                {t('workshop.importFromSavedHint', 'Import structures from other saved projects with matching elements and pressure.')}
              </div>
              <div className="workshop-project-list">
              {compatibleProjects.map((p) => {
                const sysInfo = p.project.systemInfo;
                const structCount = p.project.structures?.length ?? 0;
                const savedTime = new Date(p.savedAt).toLocaleString();
                const isSelected = selectedIds.has(p.id);

                return (
                  <button
                    key={p.id}
                    className={`workshop-project-item ${isSelected ? 'workshop-project-item--selected' : ''}`}
                    onClick={() => toggleProject(p.id)}
                  >
                    <div className="workshop-project-item-top">
                      <span className="workshop-project-name">{p.name}</span>
                      <span className="workshop-project-count">
                        {structCount} {t('system.totalStructures', 'Total Structures').toLowerCase()}
                      </span>
                    </div>
                    <div className="workshop-project-item-meta">
                      <span>
                        {sysInfo?.elements?.join('-') ?? '?'}
                        {' · '}
                        {t('workshop.pressureMatch', { pressure: sysInfo?.externalPressure ?? 0 })}
                      </span>
                      <span>{t('workshop.savedAt', { time: savedTime })}</span>
                    </div>
                    {isSelected && <Check size={14} className="workshop-project-check" />}
                  </button>
                );
              })}
            </div>
            </>
          )}
        </div>

        {/* Footer */}
        {compatibleProjects.length > 0 && (
          <div className="workshop-modal-footer">
            <button className="workshop-btn" onClick={onClose}>
              {t('btn.cancel')}
            </button>
            <button
              className="workshop-btn workshop-btn-primary"
              disabled={selectedIds.size === 0 || importing}
              onClick={handleImport}
            >
              <Database size={16} />
              <span>
                {importing
                  ? t('loading')
                  : selectedIds.size > 0
                    ? `${t('workshop.import')} (${selectedIds.size})`
                    : t('workshop.import')}
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
