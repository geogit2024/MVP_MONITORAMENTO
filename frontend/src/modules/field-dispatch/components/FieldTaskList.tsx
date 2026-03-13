import React from 'react';
import { FIELD_TASK_STATUS_COLORS, FIELD_TASK_STATUS_LABEL } from '../types';
import type { FieldTask, FieldTaskStatus } from '../types';

interface FieldTaskListProps {
  tasks: FieldTask[];
  selectedTaskId: number | null;
  onSelectTask: (taskId: number) => void;
}

const hexToRgba = (hex: string, alpha: number) => {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return `rgba(56, 189, 248, ${alpha})`;
  const numeric = Number.parseInt(clean, 16);
  const r = (numeric >> 16) & 255;
  const g = (numeric >> 8) & 255;
  const b = numeric & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

export function FieldTaskList({ tasks, selectedTaskId, onSelectTask }: FieldTaskListProps) {
  return (
    <section className="dispatch-card dispatch-card--resizable-list">
      <h3>Atividades ({tasks.length})</h3>
      <ul className="task-list">
        {tasks.map((task) => {
          const statusText = FIELD_TASK_STATUS_LABEL[task.status] || task.status;
          const statusColor = FIELD_TASK_STATUS_COLORS[task.status as FieldTaskStatus] || '#93c5fd';
          const isActive = selectedTaskId === task.id;
          return (
            <li
              key={task.id}
              className={isActive ? 'active' : ''}
              onClick={() => onSelectTask(task.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelectTask(task.id);
                }
              }}
              role="button"
              aria-pressed={isActive}
              tabIndex={0}
            >
              <p className="task-title">{task.title}</p>
              <div className="task-meta">
                <span
                  className="status-pill"
                  style={{
                    color: statusColor,
                    backgroundColor: hexToRgba(statusColor, 0.2),
                    borderColor: hexToRgba(statusColor, 0.55),
                  }}
                >
                  {statusText}
                </span>
                <span>{task.priority}</span>
              </div>
              <div className="task-meta">
                <span>{task.category}</span>
                <span>{(task.createdAt || '').slice(0, 10)}</span>
              </div>
            </li>
          );
        })}
        {tasks.length === 0 ? <li>Nenhuma atividade encontrada.</li> : null}
      </ul>
    </section>
  );
}
