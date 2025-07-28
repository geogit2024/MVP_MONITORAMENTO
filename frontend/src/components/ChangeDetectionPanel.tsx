// src/components/ChangeDetectionPanel.tsx

import React, { useRef } from 'react';
import Draggable from 'react-draggable';
import { ResizableBox } from 'react-resizable';
import ChangeDetectionChart from './ChangeDetectionChart';

// 1. ADICIONE 'initialPosition' ÀS PROPRIEDADES
interface Props {
  gainArea: number;
  lossArea: number;
  totalArea: number;
  onClose: () => void;
  initialPosition: { x: number, y: number };
}

const ChangeDetectionPanel: React.FC<Props> = ({ gainArea, lossArea, totalArea, onClose, initialPosition }) => {
  const nodeRef = useRef(null);

  return (
    <Draggable
      nodeRef={nodeRef}
      handle=".panel-header"
      bounds=".app-container"
      // 2. USE A PROPRIEDADE EM VEZ DE UM VALOR FIXO
      defaultPosition={initialPosition}
    >
      <ResizableBox
        ref={nodeRef}
        width={500}
        height={580}
        minConstraints={[380, 450]}
        className="floating-panel-box"
        handle={<span className="react-resizable-handle react-resizable-handle-se" />}
      >
        <div className="panel-header">
          <h3>Resultado da Detecção de Mudança</h3>
          <button onClick={onClose} className="panel-close-button">&times;</button>
        </div>
        <div className="panel-body">
          <ChangeDetectionChart gainArea={gainArea} lossArea={lossArea} totalArea={totalArea} />
        </div>
      </ResizableBox>
    </Draggable>
  );
};

export default ChangeDetectionPanel;