import React from 'react';
import { FIELD_TASK_STATUS_LABEL } from '../../../modules/field-dispatch/types';
import type { FieldTask } from '../../../modules/field-dispatch/types';

interface AgentTaskListPageProps {
  agentName: string;
  tasks: FieldTask[];
  onSelectTask: (task: FieldTask) => void;
  onReload: () => void;
  onLogout: () => void;
}

export function AgentTaskListPage({
  agentName,
  tasks,
  onSelectTask,
  onReload,
  onLogout,
}: AgentTaskListPageProps) {
  return (
    <div className="mobile-shell">
      <div className="mobile-card">
        <h2>Tarefas atribuídas</h2>
        <p className="subtitle">{agentName}</p>
        <div className="mobile-action-row">
          <button type="button" className="dispatch-button" onClick={onReload}>
            Atualizar
          </button>
          <button type="button" className="dispatch-button ghost" onClick={onLogout}>
            Sair
          </button>
        </div>
      </div>

      <ul className="mobile-task-list">
        {tasks.map((task) => (
          <li key={task.id}>
            <h3 className="task-title">{task.title}</h3>
            <p className="subtitle">
              #{task.id} • {task.category} • {task.priority}
            </p>
            <p className="subtitle">
              Status: {FIELD_TASK_STATUS_LABEL[task.status] || task.status}
            </p>
            <button type="button" className="dispatch-button success" onClick={() => onSelectTask(task)}>
              Abrir atividade
            </button>
          </li>
        ))}
        {tasks.length === 0 ? <li>Nenhuma atividade atribuída no momento.</li> : null}
      </ul>
    </div>
  );
}
