import React, { useMemo, useState } from 'react';
import type { Feature, FeatureCollection } from 'geojson';
import ClassSelector from './ClassSelector';
import Legend from './Legend';
import LandCoverStatsChart from './LandCoverStatsChart';
import TrainingSampleTool from './TrainingSampleTool';
import { classifyLandCover } from './ClassificationLayer';
import type {
  LandCoverClassDef,
  LandCoverClassifyResponse,
  LandCoverPolygonStatus,
} from './types';
import './landcover.css';

const DEFAULT_CLASSES: LandCoverClassDef[] = [
  { id: 1, name: 'Agricultura', color: '#f4d03f' },
  { id: 2, name: 'Pastagem', color: '#9bd770' },
  { id: 3, name: 'Vegetacao Nativa', color: '#1f7a3e' },
  { id: 4, name: 'Solo Exposto', color: '#8d5524' },
  { id: 5, name: 'Agua', color: '#2e86de' },
  { id: 6, name: 'Area Urbana', color: '#7f8c8d' },
];

const STATUS_LABEL: Record<LandCoverPolygonStatus, string> = {
  suggested: 'Sugeridos',
  approved: 'Aprovados',
  rejected: 'Rejeitados',
  edited: 'Editados',
};

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
  advancedMode: boolean;
  onAdvancedModeChange: (enabled: boolean) => void;
  aiVisibleStatuses: LandCoverPolygonStatus[];
  onAiVisibleStatusesChange: (statuses: LandCoverPolygonStatus[]) => void;
  aiTotalPolygons: number;
  aiSelectedPolygons: number;
  aiStatsByStatus: Record<LandCoverPolygonStatus, number>;
  aiVectorizationSummary?: {
    total_polygons: number;
    total_area_ha: number;
    min_area_ha: number;
    max_area_ha: number;
  } | null;
  aiVectorizationLoading: boolean;
  aiClassifyingLoading: boolean;
  aiEditingEnabled: boolean;
  onGenerateAIVectorization: (params: {
    segmentSize: number;
    compactness: number;
    connectivity: 4 | 8;
    minAreaHa: number;
    simplifyMeters: number;
    maxSegments: number;
  }) => void | Promise<void>;
  onAiApproveSelected: () => void;
  onAiRejectSelected: () => void;
  onAiDeleteSelected: () => void;
  onAiMergeSelected: () => void;
  onAiToggleEditSelected: () => void;
  onAiReset: () => void;
  onAiClassifyApproved: (params: {
    classes: LandCoverClassDef[];
    persist: boolean;
  }) => void | Promise<LandCoverClassifyResponse | void>;
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
  advancedMode,
  onAdvancedModeChange,
  aiVisibleStatuses,
  onAiVisibleStatusesChange,
  aiTotalPolygons,
  aiSelectedPolygons,
  aiStatsByStatus,
  aiVectorizationSummary = null,
  aiVectorizationLoading,
  aiClassifyingLoading,
  aiEditingEnabled,
  onGenerateAIVectorization,
  onAiApproveSelected,
  onAiRejectSelected,
  onAiDeleteSelected,
  onAiMergeSelected,
  onAiToggleEditSelected,
  onAiReset,
  onAiClassifyApproved,
}: LandCoverPanelProps) {
  const [satellite] = useState('sentinel2');
  const [classes, setClasses] = useState<LandCoverClassDef[]>(DEFAULT_CLASSES);
  const [error, setError] = useState<string | null>(null);
  const [classification, setClassification] = useState<LandCoverClassifyResponse | null>(null);
  const [segmentSize, setSegmentSize] = useState(20);
  const [compactness, setCompactness] = useState(1.5);
  const [connectivity, setConnectivity] = useState<4 | 8>(8);
  const [minAreaHa, setMinAreaHa] = useState(0.05);
  const [simplifyMeters, setSimplifyMeters] = useState(5);
  const [maxSegments, setMaxSegments] = useState(1200);
  const [persistClassification, setPersistClassification] = useState(false);

  const sampleCount = trainingSamples.features.length;
  const statsTotal = useMemo(
    () => (classification?.class_stats || []).reduce((acc, item) => acc + Number(item.area_ha || 0), 0),
    [classification]
  );
  const statusList = useMemo(
    () => (['suggested', 'approved', 'rejected', 'edited'] as LandCoverPolygonStatus[]),
    []
  );
  const isBusy = loading || aiVectorizationLoading || aiClassifyingLoading;

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

  const handleGenerateVectorization = async () => {
    setError(null);
    if (!aoi) {
      setError('Defina a AOI antes de gerar a vetorizacao AI.');
      return;
    }
    try {
      await onGenerateAIVectorization({
        segmentSize,
        compactness,
        connectivity,
        minAreaHa,
        simplifyMeters,
        maxSegments,
      });
    } catch (err: any) {
      setError(err.message || 'Falha ao gerar vetorizacao AI.');
    }
  };

  const handleClassifyApproved = async () => {
    setError(null);
    try {
      const response = await onAiClassifyApproved({
        classes,
        persist: persistClassification,
      });
      if (response) {
        setClassification(response);
        onResult(response);
      }
    } catch (err: any) {
      setError(err.message || 'Falha ao classificar poligonos aprovados.');
    }
  };

  const toggleStatusVisibility = (status: LandCoverPolygonStatus, enabled: boolean) => {
    const next = enabled
      ? Array.from(new Set([...aiVisibleStatuses, status]))
      : aiVisibleStatuses.filter((item) => item !== status);
    onAiVisibleStatusesChange(next);
  };

  return (
    <fieldset className="filter-group landcover-panel" disabled={isBusy}>
      <legend>Classificacao Uso do Solo (LULC)</legend>

      <div className="landcover-card">
        <label>Modo de Operacao</label>
        <div className="landcover-row">
          <button
            type="button"
            className={`button ${advancedMode ? 'button-secondary' : 'button-primary'}`}
            onClick={() => onAdvancedModeChange(false)}
          >
            Modo padrao
          </button>
          <button
            type="button"
            className={`button ${advancedMode ? 'button-primary' : 'button-secondary'}`}
            onClick={() => onAdvancedModeChange(true)}
          >
            Modo avancado com Editor AI
          </button>
        </div>
        <small>
          Modo padrao: amostras de treinamento. Modo avancado: segmentacao AI + revisao vetorial + classificacao por
          poligono.
        </small>
      </div>

      <div className="landcover-card">
        <label>Fonte Satelite</label>
        <input value={satellite.toUpperCase()} disabled />
        <small>Sentinel-2 SR - composicao mediana, 10m.</small>
      </div>

      <div className="landcover-card">
        <label>Data Inicial</label>
        <input type="date" value={dateStart} onChange={(e) => onDateStartChange(e.target.value)} />
        <label style={{ marginTop: 8 }}>Data Final</label>
        <input type="date" value={dateEnd} onChange={(e) => onDateEndChange(e.target.value)} />
        <small>Periodo usado para composicao Sentinel-2 da classificacao.</small>
      </div>

      <ClassSelector
        classes={classes}
        selectedClassId={selectedClassId}
        onSelectedClassChange={onSelectedClassIdChange}
        onClassesChange={setClasses}
      />

      {!advancedMode && (
        <>
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
        </>
      )}

      {advancedMode && (
        <>
          <div className="landcover-card">
            <div className="landcover-title-row">
              <strong>Editor AI de Vetorizacao</strong>
              <span className="landcover-badge">{aiTotalPolygons}</span>
            </div>
            <div className="landcover-grid-2">
              <label>
                Tamanho segmento
                <input
                  type="number"
                  min={5}
                  max={120}
                  value={segmentSize}
                  onChange={(e) => setSegmentSize(Number(e.target.value || 20))}
                />
              </label>
              <label>
                Compactacao
                <input
                  type="number"
                  min={0.1}
                  max={20}
                  step={0.1}
                  value={compactness}
                  onChange={(e) => setCompactness(Number(e.target.value || 1.5))}
                />
              </label>
              <label>
                Conectividade
                <select
                  value={connectivity}
                  onChange={(e) => setConnectivity(Number(e.target.value) === 4 ? 4 : 8)}
                >
                  <option value={8}>8</option>
                  <option value={4}>4</option>
                </select>
              </label>
              <label>
                Area minima (ha)
                <input
                  type="number"
                  min={0}
                  max={500}
                  step={0.01}
                  value={minAreaHa}
                  onChange={(e) => setMinAreaHa(Number(e.target.value || 0))}
                />
              </label>
              <label>
                Simplificacao (m)
                <input
                  type="number"
                  min={0}
                  max={300}
                  step={1}
                  value={simplifyMeters}
                  onChange={(e) => setSimplifyMeters(Number(e.target.value || 0))}
                />
              </label>
              <label>
                Max segmentos
                <input
                  type="number"
                  min={50}
                  max={20000}
                  step={50}
                  value={maxSegments}
                  onChange={(e) => setMaxSegments(Number(e.target.value || 1200))}
                />
              </label>
            </div>
            <div className="landcover-row" style={{ marginTop: 8 }}>
              <button type="button" className="button button-primary" onClick={handleGenerateVectorization}>
                {aiVectorizationLoading ? 'Gerando...' : 'Gerar Vetorizacao AI'}
              </button>
              <button type="button" className="button button-danger" onClick={onAiReset}>
                Reset Vetorizacao
              </button>
            </div>
            <small>
              Selecione no mapa, revise status e ajuste vertices antes da classificacao final.
            </small>
          </div>

          <div className="landcover-card">
            <strong>Status dos Poligonos</strong>
            <div className="landcover-status-grid">
              {statusList.map((status) => (
                <label key={status} className="landcover-status-item">
                  <input
                    type="checkbox"
                    checked={aiVisibleStatuses.includes(status)}
                    onChange={(e) => toggleStatusVisibility(status, e.target.checked)}
                  />
                  <span>{STATUS_LABEL[status]}: {aiStatsByStatus[status] || 0}</span>
                </label>
              ))}
            </div>
            <small>Selecionados: {aiSelectedPolygons}</small>
          </div>

          <div className="landcover-card">
            <strong>Acoes Rapidas</strong>
            <div className="landcover-row landcover-wrap">
              <button
                type="button"
                className="button button-secondary"
                onClick={onAiApproveSelected}
                disabled={aiSelectedPolygons === 0}
              >
                Aprovar
              </button>
              <button
                type="button"
                className="button button-secondary"
                onClick={onAiRejectSelected}
                disabled={aiSelectedPolygons === 0}
              >
                Rejeitar
              </button>
              <button
                type="button"
                className="button button-danger"
                onClick={onAiDeleteSelected}
                disabled={aiSelectedPolygons === 0}
              >
                Excluir
              </button>
              <button
                type="button"
                className="button button-secondary"
                onClick={onAiMergeSelected}
                disabled={aiSelectedPolygons < 2}
              >
                Unir selecionados
              </button>
              <button
                type="button"
                className="button button-primary"
                onClick={onAiToggleEditSelected}
                disabled={aiSelectedPolygons !== 1}
              >
                {aiEditingEnabled ? 'Salvar edicao' : 'Editar vertices'}
              </button>
            </div>
          </div>

          {aiVectorizationSummary && (
            <div className="landcover-card">
              <strong>Resumo da Vetorizacao</strong>
              <p>Total poligonos: {aiVectorizationSummary.total_polygons}</p>
              <p>Area total: {aiVectorizationSummary.total_area_ha.toFixed(2)} ha</p>
              <p>
                Min/Max area: {aiVectorizationSummary.min_area_ha.toFixed(2)} ha /{' '}
                {aiVectorizationSummary.max_area_ha.toFixed(2)} ha
              </p>
            </div>
          )}

          <div className="landcover-card">
            <div className="landcover-row" style={{ alignItems: 'center' }}>
              <label className="landcover-inline-check">
                <input
                  type="checkbox"
                  checked={persistClassification}
                  onChange={(e) => setPersistClassification(e.target.checked)}
                />
                Persistir resultado (quando backend habilitado)
              </label>
            </div>
            <div className="landcover-row">
              <button
                type="button"
                className="button button-primary"
                onClick={handleClassifyApproved}
                disabled={aiTotalPolygons === 0}
              >
                {aiClassifyingLoading ? 'Classificando...' : 'Classificar poligonos aprovados'}
              </button>
            </div>
          </div>
        </>
      )}

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

          <Legend legend={classification.legend} visible={layerVisible} onToggleVisible={onToggleLayerVisible} />
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
