// src/components/NdreResultPanel.tsx

import React, { useRef } from 'react';
import Draggable from 'react-draggable';
import { ResizableBox } from 'react-resizable';
import type { NdreAreas } from '../MainApplication';
import NdreClassificationChart from './NdreClassificationChart';

interface Props {
  data: NdreAreas;
  onClose: () => void;
  initialPosition: { x: number, y: number };
}

const NdreResultPanel: React.FC<Props> = ({ data, onClose, initialPosition }) => {
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
          <h3>Resultados da Análise Red-Edge NDVI</h3>
          <button onClick={onClose} className="panel-close-button">&times;</button>
        </div>
        <div className="panel-body">
          <NdreClassificationChart data={data} />
        </div>
      </ResizableBox>
    </Draggable>
  );
};

export default NdreResultPanel;