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

// --- Interfaces, Constantes e Componentes Auxiliares (sem alterações) ---
export interface ImageInfo { id: string; date: string; thumbnailUrl: string; }
export interface IndexData { imageUrl: string; bounds: LatLngBoundsExpression; }
interface NotificationProps { message: string; type: 'error' | 'success'; onDismiss: () => void; }
interface LoadingIndicatorProps { text: string; subtext: string; }

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const SATELLITES = ['LANDSAT_8', 'LANDSAT_9', 'SENTINEL_2A', 'SENTINEL_2B'];

const Notification: React.FC<NotificationProps> = ({ message, type, onDismiss }) => {
    if (!message) return null;
    const baseStyle: React.CSSProperties = { position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)', padding: '12px 20px', borderRadius: '8px', color: 'white', zIndex: 9999, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', fontSize: '16px', cursor: 'pointer' };
    const styles = { error: { ...baseStyle, backgroundColor: '#dc3545' }, success: { ...baseStyle, backgroundColor: '#198754' } };
    return <div style={styles[type] || styles.error} onClick={onDismiss}>{message}</div>;
};
const LoadingIndicator: React.FC<LoadingIndicatorProps> = ({ text, subtext }) => (
    <div className="progress-overlay"><div className="progress-spinner"></div><p>{text}</p><span>{subtext}</span></div>
);

declare const JSZip: any;

// --- Componente Principal ---
export default function App() {
  const [activeModule, setActiveModule] = useState<'territorial' | 'clima'>('territorial');
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [dateFrom, setDateFrom] = useState('2025-05-01');
  const [dateTo, setDateTo] = useState('2025-06-30');
  const [cloudPct, setCloudPct] = useState(30);
  const [satellite, setSatellite] = useState('');
  const [imagesList, setImagesList] = useState<ImageInfo[]>([]);
  const [loadingState, setLoadingState] = useState<'idle' | 'searching' | 'calculating' | 'detectingChange' | 'downloading'>('idle');
  const [selectedImageIds, setSelectedImageIds] = useState<string[]>([]);
  const [activeAoi, setActiveAoi] = useState<Feature | null>(null);
  const [indexData, setIndexData] = useState<IndexData | null>(null);
  const [changePolygons, setChangePolygons] = useState<Feature | null>(null);
  const [notification, setNotification] = useState<{ message: string, type: 'error' | 'success' } | null>(null);
  const [baseMapKey, setBaseMapKey] = useState<string>('satellite');
  const [mapViewTarget, setMapViewTarget] = useState<LatLngBoundsExpression | null>(null);
  const [selectedIndices, setSelectedIndices] = useState<string[]>(['NDVI']);

  // --- Funções de Manipulação (Handlers) ---
  const showNotification = useCallback((message: string, type: 'error' | 'success') => { setNotification({ message, type }); }, []);
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
    setImagesList([]); setSelectedImageIds([]); setIndexData(null); setChangePolygons(null);
    try {
      const resp = await fetch(`${API_BASE_URL}/api/earth-images/search`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dateFrom, dateTo, cloudPct, satellite, polygon: geometry }) });
      if (!resp.ok) { const err = await resp.json(); throw new Error(err.detail || 'Erro no servidor'); }
      const data = await resp.json() as ImageInfo[];
      setImagesList(data);
      showNotification(data.length > 0 ? `${data.length} imagens encontradas.` : `Nenhuma imagem encontrada.`, data.length > 0 ? 'success' : 'error');
    } catch (err: any) {
      showNotification(err.message || 'Erro ao buscar imagens.', 'error');
    } finally {
      setLoadingState('idle');
    }
  }, [dateFrom, dateTo, cloudPct, satellite, showNotification]);

  const handleIndexChange = useCallback((indexName: string, isChecked: boolean) => {
    setSelectedIndices(prev => isChecked ? [...prev, indexName] : prev.filter(i => i !== indexName));
  }, []);

  const handleCalculateIndices = useCallback(async () => {
    if (selectedImageIds.length === 0 || !activeAoi) { showNotification("Selecione uma imagem e defina uma AOI.", "error"); return; }
    if (selectedIndices.length === 0) { showNotification("Selecione pelo menos um índice para calcular.", "error"); return; }
    setLoadingState('calculating');
    setChangePolygons(null); 
    try {
      const imageId = selectedImageIds[0];
      const res = await fetch(`${API_BASE_URL}/api/earth-images/indices`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageId, satellite, polygon: activeAoi.geometry, indices: selectedIndices })
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.detail || "Falha ao calcular os índices"); }
      const data = await res.json();
      if (data.results && data.results.length > 0) {
        const firstResult = data.results[0];
        setIndexData({ imageUrl: firstResult.imageUrl, bounds: data.bounds });
        setMapViewTarget(data.bounds);
        showNotification(`${data.results.length} índice(s) calculado(s)!`, "success");
      } else {
        throw new Error("A API não retornou resultados para os índices solicitados.");
      }
    } catch (error: any) {
      showNotification(error.message || "Erro ao calcular os índices.", "error");
    } finally {
      setLoadingState('idle');
    }
  }, [selectedImageIds, satellite, activeAoi, selectedIndices, showNotification]);

  const handleDetectChange = useCallback(async () => {
    if (selectedImageIds.length !== 2) { showNotification("Selecione exatamente duas imagens para a detecção de mudança.", "error"); return; }
    if (!activeAoi) { showNotification("Defina uma Área de Interesse (AOI) primeiro.", "error"); return; }
    setLoadingState('detectingChange');
    setIndexData(null);
    try {
      const selectedImages = imagesList.filter(img => selectedImageIds.includes(img.id)).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      const res = await fetch(`${API_BASE_URL}/api/earth-images/change-detection`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ beforeImageId: selectedImages[0].id, afterImageId: selectedImages[1].id, satellite, polygon: activeAoi.geometry })
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.detail || "Falha ao detectar mudanças"); }
      const data = await res.json();
      setChangePolygons(data.changeGeoJson);
      showNotification("Detecção de mudança concluída!", "success");
    } catch (error: any) {
      showNotification(error.message || "Ocorreu um erro ao detectar as mudanças.", "error");
    } finally {
      setLoadingState('idle');
    }
  }, [activeAoi, imagesList, selectedImageIds, satellite, showNotification]);

  const handleBulkDownload = useCallback(async () => {
    if (selectedImageIds.length === 0 || !activeAoi) { showNotification("Selecione ao menos uma imagem e defina uma AOI.", "error"); return; }
    setLoadingState('downloading');
    try {
      const res = await fetch(`${API_BASE_URL}/api/earth-images/download-bulk`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageIds: selectedImageIds, satellite, polygon: activeAoi.geometry })
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.detail || "Falha ao preparar downloads."); }
      const data = await res.json();
      data.downloads.forEach((link: { downloadUrl: string }) => { window.open(link.downloadUrl, '_blank'); });
      showNotification(`${data.downloads.length} download(s) iniciado(s).`, "success");
    } catch (error: any) {
      showNotification(error.message || "Erro ao iniciar downloads.", "error");
    } finally {
      setLoadingState('idle');
    }
  }, [selectedImageIds, satellite, activeAoi, showNotification]);

  const handleAoiFileUpload = useCallback(async (file: File | null) => {
    if (!file) return;
    const processKml = (kmlText: string) => {
      try {
        const dom = new DOMParser().parseFromString(kmlText, 'text/xml');
        const geojson = togeojson.kml(dom) as FeatureCollection;
        const firstPolygon = geojson.features.find(f => f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon');
        if (firstPolygon) setAoiAndZoom(firstPolygon);
        else showNotification("Nenhum polígono encontrado no arquivo KML.", "error");
      } catch (e) { showNotification("Erro ao processar o arquivo KML.", "error"); }
    };
    if (file.name.toLowerCase().endsWith('.kml')) { file.text().then(processKml); }
    else if (file.name.toLowerCase().endsWith('.kmz')) {
      if (typeof JSZip === 'undefined') { showNotification("Biblioteca JSZip não carregada.", "error"); return; }
      const zip = await JSZip.loadAsync(await file.arrayBuffer());
      const kmlFile = zip.file(/^(?![_]).*\.kml$/i)[0];
      if (kmlFile) processKml(await kmlFile.async('string'));
      else showNotification("Nenhum .kml válido encontrado dentro do .kmz.", "error");
    } else { showNotification("Formato de arquivo não suportado. Use .kml ou .kmz.", "error"); }
  }, [showNotification, setAoiAndZoom]);

  const handleDrawComplete = useCallback((feature: Feature) => setAoiAndZoom(feature), [setAoiAndZoom]);
  const handleImageSelect = useCallback((id: string) => setSelectedImageIds(ids => ids.includes(id) ? ids.filter(i => i !== id) : [...ids, id]), []);
  const handleDeleteAoi = useCallback(() => { setActiveAoi(null); setImagesList([]); setIndexData(null); setChangePolygons(null); setSelectedImageIds([]); }, []);
  const handleToggleTheme = useCallback(() => setTheme(t => t === 'light' ? 'dark' : 'light'), []);

  // --- Efeitos ---
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  useEffect(() => {
    if (activeAoi && satellite) {
      handleSearchImages(activeAoi.geometry);
    }
  }, [activeAoi, satellite, handleSearchImages]);

  // --- Renderização do Componente com a Estrutura Corrigida ---
  return (
    <div className={`app-container theme-${theme}`}>
      {loadingState !== 'idle' && <LoadingIndicator text="Processando..." subtext="Por favor, aguarde." />}
      {notification && <Notification message={notification.message} type={notification.type} onDismiss={() => setNotification(null)} />}
      
      <div className="module-navigation">
        <button 
          className={activeModule === 'territorial' ? 'active' : ''}
          onClick={() => setActiveModule('territorial')}
        >
          Monitoramento Territorial
        </button>
        <button 
          className={activeModule === 'clima' ? 'active' : ''}
          onClick={() => setActiveModule('clima')}
        >
          Monitoramento do Clima
        </button>
      </div>

      <div className="main-view">
        {activeModule === 'territorial' ? (
          <SidebarTerritorial
            dateFrom={dateFrom} onDateFromChange={setDateFrom}
            dateTo={dateTo} onDateToChange={setDateTo}
            cloudPct={cloudPct} onCloudPctChange={setCloudPct}
            satellite={satellite} onSatelliteChange={setSatellite}
            satellites={SATELLITES}
            theme={theme}
            loadingState={loadingState}
            selectedImageIds={selectedImageIds}
            onDetectChange={handleDetectChange}
            onBulkDownload={handleBulkDownload}
            onToggleTheme={handleToggleTheme}
            onAoiFileUpload={handleAoiFileUpload}
            onDeleteAoi={handleDeleteAoi}
            onCalculateIndices={handleCalculateIndices}
            selectedIndices={selectedIndices}
            onIndexChange={handleIndexChange}
          />
        ) : (
          <SidebarClima
            theme={theme}
            onToggleTheme={handleToggleTheme}
          />
        )}
        
        <main className="main-content">
          <MapView
            onDrawComplete={handleDrawComplete}
            indexData={indexData}
            activeAoi={activeAoi}
            changePolygons={changePolygons}
            baseMapKey={baseMapKey}
            onBaseMapChange={setBaseMapKey}
            mapViewTarget={mapViewTarget}
          />
          {activeModule === 'territorial' && imagesList.length > 0 && (
            <ImageCarousel
              images={imagesList}
              selectedIds={selectedImageIds}
              onSelect={handleImageSelect}
            />
          )}
        </main>
      </div>
    </div>
  );
}
