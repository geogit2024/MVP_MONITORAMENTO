import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AgentTaskExecutionPage } from './pages/AgentTaskExecutionPage';
import { AgentLoginPage } from './pages/AgentLoginPage';
import { AgentTaskDetailsPage } from './pages/AgentTaskDetailsPage';
import { AgentTaskListPage } from './pages/AgentTaskListPage';
import { fieldDispatchApi } from '../../modules/field-dispatch/services/fieldDispatchApi';
import type { RequestContext } from '../../modules/field-dispatch/services/fieldDispatchApi';
import type { AgentLoginResponse, FieldTask, FieldTaskStatus } from '../../modules/field-dispatch/types';
import { FIELD_TASK_STATUS_LABEL } from '../../modules/field-dispatch/types';
import { findStatusPath } from '../../modules/field-dispatch/utils/statusFlow';
import '../../modules/field-dispatch/field-dispatch.css';

type MobileStage = 'list' | 'details' | 'execution';
const MOBILE_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const LOGIN_SUCCESS_MESSAGE = 'Login efetuado com sucesso.';
const LOGIN_SUCCESS_TOAST_DURATION_MS = 2500;

export default function FieldAgentMobileApp() {
  const [session, setSession] = useState<AgentLoginResponse | null>(null);
  const [tasks, setTasks] = useState<FieldTask[]>([]);
  const [selectedTask, setSelectedTask] = useState<FieldTask | null>(null);
  const [stage, setStage] = useState<MobileStage>('list');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const context = useMemo<RequestContext | null>(() => {
    if (!session) return null;
    return {
      role: 'agente_campo',
      userId: String(session.agent.id),
      agentToken: session.token,
    };
  }, [session]);

  const loadTasks = useCallback(async () => {
    if (!session || !context) return;
    try {
      setLoading(true);
      const loaded = await fieldDispatchApi.listAgentTasks(session.agent.id, false, context);
      setTasks(loaded);
      setSelectedTask((previous) => {
        if (!previous) return previous;
        return loaded.find((task) => task.id === previous.id) || null;
      });
    } catch (error: unknown) {
      setMessage((error as Error)?.message || 'Falha ao carregar tarefas do agente.');
    } finally {
      setLoading(false);
    }
  }, [context, session]);

  useEffect(() => {
    if (!session) return;
    void loadTasks();
    const interval = window.setInterval(() => {
      void loadTasks();
    }, MOBILE_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [loadTasks, session]);

  useEffect(() => {
    if (message !== LOGIN_SUCCESS_MESSAGE) return;
    const timeoutId = window.setTimeout(() => {
      setMessage((current) => (current === LOGIN_SUCCESS_MESSAGE ? '' : current));
    }, LOGIN_SUCCESS_TOAST_DURATION_MS);
    return () => window.clearTimeout(timeoutId);
  }, [message]);

  const handleStatusAction = async (status: FieldTaskStatus, note?: string) => {
    if (!selectedTask || !context) return;
    const path = findStatusPath(selectedTask.status, status);
    if (!path) {
      setMessage(
        `Transicao invalida: ${FIELD_TASK_STATUS_LABEL[selectedTask.status]} -> ${FIELD_TASK_STATUS_LABEL[status]}.`
      );
      return;
    }
    if (path.length === 1) {
      setMessage(`A tarefa ja esta em ${FIELD_TASK_STATUS_LABEL[status]}.`);
      return;
    }

    try {
      setLoading(true);
      let updated = selectedTask;
      for (let index = 1; index < path.length; index += 1) {
        const step = path[index];
        const stepNote =
          index === path.length - 1
            ? note
            : `Progressao automatica: ${FIELD_TASK_STATUS_LABEL[step]}.`;
        updated = await fieldDispatchApi.updateStatus(
          selectedTask.id,
          { newStatus: step, note: stepNote },
          context
        );
      }
      setSelectedTask(updated);
      setTasks((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      setMessage('');
      if (status === 'concluida' || status === 'recusada' || status === 'cancelada') {
        setStage('list');
      }
    } catch (error: unknown) {
      setMessage((error as Error)?.message || 'Falha na atualização de status.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setSession(null);
    setTasks([]);
    setSelectedTask(null);
    setStage('list');
    setMessage('');
  };

  return (
    <div className="mobile-field-agent">
      {!session ? (
        <AgentLoginPage
          onLogin={(payload) => {
            setSession(payload);
            setMessage(LOGIN_SUCCESS_MESSAGE);
          }}
        />
      ) : stage === 'list' || !selectedTask ? (
        <AgentTaskListPage
          agentName={session.agent.name}
          tasks={tasks}
          onSelectTask={(task) => {
            setSelectedTask(task);
            setStage('details');
          }}
          onReload={() => void loadTasks()}
          onLogout={handleLogout}
        />
      ) : stage === 'details' ? (
        <AgentTaskDetailsPage
          task={selectedTask}
          context={context as RequestContext}
          onBack={() => {
            setSelectedTask(null);
            setStage('list');
          }}
          onStartExecution={() => setStage('execution')}
          onStatusAction={(status, note) => void handleStatusAction(status, note)}
        />
      ) : (
        <AgentTaskExecutionPage
          task={selectedTask}
          context={context as RequestContext}
          onBack={() => setStage('details')}
          onStatusAction={(status, note) => void handleStatusAction(status, note)}
        />
      )}
      {(message || loading) ? (
        <div className="floating-toast" onClick={() => setMessage('')}>
          {loading ? 'Processando...' : message}
        </div>
      ) : null}
    </div>
  );
}
