// src/components/MsaviResultPanel.tsx

import React, { useRef } from 'react';
import Draggable from 'react-draggable';
import { ResizableBox } from 'react-resizable';
import type { MsaviAreas } from '../MainApplication'; // Importar MsaviAreas
import MsaviClassificationChart from './MsaviClassificationChart'; // Importar o novo gráfico

interface Props {
  data: MsaviAreas; // Usar MsaviAreas
  onClose: () => void;
  initialPosition: { x: number, y: number };
}

const MsaviResultPanel: React.FC<Props> = ({ data, onClose, initialPosition }) => {
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
          <h3>Resultados da Análise MSAVI</h3>
          <button onClick={onClose} className="panel-close-button">&times;</button>
        </div>
        <div className="panel-body">
          <MsaviClassificationChart data={data} />
        </div>
      </ResizableBox>
    </Draggable>
  );
};

export default MsaviResultPanel;