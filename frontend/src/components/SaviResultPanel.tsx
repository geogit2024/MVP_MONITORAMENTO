// src/components/SaviResultPanel.tsx

import React, { useRef } from 'react';
import Draggable from 'react-draggable';
import { ResizableBox } from 'react-resizable';
import type { SaviAreas } from '../MainApplication';
import SaviClassificationChart from './SaviClassificationChart';

interface Props {
  data: SaviAreas;
  onClose: () => void;
  initialPosition: { x: number, y: number };
}

const SaviResultPanel: React.FC<Props> = ({ data, onClose, initialPosition }) => {
  // LOG 5: VERIFICAR SE O PAINEL ESTÁ A RENDERIZAR E A RECEBER DADOS
  console.log("LOG 5: SaviResultPanel a renderizar com os seguintes dados (props):", data);

  const nodeRef = useRef(null);

  return (
    <Draggable
      nodeRef={nodeRef}
      handle=".panel-header"
      bounds=".app-container"
      defaultPosition={initialPosition}
    >
      <ResizableBox
        ref={nodeRef}
        width={500}
        height={620}
        minConstraints={[380, 450]}
        maxConstraints={[800, 900]}
        className="floating-panel-box"
        handle={<span className="react-resizable-handle react-resizable-handle-se" />}
      >
        <div className="panel-header">
          <h3>Resultados da Análise SAVI</h3>
          <button onClick={onClose} className="panel-close-button">&times;</button>
        </div>
        <div className="panel-body">
          <SaviClassificationChart data={data} />
        </div>
      </ResizableBox>
    </Draggable>
  );
};

export default SaviResultPanel;