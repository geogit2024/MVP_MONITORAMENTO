// src/App.tsx

import React, { useState, useCallback, useEffect } from 'react';
import L, { LatLngBoundsExpression } from 'leaflet';
import { Feature, FeatureCollection } from 'geojson';

// Importa os componentes
import SidebarTerritorial from './components/Sidebar';
import SidebarClima from './components/SidebarClima';
import MapView from './components/MapView';
import ImageCarousel from './components/ImageCarousel';
import './App.css';
import togeojson from '@mapbox/togeojson';
import JSZip from 'jszip';

// --- Interfaces, Constantes e Componentes Auxiliares ---
export interface ImageInfo { id: string; date: string; thumbnailUrl: string; }
export interface IndexResult { indexName: string; imageUrl: string; downloadUrl: string; }
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

// --- Componente Principal ---
export default function App() {
  // --- Estados da Aplicação ---
  const [activeModule, setActiveModule] = useState<'territorial' | 'clima'>('territorial');
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [dateFrom, setDateFrom] = useState('2025-05-01');
  const [dateTo, setDateTo] = useState('2025-06-30');
  const [cloudPct, setCloudPct] = useState(30);
  const [satellite, setSatellite] = useState('');
  const [apiImages, setApiImages] = useState<ImageInfo[]>([]);
  const [carouselItems, setCarouselItems] = useState<ImageInfo[]>([]);
  const [loadingState, setLoadingState] = useState<'idle' | 'searching' | 'calculating' | 'detectingChange' | 'downloading' | 'loading_preview'>('idle');
  const [selectedImageIds, setSelectedImageIds] = useState<string[]>([]);
  const [activeAoi, setActiveAoi] = useState<Feature | null>(null);
  const [calculatedIndices, setCalculatedIndices] = useState<IndexResult[]>([]);
  const [visibleLayerUrl, setVisibleLayerUrl] = useState<string | null>(null);
  const [previewLayerUrl, setPreviewLayerUrl] = useState<string | null>(null);
  const [changePolygons, setChangePolygons] = useState<Feature | null>(null);
  const [notification, setNotification] = useState<{ message: string, type: 'error' | 'success' } | null>(null);
  const [baseMapKey, setBaseMapKey] = useState<string>('satellite');
  const [mapViewTarget, setMapViewTarget] = useState<LatLngBoundsExpression | null>(null);
  const [selectedIndices, setSelectedIndices] = useState<string[]>(['NDVI']);
  const [changeThreshold, setChangeThreshold] = useState(0.25);
  const [differenceLayerUrl, setDifferenceLayerUrl] = useState<string | null>(null);
  const [isChangeLayerVisible, setIsChangeLayerVisible] = useState(false);

  useEffect(() => {
    const virtualIndexItems: ImageInfo[] = calculatedIndices.map(index => ({
      id: `index-${index.indexName}`,
      date: index.indexName,
      thumbnailUrl: INDEX_LAYER_ICON_URI,
    }));
    const virtualChangeItem: ImageInfo[] = changePolygons ? [{
      id: CHANGE_LAYER_ID,
      date: 'Detecção de Mudança',
      thumbnailUrl: CHANGE_LAYER_ICON_URI,
    }] : [];
    const items = [...virtualChangeItem, ...virtualIndexItems, ...apiImages];
    setCarouselItems(items);
  }, [apiImages, changePolygons, calculatedIndices]);

  const showNotification = useCallback((message: string, type: 'error' | 'success') => { setNotification({ message, type }); }, []);
  
  const resetAnalysisLayers = useCallback(() => {
    setCalculatedIndices([]);
    setVisibleLayerUrl(null);
    setChangePolygons(null);
    setPreviewLayerUrl(null);
    setDifferenceLayerUrl(null);
    setIsChangeLayerVisible(false);
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
    const isValidDate = (dateString: string) => {
        const d = new Date(dateString);
        const [year, month, day] = dateString.split('-').map(Number);
        return !isNaN(d.getTime()) && d.getUTCFullYear() === year && d.getUTCMonth() + 1 === month && d.getUTCDate() === day;
    };
    if (!isValidDate(dateFrom)) { showNotification('A Data Inicial é inválida.', 'error'); return; }
    if (!isValidDate(dateTo)) { showNotification('A Data Final é inválida. Verifique o dia e o mês.', 'error'); return; }
    if (new Date(dateFrom) > new Date(dateTo)) { showNotification('A Data Inicial não pode ser posterior à Data Final.', 'error'); return; }
    if (!satellite) { showNotification('Selecione um satélite.', 'error'); return; }
    setLoadingState('searching');
    setSelectedImageIds([]); 
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
    if (selectedImageIds.length === 0 || !activeAoi) { showNotification("Selecione uma imagem e defina uma AOI.", "error"); return; }
    if (selectedIndices.length === 0) { showNotification("Selecione pelo menos um índice para calcular.", "error"); return; }
    setLoadingState('calculating');
    
    setCalculatedIndices([]);
    setVisibleLayerUrl(null);

    try {
      const imageId = selectedImageIds[0];
      const res = await fetch(`${API_BASE_URL}/api/earth-images/indices`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageId, satellite, polygon: activeAoi.geometry, indices: selectedIndices })
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.detail || "Falha ao calcular os índices"); }
      const data: { results: IndexResult[], bounds: LatLngBoundsExpression } = await res.json();
      if (data.results && data.results.length > 0) {
        setCalculatedIndices(data.results);
        setVisibleLayerUrl(data.results[0].imageUrl);
        setMapViewTarget(data.bounds);
        showNotification(`${data.results.length} índice(s) calculado(s)!`, "success");
      } else {
        showNotification("A API não retornou resultados para os índices solicitados.", "error");
      }
    } catch (error: any) {
      showNotification(error.message || "Erro ao calcular os índices.", "error");
    } finally {
      setLoadingState('idle');
    }
  }, [selectedImageIds, satellite, activeAoi, selectedIndices, showNotification]);

  const handlePreviewImage = useCallback(async (imageId: string) => {
    if (!activeAoi || !satellite) { showNotification("Defina uma AOI e selecione um satélite primeiro.", "error"); return; }
    setLoadingState('loading_preview');
    setVisibleLayerUrl(null);
    setDifferenceLayerUrl(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/earth-images/preview`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageId, satellite, polygon: activeAoi.geometry })
      });
      if (!res.ok) { throw new Error("Falha ao carregar pré-visualização da imagem."); }
      const data = await res.json();
      setPreviewLayerUrl(data.tileUrl);
    } catch (error: any) {
      showNotification(error.message || "Erro ao carregar pré-visualização.", "error");
    } finally {
      setLoadingState('idle');
    }
  }, [activeAoi, satellite, showNotification]);

  const handleDetectChange = useCallback(async () => {
    if (selectedImageIds.length !== 2) { showNotification("Selecione exatamente duas imagens para a detecção de mudança.", "error"); return; }
    if (!activeAoi) { showNotification("Defina uma Área de Interesse (AOI) primeiro.", "error"); return; }
    setLoadingState('detectingChange');

    setChangePolygons(null);
    setIsChangeLayerVisible(false);
    setDifferenceLayerUrl(null);

    try {
      const imageDateMap = new Map(apiImages.map(img => [img.id, new Date(img.date.split('/').reverse().join('-'))]));
      const sortedSelectedIds = [...selectedImageIds].sort((a, b) => (imageDateMap.get(a)?.getTime() || 0) - (imageDateMap.get(b)?.getTime() || 0));
      const res = await fetch(`${API_BASE_URL}/api/earth-images/change-detection`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          beforeImageId: sortedSelectedIds[0], afterImageId: sortedSelectedIds[1], 
          satellite, polygon: activeAoi.geometry, threshold: changeThreshold
        })
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.detail || "Falha ao detectar mudanças"); }
      const data = await res.json();
      if (data.differenceImageUrl) { setDifferenceLayerUrl(data.differenceImageUrl); }
      if (data.changeGeoJson && data.changeGeoJson.features.length > 0) {
        setChangePolygons(data.changeGeoJson);
        setIsChangeLayerVisible(true);
        showNotification("Detecção de mudança concluída!", "success");
      } else {
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
      const downloadInfosPromises = selectedImageIds.map(imageId =>
        fetch(`${API_BASE_URL}/api/earth-images/download-info`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageId, polygon: activeAoi.geometry })
        }).then(res => { if (!res.ok) throw new Error(`Falha ao obter info para ${imageId}`); return res.json(); })
      );
      const downloadInfos = await Promise.all(downloadInfosPromises);
      const fileBlobsPromises = downloadInfos.map(info =>
        fetch(info.downloadUrl).then(res => { if (!res.ok) throw new Error(`Falha ao baixar o arquivo ${info.fileName}`); return res.blob(); })
          .then(blob => ({ name: info.fileName, blob: blob }))
      );
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
        if (!kmlFile) {
          throw new Error('Nenhum arquivo .kml encontrado dentro do KMZ.');
        }
        kmlText = await kmlFile.async('string');
      } else {
        kmlText = await file.text();
      }
      const dom = new DOMParser().parseFromString(kmlText, 'text/xml');
      const geojson = togeojson.kml(dom) as FeatureCollection;
      const polygonFeature = geojson.features.find(
        (f): f is Feature => f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'
      );
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
      setIsChangeLayerVisible(prev => !prev);
    } else if (id.startsWith('index-')) {
      const indexName = id.replace('index-', '');
      const selectedIndex = calculatedIndices.find(i => i.indexName === indexName);
      if (selectedIndex) {
        setVisibleLayerUrl(prevUrl => prevUrl === selectedIndex.imageUrl ? null : selectedIndex.imageUrl);
      }
    } else {
      setSelectedImageIds(ids => ids.includes(id) ? ids.filter(i => i !== id) : [...ids, id]);
    }
  }, [calculatedIndices]);

  const handleDeleteAoi = useCallback(() => { setActiveAoi(null); setApiImages([]); setSelectedImageIds([]); resetAnalysisLayers(); }, [resetAnalysisLayers]);
  const handleToggleTheme = useCallback(() => setTheme(t => t === 'light' ? 'dark' : 'light'), []);

  useEffect(() => {
    if (notification) { const timer = setTimeout(() => setNotification(null), 4000); return () => clearTimeout(timer); }
  }, [notification]);

  useEffect(() => {
    if (activeAoi && satellite) {
      handleSearchImages(activeAoi.geometry);
    }
  }, [activeAoi, satellite]);

  let activeLayerId = null;
  if (isChangeLayerVisible) {
    activeLayerId = CHANGE_LAYER_ID;
  } else if (visibleLayerUrl) {
    const activeIndex = calculatedIndices.find(i => i.imageUrl === visibleLayerUrl);
    if (activeIndex) {
      activeLayerId = `index-${activeIndex.indexName}`;
    }
  }

  return (
    <div className={`app-container theme-${theme}`}>
      {loadingState !== 'idle' && <LoadingIndicator text="Processando..." subtext="Por favor, aguarde." />}
      {notification && <Notification message={notification.message} type={notification.type} onDismiss={() => setNotification(null)} />}
      <div className="module-navigation">
        <button className={activeModule === 'territorial' ? 'active' : ''} onClick={() => setActiveModule('territorial')}>Monitoramento Territorial</button>
        <button className={activeModule === 'clima' ? 'active' : ''} onClick={() => setActiveModule('clima')}>Monitoramento do Clima</button>
      </div>
      <div className="main-view">
        {activeModule === 'territorial' ? (
          <SidebarTerritorial
            dateFrom={dateFrom} onDateFromChange={setDateFrom}
            dateTo={dateTo} onDateToChange={setDateTo}
            cloudPct={cloudPct} onCloudPctChange={setCloudPct}
            satellite={satellite} onSatelliteChange={setSatellite}
            satellites={SATELLITES} theme={theme} loadingState={loadingState}
            selectedImageIds={selectedImageIds} onDetectChange={handleDetectChange}
            onBulkDownload={handleBulkDownload} onToggleTheme={handleToggleTheme}
            onAoiFileUpload={handleAoiFileUpload} onDeleteAoi={handleDeleteAoi}
            onCalculateIndices={handleCalculateIndices} selectedIndices={selectedIndices}
            onIndexChange={handleIndexChange}
            calculatedIndices={calculatedIndices} onVisibleIndexChange={setVisibleLayerUrl}
            changeThreshold={changeThreshold}
            onChangeThreshold={setChangeThreshold}
            changesGeoJson={changePolygons}
          />
        ) : (
          <SidebarClima theme={theme} onToggleTheme={handleToggleTheme}/>
        )}
        <main className="main-content">
          <MapView
            onDrawComplete={handleDrawComplete}
            visibleLayerUrl={visibleLayerUrl}
            previewLayerUrl={previewLayerUrl}
            activeAoi={activeAoi}
            changePolygons={isChangeLayerVisible ? changePolygons : null}
            baseMapKey={baseMapKey}
            onBaseMapChange={setBaseMapKey}
            mapViewTarget={mapViewTarget}
            differenceLayerUrl={differenceLayerUrl}
          />
          {activeModule === 'territorial' && carouselItems.length > 0 && (
            <ImageCarousel
              images={carouselItems} 
              selectedIds={selectedImageIds}
              onSelect={handleCarouselSelect}
              onPreview={handlePreviewImage}
              activeLayerId={activeLayerId}
            />
          )}
        </main>
      </div>
    </div>
  );
}