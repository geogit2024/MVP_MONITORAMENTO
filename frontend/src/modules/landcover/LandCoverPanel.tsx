import React, { useMemo, useState } from 'react';
import type { Feature, FeatureCollection } from 'geojson';
import ClassSelector from './ClassSelector';
import Legend from './Legend';
import LandCoverStatsChart from './LandCoverStatsChart';
import TrainingSampleTool from './TrainingSampleTool';
import { classifyLandCover } from './ClassificationLayer';
import type { LandCoverClassDef, LandCoverClassifyResponse, TrainingSampleFeature } from './types';
import './landcover.css';

const DEFAULT_CLASSES: LandCoverClassDef[] = [
  { id: 1, name: 'Agricultura', color: '#f4d03f' },
  { id: 2, name: 'Pastagem', color: '#9bd770' },
  { id: 3, name: 'Vegetacao Nativa', color: '#1f7a3e' },
  { id: 4, name: 'Solo Exposto', color: '#8d5524' },
  { id: 5, name: 'Agua', color: '#2e86de' },
  { id: 6, name: 'Area Urbana', color: '#7f8c8d' },
];

interface LandCoverPanelProps {
  aoi: Feature | null;
  dateStart: string;
  dateEnd: string;
  onDateStartChange: (value: string) => void;
  onDateEndChange: (value: string) => void;
  trainingSamples: FeatureCollection;
  onTrainingSamplesChange: (fc: FeatureCollection) => void;
  drawingEnabled: boolean;
  onToggleDrawing: () => void;
  selectedClassId: number | null;
  onSelectedClassIdChange: (id: number) => void;
  onResult: (result: LandCoverClassifyResponse) => void;
  onToggleLayerVisible: () => void;
  layerVisible: boolean;
  loading: boolean;
  onLoadingChange: (value: boolean) => void;
  refinementMode: boolean;
  hasBaseClassification: boolean;
  refinementZoneReady: boolean;
  refinementSampleCount: number;
  onToggleRefinementMode: () => void;
  onDrawRefinementZone: () => void;
  onApplyRefinement: () => void;
  onClearRefinement: () => void;
}

export default function LandCoverPanel({
  aoi,
  dateStart,
  dateEnd,
  onDateStartChange,
  onDateEndChange,
  trainingSamples,
  onTrainingSamplesChange,
  drawingEnabled,
  onToggleDrawing,
  selectedClassId,
  onSelectedClassIdChange,
  onResult,
  onToggleLayerVisible,
  layerVisible,
  loading,
  onLoadingChange,
  refinementMode,
  hasBaseClassification,
  refinementZoneReady,
  refinementSampleCount,
  onToggleRefinementMode,
  onDrawRefinementZone,
  onApplyRefinement,
  onClearRefinement,
}: LandCoverPanelProps) {
  const [satellite] = useState('sentinel2');
  const [classes, setClasses] = useState<LandCoverClassDef[]>(DEFAULT_CLASSES);
  const [error, setError] = useState<string | null>(null);
  const [classification, setClassification] = useState<LandCoverClassifyResponse | null>(null);

  const sampleCount = trainingSamples.features.length;

  const statsTotal = useMemo(
    () => (classification?.class_stats || []).reduce((acc, item) => acc + Number(item.area_ha || 0), 0),
    [classification]
  );

  const handleClearSamples = () => onTrainingSamplesChange({ type: 'FeatureCollection', features: [] });

  const handleClassify = async () => {
    setError(null);
    if (!aoi) {
      setError('Desenhe uma AOI antes da classificacao.');
      return;
    }
    if (!trainingSamples.features.length) {
      setError('Desenhe amostras de treinamento por classe.');
      return;
    }
    try {
      onLoadingChange(true);
      const response = await classifyLandCover({
        aoiGeometry: aoi.geometry,
        trainingSamples,
        dateStart,
        dateEnd,
        classes,
      });
      setClassification(response);
      onResult(response);
    } catch (err: any) {
      setError(err.message || 'Falha ao classificar uso do solo.');
    } finally {
      onLoadingChange(false);
    }
  };

  return (
    <fieldset className="filter-group landcover-panel" disabled={loading}>
      <legend>Classificacao Uso do Solo (LULC)</legend>

      <div className="landcover-card">
        <label>Fonte Satelite</label>
        <input value={satellite.toUpperCase()} disabled />
        <small>Sentinel-2 SR - composicao mediana, 10m.</small>
      </div>

      <div className="landcover-card">
        <label>Data Inicial</label>
        <input
          type="date"
          value={dateStart}
          onChange={(e) => onDateStartChange(e.target.value)}
        />
        <label style={{ marginTop: 8 }}>Data Final</label>
        <input
          type="date"
          value={dateEnd}
          onChange={(e) => onDateEndChange(e.target.value)}
        />
        <small>Periodo usado para composicao Sentinel-2 da classificacao.</small>
      </div>

      <ClassSelector
        classes={classes}
        selectedClassId={selectedClassId}
        onSelectedClassChange={onSelectedClassIdChange}
        onClassesChange={setClasses}
      />

      <TrainingSampleTool
        selectedClassId={selectedClassId}
        classes={classes}
        drawing={drawingEnabled}
        sampleCount={sampleCount}
        onToggleDrawing={onToggleDrawing}
        onClearSamples={handleClearSamples}
      />

      <div className="landcover-row">
        <button type="button" className="button button-primary" onClick={handleClassify}>
          Treinar e Classificar
        </button>
      </div>

      {error && <p className="landcover-error">{error}</p>}

      {classification && (
        <>
          <div className="landcover-card">
            <div className="landcover-title-row">
              <strong>Refinamento Zonal</strong>
              <span className="landcover-badge">{refinementMode ? 'ATIVO' : 'DESLIGADO'}</span>
            </div>
            <p className="landcover-helper">
              Corrige apenas uma sub-area, mantendo o restante da classificacao intacto.
            </p>
            <div className="landcover-row">
              <button
                type="button"
                className="button button-secondary"
                onClick={onToggleRefinementMode}
                disabled={!hasBaseClassification}
              >
                {refinementMode ? 'Sair Refinamento' : 'Entrar Refinamento'}
              </button>
              <button
                type="button"
                className="button button-primary"
                onClick={onDrawRefinementZone}
                disabled={!refinementMode}
              >
                Desenhar Zona
              </button>
            </div>
            <div className="landcover-row" style={{ marginTop: 8 }}>
              <button
                type="button"
                className="button button-primary"
                onClick={onApplyRefinement}
                disabled={!refinementMode || !refinementZoneReady || refinementSampleCount < 3}
              >
                Aplicar Refinamento
              </button>
              <button type="button" className="button button-danger" onClick={onClearRefinement}>
                Limpar Refino
              </button>
            </div>
            <small>
              Zona: {refinementZoneReady ? 'definida' : 'nao definida'} | Amostras de refino:{' '}
              {refinementSampleCount}
            </small>
          </div>

          <Legend
            legend={classification.legend}
            visible={layerVisible}
            onToggleVisible={onToggleLayerVisible}
          />
          <LandCoverStatsChart stats={classification.class_stats} />
          <div className="landcover-card">
            <strong>Resumo</strong>
            <p>Total classificado: {statsTotal.toFixed(2)} ha</p>
            <div className="landcover-row">
              <a className="button button-secondary" href={classification.export_url} target="_blank" rel="noreferrer">
                Exportar GeoTIFF
              </a>
            </div>
          </div>
        </>
      )}
    </fieldset>
  );
}
