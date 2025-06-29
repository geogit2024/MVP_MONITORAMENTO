// Caminho: src/components/Sidebar.tsx

import React from 'react';
import { ImageInfo } from '../App'; // Assegure que a importação está correta

interface SidebarProps {
  dateFrom: string;
  onDateFromChange: (v: string) => void;
  dateTo: string;
  onDateToChange: (v: string) => void;
  cloudPct: number;
  onCloudPctChange: (v: number) => void;
  satellite: string;
  onSatelliteChange: (v: string) => void;
  satellites: string[];
  imagesList: ImageInfo[];
  theme: 'light' | 'dark';
  loadingState: 'idle' | 'searching' | 'calculatingNdvi' | 'detectingChange' | 'downloading';
  selectedImageIds: string[];
  onCalculateNdvi: () => void;
  onDetectChange: () => void;
  onBulkDownload: () => void;
  onToggleTheme: () => void;
  onAoiFileUpload: (file: File | null) => void;
  onDeleteAoi: () => void;
}

export default function Sidebar({
  dateFrom, onDateFromChange,
  dateTo, onDateToChange,
  cloudPct, onCloudPctChange,
  satellite, onSatelliteChange,
  satellites,
  imagesList,
  theme,
  loadingState,
  selectedImageIds,
  onCalculateNdvi,
  onDetectChange,
  onBulkDownload,
  onToggleTheme,
  onAoiFileUpload,
  onDeleteAoi
}: SidebarProps) {
  const selectionCount = selectedImageIds.length;
  const isProcessing = loadingState !== 'idle';

  return (
    <aside className="sidebar-container">
      <div className="sidebar-scrollable-content">
        <div className="sidebar-header">
          <h2>Busca de Imagens</h2>
          <button onClick={onToggleTheme} title="Alternar Tema">
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
        </div>

        <fieldset disabled={isProcessing} className="filter-group">
          <legend>Filtros de Busca</legend>
          <label>
            Data Inicial:
            <input type="date" value={dateFrom} onChange={e => onDateFromChange(e.target.value)} />
          </label>
          <label>
            Data Final:
            <input type="date" value={dateTo} onChange={e => onDateToChange(e.target.value)} />
          </label>
          <label>
            % Nuvens Máx:
            <input type="number" min={0} max={100} value={cloudPct} onChange={e => onCloudPctChange(+e.target.value)} />
          </label>
          <label>
            Satélite:
            <select value={satellite} onChange={e => onSatelliteChange(e.target.value)}>
              <option value="">-- selecione --</option>
              {satellites.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        </fieldset>

        <hr className="sidebar-divider"/>
        
        <fieldset disabled={isProcessing} className="upload-group">
          <legend>Área de Interesse (AOI)</legend>
          <label>
            Carregar KML/KMZ/SHP(.zip):
            <input
              type="file"
              accept=".kml,.kmz,.zip"
              onChange={e => {
                onAoiFileUpload(e.target.files ? e.target.files[0] : null);
                e.target.value = ''; // Permite carregar o mesmo ficheiro novamente
              }}
            />
          </label>
        </fieldset>
      </div>

      <div className="sidebar-actions">
        <button
          onClick={onDeleteAoi}
          disabled={isProcessing}
          className="button button-danger"
        >Deletar Alterações</button>
        <button
          onClick={onDetectChange}
          disabled={isProcessing || selectedImageIds.length < 2}
          className="button button-primary"
        >{loadingState === 'detectingChange' ? 'Analisando…' : 'Detetar Alterações'}</button>

        <button
          onClick={onCalculateNdvi}
          disabled={isProcessing || selectionCount === 0}
          className="button button-primary"
        >{loadingState === 'calculatingNdvi' ? 'Processando…' : 'Gerar e Baixar NDVI'}</button>
        
        <hr className="sidebar-divider"/>

        <button
          onClick={onBulkDownload}
          disabled={isProcessing || selectionCount === 0}
          className="button button-secondary"
        >{loadingState === 'downloading' ? 'Baixando…' : `Baixar Imagem(ns) (${selectionCount})`}</button>
      </div>
    </aside>
  );
}