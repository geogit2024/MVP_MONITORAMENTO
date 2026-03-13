import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import Draggable from 'react-draggable';
import type { DraggableData, DraggableEvent } from 'react-draggable';
import {
  CircleMarker,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import BaseMapSelector from '../../../components/BaseMapSelector';
import {
  hasGoogleMapsSearchConfigured,
  searchAddress,
  type GoogleAddressSearchResult,
} from '../utils/googleMapsLoader';
import { FIELD_TASK_STATUS_COLORS, FIELD_TASK_STATUS_LABEL } from '../types';
import type { FieldAgent, FieldTask, FieldTaskStatus, PointGeometry } from '../types';

interface FieldTaskMapProps {
  tasks: FieldTask[];
  agents: FieldAgent[];
  selectedTaskId: number | null;
  creatingByMap: boolean;
  draftGeometry: PointGeometry | null;
  resizeToken?: number;
  onMapPointSelected: (geometry: PointGeometry) => void;
  onAddressSearchSelect?: (result: { geometry: PointGeometry; formattedAddress: string }) => void;
  onTaskSelect: (taskId: number) => void;
}

const isFiniteCoord = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const isValidLngLat = (coords: unknown): coords is [number, number] =>
  Array.isArray(coords) &&
  coords.length >= 2 &&
  isFiniteCoord(coords[0]) &&
  isFiniteCoord(coords[1]);

const toLatLng = (coords: [number, number]): [number, number] => [coords[1], coords[0]];

const baseMaps = {
  osm: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri',
  },
  dark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; CARTO',
  },
  google_streets: {
    url: 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
    attribution: '&copy; Google',
  },
  google_hybrid: {
    url: 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
    attribution: '&copy; Google',
  },
};

const statusColor = (status: string) => FIELD_TASK_STATUS_COLORS[status as FieldTaskStatus] || '#94a3b8';

const statusLegendOrder: FieldTaskStatus[] = [
  'rascunho',
  'despachada',
  'recebida',
  'aceita',
  'em_deslocamento',
  'no_local',
  'em_execucao',
  'concluida',
  'recusada',
  'cancelada',
  'erro_execucao',
];

const SEARCH_PANEL_POSITION_STORAGE_KEY = 'field-dispatch.map.search.position';
const DEFAULT_SEARCH_PANEL_POSITION = { x: 0, y: 0 };

const readSearchPanelPosition = () => {
  if (typeof window === 'undefined') {
    return DEFAULT_SEARCH_PANEL_POSITION;
  }

  try {
    const rawValue = window.localStorage.getItem(SEARCH_PANEL_POSITION_STORAGE_KEY);
    if (!rawValue) {
      return DEFAULT_SEARCH_PANEL_POSITION;
    }

    const parsedValue = JSON.parse(rawValue) as { x?: unknown; y?: unknown };
    const x = typeof parsedValue?.x === 'number' && Number.isFinite(parsedValue.x) ? parsedValue.x : 0;
    const y = typeof parsedValue?.y === 'number' && Number.isFinite(parsedValue.y) ? parsedValue.y : 0;
    return { x, y };
  } catch {
    return DEFAULT_SEARCH_PANEL_POSITION;
  }
};

const persistSearchPanelPosition = (position: { x: number; y: number }) => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(SEARCH_PANEL_POSITION_STORAGE_KEY, JSON.stringify(position));
  } catch {
    // Falha de persistencia nao deve interromper o uso do mapa.
  }
};

function MapClickCapture({
  enabled,
  onSelect,
}: {
  enabled: boolean;
  onSelect: (geometry: PointGeometry) => void;
}) {
  useMapEvents({
    click(event: { latlng: { lng: number; lat: number } }) {
      if (!enabled) return;
      onSelect({
        type: 'Point',
        coordinates: [event.latlng.lng, event.latlng.lat],
      });
    },
  });
  return null;
}

function MapSelectionNavigator({
  target,
  zoom = 16,
}: {
  target: [number, number] | null;
  zoom?: number;
}) {
  const map = useMap();

  useEffect(() => {
    if (!target) return;
    const nextZoom = Math.max(map.getZoom(), zoom);
    map.flyTo(target, nextZoom, { duration: 0.7, easeLinearity: 0.25 });
  }, [map, target, zoom]);

  return null;
}

function MapResizeSync({ resizeToken = 0 }: { resizeToken?: number }) {
  const map = useMap();

  useEffect(() => {
    const timer = window.setTimeout(() => map.invalidateSize(), 60);
    return () => window.clearTimeout(timer);
  }, [map, resizeToken]);

  return null;
}

function MapSearchNavigator({
  result,
}: {
  result: GoogleAddressSearchResult | null;
}) {
  const map = useMap();

  useEffect(() => {
    if (!result) return;

    if (result.viewport) {
      map.fitBounds(result.viewport, {
        padding: [28, 28],
        maxZoom: 17,
      });
      return;
    }

    map.flyTo([result.coordinates[1], result.coordinates[0]], Math.max(map.getZoom(), 17), {
      duration: 0.7,
      easeLinearity: 0.25,
    });
  }, [map, result]);

  return null;
}

export function FieldTaskMap({
  tasks,
  agents,
  selectedTaskId,
  creatingByMap,
  draftGeometry,
  resizeToken = 0,
  onMapPointSelected,
  onAddressSearchSelect,
  onTaskSelect,
}: FieldTaskMapProps) {
  const fallbackCenter: [number, number] = [-22.5, -43.2];
  const [baseMapKey, setBaseMapKey] = useState<keyof typeof baseMaps>('google_hybrid');
  const layerBoxRef = useRef<HTMLDivElement>(null);
  const searchBoxRef = useRef<HTMLDivElement>(null);
  const [searchPanelPosition, setSearchPanelPosition] = useState(readSearchPanelPosition);
  const [addressQuery, setAddressQuery] = useState('');
  const [searchingAddress, setSearchingAddress] = useState(false);
  const [addressSearchError, setAddressSearchError] = useState('');
  const [searchedAddress, setSearchedAddress] = useState<GoogleAddressSearchResult | null>(null);
  const [layerVisibility, setLayerVisibility] = useState({
    tasks: true,
    draft: true,
    agents: true,
  });

  const selectedTask = useMemo(() => {
    const task = tasks.find((item) => item.id === selectedTaskId) || null;
    if (!task) return null;
    return isValidLngLat(task.geometry?.coordinates) ? task : null;
  }, [selectedTaskId, tasks]);

  const selectedTaskTarget = useMemo<[number, number] | null>(() => {
    if (!selectedTask) return null;
    return toLatLng(selectedTask.geometry.coordinates);
  }, [selectedTask?.id, selectedTask?.geometry.coordinates]);

  const center: [number, number] = selectedTask
    ? toLatLng(selectedTask.geometry.coordinates)
    : draftGeometry && isValidLngLat(draftGeometry.coordinates)
      ? toLatLng(draftGeometry.coordinates)
      : fallbackCenter;

  const activeBaseMap = baseMaps[baseMapKey] || baseMaps.google_hybrid;

  const agentIcon = useMemo(
    () =>
      L.divIcon({
        className: 'field-agent-icon-wrapper',
        html: '<div class="field-agent-icon"><span>AG</span></div>',
        iconSize: [36, 36],
        iconAnchor: [18, 34],
      }),
    []
  );

  const selectedAgentIcon = useMemo(
    () =>
      L.divIcon({
        className: 'field-agent-icon-wrapper',
        html: '<div class="field-agent-icon field-agent-icon--selected"><span>AG</span></div>',
        iconSize: [38, 38],
        iconAnchor: [19, 36],
      }),
    []
  );

  const toggleLayer = (layer: keyof typeof layerVisibility) => {
    setLayerVisibility((prev) => ({ ...prev, [layer]: !prev[layer] }));
  };

  const statusCounts = useMemo(() => {
    const counts = new Map<FieldTaskStatus, number>();
    for (const task of tasks) {
      counts.set(task.status, (counts.get(task.status) || 0) + 1);
    }
    return counts;
  }, [tasks]);

  const handleAddressSearch = useCallback(async () => {
    if (!addressQuery.trim()) {
      setAddressSearchError('Informe um endereco para pesquisar.');
      return;
    }

    try {
      setSearchingAddress(true);
      setAddressSearchError('');
      const results = await searchAddress(addressQuery);
      const firstResult = results[0] || null;

      if (!firstResult) {
        setSearchedAddress(null);
        setAddressSearchError('Nenhum endereco encontrado.');
        return;
      }

      setSearchedAddress(firstResult);
      if (!selectedTaskId) {
        onAddressSearchSelect?.({
          geometry: {
            type: 'Point',
            coordinates: firstResult.coordinates,
          },
          formattedAddress: firstResult.formattedAddress,
        });
      }
    } catch (error: unknown) {
      setSearchedAddress(null);
      setAddressSearchError((error as Error)?.message || 'Falha ao buscar endereco.');
    } finally {
      setSearchingAddress(false);
    }
  }, [addressQuery, onAddressSearchSelect, selectedTaskId]);

  const handleSearchPanelDragStop = useCallback((_event: DraggableEvent, data: DraggableData) => {
    const nextPosition = { x: data.x, y: data.y };
    setSearchPanelPosition(nextPosition);
    persistSearchPanelPosition(nextPosition);
  }, []);

  return (
    <div className="field-dispatch-map-shell">
      <Draggable
        nodeRef={searchBoxRef}
        bounds="parent"
        handle=".field-dispatch-map-search__header"
        defaultPosition={searchPanelPosition}
        onStop={handleSearchPanelDragStop}
      >
        <div ref={searchBoxRef} className="field-dispatch-map-search">
          <div className="field-dispatch-map-search__header">
            <strong>Buscar local</strong>
            <span>arrastar</span>
          </div>
          <div className="field-dispatch-map-search__controls">
            <input
              type="text"
              value={addressQuery}
              placeholder="Buscar cidade, bairro ou endereco"
              onChange={(event) => setAddressQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void handleAddressSearch();
                }
              }}
            />
            <button
              type="button"
              className="dispatch-button toolbar-refresh"
              disabled={searchingAddress}
              onClick={() => void handleAddressSearch()}
            >
              {searchingAddress ? 'Buscando...' : 'Pesquisar'}
            </button>
          </div>
          {addressSearchError ? (
            <div className="field-dispatch-map-search__message is-error">{addressSearchError}</div>
          ) : null}
          {!addressSearchError && searchedAddress ? (
            <div className="field-dispatch-map-search__message">
              {searchedAddress.formattedAddress}
            </div>
          ) : null}
          {!hasGoogleMapsSearchConfigured() ? (
            <div className="field-dispatch-map-search__message is-warning">
              Busca Google indisponivel neste ambiente. Usando busca padrao de enderecos.
            </div>
          ) : null}
        </div>
      </Draggable>

      <div className="field-dispatch-map-note">
        {creatingByMap
          ? 'Modo criacao ativo: clique no mapa para definir o ponto.'
          : 'Clique em uma atividade para abrir detalhes.'}
      </div>

      <div className="field-dispatch-basemap-selector">
        <BaseMapSelector value={baseMapKey} onChange={(value) => setBaseMapKey(value as keyof typeof baseMaps)} />
      </div>

      <Draggable nodeRef={layerBoxRef} bounds="parent" handle=".field-dispatch-layer-box-header">
        <div ref={layerBoxRef} className="field-dispatch-layer-box">
          <div className="field-dispatch-layer-box-header">
            <h4>Camadas e Legenda</h4>
            <span>arrastar</span>
          </div>

          <label>
            <input
              type="checkbox"
              checked={layerVisibility.tasks}
              onChange={() => toggleLayer('tasks')}
            />
            <span className="layer-dot layer-dot--task" />
            Atividades
          </label>
          <div className="layer-sublegend">
            {statusLegendOrder.map((status) => (
              <div key={status} className="layer-sublegend-item">
                <span className="layer-dot layer-dot--status" style={{ background: statusColor(status) }} />
                <span className="layer-sublegend-label">{FIELD_TASK_STATUS_LABEL[status] || status}</span>
                <span className="layer-sublegend-count">{statusCounts.get(status) || 0}</span>
              </div>
            ))}
          </div>

          <label>
            <input
              type="checkbox"
              checked={layerVisibility.agents}
              onChange={() => toggleLayer('agents')}
            />
            <span className="layer-dot layer-dot--agent" />
            Agentes em campo
          </label>

          <label>
            <input
              type="checkbox"
              checked={layerVisibility.draft}
              onChange={() => toggleLayer('draft')}
            />
            <span className="layer-dot layer-dot--draft" />
            Novo ponto (rascunho)
          </label>
        </div>
      </Draggable>

      <MapContainer center={center} zoom={13} style={{ width: '100%', height: '100%' }}>
        <TileLayer key={baseMapKey} attribution={activeBaseMap.attribution} url={activeBaseMap.url} />
        <MapResizeSync resizeToken={resizeToken} />
        <MapSelectionNavigator target={selectedTaskTarget} />
        <MapSearchNavigator result={searchedAddress} />
        <MapClickCapture enabled={creatingByMap} onSelect={onMapPointSelected} />

        {layerVisibility.tasks &&
          tasks.map((task) => {
            if (!isValidLngLat(task.geometry?.coordinates)) return null;
            const [lat, lon] = toLatLng(task.geometry.coordinates);
            return (
              <CircleMarker
                key={task.id}
                center={[lat, lon]}
                radius={selectedTaskId === task.id ? 10 : 7}
                pathOptions={{
                  color: '#e2f4ff',
                  weight: selectedTaskId === task.id ? 2 : 1,
                  fillColor: statusColor(task.status),
                  fillOpacity: 0.82,
                }}
                eventHandlers={{ click: () => onTaskSelect(task.id) }}
              >
                <Tooltip direction="top" offset={[0, -6]} opacity={0.95}>
                  #{task.id} - {task.title}
                </Tooltip>
                <Popup>
                  <strong>{task.title}</strong>
                  <div>Status: {task.status}</div>
                  <div>Prioridade: {task.priority}</div>
                </Popup>
              </CircleMarker>
            );
          })}

        {layerVisibility.draft && draftGeometry && isValidLngLat(draftGeometry.coordinates) ? (
          <CircleMarker
            center={toLatLng(draftGeometry.coordinates)}
            radius={7}
            pathOptions={{ color: '#f59e0b', fillColor: '#facc15', fillOpacity: 0.85 }}
          >
            <Popup>Novo ponto selecionado.</Popup>
          </CircleMarker>
        ) : null}

        {searchedAddress ? (
          <CircleMarker
            center={[searchedAddress.coordinates[1], searchedAddress.coordinates[0]]}
            radius={8}
            pathOptions={{ color: '#f8fafc', fillColor: '#2563eb', fillOpacity: 0.85, weight: 2 }}
          >
            <Popup>
              <strong>Endereco encontrado</strong>
              <div>{searchedAddress.formattedAddress}</div>
            </Popup>
          </CircleMarker>
        ) : null}

        {layerVisibility.agents &&
          agents.map((agent) => {
            const coordinates = agent.lastKnownLocation?.coordinates;
            if (!isValidLngLat(coordinates)) return null;
            const isSelectedAgent = selectedTask?.assignedAgentId === agent.id;

            return (
              <Marker
                key={`agent-${agent.id}`}
                position={toLatLng(coordinates)}
                icon={isSelectedAgent ? selectedAgentIcon : agentIcon}
              >
                <Tooltip direction="top" offset={[0, -6]} opacity={0.95}>
                  Agente: {agent.name}
                </Tooltip>
                <Popup>
                  <strong>{agent.name}</strong>
                  <div>Status operacional: {agent.operationalStatus}</div>
                  <div>Ultima atualizacao: {agent.lastSeenAt ? agent.lastSeenAt.replace('T', ' ').slice(0, 19) : 'n/d'}</div>
                </Popup>
              </Marker>
            );
          })}
      </MapContainer>
    </div>
  );
}
