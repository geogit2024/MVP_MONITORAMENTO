// src/App.tsx

import React, { useState, useCallback, useEffect } from 'react';
import L, { LatLngBoundsExpression } from 'leaflet';
import { Feature, FeatureCollection } from 'geojson';

// Importa os componentes da interface
import SidebarTerritorial from './components/Sidebar';
import SidebarClima from './components/SidebarClima';
import MapView from './components/MapView';
import ImageCarousel from './components/ImageCarousel';

// Importa estilos e bibliotecas auxiliares
import './App.css';
import togeojson from '@mapbox/togeojson';
import JSZip from 'jszip';

// --- DEFINIÇÃO DE TIPOS E INTERFACES ---
// Define a estrutura de um objeto de imagem para o carrossel e API
export interface ImageInfo { id: string; date: string; thumbnailUrl: string; }
// Define a estrutura do resultado de uma análise de índice
export interface IndexResult { indexName: string; imageUrl: string; downloadUrl: string; }
// Define a estrutura para as props do componente de Notificação
interface NotificationProps { message: string; type: 'error' | 'success'; onDismiss: () => void; }
// Define a estrutura para as props do componente de Loading
interface LoadingIndicatorProps { text: string; subtext: string; }

// --- CONSTANTES GLOBAIS ---
// URL base da nossa API de backend
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
// Lista de satélites suportados pela aplicação
const SATELLITES = ['LANDSAT_8', 'LANDSAT_9', 'SENTINEL_2A', 'SENTINEL_2B'];

// ID e ícone para a camada virtual de "Detecção de Mudança" no carrossel
const CHANGE_LAYER_ID = 'change-detection-result';
const CHANGE_LAYER_ICON_URI = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23ffffff' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolygon points='12 2 2 7 12 12 22 7 12 2'%3E%3C/polygon%3E%3Cpolyline points='2 17 12 22 22 17'%3E%3C/polyline%3E%3Cpolyline points='2 12 12 17 22 12'%3E%3C/polyline%3E%3C/svg%3E";

// ID e ícone para as camadas virtuais de "Índices" no carrossel
const INDEX_LAYER_ICON_URI = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23ffffff' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='3' width='18' height='18' rx='2' ry='2'%3E%3C/rect%3E%3Cline x1='3' y1='9' x2='21' y2='9'%3E%3C/line%3E%3Cline x1='9' y1='21' x2='9' y2='9'%3E%3C/line%3E%3C/svg%3E";

// --- COMPONENTES AUXILIARES ---

/**
 * Componente funcional para exibir notificações temporárias (sucesso ou erro).
 */
const Notification: React.FC<NotificationProps> = ({ message, type, onDismiss }) => {
    if (!message) return null;
    const baseStyle: React.CSSProperties = { position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)', padding: '12px 20px', borderRadius: '8px', color: 'white', zIndex: 9999, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', fontSize: '16px', cursor: 'pointer' };
    const styles = { error: { ...baseStyle, backgroundColor: '#dc3545' }, success: { ...baseStyle, backgroundColor: '#198754' } };
    return <div style={styles[type] || styles.error} onClick={onDismiss}>{message}</div>;
};

/**
 * Componente funcional para exibir um indicador de carregamento (spinner) sobre a tela.
 */
const LoadingIndicator: React.FC<LoadingIndicatorProps> = ({ text, subtext }) => (
    <div className="progress-overlay"><div className="progress-spinner"></div><p>{text}</p><span>{subtext}</span></div>
);

// --- COMPONENTE PRINCIPAL DA APLICAÇÃO ---
export default function App() {
  // --- ESTADOS DA APLICAÇÃO ---
  
  // Estado para controlar qual módulo está ativo: Territorial ou Clima
  const [activeModule, setActiveModule] = useState<'territorial' | 'clima'>('territorial');
  // Estado para o tema da aplicação (claro ou escuro)
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');

  // Estados para os filtros de busca de imagens
  const [dateFrom, setDateFrom] = useState('2025-05-01');
  const [dateTo, setDateTo] = useState('2025-06-30');
  const [cloudPct, setCloudPct] = useState(30);
  const [satellite, setSatellite] = useState('');

  // Estados para os dados e UI
  const [apiImages, setApiImages] = useState<ImageInfo[]>([]); // Lista de imagens "puras" vindas da API
  const [carouselItems, setCarouselItems] = useState<ImageInfo[]>([]); // Lista de itens a serem exibidos no carrossel (imagens + análises)
  const [loadingState, setLoadingState] = useState<'idle' | 'searching' | 'calculating' | 'detectingChange' | 'downloading' | 'loading_preview'>('idle');
  const [selectedImageIds, setSelectedImageIds] = useState<string[]>([]); // IDs das imagens selecionadas para análise
  const [activeAoi, setActiveAoi] = useState<Feature | null>(null); // Geometria da Área de Interesse
  
  // Estados para os resultados das análises
  const [calculatedIndices, setCalculatedIndices] = useState<IndexResult[]>([]); // Resultados do cálculo de índices
  const [visibleLayerUrl, setVisibleLayerUrl] = useState<string | null>(null); // URL da camada de índice visível
  const [previewLayerUrl, setPreviewLayerUrl] = useState<string | null>(null); // URL da camada de pré-visualização de imagem
  const [changePolygons, setChangePolygons] = useState<Feature | null>(null); // GeoJSON dos polígonos de mudança
  const [differenceLayerUrl, setDifferenceLayerUrl] = useState<string | null>(null); // URL da camada de diferença (raster) da deteção de mudança
  const [isChangeLayerVisible, setIsChangeLayerVisible] = useState(false); // Controla a visibilidade dos polígonos de mudança

  // Estados para UI e feedback ao utilizador
  const [notification, setNotification] = useState<{ message: string, type: 'error' | 'success' } | null>(null);
  const [baseMapKey, setBaseMapKey] = useState<string>('satellite'); // Chave para o mapa base ativo
  const [mapViewTarget, setMapViewTarget] = useState<LatLngBoundsExpression | null>(null); // Coordenadas para o foco do mapa

  // Estados para os parâmetros de análise
  const [selectedIndices, setSelectedIndices] = useState<string[]>(['NDVI']); // Lista de índices a serem calculados
  const [changeThreshold, setChangeThreshold] = useState(0.25); // Limiar de sensibilidade para deteção de mudança

  /**
   * Efeito que mantém o carrossel sincronizado.
   * Ele combina os resultados das análises (mudança e índices) com as imagens da API
   * para criar a lista final de itens a serem exibidos no carrossel.
   * É executado sempre que a lista de imagens, os polígonos de mudança ou os índices calculados mudam.
   */
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

  /**
   * Função para exibir uma notificação na tela.
   * O useCallback memoriza a função para evitar recriações desnecessárias.
   */
  const showNotification = useCallback((message: string, type: 'error' | 'success') => { setNotification({ message, type }); }, []);
  
  /**
   * Reseta o estado de todas as camadas de análise.
   * Usado antes de iniciar uma nova busca ou ao apagar a AOI.
   */
  const resetAnalysisLayers = useCallback(() => {
    setCalculatedIndices([]);
    setVisibleLayerUrl(null);
    setChangePolygons(null);
    setPreviewLayerUrl(null);
    setDifferenceLayerUrl(null);
    setIsChangeLayerVisible(false);
  }, []);

  /**
   * Define a Área de Interesse (AOI) e ajusta o zoom do mapa para ela.
   * @param feature - O objeto GeoJSON da área desenhada ou carregada.
   */
  const setAoiAndZoom = useCallback((feature: Feature) => {
    if (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') {
      setActiveAoi(feature);
      setMapViewTarget(L.geoJSON(feature).getBounds());
      showNotification("Área de Interesse definida!", "success");
    } else {
      showNotification("Nenhum polígono válido encontrado.", "error");
    }
  }, [showNotification]);

  /**
   * Executa a busca por imagens de satélite na API backend.
   * @param geometry - A geometria da AOI para a busca.
   */
  const handleSearchImages = useCallback(async (geometry: Feature['geometry']) => {
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

  /**
   * Atualiza a lista de índices selecionados pelo utilizador nas checkboxes.
   */
  const handleIndexChange = useCallback((indexName: string, isChecked: boolean) => {
    setSelectedIndices(prev => isChecked ? [...new Set([...prev, indexName])] : prev.filter(i => i !== indexName));
  }, []);

  /**
   * Dispara o cálculo de índices de vegetação no backend.
   */
  const handleCalculateIndices = useCallback(async () => {
    if (selectedImageIds.length === 0 || !activeAoi) { showNotification("Selecione uma imagem e defina uma AOI.", "error"); return; }
    if (selectedIndices.length === 0) { showNotification("Selecione pelo menos um índice para calcular.", "error"); return; }
    setLoadingState('calculating');
    
    // Limpa apenas os resultados de análises anteriores que podem sobrepor
    setPreviewLayerUrl(null);
    setDifferenceLayerUrl(null);
    setIsChangeLayerVisible(false);

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
        throw new Error("A API não retornou resultados para os índices solicitados.");
      }
    } catch (error: any) {
      showNotification(error.message || "Erro ao calcular os índices.", "error");
    } finally {
      setLoadingState('idle');
    }
  }, [selectedImageIds, satellite, activeAoi, selectedIndices, showNotification]);

  /**
   * Mostra uma pré-visualização de uma imagem de satélite original no mapa.
   */
  const handlePreviewImage = useCallback(async (imageId: string) => {
    if (!activeAoi || !satellite) { showNotification("Defina uma AOI e selecione um satélite primeiro.", "error"); return; }
    setLoadingState('loading_preview');
    // Limpa outras camadas de análise para que a pré-visualização seja visível
    setVisibleLayerUrl(null);
    setDifferenceLayerUrl(null);
    setIsChangeLayerVisible(false);
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

  /**
   * Dispara a análise de deteção de mudanças entre duas imagens.
   */
  const handleDetectChange = useCallback(async () => {
    if (selectedImageIds.length !== 2) { showNotification("Selecione exatamente duas imagens para a detecção de mudança.", "error"); return; }
    if (!activeAoi) { showNotification("Defina uma Área de Interesse (AOI) primeiro.", "error"); return; }
    setLoadingState('detectingChange');

    // Limpa outras camadas de análise para que o resultado seja visível
    setPreviewLayerUrl(null);
    setVisibleLayerUrl(null);

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
      
      setDifferenceLayerUrl(data.differenceImageUrl);
      
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

  /**
   * Prepara e inicia o download em massa das imagens selecionadas como um ficheiro .zip.
   */
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
  
  /**
   * Lida com o upload de um ficheiro KML/KMZ para definir a AOI.
   */
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

  /**
   * Callback para quando uma forma é desenhada no mapa.
   */
  const handleDrawComplete = useCallback((feature: Feature) => setAoiAndZoom(feature), [setAoiAndZoom]);
  
  /**
   * Lida com cliques nos itens do carrossel, seja para selecionar uma imagem para análise
   * ou para alternar a visibilidade de uma camada de resultado.
   */
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

  /**
   * Apaga a AOI ativa e limpa todos os dados relacionados.
   */
  const handleDeleteAoi = useCallback(() => { setActiveAoi(null); setApiImages([]); setSelectedImageIds([]); resetAnalysisLayers(); }, [resetAnalysisLayers]);
  
  /**
   * Alterna o tema da aplicação entre claro e escuro.
   */
  const handleToggleTheme = useCallback(() => setTheme(t => t === 'light' ? 'dark' : 'light'), []);

  /**
   * Efeito para gerir a exibição e o desaparecimento automático das notificações.
   */
  useEffect(() => {
    if (notification) { const timer = setTimeout(() => setNotification(null), 4000); return () => clearTimeout(timer); }
  }, [notification]);

  /**
   * Efeito que dispara automaticamente a busca por imagens quando a AOI ou o satélite mudam.
   */
  useEffect(() => {
    if (activeAoi && satellite) {
      handleSearchImages(activeAoi.geometry);
    }
  }, [activeAoi, satellite, handleSearchImages]);

  // --- LÓGICA DE RENDERIZAÇÃO ---
  
  // Lógica para determinar qual camada de análise está ativa para o destaque no carrossel
  let activeLayerId = null;
  if (isChangeLayerVisible) {
    activeLayerId = CHANGE_LAYER_ID;
  } else if (visibleLayerUrl) {
    const activeIndex = calculatedIndices.find(i => i.imageUrl === visibleLayerUrl);
    if (activeIndex) {
      activeLayerId = `index-${activeIndex.indexName}`;
    }
  }

  // Lógica para determinar a ordem de empilhamento (z-index) das camadas no mapa
  const Z_INDEX = {
    BASE: 10,
    DIFFERENCE_MAP: 12,
    PREVIEW: 15,
    ACTIVE: 20 // A camada ativa fica sempre no topo
  };
  const activeIndexFromId = calculatedIndices.find(i => `index-${i.indexName}` === activeLayerId);
  const indexLayerZIndex = activeIndexFromId?.imageUrl === visibleLayerUrl ? Z_INDEX.ACTIVE : Z_INDEX.BASE;
  const differenceLayerZIndex = activeLayerId === CHANGE_LAYER_ID ? Z_INDEX.ACTIVE : Z_INDEX.DIFFERENCE_MAP;

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
            calculatedIndices={calculatedIndices} 
            onVisibleIndexChange={setVisibleLayerUrl}
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
            indexLayerZIndex={indexLayerZIndex}
            differenceLayerZIndex={differenceLayerZIndex}
            previewLayerZIndex={Z_INDEX.PREVIEW}
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