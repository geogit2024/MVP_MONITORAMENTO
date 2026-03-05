// src/components/SaviResultPanel.tsx

import React, { useRef, useState } from 'react';
import Draggable from 'react-draggable';
import { ResizableBox } from 'react-resizable';
import type { SaviAreas } from '../MainApplication';
import SaviClassificationChart from './SaviClassificationChart';

interface Props {
  data: SaviAreas;
  onClose: () => void;
  initialPosition: { x: number; y: number };
  onAskAgronomist: () => void;
  isAskingAgronomist: boolean;
}

const SaviResultPanel: React.FC<Props> = ({ data, onClose, initialPosition, onAskAgronomist, isAskingAgronomist }) => {
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const [isSelected, setIsSelected] = useState(true);
  const [panelSize, setPanelSize] = useState({ width: 500, height: 620 });

  return (
    <Draggable
      nodeRef={nodeRef}
      handle=".panel-header"
      bounds=".app-container"
      defaultPosition={initialPosition}
      onStart={() => setIsSelected(true)}
    >
      <div
        ref={nodeRef}
        className={`floating-panel-shell ${isSelected ? 'is-selected' : ''}`}
        tabIndex={0}
        onMouseDown={() => setIsSelected(true)}
        onFocus={() => setIsSelected(true)}
        onBlur={() => setIsSelected(false)}
      >
        <ResizableBox
          width={panelSize.width}
          height={panelSize.height}
          minConstraints={[380, 450]}
          maxConstraints={[1200, 900]}
          onResizeStop={(_event: any, data: any) => {
            setPanelSize({
              width: data.size.width,
              height: data.size.height,
            });
          }}
          className="floating-panel-box savi-result-panel"
          handle={<span className="react-resizable-handle react-resizable-handle-se" title="Redimensionar janela" />}
        >
          <div className="panel-header">
            <h3>Resultados da Analise SAVI</h3>
            <button onClick={onClose} className="panel-close-button" aria-label="Fechar painel">
              &times;
            </button>
          </div>
          <div className="panel-body">
            <SaviClassificationChart data={data} />
            <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'center' }}>
              <button
                type="button"
                className="button button-primary"
                onClick={onAskAgronomist}
                disabled={isAskingAgronomist}
                title="Gerar interpretacao tecnica com IA"
                style={{ minWidth: '220px' }}
              >
                {isAskingAgronomist ? 'Analisando...' : 'Pergunte ao Agronomo'}
              </button>
            </div>
          </div>
        </ResizableBox>
      </div>
    </Draggable>
  );
};

export default SaviResultPanel;
