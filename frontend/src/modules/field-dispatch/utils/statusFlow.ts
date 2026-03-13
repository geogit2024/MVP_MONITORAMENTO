import type { FieldTaskStatus } from '../types';

const TRANSITIONS: Record<FieldTaskStatus, FieldTaskStatus[]> = {
  rascunho: ['despachada', 'cancelada'],
  despachada: ['recebida', 'recusada', 'cancelada'],
  recebida: ['aceita', 'recusada', 'cancelada'],
  aceita: ['em_deslocamento', 'cancelada'],
  em_deslocamento: ['no_local', 'erro_execucao', 'cancelada'],
  no_local: ['em_execucao', 'erro_execucao', 'cancelada'],
  em_execucao: ['concluida', 'erro_execucao', 'cancelada'],
  erro_execucao: ['em_execucao', 'concluida', 'cancelada'],
  concluida: [],
  recusada: [],
  cancelada: [],
};

export function findStatusPath(
  current: FieldTaskStatus,
  target: FieldTaskStatus
): FieldTaskStatus[] | null {
  if (current === target) return [current];

  const queue: Array<{ status: FieldTaskStatus; path: FieldTaskStatus[] }> = [
    { status: current, path: [current] },
  ];
  const visited = new Set<FieldTaskStatus>([current]);

  while (queue.length > 0) {
    const node = queue.shift();
    if (!node) break;
    const nextStatuses = TRANSITIONS[node.status] || [];

    for (const next of nextStatuses) {
      if (visited.has(next)) continue;
      const nextPath = [...node.path, next];
      if (next === target) return nextPath;
      visited.add(next);
      queue.push({ status: next, path: nextPath });
    }
  }

  return null;
}

export function canReachStatus(current: FieldTaskStatus, target: FieldTaskStatus): boolean {
  return findStatusPath(current, target) !== null;
}
