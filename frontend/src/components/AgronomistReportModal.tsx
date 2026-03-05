import React, { useMemo, useState } from 'react';
import './AgronomistReportModal.css';

export interface AgronomistReportData {
  id: number;
  timestamp: string;
  resumo: string;
  diagnostico: string;
  causas: string;
  recomendacoes: string;
  nivel_atencao: 'baixo' | 'medio' | 'alto';
}

interface ReportHistoryItem {
  id: number;
  talhao: string;
  nivel_atencao: string;
  timestamp: string;
  resumo: string;
}

interface ReportComparison {
  atual: { id: number; nivel_atencao: string; timestamp: string; resumo: string };
  anterior: { id: number; nivel_atencao: string; timestamp: string; resumo: string } | null;
}

interface Props {
  report: AgronomistReportData;
  loading?: boolean;
  error?: string | null;
  history?: ReportHistoryItem[];
  comparison?: ReportComparison | null;
  onClose: () => void;
  onExportPdf: () => void;
}

const levelClassMap: Record<string, string> = {
  baixo: 'level-low',
  medio: 'level-medium',
  alto: 'level-high',
};

const AgronomistReportModal: React.FC<Props> = ({
  report,
  loading = false,
  error = null,
  history = [],
  comparison = null,
  onClose,
  onExportPdf,
}) => {
  const [zoomPercent, setZoomPercent] = useState(100);
  const minZoom = 80;
  const maxZoom = 140;
  const zoomStep = 10;

  const zoomLabel = useMemo(() => `${zoomPercent}%`, [zoomPercent]);

  const handleZoomIn = () => {
    setZoomPercent((prev) => Math.min(maxZoom, prev + zoomStep));
  };

  const handleZoomOut = () => {
    setZoomPercent((prev) => Math.max(minZoom, prev - zoomStep));
  };

  const handleZoomReset = () => {
    setZoomPercent(100);
  };

  return (
    <div className="agronomo-overlay" role="dialog" aria-modal="true" aria-label="Relatorio do Agronomo">
      <div className="agronomo-modal">
        <div className="agronomo-header">
          <div className="agronomo-brand">
            <img src="/logo-campos-conectados.svg" alt="Campos Conectados" className="agronomo-brand-logo" />
            <h3>Relatorio Tecnico do Agronomo</h3>
          </div>
          <div className="agronomo-header-actions">
            <div className="agronomo-zoom-tools" aria-label="Ferramenta de zoom do relatorio">
              <button type="button" className="agronomo-zoom-btn" onClick={handleZoomOut} title="Reduzir zoom">
                -
              </button>
              <button type="button" className="agronomo-zoom-reset" onClick={handleZoomReset} title="Resetar zoom">
                {zoomLabel}
              </button>
              <button type="button" className="agronomo-zoom-btn" onClick={handleZoomIn} title="Aumentar zoom">
                +
              </button>
            </div>
            <button type="button" className="panel-close-button" onClick={onClose} aria-label="Fechar relatorio">
              &times;
            </button>
          </div>
        </div>

        {loading ? (
          <div className="agronomo-loading">Gerando analise tecnica...</div>
        ) : (
          <div className="agronomo-body" style={{ fontSize: `${zoomPercent}%` }}>
            {error && <div className="agronomo-error">{error}</div>}

            <div className="agronomo-meta">
              <span>Analise em: {new Date(report.timestamp).toLocaleString('pt-BR')}</span>
              <span className={`agronomo-level ${levelClassMap[report.nivel_atencao] || 'level-medium'}`}>
                Nivel de atencao: {report.nivel_atencao}
              </span>
            </div>

            <section>
              <h4>1. Resumo da situacao</h4>
              <p>{report.resumo}</p>
            </section>
            <section>
              <h4>2. Diagnostico provavel</h4>
              <p>{report.diagnostico}</p>
            </section>
            <section>
              <h4>3. Possiveis causas</h4>
              <p>{report.causas}</p>
            </section>
            <section>
              <h4>4. Recomendacoes praticas</h4>
              <p>{report.recomendacoes}</p>
            </section>

            {comparison && (
              <section>
                <h4>Comparacao com analise anterior</h4>
                {comparison.anterior ? (
                  <p>
                    Atual: <strong>{comparison.atual.nivel_atencao}</strong> | Anterior:{' '}
                    <strong>{comparison.anterior.nivel_atencao}</strong>
                  </p>
                ) : (
                  <p>Sem relatorio anterior para comparacao.</p>
                )}
              </section>
            )}

            {history.length > 0 && (
              <section>
                <h4>Historico recente</h4>
                <ul className="agronomo-history-list">
                  {history.slice(0, 5).map((item) => (
                    <li key={item.id}>
                      [{new Date(item.timestamp).toLocaleDateString('pt-BR')}] {item.nivel_atencao} - {item.resumo}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}

        <div className="agronomo-footer">
          <button type="button" className="button button-secondary" onClick={onClose}>
            Fechar
          </button>
          <button type="button" className="button button-primary" onClick={onExportPdf}>
            Exportar Relatorio em PDF
          </button>
        </div>
      </div>
    </div>
  );
};

export default AgronomistReportModal;
