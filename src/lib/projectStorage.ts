import { openDB } from 'idb';
import type { ProjectFile } from '@/types/structure';

const DB_NAME = 'uspex-analyzer';
const STORE = 'projects';
const MAX_RECENT = 10;

function getDB() {
  return openDB(DB_NAME, 2, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('projects')) {
        db.createObjectStore('projects', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('project-data')) {
        db.createObjectStore('project-data');
      }
    },
  });
}

export interface StoredProject {
  id: string;           // 唯一标识：elements + systemType
  name: string;         // 显示名称：如 "Ti-O (binary)"
  savedAt: string;      // ISO 时间
  project: ProjectFile;
}

export function makeProjectId(): string {
  return `project_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

/** 保存或覆盖一个项目 */
export async function saveProject(project: ProjectFile, projectName: string): Promise<void> {
  const db = await getDB();
  // Use the stable projectId embedded in the file; fall back to generating one
  const id = project.projectId ?? makeProjectId();
  const record: StoredProject = {
    id,
    name: projectName,  // 直接用用户起的名字
    savedAt: new Date().toISOString(),
    project: { ...project, lastModified: new Date().toISOString() },
  };
  await db.put(STORE, record);
}

/** 读取所有历史项目，按时间倒序 */
export async function loadRecentProjects(): Promise<StoredProject[]> {
  const db = await getDB();
  const all = await db.getAll(STORE);
  return all
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
    .slice(0, MAX_RECENT);
}

/** 删除一个历史项目 */
export async function deleteProject(id: string): Promise<void> {
  const db = await getDB();
  await db.delete(STORE, id);
}

/** 列出所有已存项目（不限制数量），按时间倒序 */
export async function listAllProjects(): Promise<StoredProject[]> {
  const db = await getDB();
  const all = await db.getAll(STORE);
  return all.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

/** 按 projectId 加载单个项目 */
export async function loadProjectById(id: string): Promise<StoredProject | null> {
  const db = await getDB();
  const record = await db.get(STORE, id);
  return record ?? null;
}
