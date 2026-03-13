import React from 'react';
import type { TaskTrackingResponse } from '../types';

interface AgentTrackingLayerProps {
  tracking: TaskTrackingResponse | undefined;
}

export function AgentTrackingLayer({ tracking }: AgentTrackingLayerProps) {
  if (!tracking) {
    return <p className="subtitle">Sem tracking para a atividade selecionada.</p>;
  }

  return (
    <div>
      <p className="subtitle">
        Última atualização: {tracking.lastUpdateAt ? tracking.lastUpdateAt.replace('T', ' ').slice(0, 19) : 'n/d'}
      </p>
      <ul className="tracking-points">
        {tracking.trajectory.slice(-15).map((point, index) => {
          const coords = point.geometry?.coordinates || [0, 0];
          const key = `${point.timestamp}-${index}`;
          return (
            <li key={key}>
              <strong>{point.timestamp.replace('T', ' ').slice(0, 19)}</strong>
              <div>
                lat/lon: {coords[1].toFixed(6)}, {coords[0].toFixed(6)}
              </div>
              <div>vel: {point.speed ?? 0} m/s | acc: {point.accuracy ?? 0} m</div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
