import React from 'react';
import { FIELD_TASK_STATUS_LABEL } from '../types';
import type { FieldTaskHistoryItem } from '../types';

interface TaskStatusTimelineProps {
  history: FieldTaskHistoryItem[];
}

export function TaskStatusTimeline({ history }: TaskStatusTimelineProps) {
  return (
    <ul className="timeline">
      {history.map((item) => (
        <li key={item.id}>
          <time>{(item.changedAt || '').replace('T', ' ').slice(0, 19)}</time>
          <strong>{FIELD_TASK_STATUS_LABEL[item.newStatus] || item.newStatus}</strong>
          <div className="subtitle">{item.changedBy}</div>
          {item.note ? <div className="subtitle">{item.note}</div> : null}
        </li>
      ))}
      {history.length === 0 ? <li>Sem histórico de status.</li> : null}
    </ul>
  );
}
