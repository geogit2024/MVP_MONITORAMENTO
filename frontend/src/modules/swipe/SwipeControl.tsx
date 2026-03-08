import type { PointerEvent as ReactPointerEvent } from 'react';
import type { SwipeLayerDescriptor, SwipeRevealSide } from './types';

type SwipeControlProps = {
  availableLayers: SwipeLayerDescriptor[];
  leftLayerId: string | null;
  rightLayerId: string | null;
  isSwipeEnabled: boolean;
  canEnableSwipe: boolean;
  hasAtLeastTwoLayers: boolean;
  hasDistinctLayerSources: boolean;
  isAoiReady: boolean;
  revealSide: SwipeRevealSide;
  onLeftLayerChange: (value: string) => void;
  onRightLayerChange: (value: string) => void;
  onEnable: () => void;
  onDisable: () => void;
  onReset: () => void;
  onSwap: () => void;
  onToggleRevealSide: () => void;
  onPanelDragStart?: (event: ReactPointerEvent<HTMLDivElement>) => void;
};

export default function SwipeControl({
  availableLayers,
  leftLayerId,
  rightLayerId,
  isSwipeEnabled,
  canEnableSwipe,
  hasAtLeastTwoLayers,
  hasDistinctLayerSources,
  isAoiReady,
  revealSide,
  onLeftLayerChange,
  onRightLayerChange,
  onEnable,
  onDisable,
  onReset,
  onSwap,
  onToggleRevealSide,
  onPanelDragStart,
}: SwipeControlProps) {
  const invalidSelection = Boolean(leftLayerId && rightLayerId && leftLayerId === rightLayerId);
  const reason = !isAoiReady
    ? 'Desenhe ou carregue uma AOI para habilitar o swipe.'
    : !hasAtLeastTwoLayers
      ? 'Carregue pelo menos duas camadas raster para comparar.'
      : invalidSelection
        ? 'Escolha camadas diferentes para base e comparacao.'
        : !hasDistinctLayerSources
          ? 'As camadas selecionadas apontam para a mesma origem de imagem.'
          : null;

  return (
    <div className={`swipe-control-card ${isSwipeEnabled ? 'is-enabled' : ''}`}>
      <div className="swipe-control-title draggable" onPointerDown={onPanelDragStart}>
        Comparacao por Swipe
      </div>

      <label>
        Camada base
        <select value={leftLayerId ?? ''} onChange={(event) => onLeftLayerChange(event.target.value)}>
          <option value="" disabled>
            -- selecione --
          </option>
          {availableLayers.map((layer) => (
            <option key={`left-${layer.id}`} value={layer.id}>
              {layer.label}
            </option>
          ))}
        </select>
      </label>

      <label>
        Camada comparacao
        <select value={rightLayerId ?? ''} onChange={(event) => onRightLayerChange(event.target.value)}>
          <option value="" disabled>
            -- selecione --
          </option>
          {availableLayers.map((layer) => (
            <option key={`right-${layer.id}`} value={layer.id}>
              {layer.label}
            </option>
          ))}
        </select>
      </label>

      <div className="swipe-control-actions">
        {!isSwipeEnabled ? (
          <button type="button" onClick={onEnable} disabled={!canEnableSwipe}>
            Ativar Swipe
          </button>
        ) : (
          <button type="button" onClick={onDisable} className="danger">
            Encerrar Swipe
          </button>
        )}
        <button type="button" onClick={onReset} disabled={!isSwipeEnabled}>
          Resetar 50%
        </button>
        <button type="button" onClick={onSwap} disabled={!canEnableSwipe}>
          Inverter Camadas
        </button>
        <button type="button" onClick={onToggleRevealSide} disabled={!isSwipeEnabled}>
          Revelar {revealSide === 'left' ? 'Direita' : 'Esquerda'}
        </button>
      </div>

      {reason && <p className="swipe-control-note">{reason}</p>}
      {isSwipeEnabled && !reason && (
        <p className="swipe-control-note">Modo ativo: arraste o divisor vertical no mapa para comparar.</p>
      )}
    </div>
  );
}
