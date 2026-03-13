import React, { useEffect, useMemo, useState } from 'react';
import { CircleMarker, MapContainer, Polyline, TileLayer } from 'react-leaflet';
import { DynamicTaskFormRenderer } from '../../../modules/field-dispatch/components/DynamicTaskFormRenderer';
import { fieldDispatchApi } from '../../../modules/field-dispatch/services/fieldDispatchApi';
import type { RequestContext } from '../../../modules/field-dispatch/services/fieldDispatchApi';
import type {
  FieldEvidence,
  FieldTask,
  FieldTaskStatus,
  PointGeometry,
  TaskFormDescriptor,
} from '../../../modules/field-dispatch/types';
import { canReachStatus } from '../../../modules/field-dispatch/utils/statusFlow';
import { buildRoutePolyline } from '../../../modules/field-dispatch/utils/route';
import { AgentEvidenceUploader } from '../components/AgentEvidenceUploader';
import { AgentLiveLocationController } from '../components/AgentLiveLocationController';

interface AgentTaskExecutionPageProps {
  task: FieldTask;
  context: RequestContext;
  onBack: () => void;
  onStatusAction: (status: FieldTaskStatus, note?: string) => void;
}

export function AgentTaskExecutionPage({
  task,
  context,
  onBack,
  onStatusAction,
}: AgentTaskExecutionPageProps) {
  const [executionNote, setExecutionNote] = useState('');
  const [currentPosition, setCurrentPosition] = useState<PointGeometry | null>(null);
  const [evidenceItems, setEvidenceItems] = useState<FieldEvidence[]>([]);
  const [plannedRoute, setPlannedRoute] = useState<[number, number][]>([]);
  const [taskForm, setTaskForm] = useState<TaskFormDescriptor | null>(null);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [formFeedback, setFormFeedback] = useState('');
  const [formWorking, setFormWorking] = useState(false);

  const destinationLatLng = useMemo<[number, number]>(
    () => [task.geometry.coordinates[1], task.geometry.coordinates[0]],
    [task.geometry.coordinates]
  );
  const destinationLngLat = useMemo<[number, number]>(
    () => [task.geometry.coordinates[0], task.geometry.coordinates[1]],
    [task.geometry.coordinates]
  );

  useEffect(() => {
    if (!currentPosition) {
      setPlannedRoute([]);
      return;
    }
    let cancelled = false;
    void buildRoutePolyline(currentPosition.coordinates, destinationLngLat)
      .then((line) => {
        if (!cancelled) setPlannedRoute(line);
      })
      .catch(() => {
        if (!cancelled) setPlannedRoute([]);
      });
    return () => {
      cancelled = true;
    };
  }, [currentPosition, destinationLngLat]);

  useEffect(() => {
    let ignore = false;
    void fieldDispatchApi
      .getTaskForm(task.id, context)
      .then((descriptor) => {
        if (ignore) return;
        setTaskForm(descriptor);
        setAnswers(descriptor.submission?.answers || {});
      })
      .catch(() => {
        if (!ignore) {
          setTaskForm(null);
        }
      });
    return () => {
      ignore = true;
    };
  }, [context, task.id]);

  const canStartExecution = canReachStatus(task.status, 'em_execucao');
  const canConfirmArrival = canReachStatus(task.status, 'no_local');
  const canFinish = canReachStatus(task.status, 'concluida');
  const formRequired = Boolean(taskForm?.hasForm && taskForm.formRequired);
  const formSubmitted = taskForm?.submission?.status === 'submitted';
  const canComplete = canFinish && (!formRequired || formSubmitted);

  const handleSaveDraft = async () => {
    if (!taskForm?.hasForm) return;
    try {
      setFormWorking(true);
      setFormFeedback('');
      const saved = await fieldDispatchApi.saveTaskFormDraft(task.id, answers, context);
      setTaskForm((current) => (current ? { ...current, submission: saved } : current));
      if (saved.validationErrors.length > 0) {
        setFormFeedback(`Rascunho salvo com ${saved.validationErrors.length} pendencia(s).`);
      } else {
        setFormFeedback('Rascunho salvo.');
      }
    } catch (error: unknown) {
      setFormFeedback((error as Error)?.message || 'Falha ao salvar rascunho.');
    } finally {
      setFormWorking(false);
    }
  };

  const handleSubmit = async () => {
    if (!taskForm?.hasForm) return;
    try {
      setFormWorking(true);
      setFormFeedback('');
      const submitted = await fieldDispatchApi.submitTaskForm(task.id, answers, context);
      setTaskForm((current) => (current ? { ...current, submission: submitted } : current));
      setFormFeedback('Formulario enviado com sucesso.');
    } catch (error: unknown) {
      setFormFeedback((error as Error)?.message || 'Falha ao enviar formulario.');
    } finally {
      setFormWorking(false);
    }
  };

  return (
    <div className="mobile-shell">
      <div className="mobile-card">
        <h2>Execucao em campo</h2>
        <p className="subtitle">
          Tarefa #{task.id} • {task.title}
        </p>
        <div className="mobile-action-row">
          <button type="button" className="dispatch-button ghost" onClick={onBack}>
            Voltar detalhe
          </button>
          <button
            type="button"
            className="dispatch-button"
            disabled={!canStartExecution}
            onClick={() => onStatusAction('em_execucao', 'Execucao iniciada no app movel.')}
          >
            Iniciar execucao
          </button>
        </div>
      </div>

      <AgentLiveLocationController
        active
        taskId={task.id}
        context={context}
        onPositionChange={setCurrentPosition}
      />

      {taskForm?.hasForm && taskForm.schema ? (
        <div className="mobile-card">
          <h3>Formulario dinamico</h3>
          <p className="subtitle">
            {taskForm.template?.name} • versao {taskForm.version}
            {taskForm.formRequired ? ' • obrigatorio' : ' • opcional'}
          </p>
          <DynamicTaskFormRenderer
            schema={taskForm.schema}
            values={answers}
            onChange={(fieldId, value) => setAnswers((current) => ({ ...current, [fieldId]: value }))}
          />
          <div className="mobile-action-row" style={{ marginTop: 8 }}>
            <button type="button" className="dispatch-button ghost" disabled={formWorking} onClick={() => void handleSaveDraft()}>
              Salvar rascunho
            </button>
            <button type="button" className="dispatch-button success" disabled={formWorking} onClick={() => void handleSubmit()}>
              Enviar formulario
            </button>
          </div>
          {formFeedback ? <p className="subtitle">{formFeedback}</p> : null}
        </div>
      ) : null}

      <div className="mobile-card">
        <h3>Mapa de execucao</h3>
        <div className="mobile-map">
          <MapContainer center={destinationLatLng} zoom={15} style={{ width: '100%', height: '100%' }}>
            <TileLayer
              attribution="&copy; OpenStreetMap contributors"
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <CircleMarker
              center={destinationLatLng}
              radius={8}
              pathOptions={{ color: '#3b82f6', fillColor: '#38bdf8', fillOpacity: 0.85 }}
            />
            {currentPosition ? (
              <CircleMarker
                center={[currentPosition.coordinates[1], currentPosition.coordinates[0]]}
                radius={7}
                pathOptions={{ color: '#22c55e', fillColor: '#16a34a', fillOpacity: 0.9 }}
              />
            ) : null}
            {plannedRoute.length > 1 ? (
              <Polyline positions={plannedRoute} pathOptions={{ color: '#f59e0b', weight: 4, opacity: 0.85 }} />
            ) : null}
          </MapContainer>
        </div>
      </div>

      <div className="mobile-card">
        <h3>Resumo de execucao</h3>
        <label>
          Observacoes de campo
          <textarea
            rows={3}
            value={executionNote}
            onChange={(e) => setExecutionNote(e.target.value)}
            placeholder="Condicoes observadas, pontos criticos, acao executada..."
          />
        </label>
        <div className="mobile-action-row">
          <button
            type="button"
            className="dispatch-button"
            disabled={!canConfirmArrival}
            onClick={() => onStatusAction('no_local', 'Agente confirmou presenca no local.')}
          >
            Confirmar no local
          </button>
          <button
            type="button"
            className="dispatch-button success"
            disabled={!canComplete}
            onClick={() => onStatusAction('concluida', executionNote || 'Atividade concluida no app movel.')}
          >
            Concluir atividade
          </button>
        </div>
        {formRequired && !formSubmitted ? (
          <p className="subtitle">Envie o formulario obrigatorio para liberar a conclusao.</p>
        ) : null}
      </div>

      <AgentEvidenceUploader
        taskId={task.id}
        context={context}
        currentPosition={currentPosition}
        onUploaded={(item) => setEvidenceItems((prev) => [item, ...prev])}
      />

      <div className="mobile-card">
        <h3>Evidencias registradas ({evidenceItems.length})</h3>
        <ul className="tracking-points">
          {evidenceItems.map((item) => (
            <li key={item.id}>
              <strong>{item.type}</strong>
              <div>{item.description || 'Sem descricao'}</div>
              <div>{item.timestamp.replace('T', ' ').slice(0, 19)}</div>
            </li>
          ))}
          {evidenceItems.length === 0 ? <li>Nenhuma evidencia enviada nesta sessao.</li> : null}
        </ul>
      </div>
    </div>
  );
}

