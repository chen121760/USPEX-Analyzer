import type { Structure } from '@/types/structure';

/** 构建子代索引：parentId → childId[] */
export function buildChildrenMap(structures: Structure[]): Map<number, number[]> {
  const map = new Map<number, number[]>();
  for (const s of structures) {
    for (const pid of s.parentIds) {
      if (pid === 0) continue;
      if (!map.has(pid)) map.set(pid, []);
      map.get(pid)!.push(s.id);
    }
  }
  return map;
}

/** 向上追溯所有祖先（广度优先，避免重复） */
export function getAncestors(
  targetId: number,
  structureMap: Map<number, Structure>,
  maxDepth = 20,
): { id: number; depth: number }[] {
  const result: { id: number; depth: number }[] = [];
  const visited = new Set<number>();
  let queue = [{ id: targetId, depth: 0 }];

  while (queue.length > 0) {
    const next: typeof queue = [];
    for (const item of queue) {
      const s = structureMap.get(item.id);
      if (!s) continue;
      for (const pid of s.parentIds) {
        if (pid === 0 || visited.has(pid)) continue;
        visited.add(pid);
        const entry = { id: pid, depth: item.depth + 1 };
        result.push(entry);
        if (item.depth + 1 < maxDepth) {
          next.push(entry);
        }
      }
    }
    queue = next;
  }

  return result;
}

/** 向下获取直接子代（一层） */
export function getDirectChildren(
  targetId: number,
  childrenMap: Map<number, number[]>,
): number[] {
  return childrenMap.get(targetId) ?? [];
}

/** 向下获取所有后代（广度优先，带深度） */
export function getDescendants(
  targetId: number,
  childrenMap: Map<number, number[]>,
  maxDepth = 10,
): { id: number; depth: number }[] {
  const result: { id: number; depth: number }[] = [];
  const visited = new Set<number>();
  let queue = [{ id: targetId, depth: 0 }];

  while (queue.length > 0) {
    const next: typeof queue = [];
    for (const item of queue) {
      const children = childrenMap.get(item.id) ?? [];
      for (const cid of children) {
        if (visited.has(cid)) continue;
        visited.add(cid);
        const entry = { id: cid, depth: item.depth + 1 };
        result.push(entry);
        if (item.depth + 1 < maxDepth) {
          next.push(entry);
        }
      }
    }
    queue = next;
  }

  return result;
}
