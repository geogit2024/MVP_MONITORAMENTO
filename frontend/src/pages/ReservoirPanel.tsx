import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import L, { LatLngBoundsExpression } from 'leaflet';
import togeojson from '@mapbox/togeojson';
import JSZip from 'jszip';
import { Line } from 'react-chartjs-2';
import {
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from 'chart.js';
import MapView from '../components/MapView';
import ChangeDetectionChart from '../components/ChangeDetectionChart';
import {
  classifyReservoirLandUse,
  createMonitoringArea,
  createReservoir,
  deleteMonitoringArea,
  deleteReservoir,
  detectReservoirChange,
  extractWaterbody,
  featureGeometry,
  generateReservoirInsight,
  getReservoirContext,
  getReservoirDashboard,
  getReservoirReportCsvUrl,
  listMonitoringAreas,
  listReservoirAlerts,
  listReservoirHistory,
  listReservoirs,
  previewReservoirImage,
  runReservoirIndices,
  runReservoirTimeSeries,
  runRiparianMonitoring,
  runTurbidityProxy,
  searchReservoirImages,
  updateAlertStatus,
  updateReservoirContext,
} from '../modules/reservoir-monitoring/api';
import type {
  ReservoirAlert,
  ReservoirContext,
  ReservoirDashboard,
  ReservoirFeature,
  ReservoirImageInfo,
  ReservoirIndicesResponse,
  ReservoirLandUseResult,
  ReservoirTimeSeriesResult,
  ReservoirWaterbodyResult,
} from '../modules/reservoir-monitoring/types';
import './ReservoirPanel.css';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

type DrawMode = 'none' | 'new_reservoir' | 'monitoring_aoi' | 'app' | 'surroundings';
type PreviewOverlay = { url: string; bounds: [[number, number], [number, number]] };
type PreviewLayerData =
  | { mode: 'tile'; url: string }
  | { mode: 'overlay'; url: string; bounds: [[number, number], [number, number]] };

const areaFeatureKey = (feature: Feature, index: number) =>
  String(feature.properties?.id ?? `${String(feature.properties?.tipo_area || 'area')}-${index}`);

const SATELLITES = [
  'SENTINEL_2A',
  'SENTINEL_2B',
  'LANDSAT_8',
  'LANDSAT_9',
  'CBERS_4A_WFI',
  'CBERS_4A_MUX',
];

const INDEX_OPTIONS = ['NDVI', 'NDWI', 'MNDWI', 'NDMI', 'SAVI', 'TURBIDITY_PROXY'];

const toFeature = (geometry: Geometry, properties: Record<string, unknown> = {}): Feature => ({
  type: 'Feature',
  geometry,
  properties,
});

const todayIso = () => new Date().toISOString().slice(0, 10);
const minusDaysIso = (days: number) => {
  const dt = new Date();
  dt.setDate(dt.getDate() - days);
  return dt.toISOString().slice(0, 10);
};

export default function ReservoirPanel() {
  const [reservoirs, setReservoirs] = useState<ReservoirFeature[]>([]);
  const [selectedReservoirId, setSelectedReservoirId] = useState<number | null>(null);
  const [context, setContext] = useState<ReservoirContext | null>(null);
  const [areas, setAreas] = useState<FeatureCollection>({ type: 'FeatureCollection', features: [] });
  const [alerts, setAlerts] = useState<ReservoirAlert[]>([]);
  const [history, setHistory] = useState<Array<Record<string, unknown>>>([]);
  const [dashboard, setDashboard] = useState<ReservoirDashboard | null>(null);

  const [dateFrom, setDateFrom] = useState(minusDaysIso(90));
  const [dateTo, setDateTo] = useState(todayIso());
  const [cloudPct, setCloudPct] = useState(30);
  const [satellite, setSatellite] = useState('SENTINEL_2A');
  const [images, setImages] = useState<ReservoirImageInfo[]>([]);
  const [selectedImageIds, setSelectedImageIds] = useState<string[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<string[]>(['NDVI', 'NDWI']);
  const [timeSeriesIndicator, setTimeSeriesIndicator] = useState('NDVI');
  const [timeSeriesMetric, setTimeSeriesMetric] = useState<'index_mean' | 'water_area'>('index_mean');

  const [activeAoi, setActiveAoi] = useState<Feature | null>(null);
  const [mapViewTarget, setMapViewTarget] = useState<LatLngBoundsExpression | null>(null);
  const [baseMapKey, setBaseMapKey] = useState('google_hybrid');
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [drawMode, setDrawMode] = useState<DrawMode>('none');

  const [indexResult, setIndexResult] = useState<ReservoirIndicesResponse | null>(null);
  const [waterbodyResult, setWaterbodyResult] = useState<ReservoirWaterbodyResult | null>(null);
  const [timeSeriesResult, setTimeSeriesResult] = useState<ReservoirTimeSeriesResult | null>(null);
  const [landUseResult, setLandUseResult] = useState<ReservoirLandUseResult | null>(null);
  const [changeResult, setChangeResult] = useState<{
    gainAreaHa: number;
    lossAreaHa: number;
    totalAreaHa: number;
    differenceImageUrl?: string | null;
    changeGeoJson?: FeatureCollection | null;
  } | null>(null);
  const [riparianResult, setRiparianResult] = useState<{
    ndvi_mean: number;
    previous_ndvi_mean?: number | null;
    variacao_pct?: number | null;
  } | null>(null);
  const [turbidityResult, setTurbidityResult] = useState<{ mean?: number | null; min?: number | null; max?: number | null } | null>(null);
  const [insightText, setInsightText] = useState<string>('');
  const [visibleAreaByKey, setVisibleAreaByKey] = useState<Record<string, boolean>>({});

  const [visibleLayerUrl, setVisibleLayerUrl] = useState<string | null>(null);
  const [previewLayerUrl, setPreviewLayerUrl] = useState<string | null>(null);
  const [previewOverlay, setPreviewOverlay] = useState<PreviewOverlay | null>(null);
  const [differenceLayerUrl, setDifferenceLayerUrl] = useState<string | null>(null);
  const [changeGeoJson, setChangeGeoJson] = useState<FeatureCollection | null>(null);
  const [landUseTileUrl, setLandUseTileUrl] = useState<string | null>(null);

  const [reservoirNameDraft, setReservoirNameDraft] = useState('');
  const [reservoirDescriptionDraft, setReservoirDescriptionDraft] = useState('');
  const [draftReservoirGeometry, setDraftReservoirGeometry] = useState<Geometry | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const previewTileCacheRef = useRef<Record<string, PreviewLayerData>>({});
  const largeGeometryWarnedRef = useRef(false);

  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const geometryToBoundsPolygon = useCallback((geometry: Geometry): Geometry | undefined => {
    try {
      const bounds = L.geoJSON(toFeature(geometry) as any).getBounds();
      if (!bounds.isValid()) return undefined;
      const west = bounds.getWest();
      const south = bounds.getSouth();
      const east = bounds.getEast();
      const north = bounds.getNorth();
      return {
        type: 'Polygon',
        coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]],
      };
    } catch {
      return undefined;
    }
  }, []);

  const getSafeRequestPolygon = useCallback(
    (notifyOnFallback = false): Geometry | undefined => {
      const geometry = featureGeometry(activeAoi as ReservoirFeature | null);
      if (!geometry) return undefined;

      // Protect requests against very large AOI payloads.
      const serializedLength = JSON.stringify(geometry).length;
      const maxPayloadChars = 900_000;
      if (serializedLength <= maxPayloadChars) return geometry;

      const bboxPolygon = geometryToBoundsPolygon(geometry);
      if (bboxPolygon) {
        if (notifyOnFallback && !largeGeometryWarnedRef.current) {
          largeGeometryWarnedRef.current = true;
          setMessage('AOI muito detalhada: usando envelope da geometria para melhorar desempenho da busca.');
        }
        return bboxPolygon;
      }

      return geometry;
    },
    [activeAoi, geometryToBoundsPolygon]
  );

  const inferSatelliteFromImageId = useCallback(
    (imageId?: string | null): string => {
      const id = String(imageId || '').toUpperCase();
      if (!id) return satellite;
      if (id.includes('LANDSAT/LC09') || id.includes('/LC09_')) return 'LANDSAT_9';
      if (id.includes('LANDSAT/LC08') || id.includes('/LC08_')) return 'LANDSAT_8';
      if (id.includes('LANDSAT')) return 'LANDSAT_9';
      if (id.includes('COPERNICUS/S2') || id.includes('S2_SR') || id.includes('SENTINEL')) return 'SENTINEL_2A';
      if (id.includes('CB4A-WFI') || id.includes('CBERS_4A_WFI')) return 'CBERS_4A_WFI';
      if (id.includes('CB4A-MUX') || id.includes('CBERS_4A_MUX')) return 'CBERS_4A_MUX';
      if (id.includes('CBERS')) return 'CBERS_4A_WFI';
      return satellite;
    },
    [satellite]
  );

  const selectedReservoir = useMemo(
    () => reservoirs.find((item) => item.properties?.id === selectedReservoirId) || null,
    [reservoirs, selectedReservoirId]
  );

  const primaryImageId = selectedImageIds[0] || null;

  const timeSeriesChartData = useMemo(() => {
    if (!timeSeriesResult || !timeSeriesResult.series.length) return null;
    return {
      labels: timeSeriesResult.series.map((item) => item.date),
      datasets: [
        {
          label: `${timeSeriesResult.indicator_name} (${timeSeriesResult.metric})`,
          data: timeSeriesResult.series.map((item) => item.value),
          borderColor: '#1f78b4',
          backgroundColor: 'rgba(31, 120, 180, 0.2)',
          tension: 0.2,
        },
      ],
    };
  }, [timeSeriesResult]);

  const areaEntries = useMemo(
    () =>
      areas.features.map((feature, index) => ({
        key: areaFeatureKey(feature as Feature, index),
        feature: feature as Feature,
      })),
    [areas]
  );

  useEffect(() => {
    setVisibleAreaByKey((prev) => {
      const next: Record<string, boolean> = {};
      areaEntries.forEach((entry) => {
        next[entry.key] = prev[entry.key] ?? true;
      });
      return next;
    });
  }, [areaEntries]);

  const visibleMonitoringAreas = useMemo<FeatureCollection>(
    () => ({
      type: 'FeatureCollection',
      features: areaEntries
        .filter((entry) => visibleAreaByKey[entry.key] !== false)
        .filter((entry) => String(entry.feature.properties?.tipo_area || '').toLowerCase() !== 'monitoring_aoi')
        .map((entry) => entry.feature),
    }),
    [areaEntries, visibleAreaByKey]
  );

  const isMonitoringAoiVisible = useMemo(() => {
    const monitoringEntry = areaEntries.find(
      (entry) => String(entry.feature.properties?.tipo_area || '').toLowerCase() === 'monitoring_aoi'
    );
    if (!monitoringEntry) return true;
    return visibleAreaByKey[monitoringEntry.key] !== false;
  }, [areaEntries, visibleAreaByKey]);

  const setReservoirFocus = useCallback((feature: ReservoirFeature) => {
    const bounds = L.geoJSON(feature as any).getBounds();
    setMapViewTarget(bounds);
    setActiveAoi(toFeature(feature.geometry, { source: 'reservoir' }));
    setRefreshTrigger((prev) => prev + 1);
  }, []);

  const loadReservoirs = useCallback(async () => {
    const data = await listReservoirs();
    setReservoirs((data.features || []) as ReservoirFeature[]);
    return data.features as ReservoirFeature[];
  }, []);

  const loadReservoirOperationalData = useCallback(async (reservoirId: number) => {
    const [contextData, areasData, alertsData, historyData] = await Promise.all([
      getReservoirContext(reservoirId),
      listMonitoringAreas(reservoirId),
      listReservoirAlerts(reservoirId),
      listReservoirHistory(reservoirId),
    ]);
    setContext(contextData);
    setAreas(areasData);
    setAlerts(alertsData.items || []);
    setHistory(historyData.items || []);
    if (contextData.geom_monitoramento) {
      setActiveAoi(toFeature(contextData.geom_monitoramento, { source: 'context' }));
      setRefreshTrigger((prev) => prev + 1);
    }
  }, []);

  const refreshDashboard = useCallback(async () => {
    const data = await getReservoirDashboard();
    setDashboard(data);
  }, []);

  useEffect(() => {
    const bootstrap = async () => {
      try {
        setLoadingAction('Carregando modulo...');
        const loaded = await loadReservoirs();
        if (loaded.length > 0 && loaded[0].properties?.id) {
          const firstId = loaded[0].properties.id;
          setSelectedReservoirId(firstId);
          setReservoirFocus(loaded[0] as ReservoirFeature);
          await loadReservoirOperationalData(firstId);
        }
        await refreshDashboard();
      } catch (err: any) {
        setMessage(err.message || 'Falha ao carregar painel de reservatorios.');
      } finally {
        setLoadingAction(null);
      }
    };
    void bootstrap();
  }, [loadReservoirOperationalData, loadReservoirs, refreshDashboard, setReservoirFocus]);

  const handleSelectReservoir = useCallback(
    async (reservoirId: number) => {
      const feature = reservoirs.find((item) => item.properties?.id === reservoirId);
      setSelectedReservoirId(reservoirId);
      setImages([]);
      setSelectedImageIds([]);
      setIndexResult(null);
      setWaterbodyResult(null);
      setTimeSeriesResult(null);
      setLandUseResult(null);
      setChangeResult(null);
      setRiparianResult(null);
      setTurbidityResult(null);
      setInsightText('');
      setVisibleLayerUrl(null);
      setPreviewLayerUrl(null);
      setPreviewOverlay(null);
      setDifferenceLayerUrl(null);
      setChangeGeoJson(null);
      setLandUseTileUrl(null);
      previewTileCacheRef.current = {};
      if (feature) setReservoirFocus(feature);
      try {
        setLoadingAction('Carregando contexto do reservatorio...');
        await loadReservoirOperationalData(reservoirId);
      } catch (err: any) {
        setMessage(err.message || 'Nao foi possivel carregar os dados do reservatorio.');
      } finally {
        setLoadingAction(null);
      }
    },
    [loadReservoirOperationalData, reservoirs, setReservoirFocus]
  );

  const parseKmlOrKmz = useCallback(async (file: File): Promise<Geometry> => {
    let kmlText = '';
    if (file.name.toLowerCase().endsWith('.kmz')) {
      const zip = await JSZip.loadAsync(file);
      const kmlEntry = zip.file(/\.kml$/i)?.[0];
      if (!kmlEntry) throw new Error('Arquivo KMZ sem KML interno.');
      kmlText = await kmlEntry.async('string');
    } else {
      kmlText = await file.text();
    }
    const dom = new DOMParser().parseFromString(kmlText, 'text/xml');
    const geojson = togeojson.kml(dom) as FeatureCollection;
    const polygonFeature = geojson.features.find(
      (item) => item.geometry?.type === 'Polygon' || item.geometry?.type === 'MultiPolygon'
    );
    if (!polygonFeature || !polygonFeature.geometry) {
      throw new Error('Nenhum poligono valido foi encontrado no arquivo.');
    }
    return polygonFeature.geometry;
  }, []);

  const handleImportGeometry = useCallback(async (file: File | null) => {
    if (!file) return;
    try {
      const geometry = await parseKmlOrKmz(file);
      if (selectedReservoirId) {
        setActiveAoi(toFeature(geometry, { source: 'import' }));
        setRefreshTrigger((prev) => prev + 1);
        setMessage('Geometria importada para AOI atual.');
      } else {
        setDraftReservoirGeometry(geometry);
        setMessage('Geometria importada para cadastro de novo reservatorio.');
      }
    } catch (err: any) {
      setMessage(err.message || 'Falha ao importar geometria.');
    }
  }, [parseKmlOrKmz, selectedReservoirId]);

  const handleMapDrawComplete = useCallback(async (feature: Feature) => {
    setDrawMode('none');
    if (!feature.geometry) return;
    try {
      if (drawMode === 'new_reservoir') {
        setDraftReservoirGeometry(feature.geometry);
        setMessage('Geometria do novo reservatorio desenhada.');
        return;
      }
      if (!selectedReservoirId) return;
      const areaType = drawMode === 'app' ? 'app' : drawMode === 'surroundings' ? 'surroundings' : 'monitoring_aoi';
      const areaName = drawMode === 'app' ? 'APP' : drawMode === 'surroundings' ? 'Entorno' : 'Area de Monitoramento';
      await createMonitoringArea(selectedReservoirId, {
        nome_area: areaName,
        tipo_area: areaType,
        geometry: feature.geometry,
      });
      if (drawMode === 'monitoring_aoi') {
        setActiveAoi(toFeature(feature.geometry, { source: 'draw' }));
        await updateReservoirContext(selectedReservoirId, { geom_monitoramento: feature.geometry as any });
      }
      if (drawMode === 'app') {
        await updateReservoirContext(selectedReservoirId, { geom_app: feature.geometry as any });
      }
      if (drawMode === 'surroundings') {
        await updateReservoirContext(selectedReservoirId, { geom_entorno: feature.geometry as any });
      }
      setAreas(await listMonitoringAreas(selectedReservoirId));
    } catch (err: any) {
      setMessage(err.message || 'Falha ao salvar area.');
    }
  }, [drawMode, selectedReservoirId]);

  const refreshOperationalLists = useCallback(async () => {
    if (!selectedReservoirId) return;
    const [alertsData, historyData] = await Promise.all([
      listReservoirAlerts(selectedReservoirId),
      listReservoirHistory(selectedReservoirId),
    ]);
    setAlerts(alertsData.items || []);
    setHistory(historyData.items || []);
    await refreshDashboard();
  }, [refreshDashboard, selectedReservoirId]);

  const handleCreateReservoir = useCallback(async () => {
    if (!draftReservoirGeometry || !reservoirNameDraft.trim()) {
      setMessage('Informe nome e geometria do reservatorio.');
      return;
    }
    try {
      setLoadingAction('Salvando reservatorio...');
      const created = await createReservoir({
        name: reservoirNameDraft.trim(),
        description: reservoirDescriptionDraft.trim() || undefined,
        geometry: draftReservoirGeometry,
      });
      const loaded = await loadReservoirs();
      setReservoirNameDraft('');
      setReservoirDescriptionDraft('');
      setDraftReservoirGeometry(null);
      const createdFeature = loaded.find((item) => item.properties?.id === created.id);
      if (createdFeature?.properties?.id) {
        await handleSelectReservoir(createdFeature.properties.id);
      }
      await refreshDashboard();
      setMessage('Reservatorio cadastrado.');
    } catch (err: any) {
      setMessage(err.message || 'Falha ao cadastrar reservatorio.');
    } finally {
      setLoadingAction(null);
    }
  }, [draftReservoirGeometry, handleSelectReservoir, loadReservoirs, refreshDashboard, reservoirDescriptionDraft, reservoirNameDraft]);

  const handleDeleteSelectedReservoir = useCallback(async () => {
    if (!selectedReservoirId) return;
    if (!window.confirm('Excluir reservatorio selecionado?')) return;
    try {
      setLoadingAction('Excluindo reservatorio...');
      await deleteReservoir(selectedReservoirId);
      const loaded = await loadReservoirs();
      if (loaded[0]?.properties?.id) {
        await handleSelectReservoir(loaded[0].properties.id);
      } else {
        setSelectedReservoirId(null);
        setContext(null);
        setAreas({ type: 'FeatureCollection', features: [] });
        setAlerts([]);
        setHistory([]);
        setActiveAoi(null);
        setVisibleLayerUrl(null);
        setPreviewLayerUrl(null);
        setPreviewOverlay(null);
        setDifferenceLayerUrl(null);
        setLandUseTileUrl(null);
        previewTileCacheRef.current = {};
      }
      await refreshDashboard();
    } catch (err: any) {
      setMessage(err.message || 'Falha ao excluir reservatorio.');
    } finally {
      setLoadingAction(null);
    }
  }, [handleSelectReservoir, loadReservoirs, refreshDashboard, selectedReservoirId]);

  const toggleImageSelection = useCallback((imageId: string) => {
    setSelectedImageIds((prev) => (prev.includes(imageId) ? prev.filter((item) => item !== imageId) : [...prev, imageId]));
  }, []);

  const toggleIndexSelection = useCallback((indexName: string) => {
    setSelectedIndices((prev) => (prev.includes(indexName) ? prev.filter((item) => item !== indexName) : [...prev, indexName]));
  }, []);

  const toggleAreaVisibility = useCallback((key: string) => {
    setVisibleAreaByKey((prev) => ({ ...prev, [key]: !(prev[key] ?? true) }));
  }, []);

  const fetchPreviewLayer = useCallback(
    async (imageId: string, silent = false): Promise<PreviewLayerData> => {
      const aoiGeometry = getSafeRequestPolygon(true);
      if (!aoiGeometry) {
        throw new Error('Defina uma AOI valida antes de visualizar a imagem.');
      }
      const cached = previewTileCacheRef.current[imageId];
      if (cached) {
        return cached;
      }
      if (!silent) {
        setLoadingAction('Carregando pre-visualizacao...');
      }
      try {
        const data = await previewReservoirImage({
          imageId,
          satellite: inferSatelliteFromImageId(imageId),
          polygon: aoiGeometry,
        });
        if (data.imageOverlayUrl && Array.isArray(data.imageOverlayBounds) && data.imageOverlayBounds.length === 2) {
          const entry: PreviewLayerData = {
            mode: 'overlay',
            url: data.imageOverlayUrl,
            bounds: data.imageOverlayBounds,
          };
          previewTileCacheRef.current[imageId] = entry;
          return entry;
        }
        if (!data.tileUrl) {
          throw new Error('Nao foi possivel montar a camada de pre-visualizacao da imagem.');
        }
        const entry: PreviewLayerData = { mode: 'tile', url: data.tileUrl };
        previewTileCacheRef.current[imageId] = entry;
        return entry;
      } finally {
        if (!silent) {
          setLoadingAction(null);
        }
      }
    },
    [getSafeRequestPolygon, inferSatelliteFromImageId]
  );

  const showPreviewImage = useCallback(
    async (imageId: string, silent = false) => {
      try {
        const preview = await fetchPreviewLayer(imageId, silent);
        setVisibleLayerUrl(null);
        setDifferenceLayerUrl(null);
        setLandUseTileUrl(null);
        if (preview.mode === 'overlay') {
          setPreviewLayerUrl(null);
          setPreviewOverlay({ url: preview.url, bounds: preview.bounds });
        } else {
          setPreviewOverlay(null);
          setPreviewLayerUrl(preview.url);
        }
      } catch (err: any) {
        if (!silent) {
          setMessage(err.message || 'Falha ao carregar pre-visualizacao da imagem.');
        }
      }
    },
    [fetchPreviewLayer]
  );

  const handleSearchImages = useCallback(async () => {
    if (!selectedReservoirId) return;
    try {
      setLoadingAction('Buscando imagens...');
      const searchPolygon = getSafeRequestPolygon(true);
      let result = await searchReservoirImages(selectedReservoirId, {
        dateFrom,
        dateTo,
        cloudPct,
        satellite,
        polygon: searchPolygon,
        maxResults: 24,
      });

      if (!result.length) {
        const fallbackSatellites = satellite.startsWith('SENTINEL')
          ? ['LANDSAT_9', 'LANDSAT_8']
          : satellite.startsWith('LANDSAT')
            ? ['SENTINEL_2A', 'SENTINEL_2B']
            : ['SENTINEL_2A', 'LANDSAT_9'];

        for (const fallbackSatellite of fallbackSatellites) {
          const fallbackResult = await searchReservoirImages(selectedReservoirId, {
            dateFrom,
            dateTo,
            cloudPct: Math.max(cloudPct, 50),
            satellite: fallbackSatellite,
            polygon: searchPolygon,
            maxResults: 24,
          });
          if (fallbackResult.length) {
            result = fallbackResult;
            setMessage(`Sem cenas para ${satellite}. Exibindo resultados de ${fallbackSatellite}.`);
            break;
          }
        }
      }

      setImages(result);
      previewTileCacheRef.current = {};
      setPreviewLayerUrl(null);
      setPreviewOverlay(null);
      const firstImageId = result[0]?.id;
      setSelectedImageIds(firstImageId ? [firstImageId] : []);
      if (!firstImageId) {
        setMessage('Nenhuma imagem encontrada para os filtros selecionados.');
      }
      await refreshOperationalLists();
    } catch (err: any) {
      setMessage(err.message || 'Falha na busca de imagens.');
    } finally {
      setLoadingAction(null);
    }
  }, [cloudPct, dateFrom, dateTo, getSafeRequestPolygon, refreshOperationalLists, satellite, selectedReservoirId]);

  useEffect(() => {
    if (!selectedImageIds.length) {
      setPreviewLayerUrl(null);
      setPreviewOverlay(null);
      return;
    }
    let cancelled = false;
    const imageId = selectedImageIds[0];
    const run = async () => {
      const preview = await fetchPreviewLayer(imageId, true);
      if (cancelled) return;
      setVisibleLayerUrl(null);
      setDifferenceLayerUrl(null);
      setLandUseTileUrl(null);
      if (preview.mode === 'overlay') {
        setPreviewLayerUrl(null);
        setPreviewOverlay({ url: preview.url, bounds: preview.bounds });
      } else {
        setPreviewOverlay(null);
        setPreviewLayerUrl(preview.url);
      }
    };
    void run().catch((err: any) => {
      if (!cancelled) {
        setMessage(err.message || 'Falha ao montar pre-visualizacao da imagem selecionada.');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [fetchPreviewLayer, selectedImageIds]);

  const handleRunIndices = useCallback(async () => {
    if (!selectedReservoirId) return;
    if (!primaryImageId) {
      setMessage('Selecione ao menos uma imagem para executar o calculo de indices.');
      return;
    }
    try {
      setLoadingAction('Calculando indices...');
      const result = await runReservoirIndices(selectedReservoirId, {
        imageId: primaryImageId,
        satellite: inferSatelliteFromImageId(primaryImageId),
        indices: selectedIndices,
        polygon: getSafeRequestPolygon(true),
      });
      setIndexResult(result);
      setVisibleLayerUrl(result.results[0]?.imageUrl || null);
      setPreviewLayerUrl(null);
      setPreviewOverlay(null);
      setDifferenceLayerUrl(null);
      setChangeGeoJson(null);
      await refreshOperationalLists();
    } catch (err: any) {
      setMessage(err.message || 'Falha ao calcular indices.');
    } finally {
      setLoadingAction(null);
    }
  }, [getSafeRequestPolygon, inferSatelliteFromImageId, primaryImageId, refreshOperationalLists, selectedIndices, selectedReservoirId]);

  const handleExtractWaterbody = useCallback(async () => {
    if (!selectedReservoirId) return;
    if (!primaryImageId) {
      setMessage('Selecione uma imagem para extrair o espelho dagua.');
      return;
    }
    try {
      setLoadingAction('Extraindo espelho dagua...');
      const result = await extractWaterbody(selectedReservoirId, {
        imageId: primaryImageId,
        satellite: inferSatelliteFromImageId(primaryImageId),
        index_name: 'MNDWI',
        threshold: 0.05,
        variation_alert_pct: 15,
        polygon: getSafeRequestPolygon(true),
      });
      setWaterbodyResult(result);
      setVisibleLayerUrl(result.tile_url);
      setPreviewLayerUrl(null);
      setPreviewOverlay(null);
      setDifferenceLayerUrl(null);
      await refreshOperationalLists();
    } catch (err: any) {
      setMessage(err.message || 'Falha na extracao do espelho dagua.');
    } finally {
      setLoadingAction(null);
    }
  }, [getSafeRequestPolygon, inferSatelliteFromImageId, primaryImageId, refreshOperationalLists, selectedReservoirId]);

  const handleRunTimeSeries = useCallback(async () => {
    if (!selectedReservoirId) return;
    try {
      setLoadingAction('Gerando serie temporal...');
      const result = await runReservoirTimeSeries(selectedReservoirId, {
        date_start: dateFrom,
        date_end: dateTo,
        satellite,
        indicator_name: timeSeriesIndicator,
        metric: timeSeriesMetric,
        threshold: timeSeriesMetric === 'water_area' ? 0.05 : undefined,
        max_points: 18,
        polygon: getSafeRequestPolygon(true),
      });
      setTimeSeriesResult(result);
      await refreshOperationalLists();
    } catch (err: any) {
      setMessage(err.message || 'Falha na serie temporal.');
    } finally {
      setLoadingAction(null);
    }
  }, [dateFrom, dateTo, getSafeRequestPolygon, refreshOperationalLists, satellite, selectedReservoirId, timeSeriesIndicator, timeSeriesMetric]);

  const handleRunLandUse = useCallback(async () => {
    if (!selectedReservoirId) return;
    if (!primaryImageId) {
      setMessage('Selecione uma imagem para classificar uso do solo.');
      return;
    }
    try {
      setLoadingAction('Classificando uso do solo...');
      const result = await classifyReservoirLandUse(selectedReservoirId, {
        imageId: primaryImageId,
        satellite: inferSatelliteFromImageId(primaryImageId),
        soil_exposed_alert_pct: 12,
        anthropic_alert_pct: 8,
        polygon: getSafeRequestPolygon(true),
      });
      setLandUseResult(result);
      setLandUseTileUrl(result.tile_url);
      setPreviewLayerUrl(null);
      setPreviewOverlay(null);
      await refreshOperationalLists();
    } catch (err: any) {
      setMessage(err.message || 'Falha na classificacao de uso do solo.');
    } finally {
      setLoadingAction(null);
    }
  }, [getSafeRequestPolygon, inferSatelliteFromImageId, primaryImageId, refreshOperationalLists, selectedReservoirId]);

  const handleRunChangeDetection = useCallback(async () => {
    if (!selectedReservoirId) return;
    if (selectedImageIds.length !== 2) {
      setMessage('Selecione exatamente duas imagens para detectar mudancas.');
      return;
    }
    try {
      setLoadingAction('Executando deteccao de mudancas...');
      const result = await detectReservoirChange(selectedReservoirId, {
        beforeImageId: selectedImageIds[0],
        afterImageId: selectedImageIds[1],
        satellite: inferSatelliteFromImageId(selectedImageIds[0]),
        threshold: 0.25,
        loss_alert_ha: 6,
        polygon: getSafeRequestPolygon(true),
      });
      setChangeResult({
        gainAreaHa: result.gainAreaHa,
        lossAreaHa: result.lossAreaHa,
        totalAreaHa: result.totalAreaHa,
        differenceImageUrl: result.differenceImageUrl,
        changeGeoJson: result.changeGeoJson,
      });
      setPreviewLayerUrl(null);
      setPreviewOverlay(null);
      setDifferenceLayerUrl(result.differenceImageUrl || null);
      setChangeGeoJson(result.changeGeoJson || null);
      await refreshOperationalLists();
    } catch (err: any) {
      setMessage(err.message || 'Falha na deteccao de mudancas.');
    } finally {
      setLoadingAction(null);
    }
  }, [getSafeRequestPolygon, inferSatelliteFromImageId, refreshOperationalLists, selectedImageIds, selectedReservoirId]);

  const handleRunRiparian = useCallback(async () => {
    if (!selectedReservoirId) return;
    if (!primaryImageId) {
      setMessage('Selecione uma imagem para monitorar vegetacao ciliar.');
      return;
    }
    try {
      setLoadingAction('Monitorando vegetacao ciliar...');
      const result = await runRiparianMonitoring(selectedReservoirId, {
        imageId: primaryImageId,
        satellite: inferSatelliteFromImageId(primaryImageId),
        ndvi_drop_alert_pct: 15,
      });
      setRiparianResult({
        ndvi_mean: result.ndvi_mean,
        previous_ndvi_mean: result.previous_ndvi_mean,
        variacao_pct: result.variacao_pct,
      });
      await refreshOperationalLists();
    } catch (err: any) {
      setMessage(err.message || 'Falha no monitoramento da APP.');
    } finally {
      setLoadingAction(null);
    }
  }, [inferSatelliteFromImageId, primaryImageId, refreshOperationalLists, selectedReservoirId]);

  const handleRunTurbidity = useCallback(async () => {
    if (!selectedReservoirId) return;
    if (!primaryImageId) {
      setMessage('Selecione uma imagem para calcular o proxy de turbidez.');
      return;
    }
    try {
      setLoadingAction('Calculando proxy de turbidez...');
      const result = await runTurbidityProxy(selectedReservoirId, {
        imageId: primaryImageId,
        satellite: inferSatelliteFromImageId(primaryImageId),
        threshold: 0.12,
        polygon: getSafeRequestPolygon(true),
      });
      setTurbidityResult({
        min: result.stats.min ?? null,
        max: result.stats.max ?? null,
        mean: result.stats.mean ?? null,
      });
      await refreshOperationalLists();
    } catch (err: any) {
      setMessage(err.message || 'Falha no calculo de turbidez.');
    } finally {
      setLoadingAction(null);
    }
  }, [getSafeRequestPolygon, inferSatelliteFromImageId, primaryImageId, refreshOperationalLists, selectedReservoirId]);

  const handleGenerateInsight = useCallback(async () => {
    if (!selectedReservoirId) return;
    try {
      setLoadingAction('Gerando insight tecnico...');
      const response = await generateReservoirInsight(selectedReservoirId, {
        periodo_inicio: dateFrom,
        periodo_fim: dateTo,
        limite_analises: 8,
      });
      setInsightText(response.texto || '');
      await refreshOperationalLists();
    } catch (err: any) {
      setMessage(err.message || 'Falha ao gerar insight.');
    } finally {
      setLoadingAction(null);
    }
  }, [dateFrom, dateTo, refreshOperationalLists, selectedReservoirId]);

  const handleResolveAlert = useCallback(async (alertId: number) => {
    if (!selectedReservoirId) return;
    try {
      await updateAlertStatus(alertId, 'resolved');
      const updated = await listReservoirAlerts(selectedReservoirId);
      setAlerts(updated.items || []);
      await refreshDashboard();
    } catch (err: any) {
      setMessage(err.message || 'Falha ao atualizar alerta.');
    }
  }, [refreshDashboard, selectedReservoirId]);

  const handleDeleteArea = useCallback(async (areaId: number) => {
    if (!selectedReservoirId) return;
    try {
      await deleteMonitoringArea(selectedReservoirId, areaId);
      setAreas(await listMonitoringAreas(selectedReservoirId));
    } catch (err: any) {
      setMessage(err.message || 'Falha ao remover area.');
    }
  }, [selectedReservoirId]);

  const handleExportIndicators = useCallback(() => {
    if (!selectedReservoirId) return;
    window.open(getReservoirReportCsvUrl(selectedReservoirId, dateFrom, dateTo), '_blank', 'noopener,noreferrer');
  }, [dateFrom, dateTo, selectedReservoirId]);

  return (
    <div className="reservoir-monitoring-layout">
      <aside className="reservoir-monitoring-sidebar">
        <header>
          <h2>Monitoramento Ambiental de Reservatorios</h2>
          <p>Fluxo: selecao, periodo, analise, resultado, IA e alertas.</p>
        </header>

        <section className="panel-section">
          <h3>1. Reservatorio</h3>
          <label>
            Reservatorio:
            <select value={selectedReservoirId ?? ''} onChange={(e) => { const value = Number(e.target.value); if (value) void handleSelectReservoir(value); }}>
              <option value="">Selecione</option>
              {reservoirs.map((item) => (
                <option key={item.properties?.id} value={item.properties?.id}>{item.properties?.name}</option>
              ))}
            </select>
          </label>
          <div className="button-row">
            <button type="button" className="button button-secondary" onClick={() => setDrawMode('new_reservoir')}>Desenhar Novo</button>
            <button type="button" className="button button-secondary" onClick={() => importInputRef.current?.click()}>Importar KML/KMZ</button>
            <input ref={importInputRef} type="file" accept=".kml,.kmz" style={{ display: 'none' }} onChange={(e) => void handleImportGeometry(e.target.files?.[0] || null)} />
          </div>
          <label>
            Nome novo reservatorio:
            <input type="text" value={reservoirNameDraft} onChange={(e) => setReservoirNameDraft(e.target.value)} />
          </label>
          <label>
            Descricao:
            <textarea rows={2} value={reservoirDescriptionDraft} onChange={(e) => setReservoirDescriptionDraft(e.target.value)} />
          </label>
          <div className="button-row">
            <button type="button" className="button button-primary" onClick={() => void handleCreateReservoir()}>Salvar</button>
            <button type="button" className="button button-danger" onClick={() => void handleDeleteSelectedReservoir()} disabled={!selectedReservoirId}>Excluir</button>
          </div>
        </section>

        <section className="panel-section">
          <h3>2. Areas e Imagens</h3>
          <div className="button-row">
            <button type="button" className="button button-secondary" onClick={() => setDrawMode('monitoring_aoi')} disabled={!selectedReservoirId}>Desenhar AOI</button>
            <button type="button" className="button button-secondary" onClick={() => setDrawMode('app')} disabled={!selectedReservoirId}>Desenhar APP</button>
            <button type="button" className="button button-secondary" onClick={() => setDrawMode('surroundings')} disabled={!selectedReservoirId}>Desenhar Entorno</button>
          </div>
          <ul className="compact-list">
            {areaEntries.map(({ key, feature }) => (
              <li key={key} className="area-layer-item">
                <label className="area-layer-toggle">
                  <input
                    type="checkbox"
                    checked={visibleAreaByKey[key] ?? true}
                    onChange={() => toggleAreaVisibility(key)}
                  />
                  <span>{String(feature.properties?.nome_area || 'Area')} - {String(feature.properties?.tipo_area || '')}</span>
                </label>
                <button type="button" className="link-btn" onClick={() => void handleDeleteArea(Number(feature.properties?.id))}>remover</button>
              </li>
            ))}
            {areas.features.length === 0 && <li>Nenhuma area cadastrada.</li>}
          </ul>
          <label>Data inicial:<input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></label>
          <label>Data final:<input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></label>
          <label>% nuvens:<input type="number" min={0} max={100} value={cloudPct} onChange={(e) => setCloudPct(Number(e.target.value))} /></label>
          <label>
            Satelite:
            <select value={satellite} onChange={(e) => setSatellite(e.target.value)}>
              {SATELLITES.map((sat) => <option key={sat} value={sat}>{sat}</option>)}
            </select>
          </label>
          <button type="button" className="button button-primary" onClick={() => void handleSearchImages()} disabled={!selectedReservoirId}>Buscar Imagens</button>
          <ul className="image-list">
            {images.map((img) => (
              <li key={img.id}>
                <div className="image-list-item">
                  <label>
                    <input type="checkbox" checked={selectedImageIds.includes(img.id)} onChange={() => toggleImageSelection(img.id)} />
                    <span>{img.date}</span>
                  </label>
                  <button type="button" className="link-btn" onClick={() => void showPreviewImage(img.id)}>
                    visualizar
                  </button>
                </div>
                {img.thumbnailUrl && (
                  <img
                    className="image-thumb"
                    src={img.thumbnailUrl}
                    alt={`Thumbnail da imagem ${img.date}`}
                    loading="lazy"
                  />
                )}
              </li>
            ))}
            {images.length === 0 && <li>Nenhuma imagem carregada.</li>}
          </ul>
        </section>

        <section className="panel-section">
          <h3>3. Analises</h3>
          <div className="index-grid">
            {INDEX_OPTIONS.map((idx) => (
              <label key={idx}><input type="checkbox" checked={selectedIndices.includes(idx)} onChange={() => toggleIndexSelection(idx)} />{idx}</label>
            ))}
          </div>
          <div className="button-row">
            <button type="button" className="button button-primary" onClick={() => void handleRunIndices()}>Indices</button>
            <button type="button" className="button button-primary" onClick={() => void handleExtractWaterbody()}>Espelho dAgua</button>
            <button type="button" className="button button-primary" onClick={() => void handleRunLandUse()}>Uso do Solo</button>
          </div>
          <div className="button-row">
            <button type="button" className="button button-primary" onClick={() => void handleRunChangeDetection()}>Mudancas</button>
            <button type="button" className="button button-primary" onClick={() => void handleRunRiparian()}>Vegetacao Ciliar</button>
            <button type="button" className="button button-primary" onClick={() => void handleRunTurbidity()}>Turbidez</button>
          </div>
          <label>
            Indicador serie:
            <select value={timeSeriesIndicator} onChange={(e) => setTimeSeriesIndicator(e.target.value)}>
              {INDEX_OPTIONS.map((idx) => <option key={idx} value={idx}>{idx}</option>)}
            </select>
          </label>
          <label>
            Metrica:
            <select value={timeSeriesMetric} onChange={(e) => setTimeSeriesMetric(e.target.value as 'index_mean' | 'water_area')}>
              <option value="index_mean">Media indice</option>
              <option value="water_area">Area agua</option>
            </select>
          </label>
          <button type="button" className="button button-primary" onClick={() => void handleRunTimeSeries()}>Serie Temporal</button>
          <div className="button-row">
            <button type="button" className="button button-primary" onClick={() => void handleGenerateInsight()}>Insight IA</button>
            <button type="button" className="button button-secondary" onClick={handleExportIndicators}>Exportar CSV</button>
          </div>
        </section>

        <section className="panel-section">
          <h3>Alertas</h3>
          <ul className="compact-list">
            {alerts.map((alert) => (
              <li key={alert.id}>
                <span>[{alert.severidade}] {alert.mensagem}</span>
                {alert.status === 'active' && <button type="button" className="link-btn" onClick={() => void handleResolveAlert(alert.id)}>resolver</button>}
              </li>
            ))}
            {alerts.length === 0 && <li>Sem alertas ativos.</li>}
          </ul>
          <p className="insight-box">{insightText || 'Sem insight gerado para o periodo atual.'}</p>
        </section>
      </aside>

      <main className="reservoir-monitoring-main">
        <div className="top-cards">
          <article><h4>Reservatorios monitorados</h4><strong>{dashboard?.total_reservatorios_monitorados ?? 0}</strong></article>
          <article><h4>Alertas ativos</h4><strong>{dashboard?.alertas_ativos ?? 0}</strong></article>
          <article><h4>Variacao media da agua (%)</h4><strong>{dashboard?.variacao_media_area_alagada_pct?.toFixed(2) ?? '0.00'}</strong></article>
          <article>
            <h4>Selecionado</h4>
            <strong>{selectedReservoir?.properties?.name || '-'}</strong>
            <div>{context?.status_monitoramento || 'sem contexto'}</div>
          </article>
        </div>

        <div className="map-wrapper">
          <MapView
            onDrawComplete={handleMapDrawComplete}
            visibleLayerUrl={visibleLayerUrl}
            previewLayerUrl={previewLayerUrl}
            previewOverlay={previewOverlay}
            changePolygons={changeGeoJson as unknown as Feature | null}
            activeAoi={isMonitoringAoiVisible ? activeAoi : null}
            monitoringAreas={visibleMonitoringAreas}
            baseMapKey={baseMapKey}
            onBaseMapChange={setBaseMapKey}
            mapViewTarget={mapViewTarget}
            differenceLayerUrl={differenceLayerUrl}
            indexLayerZIndex={30}
            differenceLayerZIndex={29}
            previewLayerZIndex={31}
            drawingEnabled={drawMode !== 'none'}
            onPropertySelect={(_id: string) => {}}
            refreshTrigger={refreshTrigger}
            landCoverLayerUrl={landUseTileUrl}
            landCoverLayerVisible={Boolean(landUseTileUrl)}
            onAoiDeleted={() => setActiveAoi(null)}
          />
          {loadingAction && <div className="map-overlay-loading">{loadingAction}</div>}
        </div>

        <div className="results-grid">
          <section>
            <h3>Indicadores</h3>
            <div className="result-block">
              <h4>Indices</h4>
              {indexResult ? (
                <ul>{Object.entries(indexResult.stats_by_index).map(([name, stats]) => <li key={name}>{name}: min {stats.min?.toFixed(4) ?? '-'} | mean {stats.mean?.toFixed(4) ?? '-'} | max {stats.max?.toFixed(4) ?? '-'}</li>)}</ul>
              ) : <p>Nenhum indice calculado.</p>}
            </div>
            <div className="result-block">
              <h4>Espelho dagua</h4>
              {waterbodyResult ? <ul><li>Area: {waterbodyResult.area_ha.toFixed(2)} ha</li><li>Variacao: {waterbodyResult.variacao_percentual !== null ? `${waterbodyResult.variacao_percentual.toFixed(2)}%` : '-'}</li></ul> : <p>Sem resultado.</p>}
            </div>
            <div className="result-block">
              <h4>APP e turbidez</h4>
              <ul>
                <li>NDVI APP: {riparianResult?.ndvi_mean?.toFixed(4) ?? '-'}</li>
                <li>Variacao APP: {riparianResult?.variacao_pct !== undefined && riparianResult?.variacao_pct !== null ? `${riparianResult.variacao_pct.toFixed(2)}%` : '-'}</li>
                <li>Turbidez mean: {turbidityResult?.mean !== undefined && turbidityResult?.mean !== null ? turbidityResult.mean.toFixed(4) : '-'}</li>
              </ul>
            </div>
          </section>

          <section>
            <h3>Series e mudancas</h3>
            {timeSeriesChartData ? <div className="chart-block"><Line data={timeSeriesChartData} options={{ responsive: true, plugins: { legend: { display: true } } }} /></div> : <p>Nenhuma serie temporal gerada.</p>}
            {changeResult ? (
              <div className="chart-block">
                <ChangeDetectionChart gainArea={changeResult.gainAreaHa} lossArea={changeResult.lossAreaHa} totalArea={changeResult.totalAreaHa} />
              </div>
            ) : <p>Nenhuma deteccao de mudanca executada.</p>}
          </section>

          <section>
            <h3>Uso do solo e historico</h3>
            <div className="result-block">
              <h4>Classificacao uso do solo</h4>
              {landUseResult ? <ul>{landUseResult.class_stats.map((item) => <li key={item.class_id}>{item.class_name}: {item.area_ha.toFixed(2)} ha ({item.area_pct.toFixed(1)}%)</li>)}</ul> : <p>Classificacao nao executada.</p>}
            </div>
            <div className="result-block">
              <h4>Historico analitico</h4>
              <ul className="compact-list">
                {history.slice(0, 8).map((item) => <li key={String(item.id ?? Math.random())}>{String(item.tipo_analise || 'analise')} - {String(item.created_at || '')}</li>)}
                {history.length === 0 && <li>Nenhuma execucao registrada.</li>}
              </ul>
            </div>
          </section>
        </div>
      </main>

      {message && <div className="floating-message" onClick={() => setMessage(null)}>{message}</div>}
    </div>
  );
}
