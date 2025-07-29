// src/components/AnaliseAgronomoAI.tsx

import React, { useRef } from 'react';
import Draggable from 'react-draggable';

interface AnaliseAgronomoAIProps {
  resumo: string;
  // Estas propriedades não são mais obrigatórias
  alertas?: string[];
  recomendacoes?: string[];
  historicoNDVI?: Array<{ date: string, value: number }>;
  onFeedback?: (aprovado: boolean) => void;
  initialPosition?: { x: number, y: number };
}

const AnaliseAgronomoAI: React.FC<AnaliseAgronomoAIProps> = ({
  resumo,
  // ✅ CORREÇÃO APLICADA AQUI:
  alertas = [], // Valor padrão para evitar erro se for undefined
  recomendacoes = [], // Valor padrão para evitar erro se for undefined
  historicoNDVI,
  onFeedback,
  initialPosition = { x: 500, y: 100 }
}) => {
  const nodeRef = useRef(null);

  return (
    <Draggable nodeRef={nodeRef} defaultPosition={initialPosition} bounds=".app-container" handle=".panel-header">
      {/* O resto do componente permanece igual... */}
      <div
        ref={nodeRef}
        style={{
          background: 'rgba(18,30,60,0.94)',
          color: '#f4f4f4',
          borderRadius: 16,
          maxWidth: 540,
          minWidth: 340,
          zIndex: 9999,
          boxShadow: '0 4px 18px 0 #003b',
          border: '1px solid #355',
          padding: '24px 28px 20px 24px',
          fontFamily: 'inherit',
          position: 'fixed',
          top: 0,
          left: 0,
        }}
        className="floating-panel-box"
      >
        <div className="panel-header" style={{ cursor: 'move', display: 'flex', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontSize: 32, marginRight: 12 }}>🧑‍🌾</span>
          <h3 style={{
            color: '#F4B942',
            margin: 0,
            fontWeight: 800,
            fontSize: 22,
            letterSpacing: '0.04em'
          }}>
            Análise Inteligente do Agrônomo
          </h3>
        </div>
        <div style={{ fontSize: 16, marginBottom: 12 }}>
          {resumo}
        </div>
        {alertas.length > 0 && (
          <div style={{ color: '#FFD700', fontWeight: 700, marginBottom: 10 }}>
            {alertas.map((a, i) => <div key={i}>⚠️ {a}</div>)}
          </div>
        )}
        {recomendacoes.length > 0 && (
          <ul style={{
            margin: '12px 0 0 0', padding: 0, listStyle: 'none', color: '#9bf589', fontWeight: 600, fontSize: 15
          }}>
            {recomendacoes.map((r, i) => <li key={i}>🌱 {r}</li>)}
          </ul>
        )}
        {historicoNDVI && (
          <div style={{ margin: '16px 0 0 0', fontSize: 13, color: '#ddd' }}>
            (Histórico NDVI:
              {historicoNDVI.map((h, i) =>
                <span key={i} style={{ marginLeft: 4 }}>{h.date}: <b>{h.value}</b></span>
              )}
            )
          </div>
        )}
        <div style={{ marginTop: 18, display: 'flex', gap: 18 }}>
          <button
            style={{
              background: '#22d162', color: '#212', border: 'none', borderRadius: 6,
              fontWeight: 700, fontSize: 16, padding: '6px 18px', cursor: 'pointer'
            }}
            onClick={() => onFeedback && onFeedback(true)}
          >👍</button>
          <button
            style={{
              background: '#e16b46', color: '#fff', border: 'none', borderRadius: 6,
              fontWeight: 700, fontSize: 16, padding: '6px 18px', cursor: 'pointer'
            }}
            onClick={() => onFeedback && onFeedback(false)}
          >👎</button>
        </div>
      </div>
    </Draggable>
  );
};

export default AnaliseAgronomoAI;