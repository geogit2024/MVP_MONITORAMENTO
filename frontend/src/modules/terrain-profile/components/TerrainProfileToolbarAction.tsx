import React from 'react'
import type { TerrainProfileStatus } from '../types'

interface TerrainProfileToolbarActionProps {
  enabled: boolean
  status: TerrainProfileStatus
  hasAnalysis: boolean
  isProfileVisible: boolean
  onActivate: () => void
  onDeactivate: () => void
  onCancelDrawing: () => void
  onRedraw: () => void
  onClear: () => void
  onToggleVisibility: () => void
}

const statusLabelByKey: Record<TerrainProfileStatus, string> = {
  idle: 'Inativo',
  drawing: 'Desenho ativo: clique inicio e fim no terreno.',
  analyzing: 'Processando amostras e metricas do terreno...',
  ready: 'Perfil pronto para analise.',
  error: 'Falha ao gerar analise. Redesene o perfil.',
}

export const TerrainProfileToolbarAction: React.FC<TerrainProfileToolbarActionProps> = ({
  enabled,
  status,
  hasAnalysis,
  isProfileVisible,
  onActivate,
  onDeactivate,
  onCancelDrawing,
  onRedraw,
  onClear,
  onToggleVisibility,
}) => (
  <div className="terrain-profile-toolbar-card">
    <h4>Perfil do Terreno</h4>
    <p>{statusLabelByKey[status]}</p>
    <div className="terrain-profile-toolbar-actions">
      {!enabled ? (
        <button type="button" onClick={onActivate}>
          Ativar Ferramenta
        </button>
      ) : (
        <button type="button" onClick={onDeactivate} className="secondary">
          Desativar Ferramenta
        </button>
      )}

      {enabled && status === 'drawing' && (
        <button type="button" onClick={onCancelDrawing} className="secondary">
          Cancelar Desenho
        </button>
      )}

      {hasAnalysis && (
        <>
          <button type="button" onClick={onRedraw}>
            Redesenhar
          </button>
          <button type="button" onClick={onToggleVisibility} className="secondary">
            {isProfileVisible ? 'Ocultar Perfil' : 'Mostrar Perfil'}
          </button>
          <button type="button" onClick={onClear} className="danger">
            Limpar Analise
          </button>
        </>
      )}
    </div>
  </div>
)

export default TerrainProfileToolbarAction
