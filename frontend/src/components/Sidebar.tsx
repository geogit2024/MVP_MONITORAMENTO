// src/components/Sidebar.tsx

import React from 'react';
import { IndexResult } from '../App'; // Importa a interface
import './Sidebar.css';
import { GeoJsonObject } from 'geojson'; // ✅ MINHA INCLUSÃO: Importar o tipo GeoJsonObject

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
  // ✅ MINHA INCLUSÃO: Nova prop para receber os dados GeoJSON das alterações detectadas.
  changesGeoJson: GeoJsonObject | null;
}

export default function Sidebar({
  dateFrom, onDateFromChange, dateTo, onDateToChange, cloudPct, onCloudPctChange,
  satellite, onSatelliteChange, satellites, theme, loadingState, selectedImageIds,
  onDetectChange, onBulkDownload, onToggleTheme, onAoiFileUpload, onDeleteAoi,
  onCalculateIndices, selectedIndices, onIndexChange,
  calculatedIndices, onVisibleIndexChange,
  changeThreshold, onChangeThreshold,
  // ✅ MINHA INCLUSÃO: Desestruturando a nova prop.
  changesGeoJson
}: SidebarProps) {
  const selectionCount = selectedImageIds.length;
  const isProcessing = loadingState !== 'idle';
  const canDetectChange = !isProcessing && selectedImageIds.length === 2;

  // ✅ MINHA INCLUSÃO: Função para gerir o download do ficheiro GeoJSON.
  const handleGeoJsonDownload = () => {
    // Verifica se existem dados para descarregar
    if (!changesGeoJson) {
      alert('Não há dados de alteração para descarregar.');
      return;
    }

    // 1. Converte o objeto GeoJSON para uma string
    const geoJsonString = JSON.stringify(changesGeoJson, null, 2);

    // 2. Cria um Blob (objeto binário)
    const blob = new Blob([geoJsonString], { type: 'application/json' });

    // 3. Cria uma URL temporária para o Blob
    const url = URL.createObjectURL(blob);

    // 4. Cria um elemento <a> para acionar o download
    const a = document.createElement('a');
    a.href = url;
    a.download = 'alteracoes_detectadas.geojson'; // Nome do ficheiro a ser descarregado
    document.body.appendChild(a);
    a.click(); // Simula o clique no link

    // 5. Limpa a URL e o elemento da memória
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };


  return (
    <aside className="sidebar-container">
      <div className="sidebar-header">
        <button onClick={onToggleTheme} title="Alternar Tema" className="theme-toggle-button">
          {theme === 'light' ? '🌙' : '☀️'}
        </button>
      </div>
      <div className="sidebar-content">
        <fieldset disabled={isProcessing} className="filter-group">
          <legend>Área de Interesse (AOI)</legend>
          <label>Carregar KML/KMZ:<input type="file" accept=".kml,.kmz" onChange={e => { onAoiFileUpload(e.target.files ? e.target.files[0] : null); e.target.value = ''; }}/></label>
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
              <label htmlFor="threshold-slider">
                Sensibilidade: {changeThreshold.toFixed(2)}
              </label>
              <input
                type="range"
                id="threshold-slider"
                min="0.1"
                max="0.8"
                step="0.05"
                value={changeThreshold}
                onChange={(e) => onChangeThreshold(parseFloat(e.target.value))}
                disabled={!canDetectChange}
                title="Ajuste a sensibilidade. Valores menores detectam mais mudanças."
              />
            </div>

            {/* ✅ MINHA INCLUSÃO: Botão de Download para o GeoJSON. Ele só aparece quando `changesGeoJson` contém dados. */}
            {changesGeoJson && (
              <button onClick={handleGeoJsonDownload} className="button button-success" style={{marginTop: '10px'}}>
                Download Alterações (.geojson)
              </button>
            )}

            <hr className="sidebar-divider-inner"/>

            <button onClick={onCalculateIndices} disabled={isProcessing || selectionCount === 0 || selectedIndices.length === 0} className="button button-primary">{loadingState === 'calculating' ? 'Processando…' : 'Gerar Índices'}</button>
            
            {calculatedIndices.length > 0 && (
              <div className="form-group" style={{marginTop: '10px'}}>
                <label>Visualizar Índice Calculado:</label>
                <select onChange={(e) => onVisibleIndexChange(e.target.value)} className="form-control">
                  {calculatedIndices.map(index => (
                    <option key={index.indexName} value={index.imageUrl}>
                      {index.indexName}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="indices-checkbox-group">
              {availableIndices.map(indexName => (
                <label key={indexName} className="checkbox-label">
                  <input type="checkbox" checked={selectedIndices.includes(indexName)} onChange={(e) => onIndexChange(indexName, e.target.checked)} disabled={isProcessing}/>
                  {indexName}
                </label>
              ))}
            </div>
            <button onClick={onBulkDownload} disabled={isProcessing || selectionCount === 0} className="button button-secondary">{loadingState === 'downloading' ? 'Baixando…' : `Baixar Imagem(ns) (${selectionCount})`}</button>
          </div>
        </fieldset>
      </div>
    </aside>
  );
}