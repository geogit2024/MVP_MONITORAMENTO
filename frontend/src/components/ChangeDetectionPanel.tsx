// src/components/ChangeDetectionPanel.tsx

import React, { useRef } from 'react';
import Draggable from 'react-draggable';
import { ResizableBox } from 'react-resizable';
import ChangeDetectionChart from './ChangeDetectionChart';

// Define as propriedades que o painel irá receber
interface Props {
  gainArea: number;
  lossArea: number;
  totalArea: number;
  onClose: () => void;
}

const ChangeDetectionPanel: React.FC<Props> = ({ gainArea, lossArea, totalArea, onClose }) => {
  const nodeRef = useRef(null);

  return (
    // Componente que torna o painel arrastável
    <Draggable
      nodeRef={nodeRef}
      handle=".panel-header"
      bounds=".app-container"
    >
      {/* Componente que torna o painel redimensionável */}
      <ResizableBox
        ref={nodeRef}
        width={500}
        height={580}
        minConstraints={[380, 450]}
        className="floating-panel-box"
        handle={<span className="react-resizable-handle react-resizable-handle-se" />}
      >
        {/* O conteúdo do painel */}
        <div className="panel-header">
          <h3>Resultado da Detecção de Mudança</h3>
          <button onClick={onClose} className="panel-close-button">&times;</button>
        </div>
        <div className="panel-body">
          {/* O gráfico que criamos no passo anterior é renderizado aqui dentro */}
          <ChangeDetectionChart gainArea={gainArea} lossArea={lossArea} totalArea={totalArea} />
        </div>
      </ResizableBox>
    </Draggable>
  );
};

export default ChangeDetectionPanel;