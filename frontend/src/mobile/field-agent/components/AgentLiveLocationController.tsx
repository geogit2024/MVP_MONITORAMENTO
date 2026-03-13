import React, { useEffect, useRef, useState } from 'react';
import { fieldDispatchApi } from '../../../modules/field-dispatch/services/fieldDispatchApi';
import type { RequestContext } from '../../../modules/field-dispatch/services/fieldDispatchApi';
import type { PointGeometry } from '../../../modules/field-dispatch/types';

interface AgentLiveLocationControllerProps {
  active: boolean;
  taskId: number;
  context: RequestContext;
  onPositionChange: (position: PointGeometry | null) => void;
}

export function AgentLiveLocationController({
  active,
  taskId,
  context,
  onPositionChange,
}: AgentLiveLocationControllerProps) {
  const watchIdRef = useRef<number | null>(null);
  const [status, setStatus] = useState('Inativo');

  useEffect(() => {
    if (!active) {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      setStatus('Inativo');
      onPositionChange(null);
      return;
    }

    if (!navigator.geolocation) {
      setStatus('Geolocalização não disponível neste dispositivo.');
      return;
    }

    setStatus('Aguardando posição...');
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const geometry: PointGeometry = {
          type: 'Point',
          coordinates: [position.coords.longitude, position.coords.latitude],
        };
        onPositionChange(geometry);
        void fieldDispatchApi.sendLocation(
          taskId,
          {
            geometry,
            accuracy: position.coords.accuracy,
            speed: position.coords.speed ?? undefined,
            heading: position.coords.heading ?? undefined,
            source: 'mobile_web',
          },
          context
        );
        setStatus(`Ativo • ${new Date(position.timestamp).toLocaleTimeString()}`);
      },
      (error) => {
        setStatus(`Erro de localização: ${error.message}`);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 2000,
        timeout: 12000,
      }
    );
    watchIdRef.current = watchId;

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [active, context, onPositionChange, taskId]);

  return (
    <div className="mobile-card">
      <h3>Localização em tempo real</h3>
      <p className="subtitle">{status}</p>
    </div>
  );
}
