// src/components/Sidebar.tsx

// Importações originais e novas adições
import React, { useState } from 'react';
import { IndexResult } from '../MainApplication';
import IndicesInfoPanel from './IndicesInfoPanel';
import SatelliteInfoPanel from './SatelliteInfoPanel'; // Adicionado
import './Sidebar.css';

// Constante original
const availableIndices = [
  'NDVI', 'SAVI', 'MSAVI', 'SR', 'Green NDVI', 'Red-Edge NDVI',
  'VARI', 'TSAVI', 'PVI', 'MTVI2', 'RTVIcore', 'CI Red-Edge', 'CI Green'
];

// Interface original
interface SidebarProps {
  dateFrom: string; onDateFromChange: (v: string) => void;
  dateTo: string; onDateToChange: (v: string) => void;
  cloudPct: number; onCloudPctChange: (v: number) => void;
  satellite: string; onSatelliteChange: (v: string) => void;
  satellites: string[];
  theme: 'light' | 'dark';
  loadingState: string;
  selectedImageIds: string[];
  onDetectChange: () => void;
  onBulkDownload: () => void;
  onToggleTheme: () => void;
  onAoiFileUpload: (file: File | null) => void;
  onDeleteAoi: () => void;
  onCalculateIndices: () => void;
  selectedIndices: string[];
  onIndexChange: (indexName: string, isChecked: boolean) => void;
  calculatedIndices: IndexResult[];
  onVisibleIndexChange: (url: string | null) => void;
  changeThreshold: number;
  onChangeThreshold: (value: number) => void;
  landCoverContent?: React.ReactNode;
  isToolsBarVisible: boolean;
  onToggleToolsBarVisibility: () => void;
}

// Componente principal, mantendo todos os props originais
export default function SidebarTerritorial({
  dateFrom, onDateFromChange, dateTo, onDateToChange, cloudPct, onCloudPctChange,
  satellite, onSatelliteChange, satellites, theme, loadingState, selectedImageIds,
  onDetectChange, onBulkDownload, onToggleTheme, onAoiFileUpload, onDeleteAoi,
  onCalculateIndices, selectedIndices, onIndexChange,
  calculatedIndices, onVisibleIndexChange,
  changeThreshold, onChangeThreshold, landCoverContent,
  isToolsBarVisible, onToggleToolsBarVisibility
}: SidebarProps) {
  
  // Estado original
  const [isInfoPanelVisible, setInfoPanelVisible] = useState(false);
  // Novo estado adicionado
  const [isSatelliteInfoVisible, setSatelliteInfoVisible] = useState(false);

  // Lógica original do componente
  const selectionCount = selectedImageIds.length;
  const isProcessing = loadingState !== 'idle';
  const canDetectChange = !isProcessing && selectedImageIds.length === 2;
  const isLandsat = satellite.startsWith('LANDSAT');

  return (
    // Estrutura JSX original, usando Fragment <>
    <>
      <aside className="sidebar-container">
        <div className="sidebar-header">
          <button onClick={onToggleTheme} title="Alternar Tema" className="theme-toggle-button">
            <img src="/logo.png" alt="Campos Conectados" className="theme-toggle-logo" />
          </button>
        </div>
        <div className="sidebar-content">
          <fieldset disabled={isProcessing} className="filter-group">
            <legend>Área de Interesse (AOI)</legend>
            <label>Carregar KML/KMZ:<input type="file" accept=".kml,.kmz" onChange={e => onAoiFileUpload(e.target.files ? e.target.files[0] : null)}/></label>
            <button onClick={onDeleteAoi} disabled={isProcessing} className="button button-danger">Deletar AOI</button>
          </fieldset>
          <hr className="sidebar-divider"/>
          <fieldset className="filter-group">
            <legend>Ferramentas do Mapa</legend>
            <button
              type="button"
              className="button button-secondary"
              onClick={onToggleToolsBarVisibility}
            >
              {isToolsBarVisible ? 'Ocultar Barra de Ferramentas' : 'Exibir Barra de Ferramentas'}
            </button>
          </fieldset>
          <hr className="sidebar-divider"/>
          <fieldset disabled={isProcessing} className="filter-group">
            <legend>Filtros de Busca</legend>
            <label>Data Inicial: <input type="date" value={dateFrom} onChange={e => onDateFromChange(e.target.value)} /></label>
            <label>Data Final: <input type="date" value={dateTo} onChange={e => onDateToChange(e.target.value)} /></label>
            <label>% Nuvens Máx: <input type="number" min={0} max={100} value={cloudPct} onChange={e => onCloudPctChange(+e.target.value)} /></label>
            
            {/* Seção modificada para adicionar o ícone */}
            <label>Satélite:</label>
            <div className="input-with-icon">
              <select value={satellite} onChange={e => onSatelliteChange(e.target.value)}>
                <option value="">-- selecione --</option>
                {satellites.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <button 
                className="info-icon-button" 
                title="Comparar Satélites"
                onClick={() => setSatelliteInfoVisible(true)}
              >
                &#8505;
              </button>
            </div>

          </fieldset>
          <hr className="sidebar-divider"/>
          <fieldset disabled={isProcessing} className="filter-group">
            <legend>Análise de Imagens</legend>
            <div className="action-group">
              <button onClick={onDetectChange} disabled={!canDetectChange} className="button button-primary">{loadingState === 'detectingChange' ? 'Analisando…' : 'Detectar Alterações'}</button>
              <div className="form-group slider-group">
                <label htmlFor="threshold-slider">Sensibilidade: {changeThreshold.toFixed(2)}</label>
                <input type="range" id="threshold-slider" min="0.1" max="0.8" step="0.05" value={changeThreshold} onChange={(e) => onChangeThreshold(parseFloat(e.target.value))} disabled={!canDetectChange} title="Ajuste a sensibilidade."/>
              </div>
              <hr className="sidebar-divider-inner"/>
              
              <div className="button-with-icon-group">
                <button 
                  onClick={onCalculateIndices} 
                  disabled={isProcessing || selectionCount === 0 || selectedIndices.length === 0} 
                  className="button button-primary"
                >
                  {loadingState === 'calculating' ? 'Processando…' : 'Gerar Índices'}
                </button>
                <button 
                  className="info-icon-button" 
                  title="Sobre os Índices"
                  onClick={() => setInfoPanelVisible(true)}
                >
                  &#8505;
                </button>
              </div>

              {calculatedIndices.length > 0 && (
                <div className="form-group" style={{marginTop: '10px'}}>
                  <label>Visualizar Índice Calculado:</label>
                  <select onChange={(e) => onVisibleIndexChange(e.target.value)} className="form-control">
                    <option value="">Nenhum</option> 
                    {calculatedIndices.map(index => (<option key={index.indexName} value={index.imageUrl}>{index.indexName}</option>))}
                  </select>
                </div>
              )}
              <div className="indices-checkbox-group">
                {availableIndices.map(indexName => {
                  const isDisabled = isProcessing || (indexName.includes('Red-Edge') && isLandsat);
                  return (
                    <label key={indexName} className={`checkbox-label ${isDisabled ? 'disabled' : ''}`}>
                      <input 
                        type="checkbox" 
                        checked={selectedIndices.includes(indexName)} 
                        onChange={(e) => onIndexChange(indexName, e.target.checked)} 
                        disabled={isDisabled}
                      />
                      {indexName}
                    </label>
                  );
                })}
              </div>
              <button onClick={onBulkDownload} disabled={isProcessing || selectionCount === 0} className="button button-secondary">{loadingState === 'downloading' ? 'Baixando…' : `Baixar Imagem(ns) (${selectionCount})`}</button>
            </div>
          </fieldset>
          {landCoverContent}
        </div>
      </aside>

      {/* Renderização condicional original e a nova adição */}
      {isSatelliteInfoVisible && (
        <SatelliteInfoPanel onClose={() => setSatelliteInfoVisible(false)} />
      )}
      
      {isInfoPanelVisible && (
        <IndicesInfoPanel onClose={() => setInfoPanelVisible(false)} />
      )}
    </>
  );
}
