// src/components/Sidebar.tsx

import React, { useState } from 'react'; // 1. Importar o useState
import { IndexResult } from '../MainApplication';
import IndicesInfoPanel from './IndicesInfoPanel'; // 2. Importar o novo painel de informações
import './Sidebar.css';

const availableIndices = [
  'NDVI', 'SAVI', 'MSAVI', 'SR', 'Green NDVI', 'Red-Edge NDVI',
  'VARI', 'TSAVI', 'PVI', 'MTVI2', 'RTVIcore', 'CI Red-Edge', 'CI Green'
];

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
}

export default function SidebarTerritorial({
  dateFrom, onDateFromChange, dateTo, onDateToChange, cloudPct, onCloudPctChange,
  satellite, onSatelliteChange, satellites, theme, loadingState, selectedImageIds,
  onDetectChange, onBulkDownload, onToggleTheme, onAoiFileUpload, onDeleteAoi,
  onCalculateIndices, selectedIndices, onIndexChange,
  calculatedIndices, onVisibleIndexChange,
  changeThreshold, onChangeThreshold
}: SidebarProps) {
  
  // 3. Adicionar estado para controlar a visibilidade do painel de informação
  const [isInfoPanelVisible, setInfoPanelVisible] = useState(false);

  const selectionCount = selectedImageIds.length;
  const isProcessing = loadingState !== 'idle';
  const canDetectChange = !isProcessing && selectedImageIds.length === 2;
  const isLandsat = satellite.startsWith('LANDSAT');

  return (
    // Usar um Fragment <> para poder retornar a sidebar e o painel como irmãos
    <>
      <aside className="sidebar-container">
        <div className="sidebar-header">
          <button onClick={onToggleTheme} title="Alternar Tema" className="theme-toggle-button">
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
        </div>
        <div className="sidebar-content">
          <fieldset disabled={isProcessing} className="filter-group">
            <legend>Área de Interesse (AOI)</legend>
            <label>Carregar KML/KMZ:<input type="file" accept=".kml,.kmz" onChange={e => onAoiFileUpload(e.target.files ? e.target.files[0] : null)}/></label>
            <button onClick={onDeleteAoi} disabled={isProcessing} className="button button-danger">Deletar AOI</button>
          </fieldset>
          <hr className="sidebar-divider"/>
          <fieldset disabled={isProcessing} className="filter-group">
            <legend>Filtros de Busca</legend>
            <label>Data Inicial: <input type="date" value={dateFrom} onChange={e => onDateFromChange(e.target.value)} /></label>
            <label>Data Final: <input type="date" value={dateTo} onChange={e => onDateToChange(e.target.value)} /></label>
            <label>% Nuvens Máx: <input type="number" min={0} max={100} value={cloudPct} onChange={e => onCloudPctChange(+e.target.value)} /></label>
            <label>Satélite:
              <select value={satellite} onChange={e => onSatelliteChange(e.target.value)}>
                <option value="">-- selecione --</option>
                {satellites.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
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
              
              {/* 4. Agrupar o botão e o novo ícone de informação */}
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
                  &#8505; {/* Caractere Unicode para 'i' de informação */}
                </button>
              </div>

              {calculatedIndices.length > 0 && (
                <div className="form-group" style={{marginTop: '10px'}}>
                  <label>Visualizar Índice Calculado:</label>
                  <select onChange={(e) => onVisibleIndexChange(e.target.value)} className="form-control">
                    {/* Adiciona uma opção padrão para desativar a visualização */}
                    <option value="">Nenhum</option> 
                    {calculatedIndices.map(index => (<option key={index.indexName} value={index.imageUrl}>{index.indexName}</option>))}
                  </select>
                </div>
              )}
              <div className="indices-checkbox-group">
                {availableIndices.map(indexName => {
                  // Desabilitar Red-Edge NDVI se o satélite for Landsat
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
        </div>
      </aside>

      {/* 5. Renderizar o painel condicionalmente fora da sidebar */}
      {isInfoPanelVisible && (
        <IndicesInfoPanel onClose={() => setInfoPanelVisible(false)} />
      )}
    </>
  );
}

/**
 * ADICIONE O CSS ABAIXO AO SEU FICHEIRO 'Sidebar.css' ou 'App.css'
 * para estilizar o novo botão de informação.
 * * .button-with-icon-group {
 * display: flex;
 * align-items: center;
 * gap: 8px;
 * width: 100%;
 * }
 * * .button-with-icon-group .button-primary {
 * flex-grow: 1;
 * }
 * * .info-icon-button {
 * border: 1px solid #ccc;
 * background-color: #f0f0f0;
 * color: #333;
 * border-radius: 50%;
 * width: 32px;
 * height: 32px;
 * font-size: 18px;
 * font-weight: bold;
 * cursor: pointer;
 * display: flex;
 * align-items: center;
 * justify-content: center;
 * padding: 0;
 * flex-shrink: 0;
 * }
 * * .info-icon-button:hover {
 * background-color: #e0e0e0;
 * border-color: #999;
 * }
 * * .checkbox-label.disabled {
 * color: #888;
 * cursor: not-allowed;
 * }
*/