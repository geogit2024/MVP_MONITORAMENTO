import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import L, { LatLngBoundsExpression } from 'leaflet';
import { Feature, FeatureCollection } from 'geojson';
import type { Property } from './components/SidebarCadastro';
import SidebarTerritorial from './components/Sidebar';
import SidebarClima from './components/SidebarClima';
import MapView from './components/MapView';
import ImageCarousel from './components/ImageCarousel';
import NdviResultPanel from './components/NdviResultPanel';
import SaviResultPanel from './components/SaviResultPanel';
import MsaviResultPanel from './components/MsaviResultPanel';
import NdreResultPanel from './components/NdreResultPanel';
import ChangeDetectionPanel from './components/ChangeDetectionPanel';
import AgronomistReportModal, { type AgronomistReportData } from './components/AgronomistReportModal';
import { MapStateProvider } from './context/MapStateContext';

import './App.css';
import togeojson from '@mapbox/togeojson';
import JSZip from 'jszip';


// --- DEFINIÇÃO DE TIPOS E INTERFACES ---
export interface ImageInfo { id: string; date: string; thumbnailUrl: string; }

export interface NdviAreas {
  area_agua: number;
  area_solo_exposto: number;
  area_vegetacao_rala: number;
  area_vegetacao_densa: number;
  pixel_area: number;
  scale: number;
  sensor: string;
}

export interface SaviAreas {
  area_agua_solo: number;
  area_vegetacao_esparsa: number;
  area_vegetacao_moderada: number;
  area_vegetacao_densa: number;
  sensor: string;
  scale: number;
}

export interface MsaviAreas {
  area_solo_exposto: number;
  area_vegetacao_rala: number;
  area_vegetacao_moderada: number;
  area_vegetacao_densa: number;
  sensor: string;
  scale: number;
}

export interface NdreAreas {
  area_nao_vegetada: number;
  area_vegetacao_estressada: number;
  area_vegetacao_moderada: number;
  area_vegetacao_densa: number;
  sensor: string;
  scale: number;
}

export interface IndexResult {
    indexName: string;
    imageUrl: string;
    downloadUrl: string;
    classification?: NdviAreas | SaviAreas | MsaviAreas | NdreAreas;
}

interface AgronomoHistoryItem {
  id: number;
  talhao: string;
  area_ha: number;
  indice: string;
  periodo: { inicio: string; fim: string };
  nivel_atencao: string;
  timestamp: string;
  resumo: string;
}

interface AgronomoComparisonResponse {
  atual: { id: number; nivel_atencao: string; timestamp: string; resumo: string };
  anterior: { id: number; nivel_atencao: string; timestamp: string; resumo: string } | null;
}

interface AgronomoPayload {
  talhao: string;
  area_ha: number;
  indice: string;
  periodo: { inicio: string; fim: string };
  valores_temporais: Array<{ data?: string; valor: number }>;
  estatisticas: {
    min: number;
    max: number;
    media: number;
    tendencia: string;
    variacao_percentual: number;
  };
  data_pico_vegetativo?: string | null;
  data_queda_brusca?: string | null;
}


interface NotificationProps { message: string; type: 'error' | 'success'; onDismiss: () => void; }
interface LoadingIndicatorProps { text: string; subtext: string; }

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const SATELLITES = ['LANDSAT_8', 'LANDSAT_9', 'SENTINEL_2A', 'SENTINEL_2B'];
const CHANGE_LAYER_ID = 'change-detection-result';
const CHANGE_LAYER_ICON_URI = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23ffffff' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolygon points='12 2 2 7 12 12 22 7 12 2'%3E%3C/polygon%3E%3Cpolyline points='2 17 12 22 22 17'%3E%3C/polyline%3E%3Cpolyline points='2 12 12 17 22 12'%3E%3C/polyline%3E%3C/svg%3E";
const INDEX_LAYER_ICON_URI = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23ffffff' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='3' width='18' height='18' rx='2' ry='2'%3E%3C/rect%3E%3Cline x1='3' y1='9' x2='21' y2='9'%3E%3C/line%3E%3Cline x1='9' y1='21' x2='9' y2='9'%3E%3C/line%3E%3C/svg%3E";

const Notification: React.FC<NotificationProps> = ({ message, type, onDismiss }) => {
    if (!message) return null;
    const baseStyle: React.CSSProperties = { position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)', padding: '12px 20px', borderRadius: '8px', color: 'white', zIndex: 9999, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', fontSize: '16px', cursor: 'pointer' };
    const styles = { error: { ...baseStyle, backgroundColor: '#dc3545' }, success: { ...baseStyle, backgroundColor: '#198754' } };
    return <div style={styles[type] || styles.error} onClick={onDismiss}>{message}</div>;
};

const LoadingIndicator: React.FC<LoadingIndicatorProps> = ({ text, subtext }) => (
    <div className="progress-overlay"><div className="progress-spinner"></div><p>{text}</p><span>{subtext}</span></div>
);

let html2canvasLoaderPromise: Promise<any> | null = null;

const loadHtml2Canvas = async (): Promise<any> => {
    const existing = (window as any).html2canvas;
    if (existing) return existing;

    if (!html2canvasLoaderPromise) {
        html2canvasLoaderPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
            script.async = true;
            script.onload = () => {
                const loaded = (window as any).html2canvas;
                if (loaded) resolve(loaded);
                else reject(new Error('html2canvas carregou, mas não ficou disponível em window.'));
            };
            script.onerror = () => reject(new Error('Falha ao carregar html2canvas via CDN.'));
            document.head.appendChild(script);
        });
    }

    return html2canvasLoaderPromise;
};

const buildHistogramSvgDataUri = (payload: AgronomoPayload | null): string | null => {
    if (!payload || !Array.isArray(payload.valores_temporais) || payload.valores_temporais.length === 0) return null;

    const width = 860;
    const height = 240;
    const paddingX = 52;
    const paddingTop = 24;
    const paddingBottom = 54;
    const chartW = width - paddingX * 2;
    const chartH = height - paddingTop - paddingBottom;
    const points = payload.valores_temporais.map((p, i) => ({
        label: String(p.data ?? `P${i + 1}`),
        value: Number(p.valor || 0),
    }));
    const maxVal = Math.max(...points.map((p) => p.value), 0.0001);
    const barGap = 10;
    const barW = Math.max(16, (chartW - barGap * (points.length - 1)) / points.length);

    const bars = points
        .map((p, i) => {
            const h = (p.value / maxVal) * chartH;
            const x = paddingX + i * (barW + barGap);
            const y = paddingTop + (chartH - h);
            const textY = y - 5;
            const labelY = height - 24;
            return `
<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="#2f6fdd" />
<text x="${(x + barW / 2).toFixed(1)}" y="${textY.toFixed(1)}" text-anchor="middle" font-size="10" fill="#344054">${p.value.toFixed(2)}</text>
<text x="${(x + barW / 2).toFixed(1)}" y="${labelY}" text-anchor="middle" font-size="10" fill="#475467">${p.label}</text>`;
        })
        .join('');

    const yTicks = [0, 0.25, 0.5, 0.75, 1]
        .map((r) => {
            const v = maxVal * r;
            const y = paddingTop + chartH - chartH * r;
            return `
<line x1="${paddingX}" y1="${y.toFixed(1)}" x2="${paddingX + chartW}" y2="${y.toFixed(1)}" stroke="#e5e7eb" stroke-width="1" />
<text x="${paddingX - 8}" y="${(y + 4).toFixed(1)}" text-anchor="end" font-size="10" fill="#667085">${v.toFixed(2)}</text>`;
        })
        .join('');

    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#ffffff"/>
  <text x="${paddingX}" y="14" font-size="12" font-weight="700" fill="#101828">Histograma de variacao do indice (${payload.indice})</text>
  ${yTicks}
  <line x1="${paddingX}" y1="${paddingTop + chartH}" x2="${paddingX + chartW}" y2="${paddingTop + chartH}" stroke="#98a2b3" stroke-width="1.2" />
  ${bars}
</svg>`.trim();

    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

export default function MainApplication() {
    const [activeModule, setActiveModule] = useState<'territorial' | 'clima'>('territorial');
    const [theme, setTheme] = useState<'light' | 'dark'>('dark');
    const [dateFrom, setDateFrom] = useState('2025-01-01');
    const [dateTo, setDateTo] = useState('2025-03-31');
    const [cloudPct, setCloudPct] = useState(30);
    const [satellite, setSatellite] = useState('');
    const [apiImages, setApiImages] = useState<ImageInfo[]>([]);
    const [carouselItems, setCarouselItems] = useState<ImageInfo[]>([]);
    const [loadingState, setLoadingState] = useState<'idle' | 'searching' | 'calculating' | 'detectingChange' | 'downloading' | 'loading_preview'>('idle');
    const [selectedImageIds, setSelectedImageIds] = useState<string[]>([]);
    const [timelineIndex, setTimelineIndex] = useState(0);
    const [timelinePlaying, setTimelinePlaying] = useState(false);
    const [timelineSpeedMs, setTimelineSpeedMs] = useState(1200);
    const [activeAoi, setActiveAoi] = useState<Feature | null>(null);
    const [calculatedIndices, setCalculatedIndices] = useState<IndexResult[]>([]);
    const [visibleLayerUrl, setVisibleLayerUrl] = useState<string | null>(null);
    const [previewLayerUrl, setPreviewLayerUrl] = useState<string | null>(null);
    const [changePolygons, setChangePolygons] = useState<Feature | null>(null);
    const [notification, setNotification] = useState<{ message: string, type: 'error' | 'success' } | null>(null);
    const [baseMapKey, setBaseMapKey] = useState<string>('google_hybrid');
    const [mapViewTarget, setMapViewTarget] = useState<LatLngBoundsExpression | null>(null);
    const [selectedIndices, setSelectedIndices] = useState<string[]>(['NDVI']);
    const [changeThreshold, setChangeThreshold] = useState(0.25);
    const [differenceLayerUrl, setDifferenceLayerUrl] = useState<string | null>(null);
    const [isChangeLayerVisible, setIsChangeLayerVisible] = useState(false);
    const [isCreatingProperty, setIsCreatingProperty] = useState(false);
    
    const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
    const [isReadOnly, setIsReadOnly] = useState(true);

    const [ndviAreas, setNdviAreas] = useState<NdviAreas | null>(null);
    const [saviResult, setSaviResult] = useState<SaviAreas | null>(null);
    const [msaviResult, setMsaviResult] = useState<MsaviAreas | null>(null);
    const [ndreResult, setNdreResult] = useState<NdreAreas | null>(null);
    const [refreshTrigger, setRefreshTrigger] = useState(Date.now());

    const [changeAreas, setChangeAreas] = useState<{ gain: number; loss: number; total: number } | null>(null);
    const [agronomoReport, setAgronomoReport] = useState<AgronomistReportData | null>(null);
    const [agronomoLoading, setAgronomoLoading] = useState(false);
    const [agronomoError, setAgronomoError] = useState<string | null>(null);
    const [agronomoHistory, setAgronomoHistory] = useState<AgronomoHistoryItem[]>([]);
    const [agronomoComparison, setAgronomoComparison] = useState<AgronomoComparisonResponse | null>(null);
    const [agronomoModalOpen, setAgronomoModalOpen] = useState(false);
    const [agronomoPayloadSnapshot, setAgronomoPayloadSnapshot] = useState<AgronomoPayload | null>(null);
    const previewTileCacheRef = useRef<Record<string, string>>({});

    useEffect(() => {
        const virtualIndexItems: ImageInfo[] = calculatedIndices.map(index => ({ id: `index-${index.indexName}`, date: index.indexName, thumbnailUrl: INDEX_LAYER_ICON_URI }));
        const virtualChangeItem: ImageInfo[] = changePolygons ? [{ id: CHANGE_LAYER_ID, date: 'Detecção de Mudança', thumbnailUrl: CHANGE_LAYER_ICON_URI }] : [];
        const items = [...virtualChangeItem, ...virtualIndexItems, ...apiImages];
        setCarouselItems(items);
    }, [apiImages, changePolygons, calculatedIndices]);
    const timelineImages = useMemo(() => {
        return apiImages
            .filter((img) => selectedImageIds.includes(img.id))
            .sort((a, b) => {
                const ta = new Date(a.date.split('/').reverse().join('-')).getTime();
                const tb = new Date(b.date.split('/').reverse().join('-')).getTime();
                return ta - tb;
            });
    }, [apiImages, selectedImageIds]);
    const selectableImageIds = useMemo(() => apiImages.map((img) => img.id), [apiImages]);
    const allSelectableSelected = useMemo(() => {
        if (selectableImageIds.length === 0) return false;
        return selectableImageIds.every((id) => selectedImageIds.includes(id));
    }, [selectableImageIds, selectedImageIds]);

    const showNotification = useCallback((message: string, type: 'error' | 'success') => { setNotification({ message, type }); }, []);
    
    const resetAnalysisLayers = useCallback(() => {
        setCalculatedIndices([]);
        setVisibleLayerUrl(null);
        setChangePolygons(null);
        setPreviewLayerUrl(null);
        setDifferenceLayerUrl(null);
        setIsChangeLayerVisible(false);
        setChangeAreas(null);
        setNdviAreas(null);
        setSaviResult(null);
        setMsaviResult(null);
        setNdreResult(null);
    }, []);

    const setAoiAndZoom = useCallback((feature: Feature) => {
        if (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') {
            setActiveAoi(feature);
            setMapViewTarget(L.geoJSON(feature).getBounds());
            showNotification("Área de Interesse definida!", "success");
        } else {
            showNotification("Nenhum polígono válido encontrado.", "error");
        }
    }, [showNotification]);



    const handleSearchImages = useCallback(async (geometry: Feature['geometry']) => {
        if (!satellite) { showNotification('Selecione um satélite.', 'error'); return; }
        setLoadingState('searching');
        setSelectedImageIds([]);
        setTimelineIndex(0);
        setTimelinePlaying(false);
        resetAnalysisLayers();
        try {
            const resp = await fetch(`${API_BASE_URL}/api/earth-images/search`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dateFrom, dateTo, cloudPct, satellite, polygon: geometry }) });
            if (!resp.ok) { const err = await resp.json(); throw new Error(err.detail || 'Erro no servidor'); }
            const data = await resp.json() as ImageInfo[];
            setApiImages(data);
            showNotification(data.length > 0 ? `${data.length} imagens encontradas.` : `Nenhuma imagem encontrada.`, data.length > 0 ? 'success' : 'error');
        } catch (err: any) {
            setApiImages([]);
            showNotification(err.message || 'Erro ao buscar imagens.', 'error');
        } finally {
            setLoadingState('idle');
        }
    }, [dateFrom, dateTo, cloudPct, satellite, showNotification, resetAnalysisLayers]);

    const handleIndexChange = useCallback((indexName: string, isChecked: boolean) => {
        setSelectedIndices(prev => isChecked ? [...new Set([...prev, indexName])] : prev.filter(i => i !== indexName));
    }, []);

    const handleCalculateIndices = useCallback(async () => {
        if (selectedImageIds.length === 0 || !activeAoi) {
            showNotification("Selecione uma imagem e defina uma AOI.", "error");
            return;
        }
        if (selectedIndices.length === 0) {
            showNotification("Selecione pelo menos um índice para calcular.", "error");
            return;
        }

        if (selectedIndices.includes('Red-Edge NDVI') && satellite.startsWith('LANDSAT')) {
            showNotification('Red-Edge NDVI só pode ser calculado para satélites Sentinel-2.', 'error');
            return;
        }

        setLoadingState('calculating');
        // Limpa painéis antigos antes de calcular novos para evitar mostrar dados de análises passadas
        setNdviAreas(null);
        setSaviResult(null);
        setMsaviResult(null);
        setNdreResult(null);

        try {
            const imageId = selectedImageIds[0];
            const res = await fetch(`${API_BASE_URL}/api/earth-images/indices`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imageId, satellite, polygon: activeAoi.geometry, indices: selectedIndices }) });
            if (!res.ok) { const err = await res.json(); throw new Error(err.detail || "Falha ao calcular os índices"); }
            
            const data: { results: IndexResult[], bounds: LatLngBoundsExpression } = await res.json();
            
            if (data.results && data.results.length > 0) {
                setCalculatedIndices(data.results);
                setVisibleLayerUrl(data.results[0].imageUrl);
                setMapViewTarget(data.bounds);
                showNotification(`${data.results.length} índice(s) calculado(s)!`, "success");

                data.results.forEach(result => {
                    switch(result.indexName.toUpperCase()) {
                        case 'NDVI':
                            setNdviAreas(result.classification as NdviAreas || null);
                            break;
                        case 'SAVI':
                            setSaviResult(result.classification as SaviAreas || null);
                            break;
                        case 'MSAVI':
                            setMsaviResult(result.classification as MsaviAreas || null);
                            break;
                        case 'RED-EDGE NDVI':
                            setNdreResult(result.classification as NdreAreas || null);
                            break;
                        default:
                            break;
                    }
                });

            } else {
                throw new Error("A API não retornou resultados para os índices solicitados.");
            }
        } catch (error: any) {
            showNotification(error.message || "Erro ao calcular os índices.", "error");
            resetAnalysisLayers();
        } finally {
            setLoadingState('idle');
        }
    }, [selectedImageIds, satellite, activeAoi, selectedIndices, showNotification, resetAnalysisLayers]);

    const fetchPreviewTileUrl = useCallback(async (imageId: string, silent = false): Promise<string> => {
        if (!activeAoi || !satellite) {
            throw new Error("Defina uma AOI e selecione um satelite primeiro.");
        }

        const cached = previewTileCacheRef.current[imageId];
        if (cached) return cached;

        if (!silent) setLoadingState('loading_preview');
        try {
            const res = await fetch(`${API_BASE_URL}/api/earth-images/preview`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imageId, satellite, polygon: activeAoi.geometry }),
            });
            if (!res.ok) throw new Error("Falha ao carregar pre-visualizacao da imagem.");
            const data = await res.json();
            previewTileCacheRef.current[imageId] = data.tileUrl;
            return data.tileUrl as string;
        } finally {
            if (!silent) setLoadingState('idle');
        }
    }, [activeAoi, satellite]);

    const showTimelineFrame = useCallback(async (frameIndex: number) => {
        if (!timelineImages.length) return;
        const safeIndex = Math.max(0, Math.min(frameIndex, timelineImages.length - 1));
        const imageId = timelineImages[safeIndex].id;
        try {
            const tileUrl = await fetchPreviewTileUrl(imageId, true);
            setVisibleLayerUrl(null);
            setDifferenceLayerUrl(null);
            setIsChangeLayerVisible(false);
            setPreviewLayerUrl(tileUrl);
        } catch (error: any) {
            showNotification(error.message || "Erro ao carregar frame temporal.", "error");
        }
    }, [timelineImages, fetchPreviewTileUrl, showNotification]);

    const handlePreviewImage = useCallback(async (imageId: string) => {
        if (!activeAoi || !satellite) { showNotification("Defina uma AOI e selecione um satelite primeiro.", "error"); return; }
        try {
            const tileUrl = await fetchPreviewTileUrl(imageId, false);
            setVisibleLayerUrl(null);
            setDifferenceLayerUrl(null);
            setIsChangeLayerVisible(false);
            setPreviewLayerUrl(tileUrl);
            const idx = timelineImages.findIndex((item) => item.id === imageId);
            if (idx >= 0) setTimelineIndex(idx);
        } catch (error: any) {
            showNotification(error.message || "Erro ao carregar pre-visualizacao.", "error");
        }
    }, [activeAoi, satellite, showNotification, fetchPreviewTileUrl, timelineImages]);

    const handleTimelineIndexChange = useCallback((index: number) => {
        setTimelineIndex(index);
        void showTimelineFrame(index);
    }, [showTimelineFrame]);

    const handleTimelinePlayToggle = useCallback(() => {
        if (timelineImages.length < 2) {
            showNotification('Selecione pelo menos 2 imagens para animacao temporal.', 'error');
            return;
        }
        if (!activeAoi || !satellite) {
            showNotification('Defina AOI e satelite para reproduzir timeline.', 'error');
            return;
        }
        setTimelinePlaying((prev) => !prev);
    }, [timelineImages.length, activeAoi, satellite, showNotification]);

    const handleTimelineSpeedChange = useCallback((value: number) => {
        setTimelineSpeedMs(value);
    }, []);

    useEffect(() => {
        if (timelineIndex > Math.max(0, timelineImages.length - 1)) {
            setTimelineIndex(0);
        }
        if (timelineImages.length < 2) {
            setTimelinePlaying(false);
        }
    }, [timelineImages.length, timelineIndex]);

    useEffect(() => {
        if (!timelinePlaying || timelineImages.length < 2) return;
        const timer = setInterval(() => {
            setTimelineIndex((prev) => {
                const next = (prev + 1) % timelineImages.length;
                void showTimelineFrame(next);
                return next;
            });
        }, timelineSpeedMs);
        return () => clearInterval(timer);
    }, [timelinePlaying, timelineImages.length, timelineSpeedMs, showTimelineFrame]);

    const handleDetectChange = useCallback(async () => {
        if (selectedImageIds.length !== 2) { showNotification("Selecione exatamente duas imagens para a detecção de mudança.", "error"); return; }
        if (!activeAoi) { showNotification("Defina uma Área de Interesse (AOI) primeiro.", "error"); return; }
        setLoadingState('detectingChange');
        setPreviewLayerUrl(null);
        setVisibleLayerUrl(null);
        try {
            const imageDateMap = new Map(apiImages.map(img => [img.id, new Date(img.date.split('/').reverse().join('-'))]));
            const sortedSelectedIds = [...selectedImageIds].sort((a, b) => (imageDateMap.get(a)?.getTime() || 0) - (imageDateMap.get(b)?.getTime() || 0));
            const res = await fetch(`${API_BASE_URL}/api/earth-images/change-detection`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ beforeImageId: sortedSelectedIds[0], afterImageId: sortedSelectedIds[1], satellite, polygon: activeAoi.geometry, threshold: changeThreshold }) });
            if (!res.ok) { const err = await res.json(); throw new Error(err.detail || "Falha ao detectar mudanças"); }
            const data = await res.json();
            setDifferenceLayerUrl(data.differenceImageUrl);
            
            setChangeAreas({ 
                gain: data.gainAreaHa, 
                loss: data.lossAreaHa, 
                total: data.totalAreaHa 
            });

            if (data.changeGeoJson && data.changeGeoJson.features.length > 0) {
                setChangePolygons(data.changeGeoJson);
                setIsChangeLayerVisible(true);
                showNotification("Detecção de mudança concluída!", "success");
            } else {
                setChangePolygons(null);
                showNotification("Nenhuma mudança significativa foi detectada.", "error");
            }
        } catch (error: any) {
            showNotification(error.message || "Ocorreu um erro ao detectar as mudanças.", "error");
        } finally {
            setLoadingState('idle');
        }
    }, [selectedImageIds, activeAoi, satellite, apiImages, changeThreshold, showNotification]);

    const handleBulkDownload = useCallback(async () => {
        if (selectedImageIds.length === 0 || !activeAoi) { showNotification("Selecione pelo menos uma imagem e defina uma AOI.", "error"); return; }
        setLoadingState('downloading');
        showNotification(`Iniciando download de ${selectedImageIds.length} imagem(ns)...`, "success");
        try {
            const zip = new JSZip();
            const downloadInfosPromises = selectedImageIds.map(imageId => fetch(`${API_BASE_URL}/api/earth-images/download-info`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imageId, polygon: activeAoi.geometry }) }).then(res => { if (!res.ok) throw new Error(`Falha ao obter info para ${imageId}`); return res.json(); }));
            const downloadInfos = await Promise.all(downloadInfosPromises);
            const fileBlobsPromises = downloadInfos.map(info => fetch(info.downloadUrl).then(res => { if (!res.ok) throw new Error(`Falha ao baixar o arquivo ${info.fileName}`); return res.blob(); }).then(blob => ({ name: info.fileName, blob: blob })));
            const fileDatas = await Promise.all(fileBlobsPromises);
            fileDatas.forEach(fileData => { zip.file(fileData.name, fileData.blob); });
            const zipBlob = await zip.generateAsync({ type: 'blob' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(zipBlob);
            link.download = `geodados_terras_${new Date().toISOString().split('T')[0]}.zip`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(link.href);
            showNotification("Download concluído com sucesso!", "success");
        } catch (error: any) {
            console.error("Erro no download em massa:", error);
            showNotification(error.message || "Ocorreu um erro durante o download.", "error");
        } finally {
            setLoadingState('idle');
        }
    }, [selectedImageIds, activeAoi, showNotification]);

    const handleAoiFileUpload = useCallback(async (file: File | null) => {
        if (!file) return;
        setLoadingState('searching'); 
        try {
            let kmlText = '';
            if (file.name.toLowerCase().endsWith('.kmz')) {
                const zip = await JSZip.loadAsync(file);
                const kmlFile = zip.file(/\.kml$/i)[0];
                if (!kmlFile) { throw new Error('Nenhum arquivo .kml encontrado dentro do KMZ.'); }
                kmlText = await kmlFile.async('string');
            } else {
                kmlText = await file.text();
            }
            const dom = new DOMParser().parseFromString(kmlText, 'text/xml');
            const geojson = togeojson.kml(dom) as FeatureCollection;
            const polygonFeature = geojson.features.find((f): f is Feature => f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon');
            if (polygonFeature) {
                setAoiAndZoom(polygonFeature);
            } else {
                showNotification('Nenhum polígono válido foi encontrado no arquivo KML.', 'error');
            }
        } catch (error: any) {
            console.error("Erro ao processar arquivo KML/KMZ:", error);
            showNotification(error.message || 'Não foi possível processar o arquivo.', 'error');
        } finally {
            setLoadingState('idle');
        }
    }, [showNotification, setAoiAndZoom]);

    const handleDrawComplete = useCallback((feature: Feature) => setAoiAndZoom(feature), [setAoiAndZoom]);
    
    const handleCarouselSelect = useCallback((id: string) => {
        if (id === CHANGE_LAYER_ID) {
            setTimelinePlaying(false);
            setIsChangeLayerVisible(prev => !prev);
        } else if (id.startsWith('index-')) {
            setTimelinePlaying(false);
            const indexName = id.replace('index-', '');
            const selectedIndex = calculatedIndices.find(i => i.indexName === indexName);
            if (selectedIndex) {
                setVisibleLayerUrl(prevUrl => prevUrl === selectedIndex.imageUrl ? null : selectedIndex.imageUrl);
            }
        } else {
            setSelectedImageIds(ids => ids.includes(id) ? ids.filter(i => i !== id) : [...ids, id]);
        }
    }, [calculatedIndices]);

    const handleDeleteAoi = useCallback(() => {
        setActiveAoi(null);
        setApiImages([]);
        setSelectedImageIds([]);
        setTimelineIndex(0);
        setTimelinePlaying(false);
        resetAnalysisLayers();
    }, [resetAnalysisLayers]);

    const handleSelectAllImages = useCallback(() => {
        if (selectableImageIds.length === 0) return;
        setSelectedImageIds(selectableImageIds);
        setTimelineIndex(0);
    }, [selectableImageIds]);

    const handleDeselectAllImages = useCallback(() => {
        setSelectedImageIds([]);
        setTimelineIndex(0);
        setTimelinePlaying(false);
    }, []);
    const handleToggleTheme = useCallback(() => setTheme(t => t === 'light' ? 'dark' : 'light'), []);

    const handleStartCreation = useCallback(() => {
    setIsCreatingProperty(true);
    setSelectedProperty(null);
    resetAnalysisLayers();
}, [resetAnalysisLayers]);

const handleCancelCreation = useCallback(() => {
    setIsCreatingProperty(false);
    setSelectedProperty(null);
}, []);

const handleSelectProperty = useCallback((property: Property) => {
    setSelectedProperty(property);
    setIsCreatingProperty(false);
    setIsReadOnly(true);
}, []);

const handleEnableEdit = useCallback(() => {
    setIsReadOnly(false);
  }, []);


const handleSubmitProperty = useCallback(() => {
    setRefreshTrigger(Date.now());
    setIsCreatingProperty(false);
    setSelectedProperty(null);
}, []);

    const captureCurrentMapSnapshot = useCallback(async (): Promise<string | null> => {
        try {
            const mapElement = document.querySelector('.main-content .leaflet-container') as HTMLElement | null;
            if (!mapElement) return null;

            const html2canvas = await loadHtml2Canvas();
            const canvas = await html2canvas(mapElement, {
                useCORS: true,
                allowTaint: false,
                backgroundColor: '#ffffff',
                scale: 1,
                logging: false,
            });
            return canvas.toDataURL('image/png', 0.92);
        } catch (error) {
            console.error('Falha ao capturar screenshot do mapa:', error);
            return null;
        }
    }, []);

    const captureCurrentChartSnapshot = useCallback((): string | null => {
        try {
            const canvases = Array.from(document.querySelectorAll('.floating-panel-box .panel-body canvas')) as HTMLCanvasElement[];
            if (!canvases.length) return null;

            // Usa o maior canvas visivel para priorizar o grafico principal do painel de resultado.
            const visibleCanvases = canvases.filter((c) => c.offsetWidth > 0 && c.offsetHeight > 0);
            const target = (visibleCanvases.length ? visibleCanvases : canvases)
                .sort((a, b) => (b.width * b.height) - (a.width * a.height))[0];
            if (!target) return null;

            return target.toDataURL('image/png', 0.92);
        } catch (error) {
            console.error('Falha ao capturar screenshot do grafico:', error);
            return null;
        }
    }, []);

    const runAgronomistAnalysis = useCallback(async (payload: AgronomoPayload) => {
        setAgronomoLoading(true);
        setAgronomoError(null);
        setAgronomoHistory([]);
        setAgronomoComparison(null);
        setAgronomoModalOpen(true);
        setAgronomoPayloadSnapshot(payload);
        try {
            const response = await fetch(`${API_BASE_URL}/api/agronomo/relatorio`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.detail || 'Falha ao gerar relatorio do agronomo.');
            }
            const report = await response.json() as AgronomistReportData;
            setAgronomoReport(report);

            const [historyResp, comparisonResp] = await Promise.all([
                fetch(`${API_BASE_URL}/api/agronomo/relatorios?talhao=${encodeURIComponent(payload.talhao)}&limit=5`),
                fetch(`${API_BASE_URL}/api/agronomo/relatorio/${report.id}/comparar-anterior`),
            ]);

            if (historyResp.ok) {
                const historyJson = await historyResp.json();
                setAgronomoHistory(Array.isArray(historyJson.items) ? historyJson.items : []);
            } else {
                setAgronomoHistory([]);
            }

            if (comparisonResp.ok) {
                const comparisonJson = await comparisonResp.json();
                setAgronomoComparison(comparisonJson as AgronomoComparisonResponse);
            } else {
                setAgronomoComparison(null);
            }
        } catch (error: any) {
            setAgronomoError(error.message || 'Erro ao consultar o agronomo virtual.');
            showNotification(error.message || 'Erro ao consultar o agronomo virtual.', 'error');
        } finally {
            setAgronomoLoading(false);
        }
    }, [showNotification]);

    const handleAskAgronomist = useCallback(async () => {
        if (!changeAreas) {
            showNotification('Execute a deteccao de mudanca antes de consultar o agronomo.', 'error');
            return;
        }

        const total = Math.max(changeAreas.total, 0.0001);
        const noChange = Math.max(0, total - changeAreas.gain - changeAreas.loss);
        const valores = [changeAreas.gain, changeAreas.loss, noChange];
        const min = Math.min(...valores);
        const max = Math.max(...valores);
        const media = valores.reduce((sum, v) => sum + v, 0) / valores.length;
        const variacaoPercentual = ((changeAreas.gain - changeAreas.loss) / total) * 100;
        const tendencia = variacaoPercentual < -8 ? 'queda' : variacaoPercentual > 8 ? 'alta' : 'estavel';

        const payload = {
            talhao: selectedProperty?.propriedade_nome || 'Talhao/AOI atual',
            area_ha: Number(total.toFixed(4)),
            indice: 'NDVI',
            periodo: {
                inicio: dateFrom,
                fim: dateTo,
            },
            valores_temporais: [
                { data: 'ganho_vegetacao', valor: Number(changeAreas.gain.toFixed(4)) },
                { data: 'perda_vegetacao', valor: Number(changeAreas.loss.toFixed(4)) },
                { data: 'sem_mudanca', valor: Number(noChange.toFixed(4)) },
            ],
            estatisticas: {
                min: Number(min.toFixed(4)),
                max: Number(max.toFixed(4)),
                media: Number(media.toFixed(4)),
                tendencia,
                variacao_percentual: Number(variacaoPercentual.toFixed(4)),
            },
            data_pico_vegetativo: null,
            data_queda_brusca: null,
        };

        await runAgronomistAnalysis(payload);
    }, [changeAreas, selectedProperty, dateFrom, dateTo, showNotification, runAgronomistAnalysis]);

    const handleAskAgronomistNdvi = useCallback(async () => {
        if (!ndviAreas) {
            showNotification('Execute o calculo NDVI antes de consultar o agronomo.', 'error');
            return;
        }

        const values = [
            Number(ndviAreas.area_agua || 0),
            Number(ndviAreas.area_solo_exposto || 0),
            Number(ndviAreas.area_vegetacao_rala || 0),
            Number(ndviAreas.area_vegetacao_densa || 0),
        ];
        const total = Math.max(values.reduce((sum, v) => sum + v, 0), 0.0001);
        const min = Math.min(...values);
        const max = Math.max(...values);
        const media = values.reduce((sum, v) => sum + v, 0) / values.length;
        const variacaoPercentual = ((ndviAreas.area_vegetacao_densa - ndviAreas.area_solo_exposto) / total) * 100;
        const tendencia = variacaoPercentual < -8 ? 'queda' : variacaoPercentual > 8 ? 'alta' : 'estavel';
        const denseRatio = ndviAreas.area_vegetacao_densa / total;
        const stressRatio = (ndviAreas.area_solo_exposto + ndviAreas.area_agua) / total;

        const payload = {
            talhao: selectedProperty?.propriedade_nome || 'Talhao/AOI atual',
            area_ha: Number(total.toFixed(4)),
            indice: 'NDVI',
            periodo: {
                inicio: dateFrom,
                fim: dateTo,
            },
            valores_temporais: [
                { data: 'agua', valor: Number(ndviAreas.area_agua.toFixed(4)) },
                { data: 'solo_exposto', valor: Number(ndviAreas.area_solo_exposto.toFixed(4)) },
                { data: 'vegetacao_rala', valor: Number(ndviAreas.area_vegetacao_rala.toFixed(4)) },
                { data: 'vegetacao_densa', valor: Number(ndviAreas.area_vegetacao_densa.toFixed(4)) },
            ],
            estatisticas: {
                min: Number(min.toFixed(4)),
                max: Number(max.toFixed(4)),
                media: Number(media.toFixed(4)),
                tendencia,
                variacao_percentual: Number(variacaoPercentual.toFixed(4)),
            },
            data_pico_vegetativo: denseRatio >= 0.5 ? dateTo : null,
            data_queda_brusca: stressRatio >= 0.35 ? dateTo : null,
        };

        await runAgronomistAnalysis(payload);
    }, [ndviAreas, selectedProperty, dateFrom, dateTo, showNotification, runAgronomistAnalysis]);

    const handleAskAgronomistNdre = useCallback(async () => {
        if (!ndreResult) {
            showNotification('Execute o calculo Red-Edge NDVI antes de consultar o agronomo.', 'error');
            return;
        }

        const values = [
            Number(ndreResult.area_nao_vegetada || 0),
            Number(ndreResult.area_vegetacao_estressada || 0),
            Number(ndreResult.area_vegetacao_moderada || 0),
            Number(ndreResult.area_vegetacao_densa || 0),
        ];
        const total = Math.max(values.reduce((sum, v) => sum + v, 0), 0.0001);
        const min = Math.min(...values);
        const max = Math.max(...values);
        const media = values.reduce((sum, v) => sum + v, 0) / values.length;
        const variacaoPercentual =
            ((ndreResult.area_vegetacao_densa - ndreResult.area_vegetacao_estressada) / total) * 100;
        const tendencia = variacaoPercentual < -8 ? 'queda' : variacaoPercentual > 8 ? 'alta' : 'estavel';
        const denseRatio = ndreResult.area_vegetacao_densa / total;
        const stressRatio = (ndreResult.area_vegetacao_estressada + ndreResult.area_nao_vegetada) / total;

        const payload = {
            talhao: selectedProperty?.propriedade_nome || 'Talhao/AOI atual',
            area_ha: Number(total.toFixed(4)),
            indice: 'RED-EDGE NDVI',
            periodo: {
                inicio: dateFrom,
                fim: dateTo,
            },
            valores_temporais: [
                { data: 'nao_vegetado', valor: Number(ndreResult.area_nao_vegetada.toFixed(4)) },
                { data: 'vegetacao_estressada', valor: Number(ndreResult.area_vegetacao_estressada.toFixed(4)) },
                { data: 'vegetacao_moderada', valor: Number(ndreResult.area_vegetacao_moderada.toFixed(4)) },
                { data: 'vegetacao_densa', valor: Number(ndreResult.area_vegetacao_densa.toFixed(4)) },
            ],
            estatisticas: {
                min: Number(min.toFixed(4)),
                max: Number(max.toFixed(4)),
                media: Number(media.toFixed(4)),
                tendencia,
                variacao_percentual: Number(variacaoPercentual.toFixed(4)),
            },
            data_pico_vegetativo: denseRatio >= 0.55 ? dateTo : null,
            data_queda_brusca: stressRatio >= 0.35 ? dateTo : null,
        };

        await runAgronomistAnalysis(payload);
    }, [ndreResult, selectedProperty, dateFrom, dateTo, showNotification, runAgronomistAnalysis]);

    const handleAskAgronomistSavi = useCallback(async () => {
        if (!saviResult) {
            showNotification('Execute o calculo SAVI antes de consultar o agronomo.', 'error');
            return;
        }

        const values = [
            Number(saviResult.area_agua_solo || 0),
            Number(saviResult.area_vegetacao_esparsa || 0),
            Number(saviResult.area_vegetacao_moderada || 0),
            Number(saviResult.area_vegetacao_densa || 0),
        ];
        const total = Math.max(values.reduce((sum, v) => sum + v, 0), 0.0001);
        const min = Math.min(...values);
        const max = Math.max(...values);
        const media = values.reduce((sum, v) => sum + v, 0) / values.length;
        const variacaoPercentual =
            ((saviResult.area_vegetacao_densa - saviResult.area_agua_solo) / total) * 100;
        const tendencia = variacaoPercentual < -8 ? 'queda' : variacaoPercentual > 8 ? 'alta' : 'estavel';
        const denseRatio = saviResult.area_vegetacao_densa / total;
        const stressRatio = (saviResult.area_agua_solo + saviResult.area_vegetacao_esparsa) / total;

        const payload = {
            talhao: selectedProperty?.propriedade_nome || 'Talhao/AOI atual',
            area_ha: Number(total.toFixed(4)),
            indice: 'SAVI',
            periodo: { inicio: dateFrom, fim: dateTo },
            valores_temporais: [
                { data: 'agua_solo', valor: Number(saviResult.area_agua_solo.toFixed(4)) },
                { data: 'vegetacao_esparsa', valor: Number(saviResult.area_vegetacao_esparsa.toFixed(4)) },
                { data: 'vegetacao_moderada', valor: Number(saviResult.area_vegetacao_moderada.toFixed(4)) },
                { data: 'vegetacao_densa', valor: Number(saviResult.area_vegetacao_densa.toFixed(4)) },
            ],
            estatisticas: {
                min: Number(min.toFixed(4)),
                max: Number(max.toFixed(4)),
                media: Number(media.toFixed(4)),
                tendencia,
                variacao_percentual: Number(variacaoPercentual.toFixed(4)),
            },
            data_pico_vegetativo: denseRatio >= 0.5 ? dateTo : null,
            data_queda_brusca: stressRatio >= 0.35 ? dateTo : null,
        };

        await runAgronomistAnalysis(payload);
    }, [saviResult, selectedProperty, dateFrom, dateTo, showNotification, runAgronomistAnalysis]);

    const handleAskAgronomistMsavi = useCallback(async () => {
        if (!msaviResult) {
            showNotification('Execute o calculo MSAVI antes de consultar o agronomo.', 'error');
            return;
        }

        const values = [
            Number(msaviResult.area_solo_exposto || 0),
            Number(msaviResult.area_vegetacao_rala || 0),
            Number(msaviResult.area_vegetacao_moderada || 0),
            Number(msaviResult.area_vegetacao_densa || 0),
        ];
        const total = Math.max(values.reduce((sum, v) => sum + v, 0), 0.0001);
        const min = Math.min(...values);
        const max = Math.max(...values);
        const media = values.reduce((sum, v) => sum + v, 0) / values.length;
        const variacaoPercentual =
            ((msaviResult.area_vegetacao_densa - msaviResult.area_solo_exposto) / total) * 100;
        const tendencia = variacaoPercentual < -8 ? 'queda' : variacaoPercentual > 8 ? 'alta' : 'estavel';
        const denseRatio = msaviResult.area_vegetacao_densa / total;
        const stressRatio = (msaviResult.area_solo_exposto + msaviResult.area_vegetacao_rala) / total;

        const payload = {
            talhao: selectedProperty?.propriedade_nome || 'Talhao/AOI atual',
            area_ha: Number(total.toFixed(4)),
            indice: 'MSAVI',
            periodo: { inicio: dateFrom, fim: dateTo },
            valores_temporais: [
                { data: 'solo_exposto', valor: Number(msaviResult.area_solo_exposto.toFixed(4)) },
                { data: 'vegetacao_rala', valor: Number(msaviResult.area_vegetacao_rala.toFixed(4)) },
                { data: 'vegetacao_moderada', valor: Number(msaviResult.area_vegetacao_moderada.toFixed(4)) },
                { data: 'vegetacao_densa', valor: Number(msaviResult.area_vegetacao_densa.toFixed(4)) },
            ],
            estatisticas: {
                min: Number(min.toFixed(4)),
                max: Number(max.toFixed(4)),
                media: Number(media.toFixed(4)),
                tendencia,
                variacao_percentual: Number(variacaoPercentual.toFixed(4)),
            },
            data_pico_vegetativo: denseRatio >= 0.5 ? dateTo : null,
            data_queda_brusca: stressRatio >= 0.35 ? dateTo : null,
        };

        await runAgronomistAnalysis(payload);
    }, [msaviResult, selectedProperty, dateFrom, dateTo, showNotification, runAgronomistAnalysis]);

    const handleExportAgronomoPdf = useCallback(async () => {
        if (!agronomoReport) return;
        const mapSnapshot = await captureCurrentMapSnapshot();
        const chartSnapshot = captureCurrentChartSnapshot();
        const histogramSnapshot = buildHistogramSvgDataUri(agronomoPayloadSnapshot);
        const periodoLegenda = agronomoPayloadSnapshot
            ? `${agronomoPayloadSnapshot.periodo.inicio} a ${agronomoPayloadSnapshot.periodo.fim}`
            : `${dateFrom} a ${dateTo}`;
        const logoUrl = `${window.location.origin}/logo-campos-conectados.svg`;
        const html = `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Relatorio Tecnico do Agronomo</title>
    <style>
      @page { size: A4; margin: 14mm; }
      * { box-sizing: border-box; }
      body { font-family: "Segoe UI", Arial, sans-serif; margin: 0; color: #1d2939; background: #f6f8fb; }
      .sheet { max-width: 920px; margin: 0 auto; background: #fff; border: 1px solid #e4e7ec; border-radius: 10px; padding: 18px 20px; }
      .topline { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 14px; border-bottom: 1px solid #eef1f5; padding-bottom: 12px; }
      .brand { display: flex; align-items: center; gap: 10px; }
      .brand img { width: 46px; height: 46px; object-fit: contain; border-radius: 8px; }
      .title-block h1 { margin: 0; font-size: 20px; letter-spacing: 0.2px; }
      .subtitle { margin: 3px 0 0 0; color: #667085; font-size: 12px; }
      .meta-wrap { text-align: right; font-size: 12px; color: #475467; line-height: 1.6; }
      .badge { display: inline-block; padding: 3px 8px; border-radius: 999px; font-weight: 700; text-transform: uppercase; font-size: 10px; background: #eef2ff; color: #344054; }
      .visual-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 8px 0 14px; }
      .card { border: 1px solid #d8dee8; border-radius: 8px; overflow: hidden; background: #fbfcfe; }
      .card h3 { margin: 0; padding: 8px 10px; font-size: 13px; border-bottom: 1px solid #e7ecf3; color: #344054; background: #f8fafc; }
      .card-media { height: 210px; display: flex; align-items: center; justify-content: center; background: #fff; }
      .card-media img { max-width: 100%; max-height: 100%; object-fit: contain; display: block; }
      .fallback { padding: 10px; font-size: 11px; color: #667085; }
      .legend { margin: 6px 0 0 0; font-size: 11px; color: #667085; }
      .section { margin-top: 10px; }
      .section h2 { margin: 0 0 6px 0; font-size: 14px; color: #101828; }
      .section p { margin: 0; line-height: 1.5; font-size: 13px; color: #344054; }
      @media print {
        body { background: #fff; }
        .sheet { border: none; border-radius: 0; padding: 0; max-width: none; }
      }
    </style>
  </head>
  <body>
    <div class="sheet">
      <div class="topline">
        <div class="brand">
          <img src="${logoUrl}" alt="Campos Conectados" />
          <div class="title-block">
            <h1>Relatorio Tecnico do Agronomo</h1>
            <p class="subtitle">Campos Conectados · Smart Farm Monitoring</p>
          </div>
        </div>
        <div class="meta-wrap">
          <div>Timestamp: ${new Date(agronomoReport.timestamp).toLocaleString('pt-BR')}</div>
          <div>Nivel de atencao: <span class="badge">${agronomoReport.nivel_atencao}</span></div>
        </div>
      </div>

      <div class="visual-grid">
        <div class="card">
          <h3>Grafico da Analise</h3>
          <div class="card-media">
            ${
              chartSnapshot
                ? `<img src="${chartSnapshot}" alt="Print do grafico da analise" />`
                : `<div class="fallback">Nao foi possivel capturar o grafico automaticamente.</div>`
            }
          </div>
        </div>
        <div class="card">
          <h3>Mapa da Analise</h3>
          <div class="card-media">
            ${
              mapSnapshot
                ? `<img src="${mapSnapshot}" alt="Print do mapa da analise" />`
                : `<div class="fallback">Nao foi possivel capturar o mapa automaticamente neste navegador/camada base.</div>`
            }
          </div>
        </div>
      </div>

      <div class="card" style="margin-top: 10px;">
        <h3>Histograma de Variacao do Indice</h3>
        <div class="card-media" style="height: 230px;">
          ${
            histogramSnapshot
              ? `<img src="${histogramSnapshot}" alt="Histograma de variacao do indice" />`
              : `<div class="fallback">Nao foi possivel gerar o histograma automaticamente.</div>`
          }
        </div>
        <p class="legend">Intervalo analisado: ${periodoLegenda}</p>
      </div>

      <div class="section"><h2>1. Resumo da situacao</h2><p>${agronomoReport.resumo}</p></div>
      <div class="section"><h2>2. Diagnostico provavel</h2><p>${agronomoReport.diagnostico}</p></div>
      <div class="section"><h2>3. Possiveis causas</h2><p>${agronomoReport.causas}</p></div>
      <div class="section"><h2>4. Recomendacoes praticas</h2><p>${agronomoReport.recomendacoes}</p></div>
    </div>
  </body>
</html>`;
        const printWindow = window.open('', '_blank', 'width=980,height=760');
        if (!printWindow) {
            showNotification('Nao foi possivel abrir a janela de impressao.', 'error');
            return;
        }
        printWindow.document.open();
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.focus();
        printWindow.print();
    }, [agronomoReport, showNotification, captureCurrentMapSnapshot, captureCurrentChartSnapshot, agronomoPayloadSnapshot, dateFrom, dateTo]);

    const handleCloseNdviModal = useCallback(() => { setNdviAreas(null); }, []);
    const handleCloseSaviModal = useCallback(() => { setSaviResult(null); }, []);
    const handleCloseMsaviModal = useCallback(() => { setMsaviResult(null); }, []);
    const handleCloseNdreModal = useCallback(() => { setNdreResult(null); }, []);

    useEffect(() => {
        if (notification) { const timer = setTimeout(() => setNotification(null), 4000); return () => clearTimeout(timer); }
    }, [notification]);

    useEffect(() => {
        if (activeAoi && satellite) {
            previewTileCacheRef.current = {};
            handleSearchImages(activeAoi.geometry);
        }
    }, [activeAoi, satellite, handleSearchImages]);

    let activeLayerId = null;
    if (isChangeLayerVisible) {
        activeLayerId = CHANGE_LAYER_ID;
    } else if (visibleLayerUrl) {
        const activeIndex = calculatedIndices.find(i => i.imageUrl === visibleLayerUrl);
        if (activeIndex) {
            activeLayerId = `index-${activeIndex.indexName}`;
        }
    }

    const Z_INDEX = { BASE: 10, DIFFERENCE_MAP: 12, PREVIEW: 15, ACTIVE: 20 };
    const activeIndexFromId = calculatedIndices.find(i => `index-${i.indexName}` === activeLayerId);
    const indexLayerZIndex = activeIndexFromId?.imageUrl === visibleLayerUrl ? Z_INDEX.ACTIVE : Z_INDEX.BASE;
    const differenceLayerZIndex = activeLayerId === CHANGE_LAYER_ID ? Z_INDEX.ACTIVE : Z_INDEX.DIFFERENCE_MAP;

    return (
        <MapStateProvider>
            <div className={`app-container theme-${theme}`}>
                {loadingState !== 'idle' && <LoadingIndicator text="Processando..." subtext="Por favor, aguarde." />}
                {notification && <Notification message={notification.message} type={notification.type} onDismiss={() => setNotification(null)} />}
                <div className="module-navigation">
                    <button className={activeModule === 'territorial' ? 'active' : ''} onClick={() => setActiveModule('territorial')}>Monitoramento Territorial</button>
                </div>
                <div className="main-view">
                    {activeModule === 'territorial' ? (
                        <SidebarTerritorial
                            dateFrom={dateFrom} onDateFromChange={setDateFrom} dateTo={dateTo} onDateToChange={setDateTo}
                            cloudPct={cloudPct} onCloudPctChange={setCloudPct}
                            satellite={satellite}
                            onSatelliteChange={(value) => {
                                setSatellite(value);
                                if (value.startsWith('LANDSAT') && selectedIndices.includes('Red-Edge NDVI')) {
                                    setSelectedIndices(prev => prev.filter(i => i !== 'Red-Edge NDVI'));
                                }
                            }}
                            satellites={SATELLITES} theme={theme} loadingState={loadingState}
                            selectedImageIds={selectedImageIds} onDetectChange={handleDetectChange}
                            onBulkDownload={handleBulkDownload} onToggleTheme={handleToggleTheme}
                            onAoiFileUpload={handleAoiFileUpload} onDeleteAoi={handleDeleteAoi}
                            onCalculateIndices={handleCalculateIndices} selectedIndices={selectedIndices} onIndexChange={handleIndexChange}
                            calculatedIndices={calculatedIndices} onVisibleIndexChange={setVisibleLayerUrl}
                            changeThreshold={changeThreshold} onChangeThreshold={setChangeThreshold}
                        />
                    ) : (
                        <SidebarClima theme={theme} onToggleTheme={handleToggleTheme}/>
                    )}
                    <main className="main-content">
                        <MapView
                            onDrawComplete={handleDrawComplete}
                            drawingEnabled={true}
                            visibleLayerUrl={visibleLayerUrl}
                            previewLayerUrl={previewLayerUrl} 
                            activeAoi={activeAoi}
                            changePolygons={isChangeLayerVisible ? changePolygons : null}
                            baseMapKey={baseMapKey} onBaseMapChange={setBaseMapKey}
                            mapViewTarget={mapViewTarget} 
                            differenceLayerUrl={differenceLayerUrl}
                            indexLayerZIndex={indexLayerZIndex} 
                            differenceLayerZIndex={differenceLayerZIndex}
                            previewLayerZIndex={Z_INDEX.PREVIEW}
                            classifiedPlots={null}
                            onPropertySelect={handleSelectProperty}
                            refreshTrigger={refreshTrigger}
                        />
                        {activeModule === 'territorial' && carouselItems.length > 0 && (
                            <ImageCarousel
                                images={carouselItems} 
                                selectedIds={selectedImageIds}
                                onSelect={handleCarouselSelect}
                                onPreview={handlePreviewImage}
                                activeLayerId={activeLayerId}
                                timelineItems={timelineImages.map((img) => ({ id: img.id, date: img.date }))}
                                timelineIndex={timelineIndex}
                                timelinePlaying={timelinePlaying}
                                timelineSpeedMs={timelineSpeedMs}
                                onTimelineIndexChange={handleTimelineIndexChange}
                                onTimelinePlayToggle={handleTimelinePlayToggle}
                                onTimelineSpeedChange={handleTimelineSpeedChange}
                                hasSelectableImages={selectableImageIds.length > 0}
                                allSelectableSelected={allSelectableSelected}
                                onSelectAllImages={handleSelectAllImages}
                                onDeselectAllImages={handleDeselectAllImages}
                            />
                        )}
                    </main>
                </div>
                
                {changeAreas && (
                    <ChangeDetectionPanel
                        gainArea={changeAreas.gain}
                        lossArea={changeAreas.loss}
                        totalArea={changeAreas.total}
                        onClose={() => setChangeAreas(null)}
                        initialPosition={{ x: 1090, y: 70 }}
                        onAskAgronomist={handleAskAgronomist}
                        isAskingAgronomist={agronomoLoading}
                    />
                )}
                
                {ndviAreas && (
                    <NdviResultPanel 
                        data={ndviAreas}
                        onClose={handleCloseNdviModal}
                        initialPosition={{ x: 50, y: 70 }}
                        onAskAgronomist={handleAskAgronomistNdvi}
                        isAskingAgronomist={agronomoLoading}
                    />
                )}

                {saviResult && (
                    <SaviResultPanel
                      data={saviResult}
                      onClose={handleCloseSaviModal}
                      initialPosition={{ x: 570, y: 70 }}
                      onAskAgronomist={handleAskAgronomistSavi}
                      isAskingAgronomist={agronomoLoading}
                    />
                )}
                
                {msaviResult && (
                    <MsaviResultPanel
                      data={msaviResult}
                      onClose={handleCloseMsaviModal}
                      initialPosition={{ x: 1090, y: 70 }}
                      onAskAgronomist={handleAskAgronomistMsavi}
                      isAskingAgronomist={agronomoLoading}
                    />
                )}

                {ndreResult && (
                    <NdreResultPanel
                      data={ndreResult}
                      onClose={handleCloseNdreModal}
                      initialPosition={{ x: 50, y: 120 }}
                      onAskAgronomist={handleAskAgronomistNdre}
                      isAskingAgronomist={agronomoLoading}
                    />
                )}

                {agronomoModalOpen && (
                    <AgronomistReportModal
                        report={agronomoReport || {
                            id: 0,
                            timestamp: new Date().toISOString(),
                            resumo: '',
                            diagnostico: '',
                            causas: '',
                            recomendacoes: '',
                            nivel_atencao: 'medio',
                        }}
                        loading={agronomoLoading}
                        error={agronomoError}
                        history={agronomoHistory}
                        comparison={agronomoComparison}
                        onClose={() => {
                            setAgronomoModalOpen(false);
                            setAgronomoReport(null);
                            setAgronomoError(null);
                        }}
                        onExportPdf={handleExportAgronomoPdf}
                    />
                )}
            </div>
        </MapStateProvider>
    );
}


