import React, { useEffect, useMemo, useState } from 'react';
import { AgentTrackingLayer } from './AgentTrackingLayer';
import { DynamicTaskFormRenderer } from './DynamicTaskFormRenderer';
import { TaskStatusTimeline } from './TaskStatusTimeline';
import { fieldDispatchApi } from '../services/fieldDispatchApi';
import { buildTaskReportHtml } from '../utils/taskReport';
import { FIELD_TASK_STATUS_LABEL } from '../types';
import type {
  FieldAgent,
  FieldTask,
  FieldTaskStatus,
  TaskFormDescriptor,
  TaskTrackingResponse,
} from '../types';

interface FieldTaskDetailsDrawerProps {
  task: FieldTask | null;
  agents: FieldAgent[];
  tracking: TaskTrackingResponse | undefined;
  onDispatch: (taskId: number) => Promise<void>;
  onStatusUpdate: (taskId: number, status: FieldTaskStatus, note?: string) => Promise<void>;
  onReassign: (taskId: number, assignedAgentId: number, note: string) => Promise<void>;
  onCancel: (taskId: number, note: string) => Promise<void>;
  embedded?: boolean;
  showTitle?: boolean;
}

const dispatcherStatusOptions: FieldTaskStatus[] = [
  'despachada',
  'recebida',
  'aceita',
  'em_deslocamento',
  'no_local',
  'em_execucao',
  'concluida',
  'recusada',
  'erro_execucao',
  'cancelada',
];

const operationalNoteOptions = [
  '',
  'Aguardando validacao operacional',
  'Equipe em deslocamento',
  'Chegada no local confirmada',
  'Execucao iniciada em campo',
  'Execucao concluida com evidencia',
  'Necessita replanejamento operacional',
  'Risco identificado no atendimento',
];

const DISPATCHER_CONTEXT = { role: 'despachante' as const, userId: 'dispatcher.web' };
const NOOP_CHANGE = () => undefined;

export function FieldTaskDetailsDrawer({
  task,
  agents,
  tracking,
  onDispatch,
  onStatusUpdate,
  onReassign,
  onCancel,
  embedded = false,
  showTitle = true,
}: FieldTaskDetailsDrawerProps) {
  const [working, setWorking] = useState(false);
  const [note, setNote] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<FieldTaskStatus>('despachada');
  const [reassignAgentId, setReassignAgentId] = useState<string>('');
  const [feedback, setFeedback] = useState('');
  const [taskForm, setTaskForm] = useState<TaskFormDescriptor | null>(null);
  const [loadingTaskForm, setLoadingTaskForm] = useState(false);
  const [taskFormFeedback, setTaskFormFeedback] = useState('');

  const assignedAgentName = useMemo(() => {
    if (!task?.assignedAgentId) return 'nao atribuido';
    const found = agents.find((agent) => agent.id === task.assignedAgentId);
    return found?.name || `Agente ${task.assignedAgentId}`;
  }, [agents, task?.assignedAgentId]);

  const runAction = async (action: () => Promise<void>, successText: string) => {
    try {
      setWorking(true);
      setFeedback('');
      await action();
      setFeedback(successText);
    } catch (error: unknown) {
      setFeedback((error as Error)?.message || 'Falha ao processar acao.');
    } finally {
      setWorking(false);
    }
  };

  const handleGenerateReport = async () => {
    if (!task) return;
    try {
      setWorking(true);
      setFeedback('');
      const reportForm =
        taskForm ||
        (await fieldDispatchApi.getTaskForm(task.id, DISPATCHER_CONTEXT).catch(() => null));

      const reportHtml = buildTaskReportHtml({
        task,
        assignedAgentName,
        taskForm: reportForm,
        tracking,
      });

      const reportWindow = window.open('', '_blank', 'width=1200,height=900');
      if (!reportWindow) {
        setFeedback('Nao foi possivel abrir o relatorio. Verifique se o navegador bloqueou pop-up.');
        return;
      }

      reportWindow.document.open();
      reportWindow.document.write(reportHtml);
      reportWindow.document.close();
      setFeedback('Relatorio gerado em nova aba.');
    } catch (error: unknown) {
      setFeedback((error as Error)?.message || 'Falha ao gerar relatorio.');
    } finally {
      setWorking(false);
    }
  };

  useEffect(() => {
    if (!task) {
      setTaskForm(null);
      setTaskFormFeedback('');
      setLoadingTaskForm(false);
      return;
    }

    let ignore = false;
    setLoadingTaskForm(true);
    setTaskFormFeedback('');

    void fieldDispatchApi
      .getTaskForm(task.id, DISPATCHER_CONTEXT)
      .then((descriptor) => {
        if (!ignore) setTaskForm(descriptor);
      })
      .catch((error: unknown) => {
        if (ignore) return;
        setTaskForm(null);
        setTaskFormFeedback((error as Error)?.message || 'Falha ao carregar formulario associado.');
      })
      .finally(() => {
        if (!ignore) setLoadingTaskForm(false);
      });

    return () => {
      ignore = true;
    };
  }, [task?.formTemplateId, task?.formTemplateVersion, task?.id]);

  const containerClassName = embedded
    ? 'field-dispatch-embedded-section field-dispatch-embedded-section--details'
    : 'dispatch-form-card';

  if (!task) {
    return (
      <section className={containerClassName}>
        {showTitle ? <h3>Detalhes da atividade</h3> : null}
        <p className="subtitle">Selecione uma atividade na lista para abrir o detalhe operacional.</p>
      </section>
    );
  }

  return (
    <section className={containerClassName}>
      {showTitle ? <h3>Detalhes da atividade #{task.id}</h3> : null}

      <div className="task-details-grid">
        <p>
          <strong>Titulo:</strong> {task.title}
        </p>
        <p>
          <strong>Status:</strong> {FIELD_TASK_STATUS_LABEL[task.status] || task.status}
        </p>
        <p>
          <strong>Prioridade:</strong> {task.priority}
        </p>
        <p>
          <strong>Categoria:</strong> {task.category}
        </p>
        <p>
          <strong>Responsavel:</strong> {assignedAgentName}
        </p>
        <p>
          <strong>Prazo:</strong> {task.dueDate ? task.dueDate.slice(0, 10) : '-'}
        </p>
      </div>

      <div className="drawer-actions drawer-actions--report">
        <button
          type="button"
          className="dispatch-button success"
          disabled={working || task.status !== 'rascunho'}
          onClick={() => void runAction(() => onDispatch(task.id), 'Atividade despachada.')}
        >
          Despachar
        </button>
        <button
          type="button"
          className="dispatch-button danger"
          disabled={working || task.status === 'concluida' || task.status === 'cancelada'}
          onClick={() =>
            void runAction(
              () => onCancel(task.id, note || 'Cancelada pelo despachante'),
              'Atividade cancelada.'
            )
          }
        >
          Cancelar
        </button>
        <button
          type="button"
          className="dispatch-button ghost"
          disabled={working}
          onClick={() => void handleGenerateReport()}
        >
          Gerar relatorio
        </button>
      </div>

      <div className="task-operational-grid">
        <div className="task-operational-block task-operational-block--wide">
          <label>
            Nota operacional
            <select value={note} onChange={(e) => setNote(e.target.value)}>
              {operationalNoteOptions.map((option) => (
                <option key={option || 'empty'} value={option}>
                  {option || 'Selecione uma nota operacional'}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="task-operational-block">
          <label>
            Novo status
            <select value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value as FieldTaskStatus)}>
              {dispatcherStatusOptions.map((status) => (
                <option key={status} value={status}>
                  {FIELD_TASK_STATUS_LABEL[status]}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="dispatch-button"
            disabled={working}
            onClick={() =>
              void runAction(() => onStatusUpdate(task.id, selectedStatus, note), 'Status atualizado.')
            }
          >
            Atualizar status
          </button>
        </div>

        <div className="task-operational-block">
          <label>
            Reatribuir para
            <select value={reassignAgentId} onChange={(e) => setReassignAgentId(e.target.value)}>
              <option value="">Selecione</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="dispatch-button ghost"
            disabled={working || !reassignAgentId}
            onClick={() =>
              void runAction(
                () => onReassign(task.id, Number(reassignAgentId), note || 'Reatribuicao operacional'),
                'Atividade reatribuida.'
              )
            }
          >
            Reatribuir
          </button>
        </div>
      </div>

      {feedback ? <p className="subtitle">{feedback}</p> : null}

      {showTitle ? <h3 style={{ marginTop: 14 }}>Formulario associado</h3> : <h4 style={{ marginTop: 14 }}>Formulario associado</h4>}
      {loadingTaskForm ? <p className="subtitle">Carregando formulario associado...</p> : null}
      {!loadingTaskForm && taskFormFeedback ? <p className="subtitle">{taskFormFeedback}</p> : null}
      {!loadingTaskForm && !taskFormFeedback && taskForm && !taskForm.hasForm ? (
        <p className="subtitle">Esta atividade nao possui formulario vinculado.</p>
      ) : null}
      {!loadingTaskForm && !taskFormFeedback && taskForm?.hasForm && taskForm.schema ? (
        <>
          <p className="subtitle">
            {taskForm.template?.name || 'Template sem nome'} - versao {taskForm.version ?? '-'} -{' '}
            {taskForm.formRequired ? 'obrigatorio' : 'opcional'}
          </p>
          <DynamicTaskFormRenderer
            schema={taskForm.schema}
            values={taskForm.submission?.answers || {}}
            onChange={NOOP_CHANGE}
            readOnly
            showAllFields
          />
          <p className="subtitle" style={{ marginTop: 8 }}>
            Envio do formulario: {taskForm.submission?.status === 'submitted' ? 'enviado' : 'nao enviado'}
          </p>
        </>
      ) : null}

      {showTitle ? <h3 style={{ marginTop: 14 }}>Timeline de status</h3> : <h4 style={{ marginTop: 14 }}>Timeline de status</h4>}
      <TaskStatusTimeline history={task.history || []} />

      {showTitle ? <h3>Tracking do agente</h3> : <h4>Tracking do agente</h4>}
      <AgentTrackingLayer tracking={tracking} />
    </section>
  );
}
