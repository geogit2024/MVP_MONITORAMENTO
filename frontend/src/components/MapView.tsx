import React, { useCallback, useEffect, useState, useRef, useMemo } from 'react';
import InfoTool from './InfoTool'; 
import { MapContainer, TileLayer, useMap, GeoJSON, useMapEvents, Pane } from 'react-leaflet';
import L, { LatLngBoundsExpression, Layer } from 'leaflet';
import { Feature, FeatureCollection, Polygon, MultiPolygon } from 'geojson';
import FirmsDataLayer from './FirmsDataLayer';
import PrecipitationLayer from './PrecipitationLayer';
import 'leaflet/dist/leaflet.css';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';
import '@geoman-io/leaflet-geoman-free';
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';
import BaseMapSelector from './BaseMapSelector';
import LayerControl from './LayerControl';
import AoiAreaLabel from './map/AoiAreaLabel';
import SwipeControl from '../modules/swipe/SwipeControl';
import SwipeDivider from '../modules/swipe/SwipeDivider';
import SwipeLayerElementClipController from '../modules/swipe/SwipeLayerElementClipController';
import SwipeRasterLayer from '../modules/swipe/SwipeRasterLayer';
import useSwipe from '../modules/swipe/useSwipe';
import type { SwipeLayerDescriptor } from '../modules/swipe/types';
import { swipeDebug, swipeDebugWarn } from '../modules/swipe/swipeDebug';
import './MapView.css';

// Corrige icones padrao
(L.Icon.Default.prototype as any)._getIconUrl = undefined;
L.Icon.Default.mergeOptions({ iconRetinaUrl, iconUrl, shadowUrl });

const baseMaps = {
  osm: {
    name: 'PadrÃƒÂ£o',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
  },
  satellite: {
    name: 'SatÃƒÂ©lite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri',
  },
  dark: {
    name: 'Escuro',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; CARTO',
  },
  google_streets: {
    name: 'Google Streets',
    url: 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
    attribution: '&copy; Google',
  },
  google_hybrid: {
    name: 'Google Hybrid',
    url: 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
    attribution: '&copy; Google',
  }
};

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const SWIPE_PANEL_POSITION_KEY = 'app.map.swipe.panel.position';
const SWIPE_BOTTOM_PANE = 'swipe-bottom-pane';
const SWIPE_TOP_PANE = 'swipe-top-pane';

const hashText = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
};

const makeLayerId = (prefix: string, dynamicValue: string) =>
  `${prefix}:${hashText(dynamicValue || prefix)}`;

const normalizeSwipeUrl = (url: string | null | undefined): string | null => {
  if (!url) return null;
  try {
    const baseOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
    const parsed = new URL(url, baseOrigin);
    ['token', 'access_token', 'expires', 'cacheBust', '_ts', 'ts'].forEach((key) => {
      parsed.searchParams.delete(key);
    });
    return `${parsed.origin}${parsed.pathname}?${parsed.searchParams.toString()}`;
  } catch {
    return url;
  }
};

const normalizeTileTemplateUrl = (url: string | null | undefined): string | null => {
  if (!url) return null;
  return url
    .replace(/%7B/gi, '{')
    .replace(/%7D/gi, '}')
    .replace(/&#123;/g, '{')
    .replace(/&#125;/g, '}');
};

const CAR_COLORS = {
  ATIVO: '#2e7d32',
  PENDENTE: '#f9a825',
  SUSPENSO: '#ef6c00',
  CANCELADO: '#c62828',
  OUTROS: '#546e7a',
} as const;

const normalizeText = (value: unknown) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();

const getCarConditionClass = (props: Record<string, unknown>) => {
  const raw = props.des_condic ?? props.condicao ?? props.condic ?? '';
  const condition = normalizeText(raw);
  if (!condition) return 'OUTROS';
  if (condition.includes('CANCEL')) return 'CANCELADO';
  if (condition.includes('SUSP')) return 'SUSPENSO';
  if (condition.includes('PEND') || condition.includes('AGUARD')) return 'PENDENTE';
  if (condition.includes('ATIV') || condition.includes('ANALIS')) return 'ATIVO';
  return 'OUTROS';
};

// --- COMPONENTES AUXILIARES ---

const MapViewAnimator = ({ target }: { target: LatLngBoundsExpression | null }) => {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyToBounds(target, { padding: [50, 50] });
  }, [target, map]);
  return null;
};

const SwipeContainerBinder = ({ onBind }: { onBind: (element: HTMLElement | null) => void }) => {
  const map = useMap();

  useEffect(() => {
    onBind(map.getContainer() as HTMLElement);
    const handleResize = () => onBind(map.getContainer() as HTMLElement);
    map.on('resize', handleResize);
    return () => {
      map.off('resize', handleResize);
      onBind(null);
    };
  }, [map, onBind]);

  return null;
};

const GeomanDrawControl = ({
  onDrawComplete,
  drawingEnabled,
  isDrawingTalhao,
  onTalhaoDrawComplete,
  isDrawingLandCoverSample,
  trainingSamplesClearVersion,
  isLandCoverRefinementMode,
  landCoverSelectedClassId,
  onLandCoverSampleDrawComplete,
  isDrawingLandCoverRefinementZone,
  onLandCoverRefinementZoneDrawComplete,
  refinementClearVersion,
  onAoiDeleted,
  isEditingLandCoverAIPolygon,
}: {
  onDrawComplete: (geojson: Feature) => void;
  drawingEnabled: boolean;
  isDrawingTalhao?: boolean;
  onTalhaoDrawComplete?: (geometry: Feature<Polygon>) => void;
  isDrawingLandCoverSample?: boolean;
  trainingSamplesClearVersion?: number;
  isLandCoverRefinementMode?: boolean;
  landCoverSelectedClassId?: number | null;
  onLandCoverSampleDrawComplete?: (geometry: Feature<Polygon>) => void;
  isDrawingLandCoverRefinementZone?: boolean;
  onLandCoverRefinementZoneDrawComplete?: (geometry: Feature<Polygon>) => void;
  refinementClearVersion?: number;
  onAoiDeleted?: () => void;
  isEditingLandCoverAIPolygon?: boolean;
}) => {
  const map = useMap();
  const trainingSampleLayerIdsRef = useRef<Set<number>>(new Set());
  const refinementLayerIdsRef = useRef<Set<number>>(new Set());
  const isDrawActive = Boolean(
    drawingEnabled || isDrawingTalhao || isDrawingLandCoverSample || isDrawingLandCoverRefinementZone
  );

  useEffect(() => {
    if (!map.pm) return;

    if (!isDrawActive) {
      map.pm.disableDraw();
      map.pm.disableGlobalEditMode?.();
      map.pm.disableGlobalRemovalMode?.();
      map.pm.disableGlobalDragMode?.();
      map.pm.disableGlobalCutMode?.();
      return;
    }

    map.pm.addControls({
      position: 'topleft',
      drawPolygon: true,
      drawCircle: false,
      removalMode: false,
      drawMarker: false,
      drawCircleMarker: false,
      drawPolyline: false,
      drawRectangle: false,
      editMode: false,
      dragMode: false,
      cutPolygon: false
    });

    map.pm.setPathOptions({ color: '#ff7800', fill: false, weight: 3 });

    const handleCreate = (e: any) => {
      const geojson = e.layer.toGeoJSON() as Feature<Polygon>;
      if (isDrawingTalhao && onTalhaoDrawComplete) {
        onTalhaoDrawComplete(geojson);
      } else if (isDrawingLandCoverRefinementZone && onLandCoverRefinementZoneDrawComplete) {
        const refinementLayerId = Number(e?.layer?._leaflet_id);
        if (Number.isFinite(refinementLayerId)) {
          refinementLayerIdsRef.current.add(refinementLayerId);
        }
        onLandCoverRefinementZoneDrawComplete(geojson);
        map.pm.disableDraw();
      } else if (isDrawingLandCoverSample && onLandCoverSampleDrawComplete) {
        const sampleLayerId = Number(e?.layer?._leaflet_id);
        if (Number.isFinite(sampleLayerId)) {
          if (isLandCoverRefinementMode) {
            refinementLayerIdsRef.current.add(sampleLayerId);
          } else {
            trainingSampleLayerIdsRef.current.add(sampleLayerId);
          }
        }
        const classId = Number(landCoverSelectedClassId || 0);
        const sample: Feature<Polygon> = {
          ...geojson,
          properties: {
            ...(geojson.properties || {}),
            class_id: classId,
          },
        };
        onLandCoverSampleDrawComplete(sample);
      } else {
        onDrawComplete(geojson);
      }
      if (!isDrawingLandCoverSample) {
        map.pm.getGeomanLayers().forEach((layer) => {
          const currentLayer = layer as Layer & { _leaflet_id?: number; remove: () => void };
          const createdLayer = e.layer as { _leaflet_id?: number };
          if (currentLayer._leaflet_id !== createdLayer._leaflet_id) {
            currentLayer.remove();
          }
        });
        map.pm.disableDraw();
      }
    };

    map.on('pm:create', handleCreate);

    const handleEdit = (e: any) => {
      if (
        isDrawingTalhao ||
        isDrawingLandCoverSample ||
        isDrawingLandCoverRefinementZone ||
        isEditingLandCoverAIPolygon
      ) {
        return;
      }
      const editedLayers = e?.layers?.getLayers?.() ?? [];
      const firstLayer = editedLayers[0];
      if (!firstLayer || typeof firstLayer.toGeoJSON !== 'function') return;
      const editedGeoJson = firstLayer.toGeoJSON() as Feature<Polygon>;
      onDrawComplete(editedGeoJson);
    };

    const handleRemove = () => {
      if (isDrawingTalhao || isDrawingLandCoverSample || isDrawingLandCoverRefinementZone) return;
      const remaining = map.pm?.getGeomanLayers?.() ?? [];
      if (remaining.length === 0) {
        onAoiDeleted?.();
      }
    };

    map.on('pm:edit', handleEdit);
    map.on('pm:remove', handleRemove);

    return () => {
      map.pm.removeControls();
      map.off('pm:create', handleCreate);
      map.off('pm:edit', handleEdit);
      map.off('pm:remove', handleRemove);
    };
  }, [
    map,
    isDrawActive,
    isDrawingTalhao,
    onTalhaoDrawComplete,
    onDrawComplete,
    isDrawingLandCoverSample,
    isLandCoverRefinementMode,
    onLandCoverSampleDrawComplete,
    landCoverSelectedClassId,
    isDrawingLandCoverRefinementZone,
    onLandCoverRefinementZoneDrawComplete,
    onAoiDeleted,
    isEditingLandCoverAIPolygon,
  ]);

  useEffect(() => {
    if (!map.pm || trainingSamplesClearVersion === undefined) return;
    const trackedIds = trainingSampleLayerIdsRef.current;
    if (trackedIds.size === 0) return;

    map.pm.getGeomanLayers().forEach((layer: any) => {
      const layerId = Number(layer?._leaflet_id);
      if (!Number.isFinite(layerId) || !trackedIds.has(layerId)) return;
      layer.remove();
    });

    trackedIds.clear();
    map.pm.disableDraw();
  }, [map, trainingSamplesClearVersion]);

  useEffect(() => {
    if (!map.pm || refinementClearVersion === undefined) return;
    const trackedIds = refinementLayerIdsRef.current;
    if (trackedIds.size === 0) return;

    map.pm.getGeomanLayers().forEach((layer: any) => {
      const layerId = Number(layer?._leaflet_id);
      if (!Number.isFinite(layerId) || !trackedIds.has(layerId)) return;
      layer.remove();
    });

    trackedIds.clear();
    map.pm.disableDraw();
  }, [map, refinementClearVersion]);

  useEffect(() => {
    if (!map.pm) return;
    if (isDrawingLandCoverRefinementZone || isDrawingLandCoverSample) {
      map.pm.enableDraw('Polygon');
      return;
    }
    // Mantem o modo de desenho desligado por padrao para os fluxos legados.
    map.pm.disableDraw();
  }, [isDrawActive, map, isDrawingLandCoverSample, isDrawingLandCoverRefinementZone]);

  return null;
};

const DynamicTileLayer = ({
  url,
  zIndex = 10,
  opacity = 0.8,
  attribution,
  className,
  layerLabel = 'camada raster',
  onLayerFailure,
}: {
  url: string | null;
  zIndex?: number;
  opacity?: number;
  attribution?: string;
  className?: string;
  layerLabel?: string;
  onLayerFailure?: (message: string | null) => void;
}) => {
  const map = useMap();
  const layerRef = useRef<L.TileLayer | null>(null);

  useEffect(() => {
    const effectiveUrl = normalizeTileTemplateUrl(url);
    let tileErrorCount = 0;
    let hasLoadedAnyTile = false;
    let retryScheduled = false;
    let disposed = false;
    const maxTileErrorsBeforeDisable = 14;

    if (layerRef.current) {
      map.removeLayer(layerRef.current);
      layerRef.current = null;
    }
    if (effectiveUrl) {
      const newLayer = L.tileLayer(effectiveUrl, { zIndex, opacity, attribution, className });
      const onTileLoad = () => {
        hasLoadedAnyTile = true;
        tileErrorCount = 0;
        retryScheduled = false;
        onLayerFailure?.(null);
      };
      const onTileError = (event: any) => {
        tileErrorCount += 1;
        const message = String(event?.error?.message || 'falha ao carregar tile');
        if (!retryScheduled && tileErrorCount <= 2) {
          retryScheduled = true;
          window.setTimeout(() => {
            if (disposed) return;
            retryScheduled = false;
            newLayer.redraw();
          }, 550);
        }
        if (tileErrorCount < maxTileErrorsBeforeDisable || hasLoadedAnyTile) {
          if (tileErrorCount === 1 || tileErrorCount % 6 === 0) {
            console.warn('[MapView] Falha ao carregar tile (transiente).', {
              layerLabel,
              sourceUrl: effectiveUrl.length > 220 ? `${effectiveUrl.slice(0, 220)}...<len:${effectiveUrl.length}>` : effectiveUrl,
              tileUrl: typeof event?.tile?.src === 'string'
                ? (event.tile.src.length > 220 ? `${event.tile.src.slice(0, 220)}...<len:${event.tile.src.length}>` : event.tile.src)
                : null,
              coords: event?.coords ?? null,
              message,
              errorCount: tileErrorCount,
            });
          }
          return;
        }
        console.error('[MapView] Camada desativada por falha persistente de tiles.', {
          layerLabel,
          sourceUrl: effectiveUrl.length > 220 ? `${effectiveUrl.slice(0, 220)}...<len:${effectiveUrl.length}>` : effectiveUrl,
          message,
          errorCount: tileErrorCount,
        });
        if (map.hasLayer(newLayer)) {
          map.removeLayer(newLayer);
        }
        if (layerRef.current === newLayer) {
          layerRef.current = null;
        }
        onLayerFailure?.(`Nao foi possivel exibir ${layerLabel}. Verifique a disponibilidade do servico.`);
      };
      newLayer.on('load', onTileLoad);
      newLayer.on('tileerror', onTileError);
      newLayer.once('remove', () => {
        newLayer.off('load', onTileLoad);
        newLayer.off('tileerror', onTileError);
      });
      newLayer.addTo(map);
      layerRef.current = newLayer;
      onLayerFailure?.(null);
    } else {
      onLayerFailure?.(null);
    }
    return () => {
      disposed = true;
      if (layerRef.current && map.hasLayer(layerRef.current)) {
        map.removeLayer(layerRef.current);
      }
    };
  }, [url, map, zIndex, opacity, attribution, className, layerLabel, onLayerFailure]);

  return null;
};

const DynamicImageOverlay = ({
  overlay,
  zIndex = 15,
  opacity = 0.82,
}: {
  overlay: { url: string; bounds: [[number, number], [number, number]] } | null;
  zIndex?: number;
  opacity?: number;
}) => {
  const map = useMap();
  const layerRef = useRef<L.ImageOverlay | null>(null);

  useEffect(() => {
    if (layerRef.current) {
      map.removeLayer(layerRef.current);
      layerRef.current = null;
    }

    if (overlay?.url && Array.isArray(overlay.bounds) && overlay.bounds.length === 2) {
      const layer = L.imageOverlay(overlay.url, overlay.bounds as LatLngBoundsExpression, {
        opacity,
      });
      layer.setZIndex(zIndex);
      layer.addTo(map);
      layerRef.current = layer;
    }

    return () => {
      if (layerRef.current && map.hasLayer(layerRef.current)) {
        map.removeLayer(layerRef.current);
      }
    };
  }, [map, overlay, zIndex, opacity]);

  return null;
};
const MapClickHandler = ({ onMapClick }: { onMapClick: (e: L.LeafletMouseEvent) => void }) => {
  useMapEvents({
    click(e) {
      onMapClick(e);
    },
  });
  return null;
};
// Componente reativo para camadas WMS com LOGS
const WmsLayer = ({ url, options, visible, layerName }: { url: string; options: L.WMSOptions; visible: boolean; layerName: string }) => {
  const map = useMap();
  const layerRef = useRef<L.TileLayer.WMS | null>(null);

  useEffect(() => {
    if (visible) {
      if (!layerRef.current) {
        layerRef.current = L.tileLayer.wms(url, options as L.WMSOptions);
      } else {
        layerRef.current.setParams(options as L.WMSParams);
      }
      if (!map.hasLayer(layerRef.current)) {
        layerRef.current.addTo(map);
      }
    } else {
      if (layerRef.current && map.hasLayer(layerRef.current)) {
        map.removeLayer(layerRef.current);
      }
    }
  }, [visible, map, url, options, layerName]);

  useEffect(() => {
    const layer = layerRef.current;
    return () => {
      if (layer && map.hasLayer(layer)) {
        map.removeLayer(layer);
      }
    };
  }, [map, layerName]);

  return null;
};

const CarClassifiedLayer = ({ visible }: { visible: boolean }) => {
  const map = useMap();
  const [data, setData] = useState<FeatureCollection | null>(null);
  const cacheRef = useRef<Map<string, FeatureCollection>>(new Map());
  const featuresByKeyRef = useRef<Map<string, any>>(new Map());
  const requestSeqRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const fetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const getCacheKey = () => {
    const bounds = map.getBounds().pad(0.4);
    const zoom = map.getZoom();
    const precision = 2;
    const west = bounds.getWest().toFixed(precision);
    const south = bounds.getSouth().toFixed(precision);
    const east = bounds.getEast().toFixed(precision);
    const north = bounds.getNorth().toFixed(precision);
    return `${zoom}:${west},${south},${east},${north}`;
  };

  const putCache = (key: string, value: FeatureCollection) => {
    const cache = cacheRef.current;
    if (cache.has(key)) cache.delete(key);
    cache.set(key, value);

    const maxEntries = 30;
    if (cache.size > maxEntries) {
      const oldestKey = cache.keys().next().value;
      if (oldestKey) cache.delete(oldestKey);
    }
  };

  const getFeatureKey = (feature: any, indexHint: number) => {
    const props = feature?.properties || {};
    return String(
      props.cod_imovel ??
      props.id ??
      feature?.id ??
      `${indexHint}-${JSON.stringify(feature?.geometry || {})}`
    );
  };

  const mergeFeatures = (features: any[]) => {
    const store = featuresByKeyRef.current;
    features.forEach((feature, i) => {
      store.set(getFeatureKey(feature, i), feature);
    });

    const maxFeatures = 50000;
    if (store.size > maxFeatures) {
      const toRemove = store.size - maxFeatures;
      const keys = Array.from(store.keys()).slice(0, toRemove);
      keys.forEach((key) => store.delete(key));
    }

    return {
      type: 'FeatureCollection',
      features: Array.from(store.values()) as any,
    } as FeatureCollection;
  };

  useEffect(() => {
    if (!visible) {
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
      if (fetchTimerRef.current) {
        clearTimeout(fetchTimerRef.current);
        fetchTimerRef.current = null;
      }
      featuresByKeyRef.current.clear();
      setData(null);
      return;
    }

    const fetchByBbox = async () => {
      const bounds = map.getBounds().pad(0.35);
      const bbox = `${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`;
      const cacheKey = getCacheKey();
      const cached = cacheRef.current.get(cacheKey);
      const reqId = ++requestSeqRef.current;

      if (cached) {
        setData(mergeFeatures(cached.features as any[]));
        return;
      }

      if (abortRef.current) {
        abortRef.current.abort();
      }
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const allFeatures: any[] = [];
        let startIndex = 0;
        const pageSize = 700;
        let hasNext = true;
        let pageCount = 0;
        const maxPages = 80;

        while (hasNext && pageCount < maxPages) {
          let payload: any = null;
          let pageLoaded = false;

          for (let attempt = 1; attempt <= 3; attempt += 1) {
            const response = await fetch(
              `${API_BASE_URL}/api/wfs/car-features?bbox=${encodeURIComponent(bbox)}&start_index=${startIndex}&count=${pageSize}`,
              { signal: controller.signal }
            );
            const parsed = await response.json();
            if (response.ok) {
              payload = parsed;
              pageLoaded = true;
              break;
            }
            if (attempt === 3) {
              throw new Error(parsed?.detail || 'Falha ao carregar feicoes CAR.');
            }
          }

          if (!pageLoaded) break;

          const pageFeatures = Array.isArray(payload?.features) ? payload.features : [];
          allFeatures.push(...pageFeatures);

          if (requestSeqRef.current !== reqId) return;
          setData(mergeFeatures(pageFeatures));

          if (typeof payload?.nextStartIndex === 'number' && payload.nextStartIndex > startIndex) {
            startIndex = payload.nextStartIndex;
          } else {
            hasNext = false;
          }
          pageCount += 1;
        }

        if (requestSeqRef.current === reqId) {
          const featureCollection = mergeFeatures(allFeatures);
          setData(featureCollection);
          putCache(cacheKey, featureCollection);
        }
      } catch (err) {
        if ((err as Error)?.name !== 'AbortError') {
          console.error('Erro ao carregar camada CAR classificada:', err);
        }
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
      }
    };

    const scheduleFetch = () => {
      if (fetchTimerRef.current) clearTimeout(fetchTimerRef.current);
      fetchTimerRef.current = setTimeout(() => {
        fetchByBbox();
      }, 180);
    };

    scheduleFetch();
    map.on('moveend', scheduleFetch);
    map.on('zoomend', scheduleFetch);

    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
      if (fetchTimerRef.current) {
        clearTimeout(fetchTimerRef.current);
        fetchTimerRef.current = null;
      }
      map.off('moveend', scheduleFetch);
      map.off('zoomend', scheduleFetch);
    };
  }, [map, visible]);

  if (!visible || !data) return null;

  return (
    <GeoJSON
      data={data}
      style={(feature: any) => {
        const conditionClass = getCarConditionClass(feature?.properties || {});
        const fillColor = CAR_COLORS[conditionClass as keyof typeof CAR_COLORS] || CAR_COLORS.OUTROS;
        return {
          color: '#2f3b45',
          weight: 1.2,
          fillColor,
          fillOpacity: 0.45,
        };
      }}
    />
  );
};


// --- PROPS E COMPONENTE PRINCIPAL ---

interface MapViewProps {
  onDrawComplete: (geojson: Feature) => void;
  visibleLayerUrl: string | null;
  previewLayerUrl: string | null;
  previewOverlay?: { url: string; bounds: [[number, number], [number, number]] } | null;
  changePolygons: Feature | null;
  activeAoi: Feature | null;
  monitoringAreas?: FeatureCollection | null;
  baseMapKey: string;
  onBaseMapChange: (key: string) => void;
  mapViewTarget: LatLngBoundsExpression | null;
  differenceLayerUrl: string | null;
  indexLayerZIndex: number;
  differenceLayerZIndex: number;
  previewLayerZIndex: number;
  drawingEnabled: boolean;
  classifiedPlots?: any;
  onPropertySelect: (id: string) => void;
  refreshTrigger: any;
  isDrawingTalhao?: boolean;
  onTalhaoDrawComplete?: (geometry: Feature<Polygon>) => void;
  landCoverLayerUrl?: string | null;
  landCoverTrainingSamples?: FeatureCollection | null;
  landCoverDrawingEnabled?: boolean;
  landCoverTrainingSamplesClearVersion?: number;
  landCoverRefinementMode?: boolean;
  landCoverSelectedClassId?: number | null;
  onLandCoverSampleDrawComplete?: (geometry: Feature<Polygon>) => void;
  landCoverLayerVisible?: boolean;
  landCoverRefinementPolygon?: Feature | null;
  landCoverDrawingRefinementZone?: boolean;
  landCoverRefinementClearVersion?: number;
  onLandCoverRefinementZoneDrawComplete?: (geometry: Feature<Polygon>) => void;
  landCoverAiPolygons?: FeatureCollection | null;
  landCoverAiPolygonsVersion?: number;
  landCoverAiSelectedPolygonIds?: string[];
  onLandCoverAIPolygonSelect?: (polygonId: string, additive: boolean) => void;
  landCoverAiEditingPolygonId?: string | null;
  onLandCoverAIPolygonGeometryEdit?: (polygonId: string, geometry: Polygon | MultiPolygon) => void;
  onAoiDeleted?: () => void;
  swipeCandidateLayers?: SwipeLayerDescriptor[];
}

export default function MapView({
  onDrawComplete,
  visibleLayerUrl,
  previewLayerUrl,
  previewOverlay = null,
  changePolygons,
  activeAoi,
  monitoringAreas = null,
  baseMapKey,
  onBaseMapChange,
  mapViewTarget,
  differenceLayerUrl,
  indexLayerZIndex,
  differenceLayerZIndex,
  previewLayerZIndex,
  drawingEnabled,
  classifiedPlots: _classifiedPlots,
  onPropertySelect,
  refreshTrigger,
  isDrawingTalhao,
  onTalhaoDrawComplete,
  landCoverLayerUrl = null,
  landCoverTrainingSamples = null,
  landCoverDrawingEnabled = false,
  landCoverTrainingSamplesClearVersion = 0,
  landCoverRefinementMode = false,
  landCoverSelectedClassId = null,
  onLandCoverSampleDrawComplete,
  landCoverLayerVisible = true,
  landCoverRefinementPolygon = null,
  landCoverDrawingRefinementZone = false,
  landCoverRefinementClearVersion = 0,
  onLandCoverRefinementZoneDrawComplete,
  landCoverAiPolygons = null,
  landCoverAiPolygonsVersion = 0,
  landCoverAiSelectedPolygonIds = [],
  onLandCoverAIPolygonSelect,
  landCoverAiEditingPolygonId = null,
  onLandCoverAIPolygonGeometryEdit,
  onAoiDeleted,
  swipeCandidateLayers = [],
}: MapViewProps) {
  type NominatimResult = {
    display_name?: string;
    lat?: string;
    lon?: string;
    boundingbox?: [string, string, string, string] | string[];
  };

  const [showFirmsPoints, setShowFirmsPoints] = useState(false);
  const [showPrecipitation, setShowPrecipitation] = useState(false);
  const [locationQuery, setLocationQuery] = useState('');
  const [searchError, setSearchError] = useState('');
  const [isSearchingLocation, setIsSearchingLocation] = useState(false);
  const [locationSuggestions, setLocationSuggestions] = useState<NominatimResult[]>([]);
  const [isSearchingSuggestions, setIsSearchingSuggestions] = useState(false);
  const [highlightedSuggestionIndex, setHighlightedSuggestionIndex] = useState(-1);
  const [isSuggestionsOpen, setIsSuggestionsOpen] = useState(false);
  const [propertiesData, setPropertiesData] = useState<FeatureCollection | null>(null);
  const mapShellRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const [swipePanelPosition, setSwipePanelPosition] = useState<{ x: number; y: number }>(() => {
    if (typeof window === 'undefined') return { x: 50, y: 92 };
    const raw = window.sessionStorage.getItem(SWIPE_PANEL_POSITION_KEY);
    if (!raw) return { x: 50, y: 92 };
    try {
      const parsed = JSON.parse(raw) as { x?: number; y?: number };
      const x = Number(parsed?.x);
      const y = Number(parsed?.y);
      return {
        x: Number.isFinite(x) ? x : 50,
        y: Number.isFinite(y) ? y : 92,
      };
    } catch {
      return { x: 50, y: 92 };
    }
  });
  const [isDraggingSwipePanel, setIsDraggingSwipePanel] = useState(false);
  const swipePanelDragRef = useRef<{
    pointerId: number | null;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  }>({ pointerId: null, startX: 0, startY: 0, originX: 0, originY: 0 });
  const suggestionAbortRef = useRef<AbortController | null>(null);
  const suggestionDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeInfoLayer, setActiveInfoLayer] = useState<'mapbiomas' | null>(null);
  const [visibleWmsLayers, setVisibleWmsLayers] = useState({
    alertas_desmatamento_mapbiomas: false,
    ucs: false,
  });
  const [tileLayerWarning, setTileLayerWarning] = useState<string | null>(null);

  const handleTileLayerFailure = useCallback((message: string | null) => {
    setTileLayerWarning(message);
  }, []);

  const availableSwipeLayers = useMemo<SwipeLayerDescriptor[]>(() => {
    if (!activeAoi) return [];

    const selectedLayers: SwipeLayerDescriptor[] = [];
    const fallbackLayers: SwipeLayerDescriptor[] = [];
    const seen = new Set<string>();
    const pushUnique = (layer: SwipeLayerDescriptor) => {
      if (seen.has(layer.id)) return;
      seen.add(layer.id);
      selectedLayers.push(layer);
    };
    const pushFallbackUnique = (layer: SwipeLayerDescriptor) => {
      if (seen.has(layer.id)) return;
      seen.add(layer.id);
      fallbackLayers.push(layer);
    };

    swipeCandidateLayers.forEach((layer) => {
      if (layer.kind === 'tile') {
        pushUnique({
          ...layer,
          url: normalizeTileTemplateUrl(layer.url) || layer.url,
        });
        return;
      }
      pushUnique(layer);
    });
    if (selectedLayers.length > 0) {
      return selectedLayers;
    }

    const normalizedPreviewLayerUrl = normalizeTileTemplateUrl(previewLayerUrl);
    const normalizedVisibleLayerUrl = normalizeTileTemplateUrl(visibleLayerUrl);
    const normalizedDifferenceLayerUrl = normalizeTileTemplateUrl(differenceLayerUrl);
    const normalizedLandCoverLayerUrl = normalizeTileTemplateUrl(landCoverLayerUrl);

    if (normalizedPreviewLayerUrl) {
      pushFallbackUnique({
        id: makeLayerId('preview-tile', normalizedPreviewLayerUrl),
        label: 'Pre-visualizacao',
        kind: 'tile',
        url: normalizedPreviewLayerUrl,
        zIndex: previewLayerZIndex,
        opacity: 0.8,
        attribution: 'Pre-visualizacao',
      });
    }

    if (previewOverlay?.url && previewOverlay.bounds) {
      pushFallbackUnique({
        id: makeLayerId('preview-overlay', previewOverlay.url),
        label: 'Pre-visualizacao (Overlay)',
        kind: 'imageOverlay',
        url: previewOverlay.url,
        bounds: previewOverlay.bounds,
        zIndex: previewLayerZIndex,
        opacity: 0.82,
      });
    }

    if (normalizedVisibleLayerUrl) {
      pushFallbackUnique({
        id: makeLayerId('index-layer', normalizedVisibleLayerUrl),
        label: 'Indice Calculado',
        kind: 'tile',
        url: normalizedVisibleLayerUrl,
        zIndex: indexLayerZIndex,
        opacity: 0.8,
        attribution: 'Indice Calculado',
      });
    }

    if (normalizedDifferenceLayerUrl) {
      pushFallbackUnique({
        id: makeLayerId('difference-layer', normalizedDifferenceLayerUrl),
        label: 'Diferenca NDVI',
        kind: 'tile',
        url: normalizedDifferenceLayerUrl,
        zIndex: differenceLayerZIndex,
        opacity: 0.62,
        attribution: 'Diferenca NDVI',
        className: 'difference-tile-soft',
      });
    }

    if (landCoverLayerVisible && normalizedLandCoverLayerUrl) {
      pushFallbackUnique({
        id: makeLayerId('landcover-layer', normalizedLandCoverLayerUrl),
        label: 'Classificacao Uso do Solo',
        kind: 'tile',
        url: normalizedLandCoverLayerUrl,
        zIndex: 18,
        opacity: 0.72,
        attribution: 'LandCover',
      });
    }

    return fallbackLayers;
  }, [
    differenceLayerUrl,
    differenceLayerZIndex,
    indexLayerZIndex,
    landCoverLayerUrl,
    landCoverLayerVisible,
    previewLayerUrl,
    previewLayerZIndex,
    previewOverlay,
    swipeCandidateLayers,
    visibleLayerUrl,
    activeAoi,
  ]);

  const swipe = useSwipe(availableSwipeLayers);
  const swipeBottomLayer = swipe.leftLayer;
  const swipeTopLayer = swipe.rightLayer;
  const isSwipeRenderActive = Boolean(swipe.isSwipeEnabled && swipeBottomLayer && swipeTopLayer);

  useEffect(() => {
    const compactUrl = (url: string | null) => {
      if (!url) return null;
      return url.length > 180 ? `${url.slice(0, 180)}...<len:${url.length}>` : url;
    };
    const bottomUrl =
      swipeBottomLayer && (swipeBottomLayer.kind === 'tile' || swipeBottomLayer.kind === 'imageOverlay')
        ? swipeBottomLayer.url
        : null;
    const topUrl =
      swipeTopLayer && (swipeTopLayer.kind === 'tile' || swipeTopLayer.kind === 'imageOverlay')
        ? swipeTopLayer.url
        : null;
    const bottomNorm = normalizeSwipeUrl(bottomUrl);
    const topNorm = normalizeSwipeUrl(topUrl);

    swipeDebug('MapView', 'swipe:state', {
      enabled: swipe.isSwipeEnabled,
      renderActive: isSwipeRenderActive,
      dividerPercent: swipe.dividerPercent,
      revealSide: swipe.revealSide,
      availableLayerIds: swipe.availableLayers.map((layer) => layer.id),
      availableLayerUrls: swipe.availableLayers.map((layer) =>
        layer.kind === 'tile' || layer.kind === 'imageOverlay' ? compactUrl(layer.url) : null
      ),
      bottomLayerId: swipeBottomLayer?.id ?? null,
      topLayerId: swipeTopLayer?.id ?? null,
      bottomLayerUrl: compactUrl(bottomUrl),
      topLayerUrl: compactUrl(topUrl),
      bottomLayerUrlNormalized: compactUrl(bottomNorm),
      topLayerUrlNormalized: compactUrl(topNorm),
      hasAoi: Boolean(activeAoi),
    });

    if (isSwipeRenderActive && swipeBottomLayer && swipeTopLayer) {
      const sameKind = swipeBottomLayer.kind === swipeTopLayer.kind;
      const sameUrl =
        sameKind &&
        ((swipeBottomLayer.kind === 'tile' &&
          swipeTopLayer.kind === 'tile' &&
          swipeBottomLayer.url === swipeTopLayer.url) ||
          (swipeBottomLayer.kind === 'imageOverlay' &&
            swipeTopLayer.kind === 'imageOverlay' &&
            swipeBottomLayer.url === swipeTopLayer.url));
      if (sameUrl) {
        swipeDebugWarn('MapView', 'swipe:layers-identical-url', {
          bottomLayerId: swipeBottomLayer.id,
          topLayerId: swipeTopLayer.id,
          url:
            swipeBottomLayer.kind === 'tile' && swipeTopLayer.kind === 'tile'
              ? swipeBottomLayer.url
              : swipeBottomLayer.kind === 'imageOverlay' && swipeTopLayer.kind === 'imageOverlay'
                ? swipeBottomLayer.url
                : null,
        });
      }
      const sameNormalized = Boolean(bottomNorm && topNorm && bottomNorm === topNorm);
      if (sameNormalized) {
        swipeDebugWarn('MapView', 'swipe:layers-identical-normalized-url', {
          bottomLayerId: swipeBottomLayer.id,
          topLayerId: swipeTopLayer.id,
          bottomNorm,
          topNorm,
        });
      }
    }
  }, [
    activeAoi,
    isSwipeRenderActive,
    swipe.availableLayers,
    swipe.dividerPercent,
    swipe.isSwipeEnabled,
    swipe.revealSide,
    swipeBottomLayer,
    swipeTopLayer,
  ]);

  const handleWmsLayerToggle = (layerName: string, isVisible: boolean) => {
    if (!isVisible) {
      if (layerName === 'alertas_desmatamento_mapbiomas' && activeInfoLayer === 'mapbiomas') {
        setActiveInfoLayer(null);
      }
    }
    setVisibleWmsLayers(prev => ({ ...prev, [layerName]: isVisible }));
  };

  const formatPropertiesForPopup = (props: Record<string, any>, title: string) => {
    const entries = Object.entries(props || {})
      .filter(([, value]) => value !== null && value !== undefined && value !== '');
    const rows = entries.slice(0, 20)
      .map(([key, value]) => `<p><strong>${key}:</strong> ${String(value)}</p>`)
      .join('');
    return `<div><h4>${title}</h4>${rows || '<p>Nenhum atributo disponivel.</p>'}</div>`;
  };

  const handleGetFeatureInfo = (e: L.LeafletMouseEvent) => {
    if (!activeInfoLayer || !mapRef.current) {
      return;
    }

    const selectedLayer = activeInfoLayer;

    if (selectedLayer === 'mapbiomas' && !visibleWmsLayers.alertas_desmatamento_mapbiomas) return;

    const map = mapRef.current;
    const point = map.latLngToContainerPoint(e.latlng);
    const size = map.getSize();
    const bounds = map.getBounds().toBBoxString();

    const body = {
      layerType: selectedLayer,
      bbox: bounds,
      width: size.x,
      height: size.y,
      x: Math.round(point.x),
      y: Math.round(point.y),
    };

    fetch(`${API_BASE_URL}/api/wms/feature-info`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(body),
    })
      .then(async response => {
        const text = await response.text();
        let payload: any = {};
        try {
          payload = text ? JSON.parse(text) : {};
        } catch {
          payload = { detail: text || 'Resposta invalida do servico.' };
        }
        if (!response.ok) {
          throw new Error(payload?.detail || 'Falha ao consultar GetFeatureInfo.');
        }
        return payload;
      })
      .then(data => {
        if (data && data.features && data.features.length > 0) {
          const feature = data.features[0];
          const props = feature.properties;
          const content = formatPropertiesForPopup(props, 'Alerta MapBiomas');

          L.popup()
            .setLatLng(e.latlng)
            .setContent(content)
            .openOn(map);
        } else {
          L.popup()
            .setLatLng(e.latlng)
            .setContent('<div><p>Nenhuma feicao encontrada neste ponto.</p></div>')
            .openOn(map);
        }
      })
      .catch(error => {
        console.error('Erro ao buscar GetFeatureInfo:', error);
        const fallbackMessage =
          'Servico MapBiomas temporariamente indisponivel. Tente novamente em instantes.';
        L.popup()
          .setLatLng(e.latlng)
          .setContent(`<div><p>${fallbackMessage}</p></div>`)
          .openOn(map);
      })
      .finally(() => {
        setActiveInfoLayer(null);
      });
  };

  const fetchProperties = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/properties' );
      if (!response.ok) throw new Error('Falha ao carregar propriedades.');
      const data: FeatureCollection = await response.json();
      setPropertiesData(data);
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    fetchProperties();
  }, [refreshTrigger]);
  
  useEffect(() => {
  if (!mapRef.current) return;
  const mapContainer = mapRef.current.getContainer();
  if (activeInfoLayer) {
    mapContainer.classList.add('crosshair-cursor');
  } else {
    mapContainer.classList.remove('crosshair-cursor');
  }
}, [activeInfoLayer]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.pm) return;

    if (!activeAoi) {
      const geomanLayers = map.pm.getGeomanLayers?.() ?? [];
      geomanLayers.forEach((layer: any) => {
        if (layer && typeof layer.remove === 'function') {
          layer.remove();
        }
      });
    }
  }, [activeAoi]);

  const handleBindSwipeContainer = useCallback(
    (element: HTMLElement | null) => {
      swipe.setContainerElement(element ?? mapShellRef.current);
    },
    [swipe.setContainerElement]
  );

  useEffect(() => {
    if (!activeAoi && swipe.isSwipeEnabled) {
      swipe.disableSwipe();
    }
  }, [activeAoi, swipe.disableSwipe, swipe.isSwipeEnabled]);

  useEffect(() => {
    if (activeAoi) {
      swipe.resetSwipe();
    }
  }, [activeAoi, swipe.resetSwipe]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.sessionStorage.setItem(SWIPE_PANEL_POSITION_KEY, JSON.stringify(swipePanelPosition));
  }, [swipePanelPosition]);

  useEffect(() => {
    const handleResize = () => {
      setSwipePanelPosition((prev) => {
        const shell = mapShellRef.current;
        if (!shell) return prev;
        const rect = shell.getBoundingClientRect();
        const minX = 8;
        const minY = 8;
        const maxX = Math.max(minX, rect.width - 308);
        const maxY = Math.max(minY, rect.height - 220);
        return {
          x: Math.min(Math.max(prev.x, minX), maxX),
          y: Math.min(Math.max(prev.y, minY), maxY),
        };
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!isDraggingSwipePanel) return;

    const clampPosition = (x: number, y: number) => {
      const shell = mapShellRef.current;
      if (!shell) return { x, y };
      const shellRect = shell.getBoundingClientRect();
      const minX = 8;
      const minY = 8;
      const maxX = Math.max(minX, shellRect.width - 308);
      const maxY = Math.max(minY, shellRect.height - 220);
      return {
        x: Math.min(Math.max(x, minX), maxX),
        y: Math.min(Math.max(y, minY), maxY),
      };
    };

    const handlePointerMove = (event: PointerEvent) => {
      const drag = swipePanelDragRef.current;
      if (drag.pointerId !== null && event.pointerId !== drag.pointerId) return;
      const nextX = drag.originX + (event.clientX - drag.startX);
      const nextY = drag.originY + (event.clientY - drag.startY);
      setSwipePanelPosition(clampPosition(nextX, nextY));
    };

    const handlePointerEnd = (event: PointerEvent) => {
      const drag = swipePanelDragRef.current;
      if (drag.pointerId !== null && event.pointerId !== drag.pointerId) return;
      setIsDraggingSwipePanel(false);
      swipePanelDragRef.current.pointerId = null;
      document.body.classList.remove('swipe-panel-dragging');
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerEnd);
    window.addEventListener('pointercancel', handlePointerEnd);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerEnd);
      window.removeEventListener('pointercancel', handlePointerEnd);
    };
  }, [isDraggingSwipePanel]);

  useEffect(() => () => document.body.classList.remove('swipe-panel-dragging'), []);

  const handleSwipePanelDragStart = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    swipePanelDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: swipePanelPosition.x,
      originY: swipePanelPosition.y,
    };
    setIsDraggingSwipePanel(true);
    document.body.classList.add('swipe-panel-dragging');
    if (event.currentTarget.setPointerCapture) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  }, [swipePanelPosition.x, swipePanelPosition.y]);

  const onEachProperty = (feature: Feature, layer: Layer) => {
    if (feature.properties) {
      const { nome, proprietario, id } = feature.properties;
      layer.bindPopup(
        `<b>${nome}</b>  
         ProprietÃƒÂ¡rio: ${proprietario}  
         <small>Clique para ver detalhes</small>`
      );
      if (typeof onPropertySelect === 'function') {
        layer.on('click', () => onPropertySelect(String(id)));
      }
    }
  };

  const activeBaseMap = baseMaps[baseMapKey as keyof typeof baseMaps] || baseMaps.osm;
  const aoiStyle = useMemo(
    () =>
      ({
        color: '#4aa3ff',
        weight: swipe.isSwipeEnabled ? 2.4 : 2,
        opacity: 0.78,
        fillColor: '#9ad8ff',
        fillOpacity: swipe.isSwipeEnabled ? 0 : 0.14,
        lineCap: 'round',
        lineJoin: 'round',
        className: swipe.isSwipeEnabled ? 'aoi-swipe-outline' : 'aoi-default',
        interactive: false,
      } as L.PathOptions),
    [swipe.isSwipeEnabled]
  );

  const changePolygonsStyle = useMemo(
    () =>
      ({
        color: '#22c55e',
        weight: 1.4,
        opacity: 0.55,
        fillColor: '#22c55e',
        fillOpacity: 0.1,
        lineCap: 'round',
        lineJoin: 'round',
      } as L.PathOptions),
    []
  );
  const trainingSamplesStyle = useMemo(
    () =>
      ({
        color: '#f59e0b',
        weight: 2,
        opacity: 0.9,
        fillColor: '#f59e0b',
        fillOpacity: 0.2,
        lineCap: 'round',
        lineJoin: 'round',
      } as L.PathOptions),
    []
  );
  const refinementZoneStyle = useMemo(
    () =>
      ({
        color: '#f59e0b',
        weight: 2,
        opacity: 0.95,
        fillColor: '#f59e0b',
        fillOpacity: 0.08,
        dashArray: '6 4',
      } as L.PathOptions),
    []
  );
  const monitoringAreasStyle = useCallback((feature: Feature | undefined) => {
    const areaType = String(feature?.properties?.tipo_area || '').toLowerCase();
    if (areaType === 'app') {
      return {
        color: '#22c55e',
        weight: 2,
        opacity: 0.9,
        fillColor: '#22c55e',
        fillOpacity: 0.12,
        dashArray: '4 3',
      } as L.PathOptions;
    }
    if (areaType === 'surroundings') {
      return {
        color: '#f59e0b',
        weight: 2,
        opacity: 0.9,
        fillColor: '#f59e0b',
        fillOpacity: 0.1,
        dashArray: '5 4',
      } as L.PathOptions;
    }
    return {
      color: '#60a5fa',
      weight: 2,
      opacity: 0.9,
      fillColor: '#93c5fd',
      fillOpacity: 0.1,
      dashArray: '4 3',
    } as L.PathOptions;
  }, []);

  const aiPolygonLayersRef = useRef<Map<string, L.Layer>>(new Map());
  const selectedAIPolygonIds = useMemo(
    () => new Set(landCoverAiSelectedPolygonIds),
    [landCoverAiSelectedPolygonIds]
  );
  const aiPolygonStyle = useCallback(
    (feature: Feature | undefined) => {
      const polygonId = String(feature?.properties?.polygon_id || '');
      const status = String(feature?.properties?.status || 'suggested').toLowerCase();
      const isSelected = selectedAIPolygonIds.has(polygonId);
      const baseStyle: Record<string, L.PathOptions> = {
        suggested: {
          color: '#38bdf8',
          fillColor: '#38bdf8',
          fillOpacity: 0.14,
          weight: 1.6,
          opacity: 0.9,
          dashArray: '4 3',
          interactive: true,
        },
        approved: {
          color: '#22c55e',
          fillColor: '#22c55e',
          fillOpacity: 0.16,
          weight: 1.8,
          opacity: 0.92,
          interactive: true,
        },
        rejected: {
          color: '#ef4444',
          fillColor: '#ef4444',
          fillOpacity: 0.09,
          weight: 1.4,
          opacity: 0.85,
          dashArray: '6 4',
          interactive: true,
        },
        edited: {
          color: '#f59e0b',
          fillColor: '#f59e0b',
          fillOpacity: 0.16,
          weight: 1.9,
          opacity: 0.92,
          interactive: true,
        },
      };
      const style = baseStyle[status] || baseStyle.suggested;
      if (!isSelected) return style;
      return {
        ...style,
        weight: 3,
        fillOpacity: 0.22,
        opacity: 1,
        interactive: true,
      } as L.PathOptions;
    },
    [selectedAIPolygonIds]
  );

  const onEachAIPolygon = useCallback(
    (feature: Feature, layer: Layer) => {
      const polygonId = String(feature?.properties?.polygon_id || '');
      if (!polygonId) return;
      aiPolygonLayersRef.current.set(polygonId, layer);
      const layerAny = layer as any;
      if (layerAny?.options) {
        layerAny.options.interactive = true;
      }

      const clickHandler = (event: any) => {
        event?.originalEvent?.preventDefault?.();
        event?.originalEvent?.stopPropagation?.();
        const additive = Boolean(event?.originalEvent?.ctrlKey || event?.originalEvent?.metaKey);
        onLandCoverAIPolygonSelect?.(polygonId, additive);
      };
      const editHandler = (event: any) => {
        const editedGeoJson = event?.layer?.toGeoJSON?.() as Feature | undefined;
        if (!editedGeoJson?.geometry) return;
        if (editedGeoJson.geometry.type !== 'Polygon' && editedGeoJson.geometry.type !== 'MultiPolygon') return;
        onLandCoverAIPolygonGeometryEdit?.(polygonId, editedGeoJson.geometry);
      };

      layer.on('click', clickHandler);
      layer.on('pm:edit', editHandler);
      (layer as any)?.bringToFront?.();
      layer.once('remove', () => {
        aiPolygonLayersRef.current.delete(polygonId);
        layer.off('click', clickHandler);
        layer.off('pm:edit', editHandler);
      });
    },
    [onLandCoverAIPolygonGeometryEdit, onLandCoverAIPolygonSelect]
  );

  const handleAIPolygonGeoJsonClick = useCallback(
    (event: any) => {
      const feature =
        event?.layer?.feature ||
        event?.sourceTarget?.feature ||
        event?.propagatedFrom?.feature ||
        null;
      const polygonId = String(feature?.properties?.polygon_id || '');
      if (!polygonId) return;
      const additive = Boolean(event?.originalEvent?.ctrlKey || event?.originalEvent?.metaKey);
      onLandCoverAIPolygonSelect?.(polygonId, additive);
    },
    [onLandCoverAIPolygonSelect]
  );

  useEffect(() => {
    aiPolygonLayersRef.current.forEach((layer, polygonId) => {
      const editableLayer = layer as any;
      if (!editableLayer?.pm) return;
      if (landCoverAiEditingPolygonId && landCoverAiEditingPolygonId === polygonId) {
        editableLayer.pm.enable({
          allowSelfIntersection: false,
          allowEditing: true,
        });
      } else {
        editableLayer.pm.disable();
      }
    });
  }, [landCoverAiEditingPolygonId, landCoverAiPolygonsVersion]);

  const mapbiomasWmsOptions = useMemo(
    () =>
      ({
        layers: 'mapbiomas-alertas:v_alerts_last_status',
        styles: '',
        format: 'image/png',
        transparent: true,
        version: '1.1.1',
        zIndex: 480,
        tiled: true,
        updateWhenIdle: true,
        updateWhenZooming: false,
        keepBuffer: 1,
        detectRetina: false,
        crossOrigin: true,
        minZoom: 6,
      } as L.WMSOptions),
    []
  );

  const flyToNominatimResult = (result: NominatimResult) => {
    if (!mapRef.current) return false;

    const bbox = result?.boundingbox;
    const lat = Number(result?.lat);
    const lon = Number(result?.lon);

    if (Array.isArray(bbox) && bbox.length === 4) {
      const south = Number(bbox[0]);
      const north = Number(bbox[1]);
      const west = Number(bbox[2]);
      const east = Number(bbox[3]);

      if (
        Number.isFinite(south) &&
        Number.isFinite(north) &&
        Number.isFinite(west) &&
        Number.isFinite(east)
      ) {
        mapRef.current.flyToBounds(
          [
            [south, west],
            [north, east],
          ],
          { padding: [40, 40], duration: 1.2 }
        );
        return true;
      }
    }

    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      mapRef.current.flyTo([lat, lon], 14, { duration: 1.2 });
      return true;
    }

    return false;
  };

  const handleSelectSuggestion = (suggestion: NominatimResult) => {
    setLocationQuery(suggestion.display_name || locationQuery);
    setIsSuggestionsOpen(false);
    setHighlightedSuggestionIndex(-1);
    setSearchError('');
  };

  const handleLocationSearch = async () => {
    const query = locationQuery.trim();
    if (!query || !mapRef.current) return;

    setSearchError('');
    setIsSearchingLocation(true);

    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Falha ao consultar o servico de busca de local.');
      }

      const results = await response.json();
      if (!Array.isArray(results) || results.length === 0) {
        setSearchError('Local nao encontrado.');
        return;
      }

      const best = results[0];
      const moved = flyToNominatimResult(best);
      if (!moved) setSearchError('Nao foi possivel posicionar o mapa para esse local.');
    } catch (err) {
      console.error('Erro na busca de local:', err);
      setSearchError('Erro ao buscar local. Tente novamente.');
    } finally {
      setIsSearchingLocation(false);
    }
  };

  useEffect(() => {
    const query = locationQuery.trim();

    if (suggestionDebounceRef.current) {
      clearTimeout(suggestionDebounceRef.current);
      suggestionDebounceRef.current = null;
    }

    if (suggestionAbortRef.current) {
      suggestionAbortRef.current.abort();
      suggestionAbortRef.current = null;
    }

    if (query.length < 3) {
      setLocationSuggestions([]);
      setHighlightedSuggestionIndex(-1);
      return;
    }

    suggestionDebounceRef.current = setTimeout(async () => {
      const controller = new AbortController();
      suggestionAbortRef.current = controller;
      setIsSearchingSuggestions(true);

      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&limit=6&q=${encodeURIComponent(query)}`;
        const response = await fetch(url, {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        });

        if (!response.ok) {
          throw new Error('Falha ao consultar sugestoes.');
        }

        const results = await response.json();
        const suggestions = Array.isArray(results) ? (results as NominatimResult[]) : [];
        setLocationSuggestions(suggestions);
        setIsSuggestionsOpen(true);
        setHighlightedSuggestionIndex(suggestions.length ? 0 : -1);
      } catch (err) {
        if ((err as Error)?.name !== 'AbortError') {
          setLocationSuggestions([]);
          setHighlightedSuggestionIndex(-1);
        }
      } finally {
        setIsSearchingSuggestions(false);
        if (suggestionAbortRef.current === controller) {
          suggestionAbortRef.current = null;
        }
      }
    }, 300);

    return () => {
      if (suggestionDebounceRef.current) {
        clearTimeout(suggestionDebounceRef.current);
        suggestionDebounceRef.current = null;
      }
    };
  }, [locationQuery]);

  useEffect(() => {
    return () => {
      if (suggestionDebounceRef.current) {
        clearTimeout(suggestionDebounceRef.current);
        suggestionDebounceRef.current = null;
      }
      if (suggestionAbortRef.current) {
        suggestionAbortRef.current.abort();
        suggestionAbortRef.current = null;
      }
    };
  }, []);

  return (
    <div ref={mapShellRef} className={`map-view-shell ${swipe.isSwipeEnabled ? 'is-swipe-active' : ''}`}>
      <div style={{ position: 'absolute', top: '10px', right: '10px', zIndex: 1000 }}>
        <BaseMapSelector value={baseMapKey} onChange={onBaseMapChange} />
      </div>
      <div
        style={{
          position: 'absolute',
          top: `${swipePanelPosition.y}px`,
          left: `${swipePanelPosition.x}px`,
          zIndex: 1200,
        }}
      >
        <SwipeControl
          availableLayers={swipe.availableLayers}
          leftLayerId={swipe.leftLayerId}
          rightLayerId={swipe.rightLayerId}
          isSwipeEnabled={swipe.isSwipeEnabled}
          canEnableSwipe={swipe.canEnableSwipe}
          hasAtLeastTwoLayers={swipe.hasAtLeastTwoLayers}
          hasDistinctLayerSources={swipe.hasDistinctLayerSources}
          isAoiReady={Boolean(activeAoi)}
          revealSide={swipe.revealSide}
          onLeftLayerChange={swipe.setLeftLayerId}
          onRightLayerChange={swipe.setRightLayerId}
          onEnable={swipe.enableSwipe}
          onDisable={swipe.disableSwipe}
          onReset={swipe.resetSwipe}
          onSwap={swipe.swapLayers}
          onToggleRevealSide={swipe.toggleRevealSide}
          onPanelDragStart={handleSwipePanelDragStart}
        />
      </div>
      <div
        style={{
          position: 'absolute',
          top: '10px',
          left: '50px',
          zIndex: 1200,
          background: 'rgba(255,255,255,0.95)',
          borderRadius: '8px',
          padding: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          minWidth: '280px'
        }}
      >
        <div style={{ display: 'flex', gap: '8px', position: 'relative' }}>
          <input
            type="text"
            value={locationQuery}
            placeholder="Buscar local (cidade, bairro, endereco)"
            onChange={(e) => {
              setLocationQuery(e.target.value);
              setIsSuggestionsOpen(true);
            }}
            onFocus={() => {
              if (locationSuggestions.length > 0) setIsSuggestionsOpen(true);
            }}
            onBlur={() => {
              setTimeout(() => setIsSuggestionsOpen(false), 120);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (!locationSuggestions.length) return;
                setIsSuggestionsOpen(true);
                setHighlightedSuggestionIndex((prev) => (prev + 1) % locationSuggestions.length);
                return;
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (!locationSuggestions.length) return;
                setIsSuggestionsOpen(true);
                setHighlightedSuggestionIndex((prev) => (prev <= 0 ? locationSuggestions.length - 1 : prev - 1));
                return;
              }
              if (e.key === 'Enter') {
                e.preventDefault();
                // Busca apenas por clique no botao "Pesquisar".
                return;
              }
              if (e.key === 'Escape') {
                setIsSuggestionsOpen(false);
                setHighlightedSuggestionIndex(-1);
              }
            }}
            style={{
              flex: 1,
              padding: '8px',
              border: '1px solid #cfd8dc',
              borderRadius: '6px',
              fontSize: '14px'
            }}
          />
          {isSuggestionsOpen && (locationSuggestions.length > 0 || isSearchingSuggestions) && (
            <div
              style={{
                position: 'absolute',
                left: 0,
                right: '74px',
                top: '41px',
                maxHeight: '260px',
                overflowY: 'auto',
                background: '#fff',
                border: '1px solid #cfd8dc',
                borderRadius: '6px',
                boxShadow: '0 4px 14px rgba(0,0,0,0.18)',
                zIndex: 1300
              }}
            >
              {isSearchingSuggestions && (
                <div style={{ padding: '8px 10px', fontSize: '12px', color: '#4b5563' }}>
                  Buscando sugestoes...
                </div>
              )}
              {!isSearchingSuggestions && locationSuggestions.map((item, index) => (
                <button
                  key={`${item.display_name}-${index}`}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleSelectSuggestion(item)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    border: 'none',
                    borderBottom: index === locationSuggestions.length - 1 ? 'none' : '1px solid #eef2f7',
                    background: index === highlightedSuggestionIndex ? '#e8f0fe' : '#fff',
                    padding: '8px 10px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    lineHeight: 1.35
                  }}
                >
                  {item.display_name || 'Local sem descricao'}
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={handleLocationSearch}
            disabled={isSearchingLocation}
            style={{
              padding: '8px 10px',
              border: 'none',
              borderRadius: '6px',
              background: '#1f6feb',
              color: '#fff',
              cursor: isSearchingLocation ? 'not-allowed' : 'pointer',
              opacity: isSearchingLocation ? 0.7 : 1
            }}
          >
            {isSearchingLocation ? '...' : 'Pesquisar'}
          </button>
        </div>
        {searchError && (
          <div style={{ marginTop: '6px', fontSize: '12px', color: '#b42318' }}>
            {searchError}
          </div>
        )}
        {tileLayerWarning && (
          <div style={{ marginTop: '6px', fontSize: '12px', color: '#b42318' }}>
            {tileLayerWarning}
          </div>
        )}
      </div>
      <div style={{ position: 'absolute', top: '90px', right: '10px', zIndex: 999 }}>
        <LayerControl onLayerToggle={handleWmsLayerToggle} initialState={visibleWmsLayers} />
      </div>
      
      <div style={{ position: 'absolute', top: '260px', right: '10px', zIndex: 1200, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {visibleWmsLayers.alertas_desmatamento_mapbiomas && (
          <InfoTool
            onClick={() => setActiveInfoLayer(prev => prev === 'mapbiomas' ? null : 'mapbiomas')}
            isActive={activeInfoLayer === 'mapbiomas'}
            title="Consultar informacoes dos alertas MapBiomas (clique e depois no mapa)"
          />
        )}
      </div>

      <MapContainer
        center={[-22.505, -43.179]}
        zoom={13}
        style={{ height: '100%', width: '100%' }}
        ref={mapRef}
      >
        <TileLayer key={baseMapKey} url={activeBaseMap.url} attribution={activeBaseMap.attribution} />
        <SwipeContainerBinder onBind={handleBindSwipeContainer} />
        
        <MapClickHandler onMapClick={handleGetFeatureInfo} />

        <MapViewAnimator target={mapViewTarget} />
        <GeomanDrawControl 
          onDrawComplete={onDrawComplete}
          drawingEnabled={drawingEnabled}
          isDrawingTalhao={isDrawingTalhao}
          onTalhaoDrawComplete={onTalhaoDrawComplete}
          isDrawingLandCoverSample={landCoverDrawingEnabled}
          trainingSamplesClearVersion={landCoverTrainingSamplesClearVersion}
          isLandCoverRefinementMode={landCoverRefinementMode}
          landCoverSelectedClassId={landCoverSelectedClassId}
          onLandCoverSampleDrawComplete={onLandCoverSampleDrawComplete}
          isDrawingLandCoverRefinementZone={landCoverDrawingRefinementZone}
          onLandCoverRefinementZoneDrawComplete={onLandCoverRefinementZoneDrawComplete}
          refinementClearVersion={landCoverRefinementClearVersion}
          onAoiDeleted={onAoiDeleted}
          isEditingLandCoverAIPolygon={Boolean(landCoverAiEditingPolygonId)}
        />
        <AoiAreaLabel aoi={activeAoi} />
        
        {!isSwipeRenderActive ? (
          <>
            <DynamicTileLayer
              url={visibleLayerUrl}
              zIndex={indexLayerZIndex}
              attribution="Indice Calculado"
              layerLabel="Indice calculado"
              onLayerFailure={handleTileLayerFailure}
            />
            <DynamicTileLayer
              url={landCoverLayerVisible ? landCoverLayerUrl || null : null}
              zIndex={18}
              opacity={0.72}
              attribution="LandCover"
              layerLabel="Classificacao de uso do solo"
              onLayerFailure={handleTileLayerFailure}
            />
            <DynamicTileLayer
              url={previewLayerUrl}
              zIndex={previewLayerZIndex}
              attribution="Pre-visualizacao"
              layerLabel="Pre-visualizacao"
              onLayerFailure={handleTileLayerFailure}
            />
            <DynamicImageOverlay overlay={previewOverlay} zIndex={previewLayerZIndex} />
            <DynamicTileLayer
              url={differenceLayerUrl}
              zIndex={differenceLayerZIndex}
              opacity={0.62}
              attribution="Diferenca NDVI"
              className="difference-tile-soft"
              layerLabel="Diferenca NDVI"
              onLayerFailure={handleTileLayerFailure}
            />
          </>
        ) : (
          <>
            <SwipeRasterLayer
              descriptor={swipeBottomLayer}
              paneName={SWIPE_BOTTOM_PANE}
              paneZIndex={455}
              forceOpaque
            />
            <SwipeRasterLayer
              descriptor={swipeTopLayer}
              paneName={SWIPE_TOP_PANE}
              paneZIndex={456}
              forceOpaque
            />
            <SwipeLayerElementClipController
              enabled={isSwipeRenderActive}
              dividerPercent={swipe.dividerPercent}
              revealSide={swipe.revealSide}
              paneName={SWIPE_TOP_PANE}
            />
          </>
        )}

        <WmsLayer
          url="http://localhost:8080/geoserver/imagens_satelite/wms" // <-- Altere o workspace
          options={{
            layers: 'imagens_satelite:ucs', // <-- Altere o nome completo da camada
            format: 'image/png',
            transparent: true,
            zIndex: 490 // zIndex alto para ficar por cima de outras camadas
          }}
          visible={visibleWmsLayers.ucs} // <<-- Conecta a visibilidade ao estado
          layerName="ucs"
        />
  <WmsLayer
  url="https://production.alerta.mapbiomas.org/geoserver/ows"
  options={mapbiomasWmsOptions}
  visible={visibleWmsLayers.alertas_desmatamento_mapbiomas}
  layerName="alertas_desmatamento_mapbiomas"
/>

        {changePolygons && <GeoJSON data={changePolygons as any} style={changePolygonsStyle} />}
        {landCoverTrainingSamples && (
          <GeoJSON
            key={JSON.stringify(landCoverTrainingSamples)}
            data={landCoverTrainingSamples as any}
            style={trainingSamplesStyle}
          />
        )}
        {landCoverRefinementPolygon && (
          <GeoJSON
            key={JSON.stringify(landCoverRefinementPolygon)}
            data={landCoverRefinementPolygon as any}
            style={refinementZoneStyle}
          />
        )}
        {landCoverAiPolygons && landCoverAiPolygons.features.length > 0 && (
          <Pane name="landcover-ai-editor-pane" style={{ zIndex: 690, pointerEvents: 'auto' }}>
            <GeoJSON
              key={`ai-polygons-${landCoverAiPolygonsVersion}`}
              data={landCoverAiPolygons as any}
              style={aiPolygonStyle}
              onEachFeature={onEachAIPolygon}
              pane="landcover-ai-editor-pane"
              eventHandlers={{ click: handleAIPolygonGeoJsonClick }}
            />
          </Pane>
        )}
        {monitoringAreas && monitoringAreas.features.length > 0 && (
          <GeoJSON
            key={JSON.stringify(monitoringAreas)}
            data={monitoringAreas as any}
            style={monitoringAreasStyle}
          />
        )}
        {activeAoi && <GeoJSON key={JSON.stringify(activeAoi )} data={activeAoi} style={aoiStyle} />}
        {propertiesData && <GeoJSON data={propertiesData} onEachFeature={onEachProperty} />}
        
        {showFirmsPoints && <FirmsDataLayer />}
        <PrecipitationLayer visible={showPrecipitation} />
        <SwipeDivider
          isEnabled={isSwipeRenderActive}
          dividerPercent={swipe.dividerPercent}
          revealSide={swipe.revealSide}
          onPointerDown={swipe.onDividerPointerDown}
        />
      </MapContainer>

      <div style={{ position: 'absolute', bottom: '20px', left: '10px', zIndex: 1001, display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <button className="map-layer-button firms" onClick={() => setShowFirmsPoints(p => !p)}>
          {showFirmsPoints ? 'Ocultar FIRMS' : 'Mostrar FIRMS'}
        </button>
        <button className="map-layer-button precipitation" onClick={() => setShowPrecipitation(p => !p)}>
          {showPrecipitation ? 'Ocultar PrecipitaÃƒÂ§ÃƒÂ£o' : 'Mostrar PrecipitaÃƒÂ§ÃƒÂ£o'}
        </button>
      </div>
    </div>
  );
}


