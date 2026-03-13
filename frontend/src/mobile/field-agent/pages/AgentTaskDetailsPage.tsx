import React, { useEffect, useMemo, useState } from 'react';
import { CircleMarker, MapContainer, Polyline, TileLayer } from 'react-leaflet';
import type { RequestContext } from '../../../modules/field-dispatch/services/fieldDispatchApi';
import { buildRoutePolyline } from '../../../modules/field-dispatch/utils/route';
import { FIELD_TASK_STATUS_LABEL } from '../../../modules/field-dispatch/types';
import { canReachStatus } from '../../../modules/field-dispatch/utils/statusFlow';
import type { FieldTask, FieldTaskStatus, PointGeometry } from '../../../modules/field-dispatch/types';
import { AgentLiveLocationController } from '../components/AgentLiveLocationController';

interface AgentTaskDetailsPageProps {
  task: FieldTask;
  context: RequestContext;
  onBack: () => void;
  onStartExecution: () => void;
  onStatusAction: (status: FieldTaskStatus, note?: string) => void;
}

export function AgentTaskDetailsPage({
  task,
  context,
  onBack,
  onStartExecution,
  onStatusAction,
}: AgentTaskDetailsPageProps) {
  const [currentPosition, setCurrentPosition] = useState<PointGeometry | null>(null);
  const [plannedRoute, setPlannedRoute] = useState<[number, number][]>([]);

  const lat = task.geometry.coordinates[1];
  const lon = task.geometry.coordinates[0];
  const destinationLngLat = useMemo<[number, number]>(() => [task.geometry.coordinates[0], task.geometry.coordinates[1]], [task.geometry.coordinates]);
  const canReceive = canReachStatus(task.status, 'recebida');
  const canAccept = canReachStatus(task.status, 'aceita');
  const canMove = canReachStatus(task.status, 'em_deslocamento');
  const canArrive = canReachStatus(task.status, 'no_local');
  const canRefuse = canReachStatus(task.status, 'recusada');
  const canError = canReachStatus(task.status, 'erro_execucao');
  const canExecute = canReachStatus(task.status, 'em_execucao');
  const trackingActive = ['aceita', 'em_deslocamento', 'no_local', 'em_execucao'].includes(task.status);

  useEffect(() => {
    if (!trackingActive || !currentPosition) {
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
  }, [currentPosition, destinationLngLat, trackingActive]);

  return (
    <div className="mobile-shell">
      <div className="mobile-card">
        <h2>COLETOR DE DADOS</h2>
        <p className="subtitle">
          Status: {FIELD_TASK_STATUS_LABEL[task.status]} | prioridade: {task.priority}
        </p>
        <p className="subtitle">Tarefa: {task.title}</p>
        <p className="subtitle">{task.description || 'Sem descricao detalhada.'}</p>
        <p className="subtitle">Instrucoes: {task.instructions || 'Nao informado.'}</p>
        <p className="subtitle">Referencia: {task.addressReference || 'Nao informado.'}</p>
        <div className="mobile-action-row">
          <button type="button" className="dispatch-button ghost" onClick={onBack}>
            Voltar
          </button>
          <button
            type="button"
            className="dispatch-button success"
            disabled={!canExecute}
            onClick={onStartExecution}
          >
            Executar tarefa
          </button>
        </div>
      </div>

      <AgentLiveLocationController
        active={trackingActive}
        taskId={task.id}
        context={context}
        onPositionChange={setCurrentPosition}
      />

      <div className="mobile-card">
        <h3>Destino no mapa</h3>
        <div className="mobile-map">
          <MapContainer center={[lat, lon]} zoom={15} style={{ width: '100%', height: '100%' }}>
            <TileLayer
              attribution="&copy; OpenStreetMap contributors"
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <CircleMarker
              center={[lat, lon]}
              radius={8}
              pathOptions={{ color: '#38bdf8', fillColor: '#3b82f6', fillOpacity: 0.9 }}
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
        <h3>Atualizacoes rapidas</h3>
        <div className="mobile-action-row">
          <button
            type="button"
            className="dispatch-button"
            disabled={!canReceive}
            onClick={() => onStatusAction('recebida', 'Recebimento confirmado.')}
          >
            Confirmar recebimento
          </button>
          <button
            type="button"
            className="dispatch-button"
            disabled={!canAccept}
            onClick={() => onStatusAction('aceita', 'Atividade aceita pelo agente.')}
          >
            Aceitar tarefa
          </button>
          <button
            type="button"
            className="dispatch-button"
            disabled={!canMove}
            onClick={() => onStatusAction('em_deslocamento', 'Deslocamento iniciado.')}
          >
            Iniciar deslocamento
          </button>
          <button
            type="button"
            className="dispatch-button"
            disabled={!canArrive}
            onClick={() => onStatusAction('no_local', 'Chegada ao local registrada.')}
          >
            Marcar chegada
          </button>
          <button
            type="button"
            className="dispatch-button danger"
            disabled={!canRefuse}
            onClick={() => onStatusAction('recusada', 'Atividade recusada pelo agente.')}
          >
            Recusar tarefa
          </button>
          <button
            type="button"
            className="dispatch-button warn"
            disabled={!canError}
            onClick={() => onStatusAction('erro_execucao', 'Erro operacional em campo.')}
          >
            Reportar erro
          </button>
        </div>
      </div>
    </div>
  );
}
