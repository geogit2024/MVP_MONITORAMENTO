// Caminho: src/App.tsx

import React, { useState, useCallback, useEffect } from 'react';
import L, { LatLngBoundsExpression } from 'leaflet';
import { Feature, Polygon, MultiPolygon } from 'geojson';
import Sidebar from './components/Sidebar';
import MapView from './components/MapView';
import ImageCarousel from './components/ImageCarousel';
import './App.css';
import togeojson from '@mapbox/togeojson';

export interface ImageInfo { id: string; date: string; thumbnailUrl: string; }
export interface NdviData { imageUrl: string; bounds: LatLngBoundsExpression; }

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const SATELLITES = ['LANDSAT_8', 'LANDSAT_9', 'SENTINEL_2A', 'SENTINEL_2B'];

interface NotificationProps { message: string; type: 'error' | 'success'; onDismiss: () => void; }
const Notification: React.FC<NotificationProps> = ({ message, type, onDismiss }) => {
    if (!message) return null;
    const baseStyle: React.CSSProperties = { position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)', padding: '12px 20px', borderRadius: '8px', color: 'white', zIndex: 9999, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', fontSize: '16px', cursor: 'pointer' };
    const styles = { error: { ...baseStyle, backgroundColor: '#d73027' }, success: { ...baseStyle, backgroundColor: '#1a9850' } };
    return <div style={styles[type] || styles.error} onClick={onDismiss}>{message}</div>;
};
interface LoadingIndicatorProps { text: string; subtext: string; }
const LoadingIndicator: React.FC<LoadingIndicatorProps> = ({ text, subtext }) => (
    <div className="progress-overlay"><div className="progress-spinner"></div><p>{text}</p><span>{subtext}</span></div>
);
declare const JSZip: any;

export default function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [dateFrom, setDateFrom] = useState('2024-05-01');
  const [dateTo, setDateTo] = useState('2024-05-31');
  const [cloudPct, setCloudPct] = useState(30);
  const [satellite, setSatellite] = useState('');
  const [imagesList, setImagesList] = useState<ImageInfo[]>([]);
  const [loadingState, setLoadingState] = useState<'idle' | 'searching' | 'calculatingNdvi' | 'detectingChange' | 'downloading'>('idle');
  const [selectedImageIds, setSelectedImageIds] = useState<string[]>([]);
  const [activeAoi, setActiveAoi] = useState<Feature | null>(null);
  const [ndviData, setNdviData] = useState<NdviData | null>(null);
  const [changePolygons, setChangePolygons] = useState<Feature | null>(null);
  const [notification, setNotification] = useState<{ message: string, type: 'error' | 'success' } | null>(null);
  const [baseMapKey, setBaseMapKey] = useState<string>('satellite');
  const [mapViewTarget, setMapViewTarget] = useState<LatLngBoundsExpression | null>(null);

  const showNotification = useCallback((message: string, type: 'error' | 'success') => {
    setNotification({ message, type });
  }, []);

  useEffect(() => {
    if (notification) {
        const timer = setTimeout(() => setNotification(null), 4000);
        return () => clearTimeout(timer);
    }
  }, [notification]);

  const handleSearchImages = useCallback(async (geometry: Feature['geometry'] | null | undefined) => {
      if (!geometry || !geometry.coordinates || geometry.coordinates.length === 0) { showNotification('Geometria inválida.', 'error'); setLoadingState('idle'); return; }
      if (!satellite) { showNotification('Selecione um satélite.', 'error'); return; }
      setLoadingState('searching');
      setImagesList([]); setSelectedImageIds([]); setNdviData(null); setChangePolygons(null);
      try {
        const resp = await fetch(`${API_BASE_URL}/api/earth-images/search`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dateFrom, dateTo, cloudPct, satellite, polygon: geometry }) });
        if (!resp.ok) { const err = await resp.json(); throw new Error(err.detail || 'Erro no servidor'); }
        const data = await resp.json() as ImageInfo[];
        setImagesList(data);
        showNotification(data.length > 0 ? `${data.length} imagens encontradas!` : `Nenhuma imagem encontrada.`, data.length > 0 ? 'success' : 'error');
      } catch (err: any) {
        showNotification(err.message || 'Erro ao buscar imagens.', 'error');
      } finally {
        setLoadingState('idle');
      }
    }, [dateFrom, dateTo, cloudPct, satellite, showNotification]);

  const handleDrawComplete = useCallback((feature: Feature) => {
    setActiveAoi(feature);
    handleSearchImages(feature.geometry);
    setMapViewTarget(L.geoJSON(feature).getBounds());
  }, [handleSearchImages]);
  
  const handleAoiFileUpload = useCallback(async (file: File | null) => {
    if (!file) return;
    setLoadingState('searching');
    showNotification(`Processando arquivo...`, 'success');
    try {
      let fileContent: string;
      if (file.name.toLowerCase().endsWith('.kmz') || file.name.toLowerCase().endsWith('.zip')) {
        const zip = await JSZip.loadAsync(file);
        const kmlFile = Object.keys(zip.files).find(name => name.toLowerCase().endsWith('.kml'));
        if (!kmlFile) throw new Error("Arquivo KML não encontrado no ZIP/KMZ.");
        fileContent = await zip.file(kmlFile).async('string');
      } else { fileContent = await file.text(); }
      const dom = new DOMParser().parseFromString(fileContent, 'text/xml');
      const geojson = togeojson.kml(dom);
      const validFeature = geojson?.features?.find(f => f.geometry && ['Polygon', 'MultiPolygon'].includes(f.geometry.type)) as Feature<Polygon | MultiPolygon> | undefined;
      if (validFeature) {
        showNotification("AOI carregada!", 'success');
        setActiveAoi(validFeature);
        handleSearchImages(validFeature.geometry);
        setMapViewTarget(L.geoJSON(validFeature).getBounds());
      } else {
        throw new Error("O arquivo KML não contém um polígono válido.");
      }
    } catch (err: any) {
      showNotification(err.message || "Erro ao processar arquivo.", 'error');
      setLoadingState('idle');
    }
  }, [handleSearchImages, showNotification]);

  const handleImageSelect = useCallback((imageId: string) => {
    setSelectedImageIds(ids => 
      ids.includes(imageId) 
        ? ids.filter(id => id !== imageId)
        : [...ids, imageId]
    );
  }, []);
  
  const handleDeleteAoi = useCallback(() => { setActiveAoi(null); setImagesList([]); setNdviData(null); setChangePolygons(null); setSelectedImageIds([]) }, []);
  const handleToggleTheme = useCallback(() => setTheme(t => t === 'light' ? 'dark' : 'light'), []);

  const handleCalculateNdvi = useCallback(async () => {
    if (selectedImageIds.length === 0) { showNotification("Selecione uma imagem.", 'error'); return; }
    if (!activeAoi) { showNotification("Defina uma AOI.", 'error'); return; }
    setLoadingState('calculatingNdvi');
    try {
      const res = await fetch(`${API_BASE_URL}/api/earth-images/ndvi`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imageId: selectedImageIds[0], satellite, polygon: activeAoi.geometry }) });
      if (!res.ok) { const err = await res.json(); throw new Error(err.detail || 'Erro no servidor'); }
      const data = await res.json();
      setNdviData({ imageUrl: data.clippedImageUrl, bounds: data.bounds });
      showNotification("NDVI gerado!", 'success');
      if (data.downloadUrl) window.open(data.downloadUrl, '_blank');
    } catch (error: any) {
      showNotification(error.message || "Erro ao gerar NDVI.", 'error');
    } finally {
      setLoadingState('idle');
    }
  }, [selectedImageIds, satellite, activeAoi, showNotification]);

  const handleDetectChange = useCallback(async () => {
    if (selectedImageIds.length < 2) { showNotification("Selecione ao menos duas imagens.", 'error'); return; }
    if (!activeAoi) { showNotification("Defina uma AOI.", 'error'); return; }
    setLoadingState('detectingChange');
    try {
      const beforeImageId = selectedImageIds[0];
      const afterImageId = selectedImageIds[selectedImageIds.length - 1];
      const res = await fetch(`${API_BASE_URL}/api/earth-images/change-detection`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ beforeImageId, afterImageId, satellite, polygon: activeAoi.geometry }) });
      if (!res.ok) { const err = await res.json(); throw new Error(err.detail || 'Erro no servidor'); }
      const data = await res.json();
      setChangePolygons(data.changeGeoJson);
      showNotification("Análise de mudanças concluída!", 'success');
    } catch (error: any) {
      showNotification(error.message || "Erro na análise.", 'error');
    } finally {
      setLoadingState('idle');
    }
  }, [selectedImageIds, satellite, activeAoi, showNotification]);

  const handleBulkDownload = useCallback(async () => {
    if (selectedImageIds.length === 0) { showNotification("Selecione imagens para baixar.", 'error'); return; }
    if (!activeAoi) { showNotification("Defina uma AOI.", 'error'); return; }
    setLoadingState('downloading');
    try {
      const res = await fetch(`${API_BASE_URL}/api/earth-images/download-bulk`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imageIds: selectedImageIds, satellite, polygon: activeAoi.geometry }) });
      if (!res.ok) { const err = await res.json(); throw new Error(err.detail || 'Erro no servidor'); }
      const { downloads } = await res.json();
      downloads.forEach((file: { downloadUrl: string }) => window.open(file.downloadUrl, '_blank'));
      showNotification(`Download de ${downloads.length} imagens iniciado!`, 'success');
    } catch (err: any) {
      showNotification(err.message || 'Erro ao baixar imagens.', 'error');
    } finally {
      setLoadingState('idle');
    }
  }, [selectedImageIds, satellite, activeAoi, showNotification]);

  const getLoadingText = () => {
    const states = {
      searching: { text: "Buscando imagens...", subtext: "Por favor, aguarde." },
      calculatingNdvi: { text: "Processando NDVI...", subtext: "Pode levar alguns segundos." },
      detectingChange: { text: "Analisando mudanças...", subtext: "Comparando imagens." },
      downloading: { text: "Preparando downloads...", subtext: "Gerando links."}
    };
    return loadingState !== 'idle' ? states[loadingState] : null;
  };
  
  return (
    <div className={`theme-${theme}`} style={{ display: 'flex', height: '100vh' }}>
      {getLoadingText() && <LoadingIndicator {...getLoadingText()!} />}
      <Notification message={notification?.message} type={notification?.type} onDismiss={() => setNotification(null)} />
      <Sidebar
        dateFrom={dateFrom} onDateFromChange={setDateFrom}
        dateTo={dateTo} onDateToChange={setDateTo}
        cloudPct={cloudPct} onCloudPctChange={setCloudPct}
        satellite={satellite} onSatelliteChange={setSatellite}
        satellites={SATELLITES}
        imagesList={imagesList}
        theme={theme}
        loadingState={loadingState}
        selectedImageIds={selectedImageIds}
        onCalculateNdvi={handleCalculateNdvi}
        onDetectChange={handleDetectChange}
        onBulkDownload={handleBulkDownload}
        onAoiFileUpload={handleAoiFileUpload}
        onToggleTheme={handleToggleTheme}
        onDeleteAoi={handleDeleteAoi}
      />
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <MapView
          onDrawComplete={handleDrawComplete}
          ndviData={ndviData}
          activeAoi={activeAoi}
          changePolygons={changePolygons}
          baseMapKey={baseMapKey}
          onBaseMapChange={setBaseMapKey}
          mapViewTarget={mapViewTarget}
        />
        {imagesList.length > 0 && (
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 1002, padding: '0 10px 10px 10px' }}>
            <ImageCarousel images={imagesList} selectedIds={selectedImageIds} onSelect={handleImageSelect} />
          </div>
        )}
      </div>
    </div>
  );
}